import type { RoutePreference } from "../../shared/types.js";
import { utciBand, walkUtci, type HeatStress } from "./heat-stress.js";
import { HEAT_RISK_LEVELS } from "../../shared/outlook.js";

/** A route the walker could take instead, with its time in the sun. */
export interface AdviceOption {
  name: string;
  minutes: number;
  sunMinutes: number;
}

export interface AdviceInput {
  /** UTCI for the chosen walk, °C. */
  utciC: number;
  /** The chosen walk. */
  walk: AdviceOption;
  /** The other routes on offer; the shadiest worthwhile one is suggested. */
  options?: AdviceOption[];
  /** NWS HeatRisk for today (0 to 4), when known. */
  heatRisk?: number | null;
  /** An air-conditioned building the route already passes through. */
  coolStop?: string | null;
  /** Mapped drinking fountains along the route. */
  water?: number;
  /** The walker is more sensitive to heat (the CDC's higher-risk groups:
   * older adults, pregnancy, heart or lung conditions, some medicines):
   * steps come one level sooner. */
  sensitive?: boolean;
}

export interface WalkAdvice {
  /** 0 (no heat stress) to 4 (extreme), the higher of UTCI and HeatRisk,
   * one higher for a walker sensitive to heat. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Said only when NWS HeatRisk is higher than the walk's own heat stress
   * (which the heat-stress line above already names). */
  note: string | null;
  /** The steps, most useful first; at most three. */
  tips: string[];
}

/** A shadier route is worth naming when it saves this much sun... */
const SUN_SAVED_MIN = 2;
/** ...for at most this many extra minutes of walking. */
const EXTRA_WALK_MAX = 5;
/** Walks at least this long at strong heat stress call for water. */
const WATER_MIN = 10;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Turns the walk's heat numbers into a few concrete steps: a shadier route
 * when one saves real sun, water and pace for longer walks in strong heat,
 * and the warning signs of heat illness as the CDC lists them when heat
 * stress is very strong. Guidance, not medical advice: nothing here tells
 * anyone they are safe.
 */
export function walkAdvice(input: AdviceInput): WalkAdvice | null {
  if (!Number.isFinite(input.utciC)) return null;
  const band = utciBand(input.utciC);
  const risk = Math.max(0, Math.min(4, Math.round(input.heatRisk ?? 0)));
  const base = Math.max(band, risk);
  if (base === 0) return null;
  const level = Math.min(
    4,
    base + (input.sensitive ? 1 : 0),
  ) as WalkAdvice["level"];
  const walk = input.walk;
  const sun = Math.round(walk.sunMinutes);
  const tips: string[] = [];

  // The best swap: the most sun saved for little extra walking.
  const better = (input.options ?? [])
    .filter(
      (o) =>
        o.name !== walk.name &&
        walk.sunMinutes - o.sunMinutes >= SUN_SAVED_MIN &&
        o.minutes - walk.minutes <= EXTRA_WALK_MAX,
    )
    .sort((a, b) => a.sunMinutes - b.sunMinutes)[0];
  if (better) {
    const extra = Math.round(better.minutes - walk.minutes);
    tips.push(
      `Take ${better.name}: ${Math.round(better.sunMinutes)} min in the sun instead of ${sun}` +
        (extra > 0 ? `, for ${plural(extra, "more minute")} of walking.` : "."),
    );
  }
  if (input.coolStop && level >= 2)
    tips.push(
      `Cool off midway in ${input.coolStop} (check it's open before you rely on it).`,
    );
  if (level >= 2 && walk.minutes >= WATER_MIN)
    tips.push(
      input.water
        ? `Carry water and walk a little slower than usual; there ${input.water === 1 ? "is a drinking fountain" : `are ${input.water} drinking fountains`} on the way.`
        : "Carry water and walk a little slower than usual.",
    );
  // The warning signs, in very strong heat, always make the cut (below).
  const warning =
    level >= 3
      ? "Stop in shade or air conditioning if you feel dizzy, sick or confused; those are early signs of heat illness (CDC)."
      : null;
  if (warning) tips.push(warning);
  // Mild heat (for this walker, before any sensitivity): just the shade.
  else if (base === 1 && level < 3 && !better && sun >= 5)
    tips.push("Keep to the shaded side where you can.");

  const note =
    risk > band
      ? `NWS HeatRisk for the day: ${HEAT_RISK_LEVELS[risk].label.toLowerCase()} (${risk} of 4).`
      : null;
  if (!note && tips.length === 0) return null;
  const kept = warning
    ? [...tips.filter((t) => t !== warning).slice(0, 2), warning]
    : tips.slice(0, 3);
  return { level, note, tips: kept };
}

type Choice = {
  durationMinutes: number;
  shadeFraction: number;
  coolStop?: string;
  waterStops?: number;
} | null;

/**
 * The heat check for one of the route choices, with the others (but the
 * lit-street night route, which trades shade for light) as swaps.
 */
export function routeAdvice(
  choices: Partial<Record<RoutePreference, Choice>>,
  pref: RoutePreference,
  stress: HeatStress,
  labels: Record<RoutePreference, string>,
  heatRisk?: number | null,
  sensitive = false,
): WalkAdvice | null {
  const option = (p: RoutePreference): AdviceOption[] => {
    const r = choices[p];
    return r
      ? [
          {
            name: labels[p],
            minutes: r.durationMinutes,
            sunMinutes: r.durationMinutes * (1 - r.shadeFraction),
          },
        ]
      : [];
  };
  const chosen = choices[pref];
  const [walk] = option(pref);
  if (!chosen || !walk) return null;
  return walkAdvice({
    utciC: walkUtci(stress, chosen.shadeFraction),
    walk,
    options: (Object.keys(choices) as RoutePreference[])
      .filter((p) => p !== "night")
      .flatMap(option),
    heatRisk,
    coolStop: chosen.coolStop ?? null,
    water: chosen.waterStops ?? 0,
    sensitive,
  });
}
