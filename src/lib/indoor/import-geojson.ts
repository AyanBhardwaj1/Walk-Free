import { unzipSync, strFromU8 } from "fflate";
import type { Point } from "../../../shared/types.js";
import { toLocal } from "../geo.js";
import type { IndoorLevel, IndoorRoom } from "./types.js";

/**
 * Reads indoor maps of whole buildings from the formats they're published
 * in, into local metres on this map:
 * - IMDF (Apple's Indoor Mapping Data Format): a .zip, or its unit,
 *   opening and level GeoJSON files;
 * - OpenStreetMap Simple Indoor Tagging: indoor=room/corridor/area with level=*;
 * - any GeoJSON of polygons (rooms) and lines (corridors), with "level"
 *   and "name" properties where known.
 */

type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] }
  | { type: "Point"; coordinates: number[] }
  | { type: string; coordinates?: unknown };
interface Feature {
  type: "Feature";
  id?: string | number;
  feature_type?: string;
  geometry: Geometry | null;
  properties: Record<string, unknown> | null;
}

/** Most bytes unpacked from one archive. */
const MAX_UNZIPPED_BYTES = 200e6;
/** Most features a single import may hold (a large campus building). */
const MAX_FEATURES = 20_000;

/** Every feature in one or more GeoJSON texts, or an IMDF zip. */
export function readFeatures(files: { name: string; data: Uint8Array }[]) {
  const features: Feature[] = [];
  const addText = (name: string, text: string) => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw Error(`${name} isn't valid GeoJSON.`);
    }
    const list =
      (json as { type?: string }).type === "FeatureCollection"
        ? ((json as { features?: Feature[] }).features ?? [])
        : (json as { type?: string }).type === "Feature"
          ? [json as Feature]
          : [];
    // IMDF names the kind of feature by file (unit.geojson, opening.geojson).
    const kind = name.replace(/^.*\//, "").replace(/\.geojson$|\.json$/i, "");
    for (const f of list) {
      if (features.length >= MAX_FEATURES) break;
      features.push({ ...f, feature_type: f.feature_type ?? kind });
    }
  };
  // Levels first, then units and openings: the feature cap must never
  // drop the floors everything else hangs on.
  const rank = (name: string) =>
    /(^|\/)(level|venue|building)\.(geo)?json$/i.test(name)
      ? 0
      : /(^|\/)(unit|opening)\.(geo)?json$/i.test(name)
        ? 1
        : 2;
  const texts: { name: string; text: () => string; packed: boolean }[] = [];
  // Archives: list every entry first, then unpack the useful GeoJSON in
  // order of use (levels, then units and openings) within one budget for
  // the whole import, so a "zip bomb" can't exhaust memory and big detail
  // files can't crowd out the levels. Mac "Compress" adds __MACOSX/._ files.
  const wanted = (name: string) =>
    /\.(geo)?json$/i.test(name) &&
    !/(^|\/)__MACOSX\//.test(name) &&
    !/(^|\/)\._/.test(name);
  let budget = MAX_UNZIPPED_BYTES;
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const listed: { name: string; size: number }[] = [];
      unzipSync(file.data, {
        filter: (f) => {
          if (wanted(f.name))
            listed.push({ name: f.name, size: f.originalSize });
          return false;
        },
      });
      const chosen = new Set<string>();
      for (const f of listed.sort((a, b) => rank(a.name) - rank(b.name)))
        if (f.size <= budget) {
          budget -= f.size;
          chosen.add(f.name);
        }
      const entries = unzipSync(file.data, {
        filter: (f) => chosen.has(f.name),
      });
      for (const [name, bytes] of Object.entries(entries))
        texts.push({ name, text: () => strFromU8(bytes), packed: true });
    } else
      texts.push({
        name: file.name,
        text: () => strFromU8(file.data),
        packed: false,
      });
  }
  texts.sort((a, b) => rank(a.name) - rank(b.name));
  for (const t of texts) {
    // A stray file inside an archive is skipped; a file chosen on its own
    // that isn't GeoJSON is an error worth saying.
    if (t.packed)
      try {
        addText(t.name, t.text());
      } catch {
        continue;
      }
    else addText(t.name, t.text());
  }
  return features;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
/** IMDF names are {language: text}; others are plain strings. */
function nameOf(p: Record<string, unknown>) {
  const n = p.name ?? p.alt_name ?? p.ref ?? p["name:en"];
  if (n && typeof n === "object") {
    const values = Object.values(n as Record<string, unknown>);
    return str((n as Record<string, unknown>).en ?? values[0]);
  }
  return str(n) || str(p.ref);
}
function levelOf(p: Record<string, unknown>, levels: Map<string, number>) {
  // IMDF: level_id points at a level feature with an ordinal.
  const id = str(p.level_id);
  if (id && levels.has(id)) return levels.get(id)!;
  const raw = p.level ?? p["level:ref"] ?? p.ordinal ?? 0;
  const n = parseFloat(String(raw).split(/[;,]/)[0]);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function kindOf(
  f: Feature,
  imdf: boolean,
  /** The file uses OSM indoor tagging: untagged features are outdoors. */
  osm = false,
): IndoorRoom["kind"] | "door" | "entrance" | null {
  const p = f.properties ?? {};
  const category = str(p.category).toLowerCase();
  const indoor = str(p.indoor).toLowerCase();
  const type = (f.feature_type ?? "").toLowerCase();
  // OSM tags the ways into a building entrance=*; IMDF marks a building's
  // main doors pedestrian.principal.
  if (p.entrance || category === "pedestrian.principal") return "entrance";
  // IMDF: details (drawn lines), fixtures, venues and the rest aren't
  // spaces to walk; only units and openings are.
  if (imdf && type !== "unit" && type !== "opening") return null;
  // Walls are drawn as lines in Simple Indoor Tagging: not a way through.
  if (indoor === "wall") return null;
  const onLevel = p.level !== undefined || p["level:ref"] !== undefined;
  // An OSM export also carries the streets outside and the building
  // itself. Indoor corridor lines are highway=corridor, or any highway on
  // a level; lifts and steps count too.
  if (!indoor && (p.highway || p.building || p["building:part"]))
    if (
      !onLevel &&
      p.highway !== "corridor" &&
      p.highway !== "elevator" &&
      p.highway !== "steps"
    )
      return null;
  // With OSM indoor tagging in the file, a feature tagged for none of it
  // (a fence, a stream, a park) isn't part of the inside.
  if (
    osm &&
    !indoor &&
    !onLevel &&
    !p.door &&
    !p.entrance &&
    p.highway !== "corridor"
  )
    return null;
  if (type === "opening" || p.door || indoor === "door") return "door";
  if (type === "level" || type === "building" || type === "footprint")
    return null;
  if (/stair/.test(category) || p.stairs === "yes") return "stairs";
  if (/elevator/.test(category) || p.highway === "elevator") return "elevator";
  if (/restroom|toilet/.test(category) || p.amenity === "toilets")
    return "restroom";
  if (
    /walkway|corridor|hallway|circulation/.test(category) ||
    indoor === "corridor" ||
    indoor === "area"
  )
    return "corridor";
  if (type === "unit" || indoor === "room" || p.room || category) return "room";
  return "other";
}

/** Indoor levels from GeoJSON features, in local metres. */
export function featuresToLevels(
  features: Feature[],
  origin: { lat: number; lon: number },
): { levels: IndoorLevel[]; source: string; hours?: string } {
  const local = (c: number[]): Point => toLocal(c[1], c[0], origin);
  // IMDF level features give each level id its ordinal and name.
  const levelIds = new Map<string, number>();
  const levelNames = new Map<number, string>();
  for (const f of features)
    if (
      (f.feature_type ?? "").toLowerCase() === "level" &&
      f.id !== undefined
    ) {
      const p = f.properties ?? {};
      const ordinal = Number(p.ordinal ?? 0);
      levelIds.set(String(f.id), Number.isFinite(ordinal) ? ordinal : 0);
      const name =
        nameOf(p) || str((p.short_name as Record<string, string>)?.en);
      if (name) levelNames.set(ordinal, name);
    }
  const levels = new Map<number, IndoorLevel>();
  const level = (n: number) => {
    let l = levels.get(n);
    if (!l) {
      l = {
        ordinal: n,
        name: levelNames.get(n) ?? (n === 0 ? "Ground floor" : `Level ${n}`),
        rooms: [],
        paths: [],
        doors: [],
      };
      levels.set(n, l);
    }
    return l;
  };
  const imdf = features.some(
      (f) => f.feature_type === "unit" || f.feature_type === "opening",
    ),
    osm = features.some((f) => !!f.properties?.indoor);
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const p = f.properties ?? {};
    const kind = kindOf(f, imdf, osm);
    if (!kind) continue;
    const l = level(levelOf(p, levelIds));
    const name = nameOf(p);
    const polys =
      g.type === "Polygon"
        ? [(g.coordinates as number[][][])[0]]
        : g.type === "MultiPolygon"
          ? (g.coordinates as number[][][][]).map((poly) => poly[0])
          : [];
    const lines =
      g.type === "LineString"
        ? [g.coordinates as number[][]]
        : g.type === "MultiLineString"
          ? (g.coordinates as number[][][])
          : [];
    if (kind === "door" || kind === "entrance") {
      const pts =
        g.type === "Point"
          ? [g.coordinates as number[]]
          : (lines[0] ?? polys[0] ?? []);
      if (pts.length) {
        const m = pts.map(local);
        const at: Point = [
          m.reduce((s, q) => s + q[0], 0) / m.length,
          m.reduce((s, q) => s + q[1], 0) / m.length,
        ];
        if (kind === "entrance") (l.entrances ??= []).push(at);
        else l.doors.push(at);
      }
      continue;
    }
    for (const ring of polys)
      if (ring && ring.length >= 4)
        l.rooms.push({ name, ring: ring.map(local), kind });
    // Lines are walked when they're corridors (or, in a plain GeoJSON with
    // no tagging scheme, whatever lines it gives).
    const walkable = !osm || kind === "corridor" || !!p.highway;
    if (walkable)
      for (const line of lines)
        if (line.length >= 2) l.paths.push(line.map(local));
  }
  // The building's opening hours: OSM opening_hours on the building, or
  // IMDF hours (the same syntax) on its venue or building feature.
  const hours = features
    .map((f) => {
      const p = f.properties ?? {};
      const type = (f.feature_type ?? "").toLowerCase();
      const whole = type === "venue" || type === "building" || !!p.building;
      return whole ? (str(p.opening_hours) || str(p.hours)).trim() : "";
    })
    .find(Boolean);
  return {
    levels: [...levels.values()]
      .filter((l) => l.rooms.length || l.paths.length)
      .sort((a, b) => a.ordinal - b.ordinal),
    source: imdf ? "IMDF" : osm ? "OpenStreetMap indoor" : "GeoJSON",
    ...(hours ? { hours: hours.slice(0, 500) } : {}),
  };
}
