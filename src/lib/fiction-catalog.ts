/**
 * The fictional cities' names and moods, without their generators, so pages
 * can list them cheaply. lib/fiction-cities builds the walkable worlds.
 */
export type FictionCitySlug =
  | "noir-harbor"
  | "skyline-prime"
  | "velocity-bay"
  | "aurora-realm"
  | "neon-district";

/** How the UI should dress the scene: sky gradient, fog, accent and weather. */
export interface FictionAmbient {
  sky: [top: string, bottom: string];
  fog: string;
  accent: string;
  particles: "rain" | "sun" | "sparks" | "aurora" | "mist";
  night: boolean;
}
export interface FictionCity {
  slug: FictionCitySlug;
  name: string;
  tagline: string;
  mood: string;
  /** A real latitude and longitude, used only for plausible sun angles. */
  origin: { lat: number; lon: number };
  timezone: string;
  ambient: FictionAmbient;
}

/** Five original, procedurally generated cities to explore on foot. */
export const FICTION_CITIES: readonly FictionCity[] = [
  {
    slug: "noir-harbor",
    name: "Noir Harbor",
    tagline: "Rain on black stone, and every alley keeps a secret.",
    mood: "A rain-soaked gothic metropolis of narrow streets, soot-dark towers, gargoyled spires and unlit alleys running down to a fog-bound harbor.",
    origin: { lat: 40.69, lon: -74.05 },
    timezone: "America/New_York",
    ambient: {
      sky: ["#141821", "#3a3f4b"],
      fog: "#2a2e38",
      accent: "#d4a24c",
      particles: "rain",
      night: true,
    },
  },
  {
    slug: "skyline-prime",
    name: "Skyline Prime",
    tagline: "Chrome, sunlight and boulevards built for tomorrow.",
    mood: "A bright, optimistic art-deco metropolis of gleaming setback towers, a globe-topped landmark, tree-lined boulevards and a grand central plaza.",
    origin: { lat: 41.88, lon: -87.63 },
    timezone: "America/Chicago",
    ambient: {
      sky: ["#5fa8e8", "#f6e7c8"],
      fog: "#e8dcc4",
      accent: "#f2b632",
      particles: "sun",
      night: false,
    },
  },
  {
    slug: "velocity-bay",
    name: "Velocity Bay",
    tagline: "Long straight avenues, bay breeze, no time to lose.",
    mood: "A sunny, fast-moving bay city of mid-rise labs and lofts on a long avenue grid, with cycleways and a waterfront promenade.",
    origin: { lat: 37.8, lon: -122.27 },
    timezone: "America/Los_Angeles",
    ambient: {
      sky: ["#4cc3ff", "#fff2d6"],
      fog: "#d9f1ff",
      accent: "#ff3b30",
      particles: "sparks",
      night: false,
    },
  },
  {
    slug: "aurora-realm",
    name: "Aurora Realm",
    tagline: "A golden citadel at the edge of the northern sky.",
    mood: "A mythic golden realm on a fjord: rings of gilded halls around a towering citadel, canals under arched bridges, garden terraces and a rainbow bridge out over the water.",
    origin: { lat: 60.39, lon: 5.32 },
    timezone: "Europe/Oslo",
    ambient: {
      sky: ["#22315f", "#f6c768"],
      fog: "#c9b8e8",
      accent: "#ffd166",
      particles: "aurora",
      night: false,
    },
  },
  {
    slug: "neon-district",
    name: "Neon District",
    tagline: "The night never ends under a thousand signs.",
    mood: "A dense night-life downtown of tight blocks, neon-lit streets, mixed towers, pocket plazas and covered skyways strung between buildings.",
    origin: { lat: 35.69, lon: 139.7 },
    timezone: "Asia/Tokyo",
    ambient: {
      sky: ["#0b0420", "#3a0d4f"],
      fog: "#2b0f3f",
      accent: "#ff2bd6",
      particles: "mist",
      night: true,
    },
  },
];

/** Whether a sky colour needs light text over it. */
export function isDarkSky(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
function mix(a: string, b: string, t: number) {
  const k = clamp01(t);
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
  return (
    "#" +
    ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)
  );
}

/**
 * A fictional city's sky at a given sun height (the y of the unit sun
 * vector): golden toward the horizon, deep blue after sunset. Night-life
 * cities stay dark but lift a little by day. `night` is 0 by day and 1 once
 * the sun is well down.
 */
export function skyAt(
  ambient: FictionAmbient,
  sunY: number,
): FictionAmbient & { nightness: number } {
  const nightness = clamp01((0.06 - sunY) / 0.14);
  const dusk = clamp01(1 - Math.abs(sunY - 0.04) / 0.14);
  let [top, bottom] = ambient.sky;
  let fog = ambient.fog;
  if (ambient.night) {
    const day = (1 - nightness) * 0.3;
    top = mix(top, "#6b7688", day);
    bottom = mix(bottom, "#8a93a3", day);
    fog = mix(fog, "#7d8696", day);
  } else {
    bottom = mix(bottom, "#f0955a", dusk * 0.55);
    fog = mix(fog, "#d9a27a", dusk * 0.35);
    top = mix(top, "#0b1226", nightness * 0.9);
    bottom = mix(bottom, "#27324f", nightness * 0.85);
    fog = mix(fog, "#1d2436", nightness * 0.8);
  }
  return { ...ambient, sky: [top, bottom], fog, nightness };
}
