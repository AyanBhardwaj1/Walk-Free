import SunCalc from "suncalc";

/**
 * When each side of a street is in shade through a day, from the street's
 * cross-section (as a photo rebuilds it: how far the fronts are and how
 * tall) and the sun's path. Looking along the street, the sun's elevation
 * as seen in the cross-section is its "profile angle"; a point on the
 * ground is in shade when the front on the sun's side rises above the line
 * from it to the sun.
 */
export interface Canyon {
  /** Fronts' distance from the camera, metres (left negative). */
  left: number;
  right: number;
  /** Heights of the left and right fronts, metres. */
  leftTall: number;
  rightTall: number;
  /** The way the photo looks along the street, degrees clockwise from north. */
  bearing: number;
}

export type Strip = "left" | "middle" | "right";

export interface ShadeSample {
  /** Epoch ms. */
  time: number;
  /** Sun above the horizon. */
  sunUp: boolean;
  shaded: Record<Strip, boolean>;
}

/** The ground across the street where each strip is judged, metres. */
export function strips(c: Canyon): Record<Strip, number> {
  const width = c.right - c.left;
  // Sidewalks: the outer fifth on each side (2-4 m is typical).
  const walk = Math.min(4, Math.max(1, width * 0.2));
  return {
    left: c.left + walk / 2,
    middle: (c.left + c.right) / 2,
    right: c.right - walk / 2,
  };
}

/** Whether the ground at `x` (metres across) is shaded at one moment. */
export function shadedAt(
  c: Canyon,
  x: number,
  sun: { altitude: number; bearing: number },
) {
  if (sun.altitude <= 0) return true;
  const b = (c.bearing * Math.PI) / 180,
    s = (sun.bearing * Math.PI) / 180;
  // The sun's direction: east, north, up.
  const e = Math.sin(s) * Math.cos(sun.altitude),
    n = Math.cos(s) * Math.cos(sun.altitude),
    u = Math.sin(sun.altitude);
  // Its part across the street (positive: from the right-hand side).
  const across = e * Math.cos(b) - n * Math.sin(b);
  if (Math.abs(across) < 1e-6) return false; // straight down the street
  const slope = u / Math.abs(across);
  return across > 0
    ? (c.right - x) * slope < c.rightTall
    : (x - c.left) * slope < c.leftTall;
}

/** Sun position as altitude (radians) and compass bearing (degrees). */
export function sunAt(time: number, lat: number, lon: number) {
  const p = SunCalc.getPosition(new Date(time), lat, lon);
  // SunCalc measures azimuth from south, positive to the west.
  return {
    altitude: p.altitude,
    bearing: ((((p.azimuth * 180) / Math.PI + 180) % 360) + 360) % 360,
  };
}

/** Shade across the street every `step` minutes from sunrise to sunset. */
export function canyonDay(
  c: Canyon,
  day: Date,
  lat: number,
  lon: number,
  step = 10,
): ShadeSample[] {
  const times = SunCalc.getTimes(day, lat, lon);
  const rise = times.sunrise.getTime(),
    set = times.sunset.getTime();
  if (!Number.isFinite(rise) || !Number.isFinite(set) || set <= rise) return [];
  const at = strips(c);
  const out: ShadeSample[] = [];
  for (let t = rise; t <= set; t += step * 60_000) {
    const sun = sunAt(t, lat, lon);
    out.push({
      time: t,
      sunUp: sun.altitude > 0,
      shaded: {
        left: shadedAt(c, at.left, sun),
        middle: shadedAt(c, at.middle, sun),
        right: shadedAt(c, at.right, sun),
      },
    });
  }
  return out;
}

/** Runs of shade for one strip, as [start, end] epoch ms. */
export function shadeSpans(samples: ShadeSample[], strip: Strip, step = 10) {
  const spans: [number, number][] = [];
  for (const s of samples) {
    if (!s.shaded[strip]) continue;
    const last = spans.at(-1);
    if (last && s.time - last[1] <= step * 60_000 + 1) last[1] = s.time;
    else spans.push([s.time, s.time]);
  }
  return spans;
}

/** Share of daylight samples a strip is in shade, 0 to 1. */
export function shadeShare(samples: ShadeSample[], strip: Strip) {
  const up = samples.filter((s) => s.sunUp);
  return up.length ? up.filter((s) => s.shaded[strip]).length / up.length : 0;
}
