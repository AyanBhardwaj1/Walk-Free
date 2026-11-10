import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { landDots, lonLatToXYZ } from "../lib/globe-land";

/** A place drawn on the globe, with the link it opens. */
export interface GlobePlace {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  href: string;
}

/** The highlighted place, and whether the list or the globe picked it. */
export interface GlobeFocus {
  slug: string;
  from: "list" | "globe";
}

interface Props {
  places: readonly GlobePlace[];
  focus: GlobeFocus | null;
  onFocus: (slug: string | null) => void;
  reducedMotion: boolean;
  /** False while the section is off screen, so the globe stops drawing. */
  running: boolean;
}

// The landing page palette: ivory paper, sage land, forest lines and a
// warm heat-orange for the places you can open.
const PAPER = "#fbf9f1";
const LAND = "#7f9a6c";
const LINES = "#b9c6a8";
const HALO = "#9db58a";
const MARKER = "#c4561f";
const MARKER_GLOW = "#e08a3c";

/** Camera distance from the centre; the globe has a radius of 1. */
const DISTANCE = 4.4;
/** Below this, a point on the globe is round the back or on the horizon. */
const FACING = 1 / DISTANCE + 0.04;
/** The first view: centred over the United States, a little from the south. */
const START = new THREE.Vector3(...lonLatToXYZ(-98, 30)).multiplyScalar(
  DISTANCE,
);

/** Latitude and longitude lines every 15°, as one set of line segments. */
function useGraticule() {
  return useMemo(() => {
    const points: number[] = [];
    const r = 1.0015;
    const push = (lon: number, lat: number) =>
      points.push(...lonLatToXYZ(lon, lat, r));
    for (let lat = -75; lat <= 75; lat += 15)
      for (let lon = -180; lon < 180; lon += 3) {
        push(lon, lat);
        push(lon + 3, lat);
      }
    for (let lon = -180; lon < 180; lon += 15)
      for (let lat = -84; lat < 84; lat += 3) {
        push(lon, lat);
        push(lon, lat + 3);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    return geometry;
  }, []);
}

/** Land drawn as a dot matrix: one small flat disc per land point. */
function LandDots() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dots = useMemo(() => landDots(2), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    dots.forEach(([lon, lat], i) => {
      dummy.position.set(...lonLatToXYZ(lon, lat, 1.002));
      // A circle faces +Z; point it straight out from the centre.
      dummy.lookAt(dummy.position.clone().multiplyScalar(2));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, dots.length]}>
      <circleGeometry args={[0.0085, 10]} />
      <meshBasicMaterial color={LAND} />
    </instancedMesh>
  );
}

/** A soft sage rim behind the globe, brightest at the edge like an atmosphere. */
function Halo() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: { color: { value: new THREE.Color(HALO) } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 world = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-world.xyz);
            gl_Position = projectionMatrix * world;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 color;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
            gl_FragColor = vec4(color, rim * 0.4);
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material}>
      <sphereGeometry args={[1.09, 64, 64]} />
    </mesh>
  );
}

/** Whether a point on the globe is turned towards the camera. */
function facesCamera(point: THREE.Vector3, camera: THREE.Camera) {
  return (
    point.clone().normalize().dot(camera.position.clone().normalize()) > FACING
  );
}

function Marker({
  place,
  active,
  reducedMotion,
  onFocus,
}: {
  place: GlobePlace;
  active: boolean;
  reducedMotion: boolean;
  onFocus: (slug: string | null) => void;
}) {
  const position = useMemo(
    () => new THREE.Vector3(...lonLatToXYZ(place.lon, place.lat, 1.006)),
    [place.lon, place.lat],
  );
  const outward = useMemo(() => position.clone().multiplyScalar(2), [position]);
  const glow = useRef<THREE.Mesh>(null);
  const label = useRef<HTMLDivElement>(null);
  // Each marker breathes on its own beat so the cluster doesn't pulse as one.
  const phase = useMemo(() => (place.lon * 7 + place.lat * 3) % 6.28, [place]);
  useLayoutEffect(() => glow.current?.lookAt(outward), [outward]);
  useFrame(({ clock, camera }) => {
    const pulse = reducedMotion
      ? 1
      : 1 + 0.18 * Math.sin(clock.elapsedTime * 2.2 + phase);
    glow.current?.scale.setScalar((active ? 1.5 : 1) * pulse);
    // Hide the label when its place has turned round the back.
    if (label.current)
      label.current.style.opacity = facesCamera(position, camera) ? "1" : "0";
  });
  // Ignore a marker the pointer reaches through the globe from behind.
  const front = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    facesCamera(position, e.camera);
  return (
    <group position={position}>
      <mesh ref={glow} renderOrder={1}>
        <circleGeometry args={[0.04, 24]} />
        <meshBasicMaterial
          color={MARKER_GLOW}
          transparent
          opacity={active ? 0.45 : 0.3}
          depthWrite={false}
        />
      </mesh>
      <mesh renderOrder={2}>
        <sphereGeometry args={[active ? 0.02 : 0.015, 16, 16]} />
        <meshBasicMaterial color={MARKER} />
      </mesh>
      {/* A larger, invisible target so a fingertip can hit the dot. */}
      <mesh
        onPointerOver={(e) => {
          if (!front(e)) return;
          e.stopPropagation();
          onFocus(place.slug);
        }}
        onPointerOut={() => onFocus(null)}
        onClick={(e) => {
          if (!front(e)) return;
          e.stopPropagation();
          window.location.assign(place.href);
        }}
      >
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {active && (
        <Html zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <div ref={label} className="coverage-globe-label">
            {place.name}
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({ places, focus, onFocus, reducedMotion }: Props) {
  const controls = useRef<OrbitControlsImpl>(null);
  // Auto-rotation stops for good once someone drags or picks a place.
  const [touched, setTouched] = useState(false);
  const target = useRef<THREE.Vector3 | null>(null);
  const canvas = useThree((s) => s.gl.domElement);
  const graticule = useGraticule();

  // A pointer over a marker means "open this"; anywhere else, "drag me".
  const overMarker = focus?.from === "globe";
  useEffect(() => {
    canvas.style.cursor = overMarker ? "pointer" : "grab";
  }, [canvas, overMarker]);

  // OrbitControls claims every touch; let vertical swipes scroll the page
  // so the globe never traps someone scrolling past it on a phone.
  useEffect(() => {
    const el = controls.current?.domElement;
    if (el) el.style.touchAction = "pan-y";
  }, []);

  // Turn to a place chosen from the list so its marker and label show.
  useEffect(() => {
    if (focus?.from !== "list") return;
    const place = places.find((p) => p.slug === focus.slug);
    if (!place) return;
    setTouched(true);
    target.current = new THREE.Vector3(
      ...lonLatToXYZ(place.lon, place.lat),
    ).normalize();
  }, [focus, places]);

  useFrame(({ camera }, dt) => {
    const to = target.current;
    if (!to) return;
    const dir = camera.position.clone().normalize();
    if (reducedMotion || dir.angleTo(to) < 0.002) {
      dir.copy(to);
      target.current = null;
    } else {
      dir.lerp(to, 1 - Math.exp(-dt * 5)).normalize();
    }
    camera.position.copy(dir.multiplyScalar(DISTANCE));
    controls.current?.update();
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color={PAPER} />
      </mesh>
      <lineSegments geometry={graticule}>
        <lineBasicMaterial color={LINES} transparent opacity={0.7} />
      </lineSegments>
      <LandDots />
      <Halo />
      {places.map((p) => (
        <Marker
          key={p.slug}
          place={p}
          active={focus?.slug === p.slug}
          reducedMotion={reducedMotion}
          onFocus={onFocus}
        />
      ))}
      <OrbitControls
        ref={controls}
        enableZoom={false}
        enablePan={false}
        enableDamping
        rotateSpeed={0.5}
        minPolarAngle={Math.PI * 0.2}
        maxPolarAngle={Math.PI * 0.8}
        autoRotate={!reducedMotion && !touched}
        autoRotateSpeed={0.5}
        onStart={() => {
          setTouched(true);
          target.current = null;
        }}
      />
    </>
  );
}

/**
 * The landing page globe: the dot-matrix world with a marker for every place
 * that opens instantly. It is decorative; the list beside it carries the same
 * links for keyboards and screen readers.
 */
export default function CoverageGlobe(props: Props) {
  return (
    <Canvas
      className="coverage-globe-canvas"
      dpr={[1, 2]}
      flat
      frameloop={props.running ? "always" : "never"}
      camera={{ fov: 30, near: 0.1, far: 20, position: START.toArray() }}
      gl={{ antialias: true, alpha: true }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
