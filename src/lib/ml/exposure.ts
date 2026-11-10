import type { Environment, Point, World } from "../../../shared/types.js";
import { createShadeTester, sunDirection } from "../environment.js";
import { toLocal } from "../geo.js";
import { smoothTrace, type LoggedWalk } from "../walk-log.js";

/**
 * How much of your walking was in direct sun: each logged walk on this map
 * is replayed against its buildings and trees at the time it was walked.
 */
export interface WalkSun {
  id: string;
  start: number;
  minutes: number;
  /** Minutes with the sun up and nothing between it and you. */
  sunMinutes: number;
}

/**
 * Shade testers are costly (one per sun position), so walks share one per
 * half hour of the day within each week: across a week the sun at a given
 * time of day moves by under 3°, too little to change which side of a
 * street is in shade.
 */
const HALF_HOUR = 30 * 60_000;
const WEEK = 7 * 24 * 3600_000;

export function walkSun(
  walks: LoggedWalk[],
  world: World,
  env: Environment,
): WalkSun[] {
  const testers = new Map<string, ((p: Point) => boolean) | null>();
  const testerAt = (t: number) => {
    const week = Math.floor(t / WEEK);
    // Half hours of the day in UTC: the map's own day lines up with it
    // within one bucket, which is all the sharing needs.
    const slot = Math.round((t % (24 * 3600_000)) / HALF_HOUR);
    const key = `${week}:${slot}`;
    if (!testers.has(key)) {
      // The sun as it was at that time of day mid-week.
      const mid = week * WEEK + Math.floor(WEEK / 2 / 864e5) * 864e5;
      const at = {
        ...env,
        dateTime: new Date(mid + slot * HALF_HOUR).toISOString(),
      };
      // Sun down: no direct sun at all.
      testers.set(
        key,
        sunDirection(at, world.origin).y <= 0
          ? null
          : createShadeTester(world, at),
      );
    }
    return testers.get(key)!;
  };
  const out: WalkSun[] = [];
  for (const w of walks) {
    if (w.area !== world.id || w.points.length < 2) continue;
    const pts = smoothTrace(w.points);
    let minutes = 0,
      sun = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const dt = (b.t - a.t) / 60_000;
      if (!(dt > 0) || dt > 5) continue; // a gap, not walking
      minutes += dt;
      const t = (a.t + b.t) / 2;
      // Whether the sun is up at this very moment (the shared tester is
      // for its half hour, which can straddle sunrise or sunset).
      if (
        sunDirection(
          { ...env, dateTime: new Date(t).toISOString() },
          world.origin,
        ).y <= 0
      )
        continue;
      const shaded = testerAt(t);
      if (!shaded) continue;
      const mid = toLocal(
        (a.lat + b.lat) / 2,
        (a.lon + b.lon) / 2,
        world.origin,
      );
      if (!shaded(mid)) sun += dt;
    }
    if (minutes > 0)
      out.push({ id: w.id, start: w.points[0].t, minutes, sunMinutes: sun });
  }
  return out;
}

export interface SunWeek {
  walks: number;
  minutes: number;
  sunMinutes: number;
  /** The same, the week before, for a trend (null without walks then). */
  previousShare: number | null;
  /** Sun avoided against the quickest ways (see sun-avoided.ts). */
  avoided?: { walks: number; minutes: number };
}

/** The last 7 days against the 7 before. */
export function sunWeek(list: WalkSun[], now = Date.now()): SunWeek {
  const week = 7 * 24 * 3600_000;
  const span = (from: number, to: number) =>
    list.filter((w) => w.start > from && w.start <= to);
  const sum = (ws: WalkSun[]) => ({
    minutes: ws.reduce((s, w) => s + w.minutes, 0),
    sun: ws.reduce((s, w) => s + w.sunMinutes, 0),
  });
  const thisWeek = span(now - week, now);
  const before = sum(span(now - 2 * week, now - week));
  const t = sum(thisWeek);
  return {
    walks: thisWeek.length,
    minutes: t.minutes,
    sunMinutes: t.sun,
    previousShare: before.minutes > 0 ? before.sun / before.minutes : null,
  };
}
