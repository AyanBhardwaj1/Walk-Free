import type {
  Environment,
  GraphEdge,
  Point,
  WeatherForecast,
  World,
} from "../../shared/types.js";
import { createShadeTester, heatIndexC, sunDirection } from "./environment.js";
import { samplePolyline } from "./routing.js";

/**
 * Comfort estimates for walking, not a measured microclimate or health
 * guidance. Shade uses the heat index (or air temperature when it does not
 * apply); direct sun adds a solar load that grows with sun height and shrinks
 * with cloud and wind. NWS notes full sun can raise heat index values by up to
 * about 15 °F, so the boost is capped at 8 °C.
 */
const SUN_BOOST_MAX_C = 8;
const CLOUD_DAMPING = 0.75;
const WIND_DAMPING_PER_MPS = 0.08;
const WALK_METERS_PER_MINUTE = 78;
const SAMPLE_SPACING_M = 15;
const MAX_EDGE_SAMPLES = 32;
const MIN_STREET_LENGTH_M = 60;
const GENERIC_NAMES = new Set(["Footpath", "Street", "Path", "Green space"]);

export const HEAT_LEVELS = [
  { label: "Cool", maxF: 75, color: "#4f8a9c" },
  { label: "Mild", maxF: 85, color: "#6f9b5f" },
  { label: "Warm", maxF: 95, color: "#d9b142" },
  { label: "Hot", maxF: 105, color: "#d7772d" },
  { label: "Very hot", maxF: Infinity, color: "#b13a2b" },
] as const;
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export const toF = (c: number) => (c * 9) / 5 + 32;

export interface HeatConditions {
  shadeFeelsC: number;
  sunBoostC: number;
}
export interface HeatReading {
  shade: number;
  feelsLikeC: number;
  sunFeelsC: number;
  shadeFeelsC: number;
  level: HeatLevel;
}
export interface PlaceHeat extends HeatReading {
  id: string;
  name: string;
  kind: "street" | "park";
  length: number;
  edgeIds: string[];
  /** Sample points for parks, which have no walking edges of their own. */
  samples: Point[];
  center: Point;
}

export function heatConditions(
  env: Environment,
  origin: World["origin"],
): HeatConditions {
  const sun = sunDirection(env, origin);
  const shadeFeelsC =
    heatIndexC(env.temperatureC, env.humidity) ?? env.temperatureC;
  const cloud = Math.min(1, Math.max(0, env.cloudCover / 100));
  const sunBoostC =
    sun.altitude <= 0
      ? 0
      : (SUN_BOOST_MAX_C *
          Math.sin(sun.altitude) *
          (1 - CLOUD_DAMPING * cloud)) /
        (1 + WIND_DAMPING_PER_MPS * Math.max(0, env.windMps));
  return { shadeFeelsC, sunBoostC };
}

export function heatLevel(feelsLikeC: number): HeatLevel {
  const f = toF(feelsLikeC);
  return HEAT_LEVELS.findIndex((l) => f < l.maxF) as HeatLevel;
}

export function readHeat(c: HeatConditions, shade: number): HeatReading {
  const sunFeelsC = c.shadeFeelsC + c.sunBoostC;
  const feelsLikeC = c.shadeFeelsC + (1 - shade) * c.sunBoostC;
  return {
    shade,
    feelsLikeC,
    sunFeelsC,
    shadeFeelsC: c.shadeFeelsC,
    level: heatLevel(feelsLikeC),
  };
}

/** Share of an edge in shade; covered and indoor passages count as shaded. */
export function edgeShadeFraction(
  e: GraphEdge,
  shadedAt: (p: Point) => boolean,
): number {
  if (e.covered || e.indoor !== "no") return 1;
  const samples = samplePolyline(
    e.points,
    Math.max(
      1,
      Math.min(MAX_EDGE_SAMPLES, Math.ceil(e.distance / SAMPLE_SPACING_M)),
    ),
  );
  return samples.filter(shadedAt).length / Math.max(1, samples.length);
}

/** Heat for every walkable edge at one moment. */
export function edgeHeatMap(w: World, env: Environment) {
  const shadedAt = createShadeTester(w, env);
  const conditions = heatConditions(env, w.origin);
  const result = new Map<string, HeatReading>();
  for (const e of w.graph.edges) {
    if (e.indoor === "hypothetical") continue;
    result.set(e.id, readHeat(conditions, edgeShadeFraction(e, shadedAt)));
  }
  return result;
}

function inside(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}

/** Evenly spaced sample points inside a polygon, at most `limit`. */
function polygonSamples(poly: Point[], limit = 48): Point[] {
  const xs = poly.map((p) => p[0]),
    zs = poly.map((p) => p[1]);
  const [x0, x1, z0, z1] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...zs),
    Math.max(...zs),
  ];
  const step = Math.max(5, Math.sqrt(((x1 - x0) * (z1 - z0)) / limit));
  const points: Point[] = [];
  for (let x = x0 + step / 2; x < x1; x += step)
    for (let z = z0 + step / 2; z < z1; z += step)
      if (inside([x, z], poly)) points.push([x, z]);
  return points.slice(0, limit * 2);
}

/**
 * Named streets and parks ranked by how hot they feel, so a person can see
 * that, for example, Speedway bakes at 3pm while the South Mall stays shaded.
 */
export function placeHeat(
  w: World,
  env: Environment,
  edges = edgeHeatMap(w, env),
): PlaceHeat[] {
  const conditions = heatConditions(env, w.origin);
  const streets = new Map<
    string,
    { length: number; shaded: number; edgeIds: string[]; sum: Point }
  >();
  for (const e of w.graph.edges) {
    const reading = edges.get(e.id);
    if (!reading || GENERIC_NAMES.has(e.name)) continue;
    const street = streets.get(e.name) ?? {
      length: 0,
      shaded: 0,
      edgeIds: [],
      sum: [0, 0] as Point,
    };
    street.length += e.distance;
    street.shaded += e.distance * reading.shade;
    street.edgeIds.push(e.id);
    const mid = e.points[Math.floor(e.points.length / 2)];
    street.sum = [street.sum[0] + mid[0], street.sum[1] + mid[1]];
    streets.set(e.name, street);
  }
  const places: PlaceHeat[] = [...streets]
    .filter(([, s]) => s.length >= MIN_STREET_LENGTH_M)
    .map(([name, s]) => ({
      id: `street:${name}`,
      name,
      kind: "street" as const,
      length: s.length,
      edgeIds: s.edgeIds,
      samples: [],
      center: [s.sum[0] / s.edgeIds.length, s.sum[1] / s.edgeIds.length],
      ...readHeat(conditions, s.shaded / s.length),
    }));
  const shadedAt = createShadeTester(w, env);
  for (const l of w.landscapes) {
    if (l.kind !== "park" || GENERIC_NAMES.has(l.name)) continue;
    const samples = polygonSamples(l.points);
    if (!samples.length) continue;
    places.push({
      id: `park:${l.id}`,
      name: l.name,
      kind: "park",
      length: 0,
      edgeIds: [],
      samples,
      center: [
        samples.reduce((s, p) => s + p[0], 0) / samples.length,
        samples.reduce((s, p) => s + p[1], 0) / samples.length,
      ],
      ...readHeat(conditions, samples.filter(shadedAt).length / samples.length),
    });
  }
  return places.sort((a, b) => b.feelsLikeC - a.feelsLikeC);
}

/** ISO instant for a local wall-clock hour on the same local date. */
export function atLocalHour(iso: string, timeZone: string, hour: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    Math.floor(hour),
    Math.min(59, Math.round((hour % 1) * 60)),
  );
  // Correct by the zone offset at that wall time (twice, for DST edges).
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const shown = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value]),
    );
    const shownWall = Date.UTC(
      +shown.year,
      +shown.month - 1,
      +shown.day,
      +shown.hour,
      +shown.minute,
    );
    guess += wall - shownWall;
  }
  return new Date(guess).toISOString();
}

/** Local hour (0–24, fractional) of an instant in a time zone. */
export function localHour(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return +parts.hour + +parts.minute / 60;
}

/** Forecast values for the hour containing `iso`, when a forecast exists. */
export function weatherAt(
  env: Environment,
  iso: string,
  forecast?: WeatherForecast | null,
): Environment {
  const t = Date.parse(iso);
  const hour = forecast?.hours.find(
    (h) => Math.abs(Date.parse(h.time) - t) < 30 * 60 * 1000,
  );
  return hour
    ? {
        ...env,
        dateTime: iso,
        temperatureC: hour.temperatureC,
        humidity: hour.humidity ?? env.humidity,
        windMps: hour.windMps ?? env.windMps,
        cloudCover: hour.cloudCover ?? env.cloudCover,
      }
    : { ...env, dateTime: iso };
}

/** How a place feels hour by hour through the local day. */
export function dailyProfile(
  w: World,
  env: Environment,
  place: Pick<PlaceHeat, "edgeIds" | "samples">,
  forecast?: WeatherForecast | null,
  hours = Array.from({ length: 15 }, (_, i) => i + 6),
) {
  const ids = new Set(place.edgeIds);
  const chosen = w.graph.edges.filter((e) => ids.has(e.id));
  const length = chosen.reduce((s, e) => s + e.distance, 0);
  return hours.map((hour) => {
    const at = weatherAt(
      env,
      atLocalHour(env.dateTime, w.timezone, hour),
      forecast,
    );
    const shadedAt = createShadeTester(w, at);
    const shade = length
      ? chosen.reduce(
          (s, e) => s + e.distance * edgeShadeFraction(e, shadedAt),
          0,
        ) / length
      : place.samples.length
        ? place.samples.filter(shadedAt).length / place.samples.length
        : 0;
    return { hour, ...readHeat(heatConditions(at, w.origin), shade) };
  });
}

/** A single unnamed path, for clicks on paths without a street name. */
export function edgePlace(
  w: World,
  edgeId: string,
  reading: HeatReading,
): PlaceHeat | null {
  const e = w.graph.edges.find((x) => x.id === edgeId);
  if (!e) return null;
  return {
    id: `edge:${e.id}`,
    name: e.name,
    kind: "street",
    length: e.distance,
    edgeIds: [e.id],
    samples: [],
    center: e.points[Math.floor(e.points.length / 2)],
    ...reading,
  };
}

/** Sun exposure and feels-like for a whole route. */
export function routeHeat(
  route: { shadeFraction: number; durationMinutes: number },
  env: Environment,
  origin: World["origin"],
) {
  const reading = readHeat(heatConditions(env, origin), route.shadeFraction);
  return {
    ...reading,
    sunMinutes: route.durationMinutes * (1 - route.shadeFraction),
  };
}

export const walkMinutes = (meters: number) => meters / WALK_METERS_PER_MINUTE;

/** "Wed 3:00 PM" in the area's time zone. */
export function clockLabel(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const RAMP = HEAT_LEVELS.map((l) => l.color);
/** Below this solar load, sun and shade feel alike and colours use ratings. */
const MIN_CONTRAST_C = 1;

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0))
    .toString(16)
    .padStart(6, "0")}`;
}

/**
 * Map colour for a reading: relative to this moment, from fully shaded
 * (cool end) to full sun (hot end), so hot spots stand out even when the
 * whole area sits in one comfort band.
 */
export function relativeHeatColor(reading: HeatReading) {
  if (reading.sunFeelsC - reading.shadeFeelsC < MIN_CONTRAST_C)
    return HEAT_LEVELS[reading.level].color;
  const t = (1 - reading.shade) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  return mix(RAMP[i], RAMP[i + 1], t - i);
}
export const HEAT_RAMP = RAMP;
