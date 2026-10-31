import type {
  Environment,
  RouteResult,
  WeatherForecast,
  World,
} from "../../shared/types.js";
import { dailyProfile, localHour, toF } from "./heat.js";
import { baseEdgeId } from "./walk-location.js";

/** Leaving hours offered: the walkable part of the day. */
const FIRST_HOUR = 6;
const LAST_HOUR = 20;

export interface LeaveHour {
  hour: number;
  feelsLikeC: number;
  shade: number;
}
export interface BestTime {
  /** The rest of today's daytime hours, from the current hour on. */
  hours: LeaveHour[];
  /** This hour, and the coolest hour to set off. */
  now: LeaveHour;
  best: LeaveHour;
  /** How much cooler (°F, rounded) leaving at the best hour feels. */
  savingF: number;
}

/**
 * How a route would feel if you set off at each remaining hour of the day,
 * from the sun's position and the weather then (the forecast's hours when
 * live). Null after the last daytime hour.
 */
export function bestTimeToLeave(
  world: World,
  env: Environment,
  route: RouteResult,
  forecast: WeatherForecast | null,
): BestTime | null {
  const start = Math.max(
    FIRST_HOUR,
    Math.floor(localHour(env.dateTime, world.timezone)),
  );
  if (start > LAST_HOUR) return null;
  const hours = Array.from(
    { length: LAST_HOUR - start + 1 },
    (_, i) => start + i,
  );
  // The route may be split at the walker; its heat is that of the mapped edges.
  const edgeIds = [...new Set(route.edges.map((e) => baseEdgeId(e.id)))];
  const profile = dailyProfile(
    world,
    env,
    { edgeIds, samples: [] },
    env.weatherMode === "forecast" ? forecast : null,
    hours,
  ).map((p) => ({ hour: p.hour, feelsLikeC: p.feelsLikeC, shade: p.shade }));
  const best = profile.reduce((a, b) => (b.feelsLikeC < a.feelsLikeC ? b : a));
  const now = profile[0];
  return {
    hours: profile,
    now,
    best,
    savingF: Math.round(toF(now.feelsLikeC) - toF(best.feelsLikeC)),
  };
}
