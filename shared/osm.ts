import type {
  Amenity,
  Point,
  SceneObject,
  SceneRoad,
  Landscape,
  GraphNode,
  GraphEdge,
  World,
} from "./types.js";
import { ServiceError } from "./errors.js";
import { nearestCity } from "../server/cities.js";

// OpenStreetMap parsing shared by the API, the browser fallback, and the
// pre-built area script, so every source produces the same World.
export const EARTH_RADIUS = 6_371_008.8;
export const RAD = Math.PI / 180;
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
const ALIAS_TAGS = [
  "ref",
  "short_name",
  "alt_name",
  "official_name",
  "old_name",
  "loc_name",
];
/** Other names a building is known by, from OSM tags. */
export function buildingAliases(tags: Record<string, string>) {
  const names = ALIAS_TAGS.flatMap((k) => tags[k]?.split(";") ?? [])
    .map((n) => n.trim())
    .filter((n) => n && n.length <= 120 && n !== tags.name);
  return [...new Set(names)].slice(0, 8);
}
const LIT = new Set(["yes", "24/7", "automatic", "limited", "interval"]);
/** OSM `lit`: true or false when mapped, undefined when unknown. */
export function litValue(lit?: string): boolean | undefined {
  if (!lit) return undefined;
  if (LIT.has(lit) || /^\d/.test(lit)) return true;
  return lit === "no" ? false : undefined;
}
/** Wheelchair guidance treats slopes over about 8% as not step-free. */
const MAX_STEP_FREE_INCLINE = 8;
export function steepIncline(incline?: string) {
  const percent = incline?.match(/^-?(\d+(?:\.\d+)?)\s*%$/);
  return percent ? Number(percent[1]) > MAX_STEP_FREE_INCLINE : false;
}
export function roadClass(
  highway: string,
): "major" | "street" | "service" | "path" {
  if (/^(primary|secondary|tertiary)(_link)?$/.test(highway)) return "major";
  if (
    ["residential", "unclassified", "living_street", "road"].includes(highway)
  )
    return "street";
  if (highway === "service") return "service";
  return "path";
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
/** Water you can drink, or a public shelter that gives shade. */
function amenityKind(tags: Record<string, string>): Amenity["kind"] | null {
  if (tags.access === "private" || tags.access === "no") return null;
  if (
    tags.amenity === "drinking_water" ||
    (tags.amenity === "water_point" && tags.drinking_water !== "no") ||
    tags.drinking_water === "yes"
  )
    return "water";
  if (
    tags.amenity === "shelter" &&
    tags.shelter_type !== "lean_to" &&
    tags.shelter_type !== "basic_hut"
  )
    return "shelter";
  return null;
}

export function parseOsmWorld(
  response: OsmResponse,
  origin: { lat: number; lon: number },
  name: string,
  radius = 800,
  now = new Date(),
  maxElements = 150_000,
): World {
  if (
    !Array.isArray(response.elements) ||
    response.elements.length > maxElements
  )
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
    landscapes: Landscape[] = [],
    amenities: Amenity[] = [];
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
  const waysById = new Map(
    elements.filter((e) => e.type === "way").map((e) => [e.id, e]),
  );
  // Keep each relation's closed outer outlines. Courtyards (inner rings) are
  // drawn solid because the scene schema has no holes.
  for (const relation of buildingRelations) {
    if (relation.members?.some((m) => m.role === "inner"))
      omittedComplexBuildings++;
    const outers =
      relation.members?.filter(
        (m) => m.type === "way" && (m.role === "outer" || m.role === ""),
      ) ?? [];
    for (const member of outers) {
      const way = waysById.get(member.ref);
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
        ...(buildingAliases(tags).length
          ? { aliases: buildingAliases(tags) }
          : {}),
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
    const amenity = amenityKind(tags);
    if (
      amenity &&
      element.type === "node" &&
      Number.isFinite(element.lat) &&
      Number.isFinite(element.lon)
    ) {
      const position = localPoint(element.lat!, element.lon!, origin);
      if (inArea(position))
        amenities.push({
          id: `osm-node-${element.id}`,
          kind: amenity,
          name:
            tags.name ??
            (amenity === "water" ? "Drinking water" : "Shade shelter"),
          position,
        });
    }
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
          !["sand", "mud"].includes(tags.surface ?? "") &&
          !steepIncline(tags.incline),
        bidirectional,
        ...(litValue(tags.lit) !== undefined
          ? { lit: litValue(tags.lit) }
          : {}),
        roadClass: roadClass(tags.highway),
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
      `${omittedComplexBuildings} courtyard building(s) are drawn without their courtyards, so shade inside those courtyards is overestimated.`,
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
    amenities,
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

/** Public Overpass instances, tried in order when one is down or rate limited. */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

/** Failures that another Overpass instance might not share. */
const RETRYABLE = new Set([
  "TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "NETWORK_BLOCKED",
  "INVALID_UPSTREAM_DATA",
]);
export function overpassRetryable(error: unknown) {
  return !(error instanceof ServiceError) || RETRYABLE.has(error.code);
}

export function worldOrigin(lat: number, lon: number) {
  return { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) };
}

export function overpassQuery(
  lat: number,
  lon: number,
  radius: number,
  timeoutSeconds = 25,
) {
  const dy = radius / (RAD * EARTH_RADIUS),
    dx = dy / Math.cos(lat * RAD);
  const bbox = [lat - dy, lon - dx, lat + dy, lon + dx]
    .map((v) => v.toFixed(6))
    .join(",");
  // Ways carry their own geometry; of their nodes, only tagged ones (gates,
  // barriers, crossings, names) affect routing, so skip the untagged bulk.
  return `[out:json][timeout:${timeoutSeconds}];(way["building"](${bbox});way["building:part"](${bbox});relation["building"](${bbox});way["highway"](${bbox});node["natural"="tree"](${bbox});way["natural"="water"](${bbox});way["waterway"="riverbank"](${bbox});way["leisure"~"^(park|garden|recreation_ground)$"](${bbox});way["landuse"~"^(forest|grass|recreation_ground)$"](${bbox});node["amenity"~"^(drinking_water|water_point|shelter)$"](${bbox});node["drinking_water"="yes"](${bbox});)->.area;.area out body geom;way.area["highway"];node(w)(if:count_tags()>0);out body;`;
}

/** Areas wider than this are fetched as four tiles to stay under limits. */
export const MAX_SINGLE_QUERY_RADIUS = 1000;
/** Largest area anyone may build: a 3 km city district. */
export const MAX_AREA_RADIUS = 1500;
/** Elements a tiled district may contain. */
export const MAX_TILED_ELEMENTS = 600_000;

/** Query centres and radius that together cover a square area. */
export function areaTiles(lat: number, lon: number, radius: number) {
  if (radius <= MAX_SINGLE_QUERY_RADIUS) return [{ lat, lon, radius }];
  const half = radius / 2;
  const dLat = half / (RAD * EARTH_RADIUS),
    dLon = dLat / Math.cos(lat * RAD);
  return [
    [1, -1],
    [1, 1],
    [-1, -1],
    [-1, 1],
  ].map(([sy, sx]) => ({
    lat: lat + sy * dLat,
    lon: lon + sx * dLon,
    radius: half,
  }));
}

/** Merges tile responses, keeping each OSM element once. */
export function mergeOsm(responses: OsmResponse[]): OsmResponse {
  const elements = new Map<string, OsmElement>();
  for (const r of responses)
    for (const e of r.elements) elements.set(`${e.type}:${e.id}`, e);
  return { elements: [...elements.values()] };
}
