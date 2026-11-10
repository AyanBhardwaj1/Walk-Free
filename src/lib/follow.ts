import type { Point } from "../../shared/types.js";
import type { LocationFix } from "./walk-location.js";

/**
 * Follow-me location for phones and laptops.
 *
 * Phones report GPS fixes of a few metres; laptops report Wi-Fi fixes of
 * 30-150 m that jump about. A constant-velocity Kalman filter in local
 * metres turns either into a steady position, a walking speed and a
 * heading, weighting each fix by the accuracy the device reports.
 */

/** Laptops locate by Wi-Fi; fixes this coarse are still worth following. */
export const FOLLOW_MAX_ACCURACY_M = 150;
/** A fix older than this is stale (a cached position from earlier). */
const MAX_AGE_MS = 60_000;

/** Whether a fix is fresh and sane enough to follow (looser than walking). */
export function followableFix(fix: LocationFix, now = Date.now()) {
  return (
    [fix.lat, fix.lon, fix.accuracy, fix.timestamp].every(Number.isFinite) &&
    Math.abs(fix.lat) <= 85 &&
    Math.abs(fix.lon) <= 180 &&
    fix.accuracy > 0 &&
    fix.accuracy <= FOLLOW_MAX_ACCURACY_M &&
    now - fix.timestamp <= MAX_AGE_MS &&
    fix.timestamp <= now + 5000
  );
}

/** Where the walker probably is, how sure we are, and how they're moving. */
export interface Estimate {
  position: Point;
  /** One standard deviation of the position, metres. */
  uncertainty: number;
  /** Ground speed, metres a second. */
  speed: number;
  /** Direction of travel, degrees clockwise from north; null when still. */
  heading: number | null;
  timestamp: number;
}

/** How briskly a walker can change speed (m/s²): walking, not driving. */
const ACCELERATION_NOISE = 0.4;
/** Below this speed the walker is standing; heading isn't meaningful. */
const STILL_MPS = 0.35;
/** Faster than any walk or jog: a jump in the fixes, not a walker. */
const MAX_PLAUSIBLE_MPS = 7;

/**
 * A 2D constant-velocity Kalman filter, x and z treated independently
 * (state: position and velocity on each axis).
 */
export class WalkTracker {
  private x: [number, number] | null = null; // [position, velocity] on x
  private z: [number, number] | null = null;
  // Covariance per axis: [[pp, pv], [pv, vv]].
  private px: [number, number, number] = [0, 0, 0];
  private pz: [number, number, number] = [0, 0, 0];
  private t = 0;

  reset() {
    this.x = this.z = null;
    this.t = 0;
  }

  /** Folds in one fix in local metres; returns the new estimate. */
  update(at: Point, accuracy: number, timestamp: number): Estimate {
    const r = Math.max(1, accuracy) ** 2;
    if (!this.x || !this.z || timestamp - this.t > 120_000) {
      this.x = [at[0], 0];
      this.z = [at[1], 0];
      this.px = [r, 0, 1];
      this.pz = [r, 0, 1];
      this.t = timestamp;
      return this.estimate();
    }
    const dt = Math.max(0, (timestamp - this.t) / 1000);
    this.t = timestamp;
    // A fix implying an impossible jump is mostly noise: trust it less.
    const predicted = this.predicted(dt);
    const jump = Math.hypot(at[0] - predicted[0], at[1] - predicted[1]);
    const plausible = MAX_PLAUSIBLE_MPS * Math.max(dt, 1) + 2 * accuracy;
    const weight = jump > plausible ? (jump / plausible) ** 2 : 1;
    this.x = step(this.x, this.px, at[0], r * weight, dt);
    this.z = step(this.z, this.pz, at[1], r * weight, dt);
    return this.estimate();
  }

  private predicted(dt: number): Point {
    return [this.x![0] + this.x![1] * dt, this.z![0] + this.z![1] * dt];
  }

  estimate(): Estimate {
    if (!this.x || !this.z) throw Error("No fixes yet.");
    const vx = this.x[1],
      vz = this.z[1];
    const speed = Math.hypot(vx, vz);
    return {
      position: [this.x[0], this.z[0]],
      uncertainty: Math.sqrt((this.px[0] + this.pz[0]) / 2),
      speed,
      // North is -z, east is +x (as on the map).
      heading:
        speed < STILL_MPS
          ? null
          : ((Math.atan2(vx, -vz) * 180) / Math.PI + 360) % 360,
      timestamp: this.t,
    };
  }
}

/** One predict-and-correct step on one axis; updates `p` in place. */
function step(
  s: [number, number],
  p: [number, number, number],
  measured: number,
  r: number,
  dt: number,
): [number, number] {
  // Predict: position moves with velocity; uncertainty grows.
  const q = ACCELERATION_NOISE ** 2;
  const pos = s[0] + s[1] * dt;
  const vel = s[1];
  let [pp, pv, vv] = p;
  pp = pp + 2 * dt * pv + dt * dt * vv + (q * dt ** 4) / 4;
  pv = pv + dt * vv + (q * dt ** 3) / 2;
  vv = vv + q * dt * dt;
  // Correct with the measured position.
  const k0 = pp / (pp + r),
    k1 = pv / (pp + r);
  const innovation = measured - pos;
  p[0] = (1 - k0) * pp;
  p[1] = (1 - k0) * pv;
  p[2] = vv - k1 * pv;
  return [pos + k0 * innovation, vel + k1 * innovation];
}

/** How far a point is outside a square area of this width (0 inside). */
export function outsideArea(p: Point, extent: number) {
  const half = extent / 2;
  return Math.max(0, Math.abs(p[0]) - half, Math.abs(p[1]) - half);
}

/** The camera should re-centre once the walker has moved this far. */
export const RECENTER_M = 4;
