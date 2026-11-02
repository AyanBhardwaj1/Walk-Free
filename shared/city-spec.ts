/**
 * A compact, strictly bounded plan for a whole generated city: what an AI
 * model writes (in about 1-4k tokens) and what lib/city-from-spec turns into
 * a walkable World. Parsing is forgiving: numbers are clamped, unknown enum
 * values fall back to sensible defaults and long lists are truncated, so a
 * slightly-off model answer still yields a usable plan.
 */
import { z } from "zod";
import { LANDMARK_SHAPES, type LandmarkShape } from "./types.js";

export const DISTRICT_KINDS = [
  "downtown",
  "old-quarter",
  "residential",
  "industrial",
  "waterfront",
  "park",
  "campus",
  "suburb",
  "market",
] as const;
export const STREET_PATTERNS = [
  "grid",
  "organic",
  "radial",
  "diagonal",
] as const;
export const ARCHITECTURE_STYLES = [
  "gothic",
  "art-deco",
  "modern",
  "brutalist",
  "adobe",
  "glass",
  "classical",
  "industrial",
  "victorian",
  "futurist",
] as const;
export const AMBIENT_PARTICLES = [
  "rain",
  "sun",
  "sparks",
  "aurora",
  "mist",
  "shimmer",
  "leaves",
] as const;
export const WATER_KINDS = ["river", "bay", "lake", "canal"] as const;
export const WATER_SIDES = [
  "north",
  "south",
  "east",
  "west",
  "center",
] as const;

export type DistrictKind = (typeof DISTRICT_KINDS)[number];
export type StreetPattern = (typeof STREET_PATTERNS)[number];
export type ArchitectureStyle = (typeof ARCHITECTURE_STYLES)[number];
export type AmbientParticles = (typeof AMBIENT_PARTICLES)[number];

/** How much city to build: the world's size, density and AI token budget. */
export const REALISM = {
  sketch: {
    label: "Sketch",
    extent: 800,
    /** Multiplies how many lots along a street receive a building. */
    density: 0.55,
    /** Multiplies block sizes: sketches use coarser blocks. */
    blockScale: 1.25,
    maxLandmarks: 8,
    maxTokens: 2500,
  },
  detailed: {
    label: "Detailed",
    extent: 1200,
    density: 0.85,
    blockScale: 1,
    maxLandmarks: 16,
    maxTokens: 5000,
  },
  dense: {
    label: "Dense",
    extent: 1600,
    density: 1,
    blockScale: 0.92,
    maxLandmarks: 24,
    maxTokens: 9000,
  },
} as const;
export type Realism = keyof typeof REALISM;
export const REALISM_LEVELS = Object.keys(REALISM) as Realism[];

/* ------------------------------------------------------------------ */
/* Forgiving primitives                                                */

const toNumber = (v: unknown) => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
};
/** A number clamped into [min, max]; anything unusable becomes `fallback`. */
const clamped = (min: number, max: number, fallback: number) =>
  z.preprocess((v) => {
    const x = toNumber(v);
    return x === undefined ? fallback : Math.min(max, Math.max(min, x));
  }, z.number());
const clampedOptional = (min: number, max: number) =>
  z.preprocess((v) => {
    const x = toNumber(v);
    return x === undefined ? undefined : Math.min(max, Math.max(min, x));
  }, z.number().optional());

/** Trimmed text cut to `max` characters; non-text becomes `fallback`. */
const text = (max: number, fallback: string) =>
  z.preprocess((v) => {
    if (typeof v === "number") v = String(v);
    if (typeof v !== "string") return fallback;
    const s = v.replace(/\s+/g, " ").trim().slice(0, max).trim();
    return s || fallback;
  }, z.string());
const optionalText = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return undefined;
    const s = v.replace(/\s+/g, " ").trim().slice(0, max).trim();
    return s || undefined;
  }, z.string().optional());

/** "#abc", "abcdef" and "#ABCDEF" all become "#aabbcc"-style hex. */
export function normalizeHex(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let s = v.trim().toLowerCase();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s))
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-f]{6}$/.test(s) ? s : undefined;
}
const hex = (fallback: string) =>
  z.preprocess((v) => normalizeHex(v) ?? fallback, z.string());
const optionalHex = z.preprocess((v) => normalizeHex(v), z.string().optional());

/** An enum value matched loosely ("Art Deco" → "art-deco"); else fallback. */
function looseEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
  synonyms: Record<string, T[number]> = {},
) {
  return z.preprocess(
    (v) => matchEnum(values, v, synonyms) ?? fallback,
    z.enum(values),
  );
}
function matchEnum<T extends readonly string[]>(
  values: T,
  v: unknown,
  synonyms: Record<string, T[number]> = {},
): T[number] | undefined {
  if (typeof v !== "string") return undefined;
  const key = v
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if ((values as readonly string[]).includes(key)) return key as T[number];
  if (Object.hasOwn(synonyms, key)) return synonyms[key];
  const bare = key.replace(/-/g, "");
  return values.find((x) => x.replace(/-/g, "") === bare);
}

/** A fraction pair [fx, fz] in -1..1, from an array or an {x, z} object. */
const fraction = z.preprocess(
  (v) => {
    let pair: unknown[] | undefined;
    if (Array.isArray(v)) pair = v;
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      pair = [o.x ?? o.fx, o.z ?? o.y ?? o.fz];
    }
    if (!pair) return undefined;
    const [x, z2] = pair.map(toNumber);
    if (x === undefined || z2 === undefined) return undefined;
    const c = (n: number) => Math.min(1, Math.max(-1, n));
    return [c(x), c(z2)];
  },
  z.tuple([z.number(), z.number()]).optional(),
);

const heightRange = z.preprocess(
  (v) => {
    let pair: unknown[] = [];
    if (Array.isArray(v)) pair = v;
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      pair = [o.min, o.max];
    } else if (toNumber(v) !== undefined) pair = [v, v];
    const nums = pair
      .map(toNumber)
      .filter((n): n is number => n !== undefined)
      .map((n) => Math.min(450, Math.max(3, n)));
    if (!nums.length) return [8, 40];
    const lo = Math.min(...nums),
      hi = Math.max(...nums);
    return [lo, Math.max(hi, lo + 2)];
  },
  z.tuple([z.number(), z.number()]),
);

/** A list cut to `max` items, dropping items that cannot be repaired. */
function list<T extends z.ZodType>(item: T, max: number) {
  return z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, max * 2) : []),
    z
      .array(item.nullable().catch(null))
      .transform((items) =>
        items
          .filter((x): x is NonNullable<z.output<T>> => x != null)
          .slice(0, max),
      ),
  );
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const objectOnly = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (isObject(v) ? v : null), schema.nullable());

export function validTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz.trim()) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return "UTC";
  }
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */

const SHAPE_SYNONYMS: Record<string, LandmarkShape> = {
  tower: "spire",
  skyscraper: "spire",
  needle: "spire",
  obelisk: "spire",
  lighthouse: "spire",
  church: "cathedral",
  temple: "cathedral",
  abbey: "cathedral",
  chapel: "cathedral",
  mosque: "dome",
  capitol: "dome",
  observatory: "dome",
  planetarium: "dome",
  sphere: "globe",
  orb: "globe",
  ziggurat: "stepped",
  setback: "stepped",
  factory: "smokestacks",
  "power-station": "smokestacks",
  chimney: "smokestacks",
  refinery: "tanks",
  silo: "tanks",
  gasworks: "tanks",
  mansion: "manor",
  castle: "manor",
  palace: "manor",
  villa: "manor",
  antenna: "signal",
  beacon: "signal",
  hq: "signal",
  headquarters: "signal",
  museum: "hall",
  library: "hall",
  "city-hall": "hall",
  station: "hall",
  courthouse: "hall",
  opera: "hall",
  theater: "hall",
  theatre: "hall",
  stadium: "arena",
  colosseum: "arena",
  monument: "statue",
  sculpture: "statue",
  windcatcher: "wind-tower",
  greenhouse: "glasshouse",
  conservatory: "glasshouse",
  atrium: "glasshouse",
};

const climateSchema = objectOnly(
  z.object({
    temperatureC: clamped(-20, 50, 24),
    humidity: clamped(0, 100, 50),
    windMps: clamped(0, 30, 3),
    cloudCover: clamped(0, 100, 20),
  }),
);
const ambientSchema = objectOnly(
  z.object({
    sky: z.preprocess(
      (v) => {
        const arr = (Array.isArray(v) ? v : [v])
          .map(normalizeHex)
          .filter(Boolean);
        return [arr[0] ?? "#6fa8dc", arr[1] ?? arr[0] ?? "#f3e6cf"];
      },
      z.tuple([z.string(), z.string()]),
    ),
    fog: hex("#d9dee6"),
    accent: hex("#f2b544"),
    particles: looseEnum(AMBIENT_PARTICLES, "sun", {
      snow: "mist",
      fog: "mist",
      haze: "shimmer",
      heat: "shimmer",
      neon: "sparks",
      fireflies: "leaves",
      none: "sun",
      clear: "sun",
      storm: "rain",
      drizzle: "rain",
    }),
    night: z.preprocess((v) => v === true || v === "true", z.boolean()),
  }),
);

export const districtSchema = z.object({
  name: text(40, "District"),
  kind: looseEnum(DISTRICT_KINDS, "residential", {
    "city-center": "downtown",
    centre: "downtown",
    center: "downtown",
    cbd: "downtown",
    "old-town": "old-quarter",
    historic: "old-quarter",
    medina: "old-quarter",
    housing: "residential",
    docks: "waterfront",
    harbor: "waterfront",
    harbour: "waterfront",
    port: "waterfront",
    garden: "park",
    gardens: "park",
    forest: "park",
    university: "campus",
    bazaar: "market",
    souk: "market",
    factory: "industrial",
  }),
  at: fraction.transform((v) => v ?? ([0, 0] as [number, number])),
  size: clamped(0.1, 0.7, 0.3),
  streets: looseEnum(STREET_PATTERNS, "grid", {
    curvy: "organic",
    winding: "organic",
    maze: "organic",
    irregular: "organic",
    rings: "radial",
    circular: "radial",
    "hub-and-spoke": "radial",
    diagonals: "diagonal",
    rotated: "diagonal",
    rectilinear: "grid",
  }),
  heights: heightRange,
  density: clamped(0, 1, 0.6),
  trees: clamped(0, 1, 0.3),
  style: looseEnum(ARCHITECTURE_STYLES, "modern", {
    deco: "art-deco",
    artdeco: "art-deco",
    noir: "gothic",
    "neo-gothic": "gothic",
    contemporary: "modern",
    concrete: "brutalist",
    "mud-brick": "adobe",
    desert: "adobe",
    pueblo: "adobe",
    "glass-tower": "glass",
    neon: "futurist",
    cyberpunk: "futurist",
    "sci-fi": "futurist",
    futuristic: "futurist",
    "beaux-arts": "classical",
    neoclassical: "classical",
    georgian: "victorian",
    edwardian: "victorian",
    warehouse: "industrial",
  }),
  palette: z.preprocess((v) => {
    if (!Array.isArray(v)) return undefined;
    const colours = v.map(normalizeHex).filter(Boolean).slice(0, 4);
    return colours.length ? colours : undefined;
  }, z.array(z.string()).optional()),
});

export const landmarkSchema = z.object({
  name: text(60, "Landmark"),
  shape: z.preprocess(
    (v) => matchEnum(LANDMARK_SHAPES, v, SHAPE_SYNONYMS) ?? "hall",
    z.enum(LANDMARK_SHAPES),
  ),
  district: optionalText(40),
  at: fraction,
  height: clamped(5, 500, 60),
  width: clamped(8, 200, 40),
  depth: clamped(8, 200, 40),
  color: optionalHex,
});

export const waterSchema = z.object({
  kind: looseEnum(WATER_KINDS, "river", {
    harbor: "bay",
    harbour: "bay",
    sea: "bay",
    ocean: "bay",
    coast: "bay",
    pond: "lake",
    lagoon: "lake",
    reservoir: "lake",
    stream: "river",
    channel: "canal",
  }),
  side: z.preprocess(
    (v) =>
      matchEnum(WATER_SIDES, v, {
        centre: "center",
        middle: "center",
        n: "north",
        s: "south",
        e: "east",
        w: "west",
      }),
    z.enum(WATER_SIDES).optional(),
  ),
  width: clampedOptional(20, 400),
});

const nameList = (max: number, chars: number) =>
  z.preprocess((v) => {
    if (!Array.isArray(v)) return undefined;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== "string") continue;
      const s = item.replace(/\s+/g, " ").trim().slice(0, chars).trim();
      if (s.length < 3 || seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      out.push(s);
      if (out.length >= max) break;
    }
    return out.length ? out : undefined;
  }, z.array(z.string()).optional());

export const citySpecSchema = z.object({
  name: z.preprocess(
    (v) =>
      typeof v === "string"
        ? v.replace(/\s+/g, " ").trim().slice(0, 60).trim()
        : "",
    z.string().min(1, "The city plan needs a name"),
  ),
  tagline: text(140, "A generated city to explore on foot."),
  inspiration: text(160, "An original city"),
  origin: z.preprocess(
    (v) => (isObject(v) ? v : {}),
    z.object({
      lat: clamped(-60, 70, 40),
      lon: clamped(-180, 180, -74),
    }),
  ),
  timezone: z.preprocess(validTimezone, z.string()),
  climate: climateSchema.transform(
    (v) => v ?? { temperatureC: 24, humidity: 50, windMps: 3, cloudCover: 20 },
  ),
  ambient: ambientSchema.transform(
    (v) =>
      v ?? {
        sky: ["#6fa8dc", "#f3e6cf"] as [string, string],
        fog: "#d9dee6",
        accent: "#f2b544",
        particles: "sun" as const,
        night: false,
      },
  ),
  districts: list(objectOnly(districtSchema), 10),
  landmarks: list(objectOnly(landmarkSchema), 24),
  water: list(objectOnly(waterSchema), 3),
  streetNames: nameList(40, 40),
  placeNames: nameList(30, 40),
});

export type CitySpec = z.output<typeof citySpecSchema>;
export type CityDistrict = CitySpec["districts"][number];
export type CityLandmark = CitySpec["landmarks"][number];
export type CityWater = CitySpec["water"][number];

/**
 * A usable plan from a model's answer: a parsed object or its JSON text
 * (code fences allowed). Throws only when the plan has no name, or has
 * neither districts nor landmarks; a plan with landmarks but no districts
 * gets one central district for them.
 */
export function parseCitySpec(raw: unknown): CitySpec {
  let value = raw;
  if (typeof value === "string") {
    const body = value
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    const start = body.indexOf("{"),
      end = body.lastIndexOf("}");
    try {
      value = JSON.parse(
        start >= 0 && end > start ? body.slice(start, end + 1) : body,
      );
    } catch {
      throw new Error("The city plan is not valid JSON.");
    }
  }
  if (!isObject(value)) throw new Error("The city plan must be a JSON object.");
  if (isObject(value.city) && !value.name) value = value.city;
  const result = citySpecSchema.safeParse(value);
  if (!result.success)
    throw new Error("The city plan needs a name (1-60 characters).");
  const spec = result.data;
  if (!spec.districts.length) {
    if (!spec.landmarks.length)
      throw new Error("The city plan needs at least one district or landmark.");
    spec.districts.push(
      districtSchema.parse({
        name: "Central District",
        kind: "downtown",
        size: 0.45,
      }),
    );
  }
  return spec;
}

/** The plan's ambient mood, for the scene's sky, fog and weather layer. */
export interface SpecAmbient {
  sky: [top: string, bottom: string];
  fog: string;
  accent: string;
  particles: AmbientParticles;
  night: boolean;
}

/**
 * The exact JSON shape for a system prompt, compact enough to paste whole
 * (kept under about 2,500 characters).
 */
export function describeSpecForPrompt(realism: Realism = "detailed"): string {
  const r = REALISM[realism];
  return [
    "Reply with ONE JSON object, no prose, exactly this shape:",
    "{",
    ' "name": string (1-60, original, never a trademarked city),',
    ' "tagline": string (<=140), "inspiration": string (<=160),',
    ' "origin": {"lat": -60..70, "lon": -180..180} (a real place with similar sun and climate),',
    ' "timezone": IANA zone of origin, e.g. "America/New_York",',
    ' "climate": {"temperatureC": -20..50, "humidity": 0..100, "windMps": 0..30, "cloudCover": 0..100},',
    ` "ambient": {"sky": [hex top, hex bottom], "fog": hex, "accent": hex, "particles": ${AMBIENT_PARTICLES.join("|")}, "night": bool},`,
    ' "districts": 1-10 of {',
    '   "name": string,',
    `   "kind": ${DISTRICT_KINDS.join("|")},`,
    '   "at": [fx, fz] each -1..1 (fraction of half the map; +x east, +z south),',
    '   "size": 0.1..0.7 (fraction of half the map),',
    `   "streets": ${STREET_PATTERNS.join("|")},`,
    '   "heights": [min, max] metres 3..450,',
    '   "density": 0..1, "trees": 0..1,',
    `   "style": ${ARCHITECTURE_STYLES.join("|")},`,
    '   "palette"?: 1-4 hex colours',
    " },",
    ` "landmarks": 0-${r.maxLandmarks} of {"name": string, "shape": ${LANDMARK_SHAPES.join("|")}, "district"?: district name, "at"?: [fx, fz], "height": 5..500, "width": 8..200, "depth": 8..200, "color"?: hex},`,
    ` "water": 0-3 of {"kind": ${WATER_KINDS.join("|")}, "side"?: ${WATER_SIDES.join("|")}, "width"?: 20..400},`,
    ' "streetNames"?: up to 40 original street names (<=40 chars),',
    ' "placeNames"?: up to 30 original square/corner/gate names',
    "}",
    "Spread districts so they do not overlap much; give each a distinct kind and style. Hex colours are #rrggbb.",
  ].join("\n");
}
