import { useEffect, useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

/** What the on-screen map controls can ask of the 3D camera. */
export interface MapCamera {
  /** Closer (factor < 1) or further (factor > 1), around the view centre. */
  zoom(factor: number): void;
  /** Back to the framing of the walk, or the whole area. */
  reset(): void;
  /** Turn to face north, keeping height and distance. */
  north(): void;
  /** Between looking straight down and the usual angled view. */
  tilt(): void;
  /** Move the view across the ground, in screen directions (right, down). */
  pan(right: number, down: number): void;
}

interface Orbit extends THREE.EventDispatcher<{
  change: object;
  start: object;
  end: object;
}> {
  target: THREE.Vector3;
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  update(): void;
}

export interface Framing {
  target: THREE.Vector3;
  offset: THREE.Vector3;
}

const MOVE_MS = 520;
const ease = (p: number) => 1 - Math.pow(1 - p, 3);
const UP = new THREE.Vector3(0, 1, 0);

/** The compass bearing the camera looks along, in degrees (0 = north). */
export function bearingOf(camera: THREE.Vector3, target: THREE.Vector3) {
  // North is -z in scene space, east is +x.
  const dx = target.x - camera.x,
    dz = target.z - camera.z;
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

/** Keeps a point within this distance of the area's centre. */
export function clampToArea(p: THREE.Vector3, limit: number) {
  const d = Math.hypot(p.x, p.z);
  if (d <= limit) return null;
  const k = limit / d;
  return new THREE.Vector3(p.x * k - p.x, 0, p.z * k - p.z);
}

/**
 * Smooth camera moves for the map controls, a live compass bearing, and a
 * leash that keeps the view over the area.
 */
export default function CameraRig({
  api,
  framed,
  extent,
  onBearing,
}: {
  api?: RefObject<MapCamera | null>;
  framed: RefObject<Framing | null>;
  extent: number;
  onBearing?: (degrees: number) => void;
}) {
  const { camera, controls, invalidate } = useThree();
  const bearing = useRef(onBearing);
  bearing.current = onBearing;
  useEffect(() => {
    const orbit = controls as unknown as Orbit | null;
    if (!orbit) return;
    const reduced =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const cancel = () => cancelAnimationFrame(frame);
    /** Glide the camera and its target to a new place. */
    const move = (toTarget: THREE.Vector3, toPosition: THREE.Vector3) => {
      cancel();
      if (!orbit.enabled) return;
      const fromTarget = orbit.target.clone(),
        fromPosition = camera.position.clone();
      const apply = (k: number) => {
        orbit.target.lerpVectors(fromTarget, toTarget, k);
        camera.position.lerpVectors(fromPosition, toPosition, k);
        camera.lookAt(orbit.target);
        orbit.update();
        invalidate();
      };
      if (reduced) return apply(1);
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / MOVE_MS);
        apply(ease(p));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const offset = () => camera.position.clone().sub(orbit.target);
    if (api)
      api.current = {
        zoom(factor) {
          const o = offset();
          const length = THREE.MathUtils.clamp(
            o.length() * factor,
            orbit.minDistance,
            orbit.maxDistance,
          );
          move(
            orbit.target.clone(),
            orbit.target.clone().add(o.setLength(length)),
          );
        },
        reset() {
          const f = framed.current;
          if (f) move(f.target.clone(), f.target.clone().add(f.offset));
        },
        north() {
          const o = offset();
          const flat = Math.hypot(o.x, o.z);
          // Looking north means standing south of the target (+z).
          move(
            orbit.target.clone(),
            orbit.target.clone().add(new THREE.Vector3(0, o.y, flat)),
          );
        },
        pan(right, down) {
          // A fifth of the view per press, along the ground as seen on screen.
          const o = offset();
          const step = o.length() * 0.2;
          const forward = new THREE.Vector3(-o.x, 0, -o.z);
          if (forward.lengthSq() < 1e-6) {
            // Looking straight down: screen up is the camera's up vector.
            forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0;
          }
          forward.normalize();
          const rightward = new THREE.Vector3()
            .crossVectors(forward, UP)
            .normalize();
          const shift = rightward
            .multiplyScalar(right * step)
            .addScaledVector(forward, -down * step);
          move(
            orbit.target.clone().add(shift),
            camera.position.clone().add(shift),
          );
        },
        tilt() {
          const o = offset();
          const length = o.length();
          const flat = Math.hypot(o.x, o.z);
          const steep = flat / length < 0.2;
          // Keep the heading; either nearly straight down or the usual angle.
          const heading =
            flat > 1e-3
              ? new THREE.Vector3(o.x, 0, o.z).normalize()
              : new THREE.Vector3(0, 0, 1);
          const angle = steep ? Math.asin(0.72) : Math.PI / 2 - 0.05;
          const next = heading
            .multiplyScalar(Math.cos(angle) * length)
            .add(UP.clone().multiplyScalar(Math.sin(angle) * length));
          move(orbit.target.clone(), orbit.target.clone().add(next));
        },
      };
    // A drag or zoom takes over from any glide.
    orbit.addEventListener("start", cancel);
    let last = -1;
    const onChange = () => {
      // Keep the view over the area: pull the target (and camera) back.
      const shift = clampToArea(orbit.target, extent * 0.75);
      if (shift) {
        orbit.target.add(shift);
        camera.position.add(shift);
      }
      const b = Math.round(bearingOf(camera.position, orbit.target));
      if (b !== last) {
        last = b;
        bearing.current?.(b);
      }
    };
    orbit.addEventListener("change", onChange);
    onChange();
    return () => {
      cancel();
      orbit.removeEventListener("start", cancel);
      orbit.removeEventListener("change", onChange);
      if (api) api.current = null;
    };
  }, [camera, controls, invalidate, api, framed, extent]);
  return null;
}
