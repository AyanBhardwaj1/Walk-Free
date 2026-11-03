import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import { useMemo, useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { PlaceLabel } from "../lib/place-labels";
import type {
  World,
  Environment,
  Point,
  RouteResult,
  Terrain,
} from "../../shared/types";
import Building from "./scene/Buildings";
import Trees from "./scene/Trees";
import MergedBuildings from "./scene/MergedBuildings";
import Crowd from "./scene/Crowd";
import { sunDirection } from "../lib/environment";
import { terrainHeight } from "../lib/geo";
import { partialLine, type P3 } from "../lib/polyline";
import { sc, sceneTheme, setSceneTheme } from "../lib/scene-theme";
import type { ThemeName } from "../lib/theme";
import type { Ambient } from "./AmbientBackdrop";
/** Screen space covered by panels, in CSS pixels, so the map frames around it. */
export interface MapInsets {
  left: number;
  bottom: number;
  top: number;
}
const NO_INSETS: MapInsets = { left: 0, bottom: 0, top: 0 };
const VIEW_DIRECTION = new THREE.Vector3(0.65, 0.72, 0.7).normalize();
/**
 * Frames the route (or the whole area) inside the part of the screen that
 * panels leave visible, by shifting the projection centre into that region.
 * Re-frames only when the endpoints, area or visible region change, so the
 * time slider never moves the camera.
 */
interface Framing {
  target: THREE.Vector3;
  offset: THREE.Vector3;
}
function FrameArea({
  extent,
  insets,
  focus,
  framed,
}: {
  extent: number;
  insets: MapInsets;
  focus: Point[];
  /** Where the camera settled, for the arrival flight to land on. */
  framed?: RefObject<Framing | null>;
}) {
  const { camera, size, invalidate, controls } = useThree();
  const focusKey = focus.map((p) => p.map(Math.round).join(",")).join("|");
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const left = Math.min(insets.left, size.width * 0.6);
    const bottom = Math.min(insets.bottom, size.height * 0.7);
    const top = Math.min(insets.top, size.height * 0.2);
    const visible = Math.max(
      120,
      Math.min(size.width - left, size.height - bottom - top),
    );
    cam.setViewOffset(
      size.width,
      size.height,
      -left / 2,
      (bottom - top) / 2,
      size.width,
      size.height,
    );
    let center: Point = [0, 0];
    let radius = extent / 2;
    if (focus.length) {
      const xs = focus.map((p) => p[0]),
        zs = focus.map((p) => p[1]);
      center = [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      ];
      const half =
        Math.hypot(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...zs) - Math.min(...zs),
        ) / 2;
      radius = Math.min(extent / 2, Math.max(160, half * 1.35 + 60));
    }
    // Distance at which a circle of this radius fits the visible region.
    const tan = Math.tan(((cam.fov / 2) * Math.PI) / 180);
    const distance = (radius * 0.9) / (tan * (visible / size.height));
    const target = new THREE.Vector3(center[0], 0, center[1]);
    cam.position.copy(target).addScaledVector(VIEW_DIRECTION, distance);
    cam.lookAt(target);
    if (framed)
      framed.current = {
        target: target.clone(),
        offset: VIEW_DIRECTION.clone().multiplyScalar(distance),
      };
    cam.updateProjectionMatrix();
    const orbit = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    } | null;
    if (orbit) {
      orbit.target.copy(target);
      orbit.update();
    }
    invalidate();
    // focusKey stands in for focus, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    camera,
    controls,
    extent,
    focusKey,
    insets.left,
    insets.bottom,
    insets.top,
    size.width,
    size.height,
    invalidate,
  ]);
  return null;
}
const FLIGHT_MS = 1900;
/**
 * Arriving in an area: the camera sweeps in from higher and further round,
 * and settles where FrameArea framed it. Any drag or zoom takes over at once;
 * skipped for people who ask for less motion.
 */
function ArrivalFlight({ framed }: { framed: RefObject<Framing | null> }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    if (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const orbit = controls as unknown as
      | (THREE.EventDispatcher<{ start: object }> & { update: () => void })
      | null;
    let frame = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
    orbit?.addEventListener("start", stop);
    const up = new THREE.Vector3(0, 1, 0);
    const start = performance.now();
    const tick = (t: number) => {
      // A street-level walk (which disables orbiting) takes the camera.
      if (
        stopped ||
        (orbit as unknown as { enabled?: boolean })?.enabled === false
      )
        return;
      const f = framed.current;
      if (f) {
        const p = Math.min(1, (t - start) / FLIGHT_MS);
        const rest = 1 - (1 - Math.pow(1 - p, 3));
        const offset = f.offset
          .clone()
          .applyAxisAngle(up, rest * 0.7)
          .multiplyScalar(1 + rest * 0.8);
        offset.y += rest * f.offset.length() * 0.4;
        camera.position.copy(f.target).add(offset);
        camera.lookAt(f.target);
        orbit?.update();
        invalidate();
        if (p >= 1) return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stop();
      orbit?.removeEventListener("start", stop);
    };
  }, [camera, controls, invalidate, framed]);
  return null;
}
function WalkingPaths({
  world,
  onClick,
}: {
  world: World;
  onClick: (point: Point) => void;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const edge of world.graph.edges) {
      if (edge.indoor === "hypothetical") continue;
      for (let i = 1; i < edge.points.length; i++)
        for (const p of [edge.points[i - 1], edge.points[i]])
          positions.push(p[0], terrainHeight(p, world.terrain) + 1.2, p[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [world.graph, world.terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation();
        onClick([e.point.x, e.point.z]);
      }}
    >
      <lineBasicMaterial color={sc("#699271")} transparent opacity={0.65} />
    </lineSegments>
  );
}
export interface HeatOverlay {
  colors: Map<string, string>;
  highlight?: Set<string>;
}
/** Walking paths coloured by heat, drawn as one batched line. */
function HeatPaths({
  world,
  heat,
  onSelect,
}: {
  world: World;
  heat: HeatOverlay;
  onSelect: (edgeId: string, point: Point) => void;
}) {
  const { points, colors, edgeAt, highlight } = useMemo(() => {
    const points: [number, number, number][] = [],
      colors: [number, number, number][] = [],
      edgeAt: string[] = [],
      highlight: [number, number, number][] = [];
    const color = new THREE.Color();
    for (const edge of world.graph.edges) {
      const hex = heat.colors.get(edge.id);
      if (!hex) continue;
      color.set(hex);
      const lifted = heat.highlight?.has(edge.id);
      for (let i = 1; i < edge.points.length; i++) {
        for (const p of [edge.points[i - 1], edge.points[i]]) {
          const v: [number, number, number] = [
            p[0],
            terrainHeight(p, world.terrain) + 1.4,
            p[1],
          ];
          points.push(v);
          colors.push([color.r, color.g, color.b]);
          if (lifted) highlight.push([v[0], v[1] + 0.6, v[2]]);
        }
        edgeAt.push(edge.id);
      }
    }
    return { points, colors, edgeAt, highlight };
  }, [world.graph, world.terrain, heat]);
  if (!points.length) return null;
  return (
    <>
      <Line
        points={points}
        vertexColors={colors}
        segments
        lineWidth={world.graph.edges.length > 3000 ? 2.5 : 4}
        onClick={(e) => {
          const edgeId = edgeAt[e.faceIndex ?? -1];
          if (!edgeId) return;
          e.stopPropagation();
          onSelect(edgeId, [e.point.x, e.point.z]);
        }}
      />
      {highlight.length > 0 && (
        <Line points={highlight} segments color={sc("#1f2a1c")} lineWidth={7} />
      )}
    </>
  );
}
const MERGE_THRESHOLD = 500;
/** Streets and footpaths batched into two lines instead of one per road. */
function Roads({ world }: { world: World }) {
  const batches = useMemo(() => {
    const road: [number, number, number][] = [],
      path: [number, number, number][] = [];
    for (const r of world.roads) {
      const target = r.kind === "road" ? road : path;
      for (let i = 1; i < r.points.length; i++)
        for (const p of [r.points[i - 1], r.points[i]])
          target.push([p[0], terrainHeight(p, world.terrain) + 0.6, p[1]]);
    }
    return { road, path };
  }, [world.roads, world.terrain]);
  return (
    <>
      {batches.road.length > 0 && (
        <Line
          points={batches.road}
          segments
          color={sc("#faf7ed")}
          lineWidth={5}
        />
      )}
      {batches.path.length > 0 && (
        <Line
          points={batches.path}
          segments
          color={sc("#dfd4bd")}
          lineWidth={2}
        />
      )}
    </>
  );
}
function Ground({
  world,
  onClick,
  color,
}: {
  world: World;
  onClick: (p: Point) => void;
  color: string;
}) {
  const geometry = useMemo(() => {
    const t = world.terrain;
    const n = t?.resolution ?? 2;
    const g = new THREE.PlaneGeometry(
      world.extent * 1.2,
      world.extent * 1.2,
      n - 1,
      n - 1,
    );
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(i, terrainHeight([p.getX(i), p.getZ(i)], t));
    g.computeVertexNormals();
    return g;
  }, [world.terrain, world.extent]);
  return (
    <mesh
      geometry={geometry}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick([e.point.x, e.point.z]);
      }}
    >
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}
/**
 * Land beyond the mapped area, out to the horizon, so the city doesn't float
 * on a tile: it fades into the fog instead of ending at a hard edge.
 */
function Horizon({
  world,
  color,
  reach = 9,
}: {
  world: World;
  color: string;
  /** How far the land runs, in multiples of the area's width. */
  reach?: number;
}) {
  const y = useMemo(() => {
    const h = world.terrain?.heights;
    return (h && h.length ? Math.min(...h) : 0) - 0.6;
  }, [world.terrain]);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={y}
      receiveShadow
      // Clicks beyond the map have nothing to pick.
      raycast={() => null}
    >
      <circleGeometry args={[world.extent * reach, 64]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}
function Area({ points, color }: { points: Point[]; color: string }) {
  const g = useMemo(() => {
    const shape = new THREE.Shape(
      points.map((p) => new THREE.Vector2(p[0], -p[1])),
    );
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [points]);
  return (
    <mesh geometry={g} position={[0, 0.3, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}
function Endpoint({
  point,
  label,
  terrain,
}: {
  point: Point;
  label: string;
  terrain?: Terrain;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 112;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = label === "Start" ? sc("#3f5938") : sc("#a55c32");
    ctx.strokeStyle = sc("#fffdf4");
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 104, 48);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sc("#ffffff");
    ctx.font = "500 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 57);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
    // The label is drawn in the scene's colours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, sceneTheme()]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[point[0], terrainHeight(point, terrain) + 4, point[1]]}>
      {/* Above the route line, which is drawn over the scene too. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={30}>
        <ringGeometry args={[5, 9, 32]} />
        <meshBasicMaterial
          color={label === "Start" ? sc("#3f5938") : sc("#b46539")}
          depthTest={false}
          transparent
        />
      </mesh>
      {/* A constant size on screen, however close the camera frames. */}
      <sprite
        position={[0, 8, 0]}
        center={[0.5, 0]}
        scale={[0.05, 0.022, 1]}
        renderOrder={31}
      >
        <spriteMaterial
          sizeAttenuation={false}
          map={texture}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
/** Labels this close to a start or finish marker give way to it, m. */
const LABEL_MARKER_GAP = 60;
/** A named place on the map: a small tag above it, a constant size. */
function PlaceTag({
  label,
  terrain,
}: {
  label: PlaceLabel;
  terrain?: Terrain;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = "600 40px Arial";
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(label.text).width) + 56;
    canvas.width = width;
    canvas.height = 80;
    ctx.font = font;
    ctx.fillStyle = sc("#fffdf4");
    ctx.strokeStyle = sc("#22301f");
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(2, 2, width - 4, 76, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sc("#22301f");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.text, width / 2, 42);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
    // Drawn in the scene's colours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label.text, sceneTheme()]);
  useEffect(() => () => texture.dispose(), [texture]);
  const aspect = texture.image.width / texture.image.height;
  return (
    <sprite
      position={[
        label.point[0],
        terrainHeight(label.point, terrain) + label.height + 6,
        label.point[1],
      ]}
      center={[0.5, 0]}
      scale={[0.016 * aspect, 0.016, 1]}
      renderOrder={25}
      raycast={() => null}
    >
      <spriteMaterial
        sizeAttenuation={false}
        map={texture}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        opacity={0.92}
      />
    </sprite>
  );
}
/**
 * Keeps a fictional city's haze at the same depth on screen however far the
 * camera sits (phones frame the area from further away).
 */
function FogFollowsCamera() {
  useFrame(({ scene, camera, controls }) => {
    if (!(scene.fog instanceof THREE.Fog)) return;
    const target =
      (controls as unknown as { target?: THREE.Vector3 } | null)?.target ??
      new THREE.Vector3();
    const d = camera.position.distanceTo(target);
    scene.fog.near = d * 0.75;
    scene.fog.far = d * 2.8;
  });
  return null;
}
/** Hands the app a way to snapshot the current view as a PNG data URL. */
function CaptureBridge({
  onReady,
}: {
  onReady: (capture: (() => string) | null) => void;
}) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(() => {
      // Draw a fresh frame first: the drawing buffer isn't kept between frames.
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    });
    return () => onReady(null);
  }, [gl, scene, camera, onReady]);
  return null;
}
/** Eye height for the street-level walk: a person walking, under the trees. */
const EYE_M = 2;
/**
 * Street level: the camera walks the route, looking a little way ahead,
 * then hands control back where it was. Any drag stops it.
 */
function StreetWalk({
  points,
  terrain,
  onDone,
  framed,
}: {
  points: Point[];
  terrain?: World["terrain"];
  onDone: () => void;
  /** The latest overhead framing, to return to afterwards. */
  framed: RefObject<Framing | null>;
}) {
  const { camera, controls, invalidate } = useThree();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (points.length < 2) return;
    const orbit = controls as unknown as
      | (THREE.EventDispatcher<{ start: object }> & {
          target: THREE.Vector3;
          enabled: boolean;
          update: () => void;
        })
      | null;
    const saved = {
      position: camera.position.clone(),
      target: orbit?.target.clone(),
    };
    if (orbit) orbit.enabled = false;
    const lengths = [0];
    for (let i = 1; i < points.length; i++)
      lengths.push(
        lengths[i - 1] +
          Math.hypot(
            points[i][0] - points[i - 1][0],
            points[i][1] - points[i - 1][1],
          ),
      );
    const total = lengths.at(-1)!;
    const at = (d: number): Point => {
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < d) i++;
      const span = lengths[i] - lengths[i - 1] || 1;
      const t = Math.min(1, Math.max(0, (d - lengths[i - 1]) / span));
      const [a, b] = [points[i - 1], points[i]];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    // A brisk, watchable pace: 8 to 40 seconds whatever the length.
    const seconds = Math.min(40, Math.max(8, total / 22));
    const start = performance.now();
    let frame = 0;
    const eye = new THREE.Vector3();
    const look = new THREE.Vector3();
    const tick = (t: number) => {
      const d = (((t - start) / 1000) * total) / seconds;
      if (d >= total) {
        done.current();
        return;
      }
      const p = at(d),
        ahead = at(Math.min(total, d + 35));
      const y = terrainHeight(p, terrain) + EYE_M;
      // Ease the view so corners turn smoothly rather than snapping.
      look.lerp(
        new THREE.Vector3(
          ahead[0],
          terrainHeight(ahead, terrain) + EYE_M + 0.6,
          ahead[1],
        ),
        d === 0 ? 1 : 0.12,
      );
      eye.set(p[0], y, p[1]);
      camera.position.copy(eye);
      camera.lookAt(look);
      // Keep the orbit target well ahead, so camera-relative haze stays
      // at street distances instead of closing in around the walker.
      if (orbit)
        orbit.target
          .copy(look)
          .sub(eye)
          .normalize()
          .multiplyScalar(400)
          .add(eye);
      invalidate();
      frame = requestAnimationFrame(tick);
    };
    look.set(points[1][0], EYE_M, points[1][1]);
    frame = requestAnimationFrame(tick);
    // Read at cleanup on purpose: the latest overhead framing, which may
    // have changed while walking (the panel can move).
    const latest = framed;
    return () => {
      cancelAnimationFrame(frame);
      const f = latest.current;
      const target = f?.target ?? saved.target;
      camera.position.copy(f ? f.target.clone().add(f.offset) : saved.position);
      if (target) camera.lookAt(target);
      if (orbit) {
        if (target) orbit.target.copy(target);
        orbit.enabled = true;
        orbit.update();
      }
      invalidate();
    };
  }, [points, terrain, camera, controls, invalidate, framed]);
  return null;
}
const DRAW_MS = 900;
/** The route line, drawing itself from start to finish when it appears. */
function RouteDraw({ points, overHeat }: { points: P3[]; overHeat: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const [k, setK] = useState(() =>
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 1
      : 0,
  );
  useEffect(() => {
    if (k >= 1) return;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / DRAW_MS);
      setK(1 - Math.pow(1 - p, 3));
      // The canvas draws on demand; ask for each frame of the draw.
      invalidate();
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Runs once per mounted route; k only moves forward from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidate]);
  const shown = partialLine(points, k);
  // Drawn over the scene like a map overlay: under tree crowns and past
  // buildings it would break into dashes. Over heat colours it is a dark
  // line with a light casing, so it never blends into the hot paths.
  const overlay = { depthTest: false, depthWrite: false, transparent: true };
  return overHeat ? (
    <>
      <Line
        points={shown}
        color={sc("#fffdf4")}
        lineWidth={12}
        {...overlay}
        renderOrder={20}
      />
      <Line
        points={shown}
        color={sc("#1d3557")}
        lineWidth={6}
        {...overlay}
        renderOrder={21}
      />
    </>
  ) : (
    <>
      <Line
        points={shown}
        color={sc("#fffdf4")}
        lineWidth={10}
        opacity={0.85}
        {...overlay}
        renderOrder={20}
      />
      <Line
        points={shown}
        color={sc("#d57b48")}
        lineWidth={6}
        {...overlay}
        renderOrder={21}
      />
    </>
  );
}
export default function WorldCanvas({
  world,
  environment,
  selectedId,
  onSelect,
  onGroundClick,
  route,
  startPoint,
  endPoint,
  showWalkingPaths = false,
  locationPoint,
  pickingEndpoint = false,
  showTrees = true,
  showBuildings = true,
  heat,
  onHeatSelect,
  insets = NO_INSETS,
  theme = "editorial",
  ambient,
  onCaptureReady,
  crowd,
  walkthrough,
  onWalkthroughDone,
  labels,
}: {
  world: World;
  environment: Environment;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGroundClick: (p: Point) => void;
  route: RouteResult | null;
  startPoint?: Point;
  endPoint?: Point;
  locationPoint?: Point;
  showWalkingPaths?: boolean;
  pickingEndpoint?: boolean;
  showTrees?: boolean;
  showBuildings?: boolean;
  heat?: HeatOverlay | null;
  onHeatSelect?: (edgeId: string, point: Point) => void;
  /** Panels over the map; the camera frames the area beside them. */
  insets?: MapInsets;
  /** Interface style; the scene's colours follow it. */
  theme?: ThemeName;
  /** A fictional city's own sky; the canvas turns see-through over it. */
  ambient?: Ambient | null;
  /** Receives a snapshot function while the scene is mounted. */
  onCaptureReady?: (capture: (() => string) | null) => void;
  /** People walking the streets (null for none). */
  crowd?: { count: number; shade?: Map<string, number>; hot: boolean } | null;
  /** Walk this route at street level (null when not walking). */
  walkthrough?: Point[] | null;
  onWalkthroughDone?: () => void;
  /** Named places to tag on the map (hidden at street level). */
  labels?: PlaceLabel[];
}) {
  // Children read the scene style while rendering (see lib/scene-theme).
  setSceneTheme(theme);
  const sun = sunDirection(environment, world.origin);
  // Windows light up through dusk; full by the time the sun is ~5° down.
  // Night-life cities keep some windows lit even before dusk.
  const lightsOn = Math.max(
    ambient?.night ? 0.35 : 0,
    Math.min(1, Math.max(0, (0.06 - sun.y) / 0.14)),
  );
  // Daylight warms toward the horizon and cools to moonlight at night.
  // The sky deepens toward night as the lights come on.
  const sky = ambient
    ? ambient.fog
    : "#" +
      new THREE.Color(sc("#eeece3"))
        .lerp(new THREE.Color("#1b2233"), lightsOn * 0.85)
        .getHexString();
  const sunColor = new THREE.Color("#fff4dc").lerp(
    new THREE.Color("#ffb46b"),
    Math.min(1, Math.max(0, 1 - sun.y / 0.35)),
  );
  const framed = useRef<Framing | null>(null);
  // Fictional cities tint the land toward their own haze.
  const ground = ambient
    ? "#" +
      new THREE.Color(sc("#e5e1d5"))
        .lerp(new THREE.Color(ambient.fog), 0.55)
        .getHexString()
    : sc("#e5e1d5");
  const extent = world.extent;
  // Large mapped areas draw OSM buildings as one mesh; designed objects and
  // the selected building stay individual so they keep their detail.
  const [reducedMotion] = useState(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  // Narrow screens draw the map smaller, so labels need more room.
  const [narrow] = useState(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(max-width: 720px)").matches,
  );
  const [lowPower] = useState(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(max-width: 720px), (pointer: coarse)").matches,
  );
  const merged = useMemo(
    () =>
      world.objects.length >= MERGE_THRESHOLD
        ? world.objects.filter(
            (o) =>
              o.kind !== "tree" &&
              // Shaped landmarks keep their silhouettes; on phones only
              // named landmarks do, and decorative towers merge (fewer draws).
              (!o.shape || (lowPower && o.kind !== "landmark")) &&
              (o.source === "osm" ||
                // Generated towers and landmarks keep their own shapes.
                ((o.source === "study" || o.source === "ai") &&
                  o.kind !== "tower" &&
                  o.kind !== "landmark")) &&
              o.id !== selectedId,
          )
        : null,
    [world.objects, selectedId, lowPower],
  );
  // Whatever is merged is drawn once, never again on its own.
  const mergedIds = useMemo(
    () => new Set(merged?.map((o) => o.id) ?? []),
    [merged],
  );
  return (
    <Canvas
      shadows="soft"
      camera={{
        position: [extent * 0.65, extent * 0.72, extent * 0.7],
        fov: 40,
        near: 1,
        far: 20000,
      }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: !!ambient }}
      // Draw only when the camera or scene changes, not 60 times a second.
      frameloop="demand"
      raycaster={{ params: { Line: { threshold: 3 } } } as never}
    >
      <FrameArea
        extent={extent}
        insets={insets}
        focus={startPoint && endPoint ? [startPoint, endPoint] : []}
        framed={framed}
      />
      <ArrivalFlight framed={framed} />
      {!ambient && <color attach="background" args={[sky]} />}
      {/* Depth: far streets fade into the background colour; fictional
          cities fade sooner into their own haze. */}
      {ambient && <FogFollowsCamera />}
      {onCaptureReady && <CaptureBridge onReady={onCaptureReady} />}
      {walkthrough && (
        <StreetWalk
          framed={framed}
          points={walkthrough}
          terrain={world.terrain}
          onDone={() => onWalkthroughDone?.()}
        />
      )}
      {crowd && !reducedMotion && (
        <Crowd
          world={world}
          terrain={world.terrain}
          count={crowd.count}
          night={lightsOn}
          shade={crowd.shade}
          hot={crowd.hot}
          streetLevel={!!walkthrough}
        />
      )}
      <fog
        attach="fog"
        args={[
          sky,
          extent * (ambient ? 0.9 : 1.6),
          extent * (ambient ? 3.4 : 5),
        ]}
      />
      {/* Less flat fill than before so shade reads, plus cool moonlight at
          night instead of darkness. */}
      <ambientLight intensity={sun.y > 0 ? 0.62 : 0.32} />
      <hemisphereLight
        args={[
          ambient
            ? "#" +
              new THREE.Color(sun.y > 0 ? "#fff7e2" : "#5b6f9a")
                .lerp(new THREE.Color(ambient.sky[1]), 0.45)
                .getHexString()
            : sun.y > 0
              ? "#fff7e2"
              : "#5b6f9a",
          sun.y > 0 ? "#9aab91" : "#22283a",
          sun.y > 0 ? 0.95 : 0.55,
        ]}
      />
      {sun.y <= 0 && (
        <directionalLight
          intensity={0.35}
          color="#9fb4e6"
          position={[-extent * 0.4, extent * 0.9, extent * 0.3]}
        />
      )}
      <directionalLight
        castShadow
        color={sunColor}
        intensity={sun.y > 0 ? 3.0 * (1 - environment.cloudCover / 120) : 0}
        position={[sun.x * extent, sun.y * extent, sun.z * extent]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-extent * 0.7}
        shadow-camera-right={extent * 0.7}
        shadow-camera-top={extent * 0.7}
        shadow-camera-bottom={-extent * 0.7}
        shadow-camera-far={extent * 4}
        shadow-bias={-0.0002}
      />
      <Ground world={world} onClick={onGroundClick} color={ground} />
      {/* A fictional city's land melts into its painted sky sooner. */}
      <Horizon world={world} color={ground} reach={ambient ? 2.4 : 9} />
      {world.landscapes.map((l) => (
        <Area
          key={l.id}
          points={l.points}
          color={l.kind === "water" ? sc("#a5bcba") : sc("#bdc6a0")}
        />
      ))}
      <Roads world={world} />
      {heat ? (
        <HeatPaths
          world={world}
          heat={heat}
          onSelect={(edgeId, point) =>
            pickingEndpoint || !onHeatSelect
              ? onGroundClick(point)
              : onHeatSelect(edgeId, point)
          }
        />
      ) : (
        showWalkingPaths && (
          <WalkingPaths world={world} onClick={onGroundClick} />
        )
      )}
      <group
        onClick={(e) => {
          if (pickingEndpoint) {
            e.stopPropagation();
            onGroundClick([e.point.x, e.point.z]);
          }
        }}
      >
        {showBuildings && merged && (
          <MergedBuildings
            objects={merged}
            terrain={world.terrain}
            lightsOn={lightsOn}
            windowTint={
              ambient?.night
                ? "#" +
                  new THREE.Color("#ffffff")
                    .lerp(new THREE.Color(ambient.accent), 0.5)
                    .getHexString()
                : undefined
            }
            onPick={(o) => {
              if (!pickingEndpoint) onSelect(o.id);
            }}
          />
        )}
        {showBuildings &&
          world.objects
            .filter((o) => o.kind !== "tree" && !mergedIds.has(o.id))
            .map((o) => (
              <Building
                key={o.id}
                object={o}
                terrain={world.terrain}
                selected={o.id === selectedId}
                detailed={world.objects.length < 500}
                onPointerDown={(e, obj) => {
                  e.stopPropagation();
                  if (!pickingEndpoint) onSelect(obj.id);
                }}
              />
            ))}
        {showTrees && (
          <Trees
            objects={world.objects.filter((o) => o.kind === "tree")}
            terrain={world.terrain}
            selectedId={selectedId}
            onPointerDown={(e, o) => {
              e.stopPropagation();
              if (!pickingEndpoint) onSelect(o.id);
            }}
          />
        )}
      </group>
      {route && !walkthrough && (
        <RouteDraw
          // A new route draws itself in; the same route doesn't replay.
          key={route.points.map((p) => p.join(",")).join(";")}
          points={route.points.map((p) => [
            p[0],
            terrainHeight(p, world.terrain) + 3,
            p[1],
          ])}
          overHeat={!!heat}
        />
      )}
      {!walkthrough &&
        labels
          // The start and finish markers name those places already.
          ?.filter(
            (l) =>
              ![startPoint, endPoint].some(
                (p) =>
                  p &&
                  Math.hypot(p[0] - l.point[0], p[1] - l.point[1]) <
                    (narrow ? LABEL_MARKER_GAP * 4 : LABEL_MARKER_GAP),
              ),
          )
          // Phones: the first few that are left, which the lists lead with.
          .slice(0, narrow ? 4 : undefined)
          .map((l) => (
            <PlaceTag key={l.text} label={l} terrain={world.terrain} />
          ))}
      {startPoint && (
        <Endpoint point={startPoint} label="Start" terrain={world.terrain} />
      )}
      {endPoint && (
        <Endpoint point={endPoint} label="Finish" terrain={world.terrain} />
      )}
      {locationPoint && (
        <mesh
          position={[
            locationPoint[0],
            terrainHeight(locationPoint, world.terrain) + 5,
            locationPoint[1],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={32}
        >
          <circleGeometry args={[6, 24]} />
          <meshBasicMaterial
            color={sc("#3479bf")}
            depthTest={false}
            transparent
          />
        </mesh>
      )}
      <OrbitControls
        makeDefault
        minDistance={70}
        maxDistance={extent * 4}
        maxPolarAngle={Math.PI * 0.48}
      />
    </Canvas>
  );
}
