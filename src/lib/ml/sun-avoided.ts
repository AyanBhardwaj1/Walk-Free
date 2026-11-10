import type { Environment, Point, World } from "../../../shared/types.js";
import { createShadeTester, sunDirection } from "../environment.js";
import { toLocal } from "../geo.js";
import { nearestWalkNode, route, samplePolyline } from "../routing.js";
import { closedInteriors } from "../indoor/hours.js";
import { smoothTrace, type LoggedWalk } from "../walk-log.js";
import type { WalkSun } from "./exposure.js";

/** A walk's ends must be this close to a mapped path to compare it. */
const SNAP_M = 60;
/** At most this many walks are re-routed, newest first. */
const MAX_WALKS = 12;
/** The quickest way is tested for sun about this often, metres. */
const SAMPLE_M = 10;
/** Walks share a shade map per half hour of the day within each week, as
 * in walkSun (the sun moves under 3° at a given hour across a week). */
const HALF_HOUR = 30 * 60_000;
const WEEK = 7 * 24 * 3600_000;

export interface SunAvoided {
  /** Walks compared with the quickest way between their ends. */
  walks: number;
  /** Minutes of direct sun avoided against the quickest ways; negative
   * when the walks were sunnier than those. */
  minutes: number;
}

/**
 * How much direct sun your walks kept you out of, against the quickest
 * mapped way between the same two points at the same time.
 *
 * Both sides are measured the same way (buildings and trees against the
 * sun, as walkSun replays the walk itself; a mapped roof over a path
 * counts for neither), and the quickest way is timed at your own pace:
 * its sunny share of its length, times its length over the length you
 * walked, times your minutes. A longer shady detour is credited only with
 * the sun it truly saved. Walks whose ends aren't near a path, round
 * trips and walks with the sun down are left out.
 */
export function sunAvoided(
  walks: LoggedWalk[],
  sun: WalkSun[],
  world: World,
  env: Environment,
): SunAvoided {
  const byId = new Map(walks.map((w) => [w.id, w]));
  const testers = new Map<string, (p: Point) => boolean>();
  // The quickest way between two points doesn't depend on the sun, only on
  // which buildings are open: routed once per trip.
  const routes = new Map<string, ReturnType<typeof route>>();
  let compared = 0,
    minutes = 0;
  for (const s of [...sun].sort((a, b) => b.start - a.start)) {
    if (compared >= MAX_WALKS) break;
    const walk = byId.get(s.id);
    if (!walk || walk.points.length < 2) continue;
    const first = walk.points[0],
      last = walk.points[walk.points.length - 1];
    const mid = (first.t + last.t) / 2;
    if (
      sunDirection(
        { ...env, dateTime: new Date(mid).toISOString() },
        world.origin,
      ).y <= 0
    )
      continue;
    // The sun as it was at this time of day, mid-week (as walkSun).
    const week = Math.floor(mid / WEEK);
    const slot = Math.round((mid % (24 * 3600_000)) / HALF_HOUR);
    const key = `${week}:${slot}`;
    const when = {
      ...env,
      dateTime: new Date(
        week * WEEK + Math.floor(WEEK / 2 / 864e5) * 864e5 + slot * HALF_HOUR,
      ).toISOString(),
    };
    const a = nearestWalkNode(
      world,
      toLocal(first.lat, first.lon, world.origin),
      SNAP_M,
    );
    const b = nearestWalkNode(
      world,
      toLocal(last.lat, last.lon, world.origin),
      SNAP_M,
    );
    if (!a || !b || a.id === b.id) continue;
    const at = { ...env, dateTime: new Date(mid).toISOString() };
    const trip = `${a.id}>${b.id}>${closedInteriors(world, at.dateTime).join()}`;
    if (!routes.has(trip))
      routes.set(
        trip,
        route(world, a.id, b.id, {
          preference: "quickest",
          environment: at,
          avoidStairs: false,
          allowHypothetical: false,
          maxDetour: 3,
        }),
      );
    const quickest = routes.get(trip)!;
    // The length actually walked, from the same smoothed trace walkSun uses.
    const trace = smoothTrace(walk.points).map((p) =>
      toLocal(p.lat, p.lon, world.origin),
    );
    let walked = 0;
    for (let i = 1; i < trace.length; i++)
      walked += Math.hypot(
        trace[i][0] - trace[i - 1][0],
        trace[i][1] - trace[i - 1][1],
      );
    if (!quickest || quickest.distance <= 0 || walked < SNAP_M) continue;
    if (!testers.has(key)) testers.set(key, createShadeTester(world, when));
    const shaded = testers.get(key)!;
    const samples = samplePolyline(
      quickest.points,
      Math.max(2, Math.ceil(quickest.distance / SAMPLE_M)),
    );
    const sunny = samples.filter((p) => !shaded(p)).length / samples.length;
    const quickestMinutes = s.minutes * (quickest.distance / walked);
    compared++;
    minutes += sunny * quickestMinutes - s.sunMinutes;
  }
  return { walks: compared, minutes };
}
