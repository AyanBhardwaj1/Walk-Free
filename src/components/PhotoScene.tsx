import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Box, Camera, Footprints, Sparkles } from "lucide-react";
import { findVanishingPoint } from "../lib/photo3d/vanishing";
import {
  clampBack,
  defaultBack,
  EYE_M,
  fitBack,
  readExif,
  sideHeights,
  type PhotoExif,
  focalFrom35mm,
  focalFromFov,
  skyMask,
  tourBox,
  type TourSetup,
} from "../lib/photo3d/tour";
import { drawShapes, sampleStreet } from "../lib/photo3d/sample-street";
import StreetShade from "./StreetShade";

/** Photos are rebuilt from at most this many pixels on the long side. */
const TEXTURE_PX = 1280;
/** The vanishing point is found on a smaller copy, for speed. */
const DETECT_PX = 480;

interface Loaded {
  canvas: HTMLCanvasElement;
  setup: TourSetup;
  sky: Uint8Array;
  skyWidth: number;
  skyHeight: number;
  /** Share of the picture that is open sky, 0 to 1. */
  skyShare: number;
  /** How sure the vanishing point is, 0 to 1. */
  confidence: number;
  lens: string;
  /** What the photo's EXIF says (GPS, direction, date). */
  exif: PhotoExif;
}

/** Grey pixels of a canvas, shrunk to `px` on the long side. */
function shrink(src: HTMLCanvasElement, px: number) {
  const k = Math.min(1, px / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { k, image: ctx.getImageData(0, 0, c.width, c.height) };
}

/** Finds the vanishing point and sky, and sets up the box. */
function analyse(canvas: HTMLCanvasElement, exif: PhotoExif): Loaded {
  const focal35 = exif.focal35 ?? null;
  const { width: W, height: H } = canvas;
  const { k, image } = shrink(canvas, DETECT_PX);
  const g = new Uint8Array(image.width * image.height);
  for (let i = 0; i < g.length; i++)
    g[i] = Math.round(
      0.299 * image.data[i * 4] +
        0.587 * image.data[i * 4 + 1] +
        0.114 * image.data[i * 4 + 2],
    );
  const vp = findVanishingPoint({
    width: image.width,
    height: image.height,
    data: g,
  });
  // Keep the vanishing point inside the picture (it may sit just outside).
  const vx = Math.min(W - 2, Math.max(2, vp.x / k)),
    vy = Math.min(H - 2, Math.max(2, vp.y / k));
  const focal = focal35
    ? focalFrom35mm(W, H, focal35)
    : focalFromFov(Math.max(W, H));
  const sky = skyMask(image, vp.y);
  const base = { width: W, height: H, vx, vy, focal, eye: EYE_M };
  // Fit the box to the street's own lines when they agree; otherwise a
  // plain frame around the vanishing point to adjust by hand.
  const fitted =
    vp.confidence >= 0.3
      ? fitBack(base, vp.rays, {
          mask: sky,
          width: image.width,
          height: image.height,
        })
      : null;
  return {
    canvas,
    setup: { ...base, back: fitted ?? defaultBack(W, H, vx, vy) },
    sky,
    skyShare: sky.reduce((n, v) => n + v, 0) / Math.max(1, sky.length),
    skyWidth: image.width,
    skyHeight: image.height,
    confidence: vp.confidence,
    lens: focal35
      ? `a ${focal35} mm lens (from the photo)`
      : "a typical phone lens",
    exif,
  };
}

const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
// Each surface takes its colour by projecting back into the photo from
// where it was taken; sky is cut away so rooftops stand against it.
const fragment = /* glsl */ `
uniform sampler2D map;
uniform sampler2D sky;
uniform float cutSky;
uniform vec2 size;
uniform vec2 vp;
uniform float focal;
uniform float eye;
varying vec3 vWorld;
void main() {
  float dz = -vWorld.z;
  if (dz < 0.05) discard;
  vec2 px = vec2(vp.x + focal * vWorld.x / dz, vp.y - focal * (vWorld.y - eye) / dz);
  vec2 uv = px / size;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  if (cutSky > 0.5 && texture2D(sky, uv).r > 0.5) discard;
  gl_FragColor = texture2D(map, vec2(uv.x, 1.0 - uv.y));
  #include <colorspace_fragment>
}`;

function Scene({
  loaded,
  setup,
  walk,
  look,
  redraw,
}: {
  loaded: Loaded;
  setup: TourSetup;
  /** Share of the way to the far wall, 0 to 0.85. */
  walk: number;
  look: React.RefObject<{ yaw: number; pitch: number }>;
  /** Filled with a function that draws a new frame. */
  redraw: React.RefObject<(() => void) | null>;
}) {
  const box = useMemo(() => tourBox(setup), [setup]);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(loaded.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [loaded.canvas]);
  const skyTexture = useMemo(() => {
    const t = new THREE.DataTexture(
      Uint8Array.from(loaded.sky, (v) => v * 255),
      loaded.skyWidth,
      loaded.skyHeight,
      THREE.RedFormat,
    );
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }, [loaded]);
  useEffect(
    () => () => {
      texture.dispose();
      skyTexture.dispose();
    },
    [texture, skyTexture],
  );
  // One material per surface; only the floor keeps its "sky" (a pale
  // road far off can look like sky).
  const materials = useMemo(
    () =>
      Object.fromEntries(
        box.planes.map((p) => [
          p.name,
          new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: fragment,
            side: THREE.DoubleSide,
            uniforms: {
              map: { value: texture },
              sky: { value: skyTexture },
              cutSky: { value: p.name === "floor" ? 0 : 1 },
              size: { value: new THREE.Vector2(setup.width, setup.height) },
              vp: { value: new THREE.Vector2(setup.vx, setup.vy) },
              focal: { value: setup.focal },
              eye: { value: setup.eye },
            },
          }),
        ]),
      ),
    [box, texture, skyTexture, setup],
  );
  useEffect(
    () => () => Object.values(materials).forEach((m) => m.dispose()),
    [materials],
  );
  const geometries = useMemo(
    () =>
      box.planes.map((p) => {
        const g = new THREE.BufferGeometry();
        const [a, b, c, d] = p.corners;
        g.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [...a, ...b, ...c, ...a, ...c, ...d],
            3,
          ),
        );
        return { name: p.name, geometry: g };
      }),
    [box],
  );
  useEffect(
    () => () => geometries.forEach((g) => g.geometry.dispose()),
    [geometries],
  );
  const { camera, size } = useThree();
  // The camera starts exactly where the photo was taken, with the photo's
  // own lens and its centre at the vanishing point, so the first frame is
  // the photo itself.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const fullW = 2 * Math.max(setup.vx, setup.width - setup.vx),
      fullH = 2 * Math.max(setup.vy, setup.height - setup.vy);
    cam.fov = (2 * Math.atan(fullH / 2 / setup.focal) * 180) / Math.PI;
    cam.aspect = fullW / fullH;
    cam.near = 0.05;
    cam.far = Math.max(500, box.depth * 3);
    cam.setViewOffset(
      fullW,
      fullH,
      fullW / 2 - setup.vx,
      fullH / 2 - setup.vy,
      setup.width,
      setup.height,
    );
    cam.updateProjectionMatrix();
  }, [camera, setup, box.depth, size]);
  // Drawn on demand: when the walk, the look or the setup changes.
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    redraw.current = invalidate;
    invalidate();
  }, [invalidate, redraw, walk, setup]);
  useFrame(() => {
    const l = look.current ?? { yaw: 0, pitch: 0 };
    camera.position.set(0, setup.eye, -walk * box.depth);
    camera.rotation.set(l.pitch, l.yaw, 0, "YXZ");
  });
  return (
    <>
      {geometries.map((g) => (
        <mesh key={g.name} geometry={g.geometry} material={materials[g.name]} />
      ))}
    </>
  );
}

/** Drag handles for the vanishing point and the far wall, over the photo. */
function Editor({
  loaded,
  setup,
  onChange,
}: {
  loaded: Loaded;
  setup: TourSetup;
  onChange: (s: TourSetup) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<null | "vp" | "tl" | "br">(null);
  const url = useMemo(
    () => loaded.canvas.toDataURL("image/jpeg", 0.85),
    [loaded.canvas],
  );
  const b = clampBack(setup);
  const { width: W, height: H, vx, vy } = setup;
  const at = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * W,
      ((e.clientY - r.top) / r.height) * H,
    ] as const;
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const [x, y] = at(e);
    const cx = Math.min(W - 2, Math.max(2, x)),
      cy = Math.min(H - 2, Math.max(2, y));
    if (drag.current === "vp") {
      // The far wall moves with the vanishing point.
      const dx = cx - vx,
        dy = cy - vy;
      onChange({
        ...setup,
        vx: cx,
        vy: cy,
        back: {
          left: b.left + dx,
          right: b.right + dx,
          top: b.top + dy,
          bottom: b.bottom + dy,
        },
      });
    } else if (drag.current === "tl")
      onChange({
        ...setup,
        back: { ...b, left: Math.min(cx, vx - 4), top: Math.min(cy, vy - 4) },
      });
    else
      onChange({
        ...setup,
        back: {
          ...b,
          right: Math.max(cx, vx + 4),
          bottom: Math.max(cy, vy + 4),
        },
      });
  };
  // Lines from the vanishing point out through the far wall's corners.
  const ray = (x: number, y: number) => {
    const dx = x - vx,
      dy = y - vy;
    const t = Math.min(
      dx > 0 ? (W - vx) / dx : dx < 0 ? -vx / dx : Infinity,
      dy > 0 ? (H - vy) / dy : dy < 0 ? -vy / dy : Infinity,
    );
    return [vx + dx * t, vy + dy * t];
  };
  const handle = (
    id: "vp" | "tl" | "br",
    x: number,
    y: number,
    label: string,
  ) => (
    <circle
      cx={x}
      cy={y}
      r={Math.max(W, H) / 80}
      className={`tip-handle tip-${id}`}
      role="slider"
      aria-label={label}
      aria-valuetext={`${Math.round(x)}, ${Math.round(y)}`}
      tabIndex={0}
      onPointerDown={(e) => {
        drag.current = id;
        (e.target as Element).setPointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 20 : 4;
        const d = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }[e.key];
        if (!d) return;
        e.preventDefault();
        if (id === "vp")
          onChange({
            ...setup,
            vx: vx + d[0],
            vy: vy + d[1],
            back: {
              left: b.left + d[0],
              right: b.right + d[0],
              top: b.top + d[1],
              bottom: b.bottom + d[1],
            },
          });
        else if (id === "tl")
          onChange({
            ...setup,
            back: { ...b, left: b.left + d[0], top: b.top + d[1] },
          });
        else
          onChange({
            ...setup,
            back: { ...b, right: b.right + d[0], bottom: b.bottom + d[1] },
          });
      }}
    />
  );
  return (
    <svg
      ref={svg}
      className="tip-editor"
      viewBox={`0 0 ${W} ${H}`}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <image href={url} width={W} height={H} />
      {(
        [
          [b.left, b.top],
          [b.right, b.top],
          [b.right, b.bottom],
          [b.left, b.bottom],
        ] as const
      ).map(([x, y], i) => {
        const [ex, ey] = ray(x, y);
        return (
          <line key={i} x1={x} y1={y} x2={ex} y2={ey} className="tip-ray" />
        );
      })}
      <rect
        x={b.left}
        y={b.top}
        width={b.right - b.left}
        height={b.bottom - b.top}
        className="tip-back"
      />
      {handle("tl", b.left, b.top, "Far wall, top left corner")}
      {handle("br", b.right, b.bottom, "Far wall, bottom right corner")}
      {handle("vp", vx, vy, "Vanishing point")}
    </svg>
  );
}

/**
 * Step into a photo: take a picture along a street (or a corridor), and it
 * becomes a 3D space at real scale you can walk into. Everything runs on
 * the device: the vanishing point comes from the photo's own lines, the
 * scale from eye height, and the lens from the photo's EXIF when it has it.
 */
export default function PhotoScene({
  open,
  onClose,
  origin,
  timeZone,
  placeName,
}: {
  open: boolean;
  onClose: () => void;
  /** Where the map is, for timing shade when a photo has no GPS. */
  origin: { lat: number; lon: number };
  timeZone: string;
  placeName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [setup, setSetup] = useState<TourSetup | null>(null);
  const [walk, setWalk] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const look = useRef({ yaw: 0, pitch: 0 });
  const loads = useRef(0);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const redraw = useRef<(() => void) | null>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const show = (next: Loaded) => {
    loads.current++;
    setLoaded(next);
    setSetup(next.setup);
    setWalk(0);
    look.current = { yaw: 0, pitch: 0 };
  };
  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const head = new Uint8Array(
        await file.slice(0, 128 * 1024).arrayBuffer(),
      );
      const bitmap = await createImageBitmap(file);
      const k = Math.min(1, TEXTURE_PX / Math.max(bitmap.width, bitmap.height));
      const c = document.createElement("canvas");
      c.width = Math.max(16, Math.round(bitmap.width * k));
      c.height = Math.max(16, Math.round(bitmap.height * k));
      // Read back on the CPU: GPU canvases are slow to read pixels from.
      c.getContext("2d", { willReadFrequently: true })!.drawImage(
        bitmap,
        0,
        0,
        c.width,
        c.height,
      );
      bitmap.close();
      // Let the "working" state paint before the analysis holds the thread.
      await new Promise((r) => setTimeout(r, 30));
      show(analyse(c, readExif(head)));
    } catch {
      setError(
        "That photo couldn't be opened. Try a JPEG or PNG taken along a street or corridor.",
      );
    } finally {
      setBusy(false);
    }
  }
  function sample() {
    const { shapes } = sampleStreet(1280, 854);
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 854;
    drawShapes(c.getContext("2d", { willReadFrequently: true })!, shapes);
    show(analyse(c, {}));
  }

  const box = setup ? tourBox(setup) : null;
  // Each side's own height, where the sky shows it; else the box's.
  const sides = useMemo(
    () =>
      loaded && setup && box
        ? sideHeights(setup, box.left, box.right, box.depth, {
            mask: loaded.sky,
            width: loaded.skyWidth,
            height: loaded.skyHeight,
          })
        : null,
    // box follows setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, setup],
  );
  const canyon = useMemo(
    () =>
      box && sides
        ? {
            left: box.left,
            right: box.right,
            leftTall: sides.left ?? box.tall,
            rightTall: sides.right ?? box.tall,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sides, box?.left, box?.right, box?.tall],
  );
  const round = (m: number) => (m < 20 ? m.toFixed(1) : Math.round(m));
  return (
    <dialog
      ref={dialog}
      className="shortcuts render-dialog photo-scene"
      aria-labelledby="photo-scene-title"
      onClose={onClose}
    >
      <h2 id="photo-scene-title">
        <Box size={18} aria-hidden /> Step into a photo
      </h2>
      <p className="intro-small">
        Take a photo looking along a street or corridor and walk into it in 3D.
        The lines in the picture show where it recedes; your eye height gives it
        real size. It all happens on this device.
      </p>
      <div className="photo-scene-actions">
        <label className={`secondary file-button${busy ? " is-busy" : ""}`}>
          <Camera size={15} aria-hidden />
          {busy
            ? "Reading the photo…"
            : loaded
              ? "Use another photo"
              : "Take or choose a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button className="secondary" onClick={sample} disabled={busy}>
          <Sparkles size={15} aria-hidden /> Try a sample street
        </button>
      </div>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      {loaded && setup && box && (
        <>
          <div className="photo-scene-panes">
            <figure>
              <Editor loaded={loaded} setup={setup} onChange={setSetup} />
              <figcaption>
                Drag the dot to where the lines meet, and the corners to the far
                wall&apos;s edges.
              </figcaption>
            </figure>
            <figure>
              <div
                className="photo-scene-3d"
                style={{ aspectRatio: `${setup.width} / ${setup.height}` }}
                onPointerDown={(e) => {
                  dragging.current = { x: e.clientX, y: e.clientY };
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const d = dragging.current;
                  if (!d) return;
                  const l = look.current;
                  l.yaw = Math.max(
                    -1.2,
                    Math.min(1.2, l.yaw + (e.clientX - d.x) * 0.004),
                  );
                  l.pitch = Math.max(
                    -0.6,
                    Math.min(0.6, l.pitch + (e.clientY - d.y) * 0.004),
                  );
                  dragging.current = { x: e.clientX, y: e.clientY };
                  redraw.current?.();
                }}
                onPointerUp={() => (dragging.current = null)}
                onDoubleClick={() => {
                  look.current = { yaw: 0, pitch: 0 };
                  redraw.current?.();
                }}
                role="img"
                aria-label={`The photo rebuilt in 3D: ${round(box.across)} metres across and ${round(box.depth)} metres deep`}
              >
                <Canvas
                  frameloop="demand"
                  dpr={[1, 2]}
                  gl={{ antialias: true }}
                  // The lens and its offset centre are set from the photo.
                  camera={{ position: [0, setup.eye, 0], manual: true }}
                >
                  <color attach="background" args={["#dfe7ec"]} />
                  <Scene
                    loaded={loaded}
                    setup={setup}
                    walk={walk}
                    look={look}
                    redraw={redraw}
                  />
                </Canvas>
              </div>
              <label className="photo-scene-walk">
                <Footprints size={15} aria-hidden />
                Walk in
                <input
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.01}
                  value={walk}
                  onChange={(e) => setWalk(e.target.valueAsNumber)}
                  aria-valuetext={`${Math.round(walk * box.depth)} metres in`}
                />
              </label>
              <figcaption>
                Drag to look around; double-click to face ahead again.
              </figcaption>
            </figure>
          </div>
          <p>
            About <strong>{round(box.across)} m</strong> between the sides,{" "}
            <strong>{round(box.tall)} m</strong> up to where the far wall&apos;s
            top is set, and <strong>{round(box.depth)} m</strong> to the far
            wall, judged from {loaded.lens} at an eye height of{" "}
            <label className="photo-scene-eye">
              <input
                type="number"
                min={0.5}
                max={3}
                step={0.05}
                value={setup.eye}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (Number.isFinite(v) && v >= 0.5 && v <= 3)
                    setSetup({ ...setup, eye: v });
                }}
                aria-label="Eye height, metres"
              />{" "}
              m
            </label>
            .{" "}
            {loaded.confidence >= 0.3
              ? "The vanishing point was found from the photo's lines."
              : "The photo's lines didn't agree on a vanishing point, so it starts at eye level in the middle: drag it into place."}
          </p>
          <p>
            Open sky fills <strong>{Math.round(loaded.skyShare * 100)}%</strong>{" "}
            of the view
            {loaded.skyShare > 0.3
              ? ": the sun reaches this walk for long stretches of the day."
              : loaded.skyShare > 0.1
                ? ", so the fronts shade parts of the walk as the sun moves."
                : ": tall fronts or trees keep most of it in shade."}
          </p>
          {canyon && (
            <StreetShade
              // A new photo starts afresh (its own facing and day).
              key={loads.current}
              canyon={canyon}
              exif={loaded.exif}
              origin={origin}
              timeZone={timeZone}
              placeName={placeName}
            />
          )}
          <p className="fine">
            A single photo can&apos;t see behind things, so people, trees and
            cars are painted onto the ground and walls, and the space stretches
            as you walk past what the camera saw.
          </p>
        </>
      )}
      <div className="proposal-actions">
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
