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
  /** Every walking hour of the day shown (6 AM to 8 PM). */
  hours: LeaveHour[];
  /** The hour shown now, and the coolest hour that is still ahead. */
  now: LeaveHour;
  best: LeaveHour;
  /** How much cooler (°F, rounded) leaving at the best hour feels. */
  savingF: number;
  /** 0 for the day shown; 1 when today is over and this plans tomorrow. */
  dayOffset: 0 | 1;
}
const DAY_MS = 24 * 60 * 60 * 1000;

const localDate = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone });

/**
 * How a route would feel if you set off at each walking hour of the day
 * shown, from the sun's position and the weather then (the forecast's hours
 * when live). On today's date the best hour is one not yet past; once
 * today's walking day is over, it plans tomorrow.
 */
export function bestTimeToLeave(
  world: World,
  env: Environment,
  route: RouteResult,
  forecast: WeatherForecast | null,
  nowIso = new Date().toISOString(),
): BestTime {
  const tz = world.timezone;
  const today = localDate(env.dateTime, tz) === localDate(nowIso, tz);
  let earliest = today ? Math.floor(localHour(nowIso, tz)) : FIRST_HOUR;
  let dayOffset: 0 | 1 = 0;
  if (earliest > LAST_HOUR) {
    // Today's walking day is over: plan tomorrow's.
    env = {
      ...env,
      dateTime: new Date(Date.parse(env.dateTime) + DAY_MS).toISOString(),
    };
    earliest = FIRST_HOUR;
    dayOffset = 1;
  }
  const hours = Array.from(
    { length: LAST_HOUR - FIRST_HOUR + 1 },
    (_, i) => FIRST_HOUR + i,
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
  const ahead = profile.filter((p) => p.hour >= earliest);
  const best = ahead.reduce((a, b) => (b.feelsLikeC < a.feelsLikeC ? b : a));
  const shown = Math.min(
    LAST_HOUR,
    Math.max(FIRST_HOUR, Math.floor(localHour(env.dateTime, tz))),
  );
  const now = profile.find((p) => p.hour === shown)!;
  return {
    hours: profile,
    now,
    best,
    dayOffset,
    savingF: Math.max(
      0,
      Math.round(toF(now.feelsLikeC) - toF(best.feelsLikeC)),
    ),
  };
}
