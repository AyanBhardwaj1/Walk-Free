import { walkDistance, type LoggedWalk } from "../walk-log.js";
import type { Place } from "./routines.js";
import type { RoutePreference } from "../../../shared/types.js";

/**
 * What kind of walker you are, from how you walk: a probabilistic
 * nearest-prototype classifier over your trip lengths, hours, weekdays and
 * places, plus where you are (a campus or a city). A role you pick
 * yourself always wins. The profile changes defaults: which route comes
 * first, how much buffer "leave by" adds, and what the assistant suggests.
 */

export type PersonaId =
  "campus-student" | "city-commuter" | "night-owl" | "weekend-explorer";

export const PERSONAS: Record<
  PersonaId,
  {
    label: string;
    /** Route chosen first by default (before your own choices are learned). */
    preference: RoutePreference;
    /** Minutes added to "leave by" on top of your safe-side walk time. */
    buffer: number;
    blurb: string;
  }
> = {
  "campus-student": {
    label: "Campus student",
    preference: "shade",
    buffer: 3,
    blurb:
      "Short hops between classes at set times: Walk-Free leads with shade and times you to the start of class.",
  },
  "city-commuter": {
    label: "City commuter",
    preference: "quickest",
    buffer: 2,
    blurb:
      "Longer weekday walks at rush hour: quickest first, switching to shade on hot days, with a tight leave-by.",
  },
  "night-owl": {
    label: "Night owl",
    preference: "night",
    buffer: 2,
    blurb:
      "Many walks after dark: lit, busier streets come first in the evening.",
  },
  "weekend-explorer": {
    label: "Weekend explorer",
    preference: "scenic",
    buffer: 1,
    blurb:
      "Varied walks, often at weekends: scenic routes first, with shade on hot afternoons.",
  },
};

/** Features: [km per trip (log), weekday share, AM peak, PM peak, after 8 PM, places per 10 walks, campus]. */
export function walkerFeatures(
  walks: LoggedWalk[],
  places: Place[],
  onCampus: boolean,
) {
  const n = Math.max(1, walks.length);
  const share = (f: (w: LoggedWalk, h: number, d: number) => boolean) =>
    walks.filter((w) => {
      const s = new Date(w.points[0].t);
      return f(w, s.getHours(), s.getDay());
    }).length / n;
  const km =
    walks.reduce((s, w) => s + walkDistance(w.points), 0) / n / 1000 || 0.6;
  return [
    Math.log(Math.max(0.1, km)),
    share((_, __, d) => d >= 1 && d <= 5),
    share((_, h) => h >= 6 && h < 10),
    share((_, h) => h >= 16 && h < 19),
    share((_, h) => h >= 20 || h < 5),
    Math.min(3, (places.length / n) * 10) / 3,
    onCampus ? 1 : 0,
  ];
}

/** Typical feature values for each kind of walker. */
const PROTOTYPES: Record<PersonaId, number[]> = {
  "campus-student": [Math.log(0.6), 0.85, 0.3, 0.2, 0.12, 0.6, 1],
  "city-commuter": [Math.log(1.6), 0.9, 0.45, 0.4, 0.05, 0.3, 0],
  "night-owl": [Math.log(0.9), 0.6, 0.05, 0.15, 0.6, 0.5, 0.5],
  "weekend-explorer": [Math.log(1.8), 0.35, 0.1, 0.2, 0.1, 0.9, 0.5],
};
/** How much each feature counts in the distance. */
const WEIGHTS = [1.2, 1.5, 1.5, 1.2, 2, 0.8, 1.4];

export interface PersonaGuess {
  id: PersonaId;
  /** Probabilities for every persona, highest first. */
  scores: { id: PersonaId; p: number }[];
  /** Walks the guess is based on (0: from the place alone). */
  walks: number;
}

export function guessPersona(
  walks: LoggedWalk[],
  places: Place[],
  onCampus: boolean,
): PersonaGuess {
  const f = walks.length
    ? walkerFeatures(walks, places, onCampus)
    : // With no walks, only where you are says anything.
      onCampus
      ? PROTOTYPES["campus-student"]
      : PROTOTYPES["city-commuter"];
  const ids = Object.keys(PROTOTYPES) as PersonaId[];
  const d = ids.map((id) =>
    PROTOTYPES[id].reduce((s, v, i) => s + WEIGHTS[i] * (v - f[i]) ** 2, 0),
  );
  // Softmax over negative distances; few walks keep it uncertain.
  const temperature = 0.4 + 2 / Math.max(1, walks.length);
  const e = d.map((x) => Math.exp(-x / temperature));
  const total = e.reduce((a, b) => a + b, 0);
  const scores = ids
    .map((id, i) => ({ id, p: e[i] / total }))
    .sort((a, b) => b.p - a.p);
  return { id: scores[0].id, scores, walks: walks.length };
}

/* ------------------- when you start choosing the shade ------------------ */

export interface RouteChoice {
  /** Feels-like in the sun when you chose, °C. */
  feelsLikeC: number;
  /** Whether you chose a shaded or cool route over the quickest. */
  shade: boolean;
}

/**
 * A one-feature logistic regression: the chance you choose shade at a
 * given heat. Returns the feels-like (°C) where it crosses 50%, or null
 * when your choices don't show a pattern yet.
 */
export function shadeThreshold(choices: RouteChoice[]): number | null {
  if (choices.length < 5) return null;
  const shade = choices.filter((c) => c.shade).length;
  if (shade === 0 || shade === choices.length) return null;
  const xs = choices.map((c) => (c.feelsLikeC - 30) / 5);
  let a = 0,
    b = 0;
  for (let it = 0; it < 2000; it++) {
    let ga = 0,
      gb = 0;
    choices.forEach((c, i) => {
      const p = 1 / (1 + Math.exp(-(a + b * xs[i])));
      const y = c.shade ? 1 : 0;
      ga += p - y;
      gb += (p - y) * xs[i];
    });
    // A little L2 keeps it finite when choices separate perfectly.
    a -= 0.1 * (ga / choices.length + 0.01 * a);
    b -= 0.1 * (gb / choices.length + 0.01 * b);
  }
  if (b <= 0.05) return null; // Heat doesn't push you toward shade.
  return 30 + (-a / b) * 5;
}
