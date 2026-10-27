import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
  Point,
  SceneObject,
  SceneRoad,
  Landscape,
  GraphNode,
  GraphEdge,
  World,
  WeatherForecast,
  WeatherHour,
} from "../shared/types";
import { nearestCity } from "./cities";
import { requestJson, ServiceError } from "./network";

const CACHE_ROOT = process.env.VERCEL
  ? join(tmpdir(), "walk-free-cache")
  : join(process.cwd(), ".cache", "walk-free");
const pending = new Map<string, Promise<unknown>>();
let activeMapRequests = 0;
const MAX_MAP_REQUESTS = 2;
const EARTH_RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;
export function localPoint(
  lat: number,
  lon: number,
  origin: { lat: number; lon: number },
): Point {
  return [
    (lon - origin.lon) * RAD * EARTH_RADIUS * Math.cos(origin.lat * RAD),
    (origin.lat - lat) * RAD * EARTH_RADIUS,
  ];
}
async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  try {
    const stored = JSON.parse(
      await readFile(join(CACHE_ROOT, `${key}.json`), "utf8"),
    ) as { savedAt: number; value: T };
    if (
      Number.isFinite(stored.savedAt) &&
      Date.now() - stored.savedAt < ttl &&
      stored.savedAt <= Date.now()
    )
      return stored.value;
  } catch {
    /* A missing/expired cache is a normal upstream fetch. */
  }
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const task = (async () => {
    const value = await load();
    try {
      await mkdir(CACHE_ROOT, { recursive: true });
      const temporary = join(CACHE_ROOT, `${key}-${randomUUID()}.tmp`);
      await writeFile(
        temporary,
        JSON.stringify({ savedAt: Date.now(), value }),
      );
      await rename(temporary, join(CACHE_ROOT, `${key}.json`));
      // Bound persistent cache growth. Never remove source/project files.
      const entries = (await readdir(CACHE_ROOT)).filter((x) =>
        x.endsWith(".json"),
      );
      if (entries.length > 128) {
        const dated = await Promise.all(
          entries.map(async (name) => ({
            name,
            mtime: (await stat(join(CACHE_ROOT, name))).mtimeMs,
          })),
        );
        dated.sort((a, b) => a.mtime - b.mtime);
        await Promise.all(
          dated
            .slice(0, entries.length - 128)
            .map((x) => unlink(join(CACHE_ROOT, x.name)).catch(() => {})),
        );
      }
    } catch {
      /* Read-only hosts can still return uncached live data. */
    }
    return value;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: string;
    ref: number;
    role: string;
    geometry?: { lat: number; lon: number }[];
  }[];
}
export interface OsmResponse {
  elements: OsmElement[];
  remark?: string;
}
const deniedAccess = new Set([
  "no",
  "private",
  "customers",
  "delivery",
  "destination",
  "use_sidepath",
]);
const blockedHighways = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "construction",
  "proposed",
  "raceway",
  "bus_guideway",
]);
const walkingHighways = new Set([
  "footway",
  "path",
  "pedestrian",
  "steps",
  "living_street",
  "residential",
  "service",
  "unclassified",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
  "track",
  "cycleway",
  "road",
]);
function footAllowed(tags: Record<string, string>): boolean {
  if (tags.indoor && tags.indoor !== "no") return false;
  if (deniedAccess.has(tags.foot ?? "")) return false;
  if (
    !["yes", "designated", "permissive"].includes(tags.foot ?? "") &&
    deniedAccess.has(tags.access ?? "")
  )
    return false;
  if (tags.locked === "yes" || tags.construction || tags.proposed) return false;
  return true;
}
export function isWalkable(tags: Record<string, string>): boolean {
  return Boolean(
    tags.highway &&
    walkingHighways.has(tags.highway) &&
    !blockedHighways.has(tags.highway) &&
    footAllowed(tags),
  );
}
export function parseHeight(value?: string): number | null {
  if (!value) return null;
  const metric = value
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?$/i);
  const feet = value
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:(\d+(?:\.\d+)?)\s*")?$/i);
  const height = metric
    ? Number(metric[1])
    : feet
      ? Number(feet[1]) * 0.3048 + Number(feet[2] ?? 0) * 0.0254
      : NaN;
  return Number.isFinite(height) && height >= 0.5 && height <= 1000
    ? height
    : null;
}
function heightFor(
  tags: Record<string, string>,
  tree = false,
): { height: number; heightMethod: SceneObject["heightMethod"] } {
  const mapped = parseHeight(tags.height);
  if (mapped !== null) return { height: mapped, heightMethod: "mapped" };
  const levels = Number(tags["building:levels"]);
  if (!tree && Number.isFinite(levels) && levels > 0 && levels <= 200)
    return { height: levels * 3.2, heightMethod: "levels" };
  return {
    height: tree
      ? 9
      : tags.building === "garage" || tags.building === "shed"
        ? 3
        : 10,
    heightMethod: "estimated",
  };
}
function finiteGeometry(element: OsmElement): { lat: number; lon: number }[] {
  return (
    element.geometry?.filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lon) <= 180,
    ) ?? []
  );
}
function centroid(points: Point[]): Point {
  let area = 0,
    x = 0,
    z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    x += (a[0] + b[0]) * cross;
    z += (a[1] + b[1]) * cross;
  }
  if (Math.abs(area) < 0.001)
    return [
      points.reduce((s, p) => s + p[0], 0) / points.length,
      points.reduce((s, p) => s + p[1], 0) / points.length,
    ];
  return [x / (3 * area), z / (3 * area)];
}
function closedPoints(
  element: OsmElement,
  origin: { lat: number; lon: number },
): Point[] | null {
  const g = finiteGeometry(element);
  if (g.length < 4) return null;
  const points = g.map((p) => localPoint(p.lat, p.lon, origin));
  const first = points[0],
    last = points.at(-1)!;
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.2) return null;
  return points.slice(0, -1);
}
function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function parseOsmWorld(
  response: OsmResponse,
  origin: { lat: number; lon: number },
  name: string,
  radius = 800,
  now = new Date(),
): World {
  if (!Array.isArray(response.elements) || response.elements.length > 150000)
    throw new ServiceError(
      "INVALID_UPSTREAM_DATA",
      "The map provider returned invalid or excessive map data.",
    );
  if (response.remark)
    throw new ServiceError(
      "UPSTREAM_UNAVAILABLE",
      "The map provider could not complete this area query. Try again later.",
    );
  const elements = [
    ...new Map(
      response.elements
        .filter((e) => e && Number.isSafeInteger(e.id))
        .map((e) => [`${e.type}:${e.id}`, e]),
    ).values(),
  ];
  const objects: SceneObject[] = [],
    roads: SceneRoad[] = [],
    landscapes: Landscape[] = [];
  const graphNodes = new Map<string, GraphNode>(),
    edges: GraphEdge[] = [];
  const nodeElements = new Map(
    elements.filter((e) => e.type === "node").map((e) => [e.id, e]),
  );
  const inArea = (point: Point, extra = 100) =>
    Math.abs(point[0]) <= radius + extra &&
    Math.abs(point[1]) <= radius + extra;
  let omittedComplexBuildings = 0,
    omittedIndoor = 0;
  const polygonWays = elements.filter((e) => e.type === "way");
  const buildingRelations = elements.filter(
    (e) =>
      e.type === "relation" && e.tags?.building && e.tags.building !== "no",
  );
  const relationMembers = new Set(
    buildingRelations.flatMap(
      (r) => r.members?.filter((m) => m.type === "way").map((m) => m.ref) ?? [],
    ),
  );
  // Preserve simple closed relation outlines. Courtyards need a hole-aware schema and are deliberately omitted.
  for (const relation of buildingRelations) {
    if (relation.members?.some((m) => m.role === "inner")) {
      omittedComplexBuildings++;
      continue;
    }
    const outers =
      relation.members?.filter(
        (m) => m.type === "way" && (m.role === "outer" || m.role === ""),
      ) ?? [];
    for (const member of outers) {
      const way = elements.find((e) => e.type === "way" && e.id === member.ref);
      const geometry = member.geometry ?? way?.geometry;
      if (!geometry?.length) continue;
      polygonWays.push({
        type: "way",
        id: -relation.id * 1000 - outers.indexOf(member),
        tags: relation.tags,
        geometry,
      });
    }
  }
  for (const element of polygonWays) {
    const tags = element.tags ?? {};
    if (
      (tags.building && tags.building !== "no") ||
      (tags["building:part"] && tags["building:part"] !== "no")
    ) {
      if (relationMembers.has(element.id)) continue;
      const polygon = closedPoints(element, origin);
      if (!polygon) continue;
      const position = centroid(polygon);
      if (!inArea(position)) continue;
      const xs = polygon.map((p) => p[0]),
        zs = polygon.map((p) => p[1]);
      const width = Math.max(...xs) - Math.min(...xs),
        depth = Math.max(...zs) - Math.min(...zs);
      if (width < 1 || depth < 1 || width > radius * 3 || depth > radius * 3)
        continue;
      const height = heightFor(tags);
      objects.push({
        id: `osm-way-${element.id}`,
        kind:
          height.height > 90
            ? "skyscraper"
            : tags["building:part"] === "tower"
              ? "tower"
              : "building",
        name: tags.name ?? tags["addr:housename"] ?? "Building",
        position,
        width,
        depth,
        ...height,
        rotation: 0,
        footprint: polygon.map((p) => [p[0] - position[0], p[1] - position[1]]),
        source: "osm",
        sourceId: `way/${element.id}`,
      });
    }
    const park =
      ["park", "garden", "recreation_ground"].includes(tags.leisure ?? "") ||
      ["forest", "grass", "recreation_ground"].includes(tags.landuse ?? "");
    const water = tags.natural === "water" || tags.waterway === "riverbank";
    if (park || water) {
      const points = closedPoints(element, origin);
      if (points && points.some((p) => inArea(p)))
        landscapes.push({
          id: `osm-land-${element.id}`,
          kind: water ? "water" : "park",
          name: tags.name ?? (water ? "Water" : "Green space"),
          points,
        });
    }
  }
  for (const element of elements) {
    const tags = element.tags ?? {};
    if (
      element.type === "node" &&
      tags.natural === "tree" &&
      Number.isFinite(element.lat) &&
      Number.isFinite(element.lon)
    ) {
      const position = localPoint(element.lat!, element.lon!, origin);
      if (!inArea(position)) continue;
      const height = heightFor(tags, true);
      const crown =
        parseHeight(tags["diameter_crown"]) ??
        Math.min(16, Math.max(3, height.height * 0.65));
      objects.push({
        id: `osm-node-${element.id}`,
        kind: "tree",
        name: tags.name ?? tags.species ?? "Mapped tree",
        position,
        width: crown,
        depth: crown,
        ...height,
        rotation: 0,
        source: "osm",
        sourceId: `node/${element.id}`,
      });
    }
    if (element.type !== "way" || !tags.highway) continue;
    const geometry = finiteGeometry(element);
    if (geometry.length < 2 || geometry.length !== element.nodes?.length)
      continue;
    const points = geometry.map((p) => localPoint(p.lat, p.lon, origin));
    const walkable = isWalkable(tags);
    if (tags.indoor && tags.indoor !== "no") omittedIndoor++;
    const footway = ["footway", "path", "pedestrian", "steps"].includes(
      tags.highway,
    );
    const kind: SceneRoad["kind"] = footway
      ? "footway"
      : tags.highway === "cycleway"
        ? "cycleway"
        : "road";
    // Keep complete consecutive in-area chains, without inventing links across clipped portions.
    let chain: Point[] = [];
    let chainIndex = 0;
    const flush = () => {
      if (chain.length > 1)
        roads.push({
          id: `osm-road-${element.id}-${chainIndex++}`,
          name: tags.name ?? (footway ? "Footpath" : "Street"),
          points: chain,
          width:
            parseHeight(tags.width) ??
            (footway ? 2.5 : kind === "cycleway" ? 3 : 7),
          kind,
          source: "osm",
        });
      chain = [];
    };
    for (const point of points) {
      if (inArea(point)) chain.push(point);
      else flush();
    }
    flush();
    if (!walkable) continue;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1],
        fromRef = element.nodes![i],
        toRef = element.nodes![i + 1];
      if (!inArea(a) || !inArea(b) || fromRef === toRef) continue;
      const fromTags = nodeElements.get(fromRef)?.tags ?? {},
        toTags = nodeElements.get(toRef)?.tags ?? {};
      if (!footAllowed(fromTags) || !footAllowed(toTags)) continue;
      if (
        [fromTags, toTags].some(
          (t) =>
            ["wall", "fence", "retaining_wall", "hedge"].includes(
              t.barrier ?? "",
            ) && !["yes", "designated", "permissive"].includes(t.foot ?? ""),
        )
      )
        continue;
      const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (distance < 0.1) continue;
      // OSM shared node references establish connectivity. Geometric crossings never do,
      // preserving bridges/tunnels on separate layers unless OSM explicitly connects them.
      const from = `osm-node-${fromRef}`,
        to = `osm-node-${toRef}`;
      graphNodes.set(from, {
        id: from,
        point: a,
        ...(fromTags.name ? { name: fromTags.name } : {}),
      });
      graphNodes.set(to, {
        id: to,
        point: b,
        ...(toTags.name ? { name: toTags.name } : {}),
      });
      const reversed = tags["oneway:foot"] === "-1";
      const bidirectional = !["yes", "1", "true", "-1"].includes(
        tags["oneway:foot"] ?? "",
      );
      const covered =
        ["yes", "arcade", "colonnade"].includes(tags.covered ?? "") ||
        tags.tunnel === "building_passage";
      const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const inPark = landscapes.some(
        (l) => l.kind === "park" && pointInPolygon(midpoint, l.points),
      );
      edges.push({
        id: `osm-edge-${element.id}-${i}`,
        from: reversed ? to : from,
        to: reversed ? from : to,
        points: reversed ? [b, a] : [a, b],
        name: tags.name ?? (footway ? "Footpath" : "Street"),
        distance,
        covered,
        scenic: inPark ? 0.9 : footway ? 0.55 : 0.15,
        indoor: "no",
        stairs: tags.highway === "steps",
        accessible:
          tags.wheelchair !== "no" &&
          tags.highway !== "steps" &&
          !["sand", "mud"].includes(tags.surface ?? ""),
        bidirectional,
      });
    }
  }
  if (!objects.length && !roads.length && !landscapes.length)
    throw new ServiceError(
      "NO_DATA",
      "No usable map features were returned for this area. Choose another location.",
    );
  const notes = [
    "OpenStreetMap coverage varies. Unmapped trees and paths are not inferred.",
    "Building heights use mapped values, levels × 3.2 m, then explicit 10 m estimates (3 m for sheds/garages). Tree heights default to an estimated 9 m; unmapped crown diameters are estimated.",
    "Walking topology uses shared OSM node IDs, not line intersections. Public access tags are respected; unverified indoor corridors are excluded.",
    "Accessibility reflects mapped tags only; an untagged path is not a verified accessible route.",
    "Terrain is flat unless edited. Building elevations and canopy density are not measured; shade results are estimates.",
    "Timezone is selected from the nearest indexed city; verify it for locations near timezone boundaries.",
  ];
  if (omittedComplexBuildings)
    notes.push(
      `${omittedComplexBuildings} courtyard building relation(s) omitted because their holes cannot be represented by this scene schema.`,
    );
  if (omittedIndoor)
    notes.push(
      `${omittedIndoor} indoor way(s) excluded from routing until access and passage geometry can be verified.`,
    );
  if (!edges.length)
    notes.push(
      "No connected public walking edges were found; route planning is unavailable in this extract.",
    );
  return {
    id: `osm-${origin.lat.toFixed(5)}-${origin.lon.toFixed(5)}-${radius}`,
    name,
    origin,
    timezone: nearestCity(origin.lat, origin.lon).timezone,
    extent: radius * 2,
    objects,
    roads,
    landscapes,
    graph: { nodes: [...graphNodes.values()], edges },
    provenance: {
      source: "OpenStreetMap via Overpass API",
      attribution:
        "© OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright",
      retrievedAt: now.toISOString(),
      live: true,
      notes,
    },
  };
}
export async function getWorld(
  lat: number,
  lon: number,
  name: string,
  radius = 800,
): Promise<World> {
  const origin = { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) };
  const key = `world-v3-${origin.lat}-${origin.lon}-${radius}`;
  const world = await cached(key, 24 * 60 * 60 * 1000, async () => {
    if (activeMapRequests >= MAX_MAP_REQUESTS)
      throw new ServiceError(
        "RATE_LIMITED",
        "Two areas are loading. Wait a moment before loading another.",
        429,
      );
    activeMapRequests++;
    try {
      const dy = radius / (RAD * EARTH_RADIUS),
        dx = dy / Math.cos(lat * RAD);
      const bbox = [lat - dy, lon - dx, lat + dy, lon + dx]
        .map((v) => v.toFixed(6))
        .join(",");
      const query = `[out:json][timeout:25];(way["building"](${bbox});way["building:part"](${bbox});relation["building"](${bbox});way["highway"](${bbox});node["natural"="tree"](${bbox});way["natural"="water"](${bbox});way["waterway"="riverbank"](${bbox});way["leisure"~"^(park|garden|recreation_ground)$"](${bbox});way["landuse"~"^(forest|grass|recreation_ground)$"](${bbox}););out body geom;>;out body geom;`;
      const payload = await requestJson<OsmResponse>(
        process.env.WALK_FREE_OVERPASS_URL ||
          "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
          timeoutMs: 32_000,
          maxBytes: 20 * 1024 * 1024,
        },
      );
      return parseOsmWorld(payload, origin, name, radius);
    } finally {
      activeMapRequests--;
    }
  });
  return { ...world, name };
}

interface NWSValues {
  uom?: string;
  values?: { validTime: string; value: number | null }[];
}
interface NWSGrid {
  properties?: { skyCover?: NWSValues; visibility?: NWSValues };
}
interface NWSPeriod {
  startTime: string;
  temperature: number;
  temperatureUnit: string;
  relativeHumidity?: { value: number | null };
  windSpeed: string;
  shortForecast: string;
}
function durationMillis(value: string): number | null {
  const m = value.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  return m
    ? (Number(m[1] ?? 0) * 86400 +
        Number(m[2] ?? 0) * 3600 +
        Number(m[3] ?? 0) * 60 +
        Number(m[4] ?? 0)) *
        1000
    : null;
}
export function gridValueAt(
  grid: NWSValues | undefined,
  time: string,
): number | null {
  const instant = Date.parse(time);
  if (!Number.isFinite(instant)) return null;
  for (const entry of grid?.values ?? []) {
    const [start, end] = entry.validTime.split("/");
    const a = Date.parse(start);
    const duration = durationMillis(end ?? "");
    const b = duration === null ? Date.parse(end ?? "") : a + duration;
    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      instant >= a &&
      instant < b &&
      typeof entry.value === "number" &&
      Number.isFinite(entry.value)
    )
      return entry.value;
  }
  return null;
}
export function parseWind(speed: string): number | null {
  const nums = speed.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums?.length) return null;
  const average = nums.reduce((s, v) => s + v, 0) / nums.length;
  if (/mph/i.test(speed)) return average * 0.44704;
  if (/km\/h|kph/i.test(speed)) return average / 3.6;
  if (/kt|knots/i.test(speed)) return average * 0.514444;
  if (/m\/s/i.test(speed)) return average;
  if (/^calm$/i.test(speed.trim())) return 0;
  return null;
}
function visibilityMeters(
  grid: NWSValues | undefined,
  time: string,
): number | null {
  const value = gridValueAt(grid, time);
  if (value === null || value < 0) return null;
  const unit = grid?.uom?.split(":").at(-1);
  return unit === "m"
    ? value
    : unit === "km"
      ? value * 1000
      : unit === "ft"
        ? value * 0.3048
        : unit === "mi"
          ? value * 1609.344
          : null;
}
export function parseNwsForecast(
  periods: NWSPeriod[],
  grid: NWSGrid = {},
  now = new Date(),
): WeatherForecast {
  if (!Array.isArray(periods))
    throw new ServiceError(
      "INVALID_UPSTREAM_DATA",
      "The weather provider returned no hourly forecast.",
    );
  const hours: WeatherHour[] = [];
  for (const period of periods) {
    if (
      !Number.isFinite(Date.parse(period.startTime)) ||
      typeof period.temperature !== "number" ||
      !Number.isFinite(period.temperature)
    )
      continue;
    const temperatureC =
      period.temperatureUnit === "F"
        ? ((period.temperature - 32) * 5) / 9
        : period.temperatureUnit === "C"
          ? period.temperature
          : null;
    const windMps =
      typeof period.windSpeed === "string" ? parseWind(period.windSpeed) : null;
    if (temperatureC === null || windMps === null) continue;
    const humidity = period.relativeHumidity?.value;
    const cloud = gridValueAt(grid.properties?.skyCover, period.startTime);
    const cloudUnit = grid.properties?.skyCover?.uom?.split(":").at(-1);
    hours.push({
      time: period.startTime,
      temperatureC,
      humidity:
        typeof humidity === "number" && humidity >= 0 && humidity <= 100
          ? humidity
          : null,
      windMps,
      cloudCover:
        cloudUnit === "percent" && cloud !== null && cloud >= 0 && cloud <= 100
          ? cloud
          : null,
      description:
        typeof period.shortForecast === "string" ? period.shortForecast : "",
      visibilityMeters: visibilityMeters(
        grid.properties?.visibility,
        period.startTime,
      ),
    } as WeatherHour);
  }
  if (!hours.length)
    throw new ServiceError(
      "NO_DATA",
      "No usable hourly weather forecast is available for this location.",
    );
  return {
    source: "National Weather Service hourly forecast and grid data",
    fetchedAt: now.toISOString(),
    hours,
    attribution:
      "NOAA / National Weather Service · https://www.weather.gov/disclaimer",
  };
}
export async function getWeather(
  lat: number,
  lon: number,
): Promise<WeatherForecast> {
  return cached(
    `weather-v2-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    15 * 60 * 1000,
    async () => {
      const point = await requestJson<{
        properties?: { forecastHourly?: string; forecastGridData?: string };
      }>(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
        timeoutMs: 12_000,
        maxBytes: 1_000_000,
      });
      const hourly = point.properties?.forecastHourly,
        gridUrl = point.properties?.forecastGridData;
      const trustedNws = (url: string | undefined) => {
        if (!url) return false;
        try {
          const u = new URL(url);
          return (
            u.protocol === "https:" &&
            u.hostname === "api.weather.gov" &&
            !u.username &&
            !u.password
          );
        } catch {
          return false;
        }
      };
      if (!trustedNws(hourly))
        throw new ServiceError(
          "NO_DATA",
          "The National Weather Service has no hourly forecast for this location.",
        );
      const [forecast, grid] = await Promise.all([
        requestJson<{ properties?: { periods?: NWSPeriod[] } }>(hourly!, {
          timeoutMs: 12_000,
          maxBytes: 2_000_000,
        }),
        trustedNws(gridUrl)
          ? requestJson<NWSGrid>(gridUrl!, {
              timeoutMs: 12_000,
              maxBytes: 4_000_000,
            }).catch(() => ({}) as NWSGrid)
          : Promise.resolve({} as NWSGrid),
      ]);
      return parseNwsForecast(forecast.properties?.periods ?? [], grid);
    },
  );
}
