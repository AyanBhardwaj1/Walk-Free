import { trainMlp, predictMlp, type MlpModel } from "./mlp.js";
import { metres, smoothTrace, type LoggedWalk } from "../walk-log.js";

/**
 * Your walking pace, learned from your own walks. Each walk is cut into
 * stretches of about 80 m; a small neural network learns the speed of each
 * stretch from the heat, the hour, the weekday and how far into the walk
 * it was. With few walks the estimate leans on your median pace, and with
 * none on the population average.
 */

/** Average adult walking speed, m/s (Bohannon & Andrews 2011: 1.31-1.43). */
export const POPULATION_SPEED = 1.34;
/** The app's route minutes use 78 m a minute. */
export const APP_SPEED = 78 / 60;
const STRETCH_M = 80;
/** Speeds outside this range are a stop, a run or a GPS glitch. */
const MIN_SPEED = 0.4,
  MAX_SPEED = 2.6;
/** Walks needed before the network is used (else the median is). */
const MIN_WALKS_FOR_NETWORK = 6;
/** How many walks it takes before your own pace counts as much as the prior. */
const PRIOR_WALKS = 3;

export interface PaceContext {
  /** Feels-like in the shade, °C. */
  feelsLikeC: number;
  /** Local hour of day, 0-24. */
  hour: number;
  weekend: boolean;
}

export interface Stretch {
  speed: number;
  minutesIn: number;
  context: PaceContext;
  walk: string;
}

export const features = (c: PaceContext, minutesIn: number) => [
  c.feelsLikeC,
  Math.sin((c.hour / 24) * 2 * Math.PI),
  Math.cos((c.hour / 24) * 2 * Math.PI),
  c.weekend ? 1 : 0,
  Math.min(minutesIn, 40),
];

/** Cuts walks into ~80 m stretches with their speed and context. */
export function stretches(walks: LoggedWalk[]): Stretch[] {
  const out: Stretch[] = [];
  for (const w of walks) {
    // GPS wobble zigzags a trace and inflates its length; a 3-point moving
    // average takes most of that out before measuring.
    const pts = smoothTrace(w.points);
    if (pts.length < 2) continue;
    const start = new Date(pts[0].t);
    const context: PaceContext = {
      feelsLikeC: w.weather?.feelsLikeC ?? 22,
      hour: start.getHours() + start.getMinutes() / 60,
      weekend: start.getDay() === 0 || start.getDay() === 6,
    };
    let from = 0,
      d = 0;
    for (let i = 1; i < pts.length; i++) {
      d += metres(pts[i - 1], pts[i]);
      if (d < STRETCH_M && i < pts.length - 1) continue;
      const dt = (pts[i].t - pts[from].t) / 1000;
      const speed = dt > 0 ? d / dt : 0;
      if (d >= STRETCH_M / 2 && speed >= MIN_SPEED && speed <= MAX_SPEED)
        out.push({
          speed,
          minutesIn: (pts[from].t - pts[0].t) / 60_000,
          context,
          walk: w.id,
        });
      from = i;
      d = 0;
    }
  }
  return out;
}

export interface PaceProfile {
  walks: number;
  stretches: number;
  /** Your typical speed, m/s (the median of your stretches). */
  median: number;
  /** The network, once there are enough walks. */
  model: MlpModel | null;
  /** Error of the network vs a fixed pace on held-out stretches, m/s. */
  modelMae: number | null;
  baselineMae: number | null;
  /** Spread of your actual times around the prediction (fraction). */
  spread: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : Number.NaN;
};

/** Learns your pace from your walks (sample walks only if all are). */
export function learnPace(all: LoggedWalk[]): PaceProfile {
  const real = all.filter((w) => !w.sample);
  const walks = real.length ? real : all;
  const rows = stretches(walks);
  const speeds = rows.map((r) => r.speed);
  const med = speeds.length ? median(speeds) : POPULATION_SPEED;
  let model: MlpModel | null = null;
  let modelMae: number | null = null,
    baselineMae: number | null = null;
  if (walks.length >= MIN_WALKS_FOR_NETWORK && rows.length >= 30) {
    model = trainMlp(
      rows.map((r) => features(r.context, r.minutesIn)),
      speeds,
      { hidden: 6, epochs: 300, decay: 3e-3, seed: 11 },
    );
    modelMae = model.holdoutMae;
    // A fixed pace (the training stretches' median), judged on the same
    // held-out stretches as the network.
    baselineMae = model.holdoutBaselineMae;
  }
  // How far actual times stray from the prediction, as a share of it.
  const errors = rows.map((r) => {
    const p = model ? predictMlp(model, features(r.context, r.minutesIn)) : med;
    return Math.abs(r.speed - p) / p;
  });
  return {
    walks: walks.length,
    stretches: rows.length,
    median: med,
    model,
    modelMae,
    baselineMae,
    spread: errors.length ? Math.min(0.5, median(errors)) : 0.15,
  };
}

/** Your expected speed (m/s) in this context, blended with the prior. */
export function speedFor(
  profile: PaceProfile,
  context: PaceContext,
  minutesIn = 0,
) {
  const own = profile.model
    ? predictMlp(profile.model, features(context, minutesIn))
    : profile.median;
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, own));
  const w = profile.walks / (profile.walks + PRIOR_WALKS);
  return w * clamped + (1 - w) * POPULATION_SPEED;
}

export interface PersonalEta {
  minutes: number;
  /** A safe-side estimate (about 85% of your walks are at least this fast). */
  safeMinutes: number;
  /** The app's standard estimate, for comparison. */
  standardMinutes: number;
}

/** Minutes for a walk of this length, at your pace in this context. */
export function personalEta(
  profile: PaceProfile,
  distanceM: number,
  context: PaceContext,
): PersonalEta {
  // Walk it in stretches so fatigue and pacing within a walk count.
  let t = 0,
    left = distanceM;
  while (left > 0) {
    const d = Math.min(STRETCH_M, left);
    t += d / speedFor(profile, context, t / 60); // seconds
    left -= d;
  }
  const minutes = t / 60;
  return {
    minutes,
    safeMinutes: minutes * (1 + profile.spread),
    standardMinutes: distanceM / APP_SPEED / 60,
  };
}
