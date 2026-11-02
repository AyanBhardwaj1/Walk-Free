/**
 * A whole walkable city from a compact AI-written plan (shared/city-spec).
 *
 * The plan is laid out in three passes: first every street is drawn as a
 * free polyline (district patterns, arterials between districts, shore
 * walks, landmark forecourts); then lines are joined at their crossings
 * and cut by water (keeping bridges) and by landmark sites; finally the
 * CityBuilder kit receives the streets and places landmarks, buildings
 * along every frontage, trees, parks and amenities, all clear of paths.
 * The same plan, realism and seed always give the same World.
 */
import type {
  LandmarkShape,
  Point,
  SceneObject,
  World,
} from "../../shared/types.js";
import {
  REALISM,
  type CityLandmark,
  type CitySpec,
  type CityWater,
  type Realism,
  type SpecAmbient,
} from "../../shared/city-spec.js";
import {
  between,
  CityBuilder,
  pick,
  rectCorners,
  round,
  seededRng,
  type Rng,
  type StreetStyle,
} from "./fiction-cities/kit.js";
import {
  boxCorners,
  boxesTouch,
  boxOf,
  clamp,
  clipToBox,
  closestOnSegment,
  dist,
  ellipse,
  expand,
  Hash,
  inBox,
  insidePolygon,
  joinLines,
  offsetPolyline,
  pointSegmentDistance,
  polygonsOverlap,
  splitAtPolygon,
  type Box,
} from "./city-from-spec/geometry.js";
import {
  diagonalPattern,
  gridPattern,
  organicPattern,
  parkPattern,
  radialPattern,
  type DistrictPlan,
  type PatternContext,
  type PatternResult,
  type PlanLine,
} from "./city-from-spec/patterns.js";
import {
  KINDS,
  STYLES,
  landmarkFootprint,
  treeLook,
} from "./city-from-spec/styles.js";

export type { CitySpec, Realism } from "../../shared/city-spec.js";

/** The plan's sky, fog, accent, weather particles and night flag. */
export function ambientFromSpec(spec: CitySpec): SpecAmbient {
  const a = spec.ambient;
  return {
    sky: [a.sky[0], a.sky[1]],
    fog: a.fog,
    accent: a.accent,
    particles: a.particles,
    night: a.night,
  };
}

export function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "city"
  );
}
export function shortHash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(7, "0").slice(-7);
}

const PREFIXES = [
  "Upper",
  "Old",
  "New",
  "North",
  "South",
  "East",
  "West",
  "Little",
  "Great",
  "High",
];

/** Street and place names: the plan's own first, then style words. */
class Names {
  private streetQueue: string[];
  private placeQueue: string[];
  private used = new Set<string>();
  private cursor = new Map<string, number>();
  private order = new Map<string, string[]>();
  constructor(
    private rng: Rng,
    spec: CitySpec,
  ) {
    this.streetQueue = [...(spec.streetNames ?? [])];
    this.placeQueue = [...(spec.placeNames ?? [])];
  }
  private words(style: keyof typeof STYLES) {
    let list = this.order.get(style);
    if (!list) {
      list = [...STYLES[style].words];
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      this.order.set(style, list);
    }
    return list;
  }
  word(style: keyof typeof STYLES, key = "") {
    const list = this.words(style);
    const i = this.cursor.get(`${style}|${key}`) ?? 0;
    this.cursor.set(`${style}|${key}`, i + 1);
    const base = list[i % list.length];
    const round = Math.floor(i / list.length);
    return round === 0
      ? base
      : `${PREFIXES[(round - 1) % PREFIXES.length]} ${base}`;
  }
  private claim(name: string) {
    if (this.used.has(name.toLowerCase())) return false;
    this.used.add(name.toLowerCase());
    return true;
  }
  /** A street name; `fromPlan` takes the plan's own names first. */
  street(style: keyof typeof STYLES, suffix: string, fromPlan = false) {
    if (fromPlan)
      while (this.streetQueue.length) {
        const n = this.streetQueue.shift()!;
        if (this.claim(n)) return n;
      }
    for (let k = 0; k < 400; k++) {
      const n = `${this.word(style, suffix)} ${suffix}`;
      if (this.claim(n)) return n;
    }
    return `${suffix} ${this.used.size}`;
  }
  /** A place name for a node or park; the plan's own names first. */
  place(style: keyof typeof STYLES, nouns: readonly string[], fromPlan = true) {
    if (fromPlan)
      while (this.placeQueue.length) {
        const n = this.placeQueue.shift()!;
        if (this.claim(n)) return n;
      }
    for (let k = 0; k < 400; k++) {
      const noun = pick(this.rng, nouns);
      const n = `${this.word(style, noun)} ${noun}`;
      if (this.claim(n)) return n;
    }
    return `${nouns[0]} ${this.used.size}`;
  }
  /** Reserve an exact name; false when it is already taken. */
  take(name: string) {
    return this.claim(name);
  }
}

interface WaterBody {
  spec: CityWater;
  kind: CityWater["kind"];
  name: string;
  polygon: Point[];
  box: Box;
  width: number;
  /** Rivers and canals are crossed by bridges; bays and lakes by causeways. */
  linear: boolean;
  /** A river's or canal's centre line. */
  centre?: Point[];
}
interface Site {
  landmark: CityLandmark;
  centre: Point;
  width: number;
  depth: number;
  /** The forecourt: the site plus its margin, ringed by a walk. */
  court: Box;
  ringName: string;
  nodeName: string;
  district: number;
}
interface Keepout {
  polygon: Point[];
  box: Box;
}
interface Frontage {
  a: Point;
  b: Point;
  half: number;
  district: number;
  role: PlanLine["role"];
}

const ARTERIAL_GAP = 26;
const COURT_MARGIN = 12;
const TERRAIN_RESOLUTION = 33;

/**
 * Build the walkable World for a plan. Deterministic for the same spec,
 * realism and seed; the plan should come from parseCitySpec.
 */
export function buildCityFromSpec(
  spec: CitySpec,
  realism: Realism,
  seed: string = spec.name,
): World {
  const level = REALISM[realism] ?? REALISM.detailed;
  const extent = level.extent;
  const edge = extent / 2;
  const H = edge - 20;
  const bounds: Box = [-H, H, -H, H];
  const rng = seededRng(`walk-free-ai:${seed}:${realism}`);
  const slug = slugify(spec.name);
  const b = new CityBuilder(rng, `ai-${slug.slice(0, 16)}`, H);
  const names = new Names(rng, spec);
  const toWorld = (at: [number, number]): Point => [
    at[0] * H * 0.8,
    at[1] * H * 0.8,
  ];
  const mainStyle = spec.districts[0]?.style ?? "modern";

  /* ---------------- water ---------------- */
  const water = spec.water.map((w, i) => planWater(w, i));
  function planWater(w: CityWater, i: number): WaterBody {
    const kind = w.kind;
    const side =
      w.side ??
      (kind === "bay" ? "south" : kind === "lake" ? "center" : "center");
    const word = names.word(mainStyle);
    const label =
      kind === "river"
        ? `${word} River`
        : kind === "canal"
          ? `${word} Canal`
          : kind === "bay" && side !== "center"
            ? `${word} Bay`
            : `Lake ${word}`;
    names.take(label);
    if (kind === "river" || kind === "canal") {
      const width = clamp(
        w.width ?? (kind === "river" ? extent * 0.06 : 22),
        20,
        extent * 0.2,
      );
      const vertical =
        side === "east" ||
        side === "west" ||
        (side === "center" && (i % 2 === 1) !== rng() < 0.5);
      const offset =
        side === "north" || side === "west"
          ? -0.55 * H
          : side === "south" || side === "east"
            ? 0.55 * H
            : between(rng, -0.12, 0.12) * H;
      const amp = kind === "river" ? 0.07 * H : 0.015 * H;
      const phase = between(rng, 0, Math.PI * 2);
      const steps = 16;
      const centre = Array.from({ length: steps + 1 }, (_, k) => {
        const t = -edge + (2 * edge * k) / steps;
        const lateral =
          offset + amp * Math.sin(phase + (k / steps) * Math.PI * 2.2);
        return (vertical ? [lateral, t] : [t, lateral]) as Point;
      });
      const left = offsetPolyline(centre, width / 2),
        right = offsetPolyline(centre, -width / 2);
      const polygon = [...left, ...right.reverse()].map(clampToEdge);
      return {
        spec: w,
        kind,
        name: label,
        polygon,
        box: boxOf(polygon),
        width,
        linear: true,
        centre,
      };
    }
    if (kind === "bay" && side !== "center") {
      const depth = clamp(w.width ?? extent * 0.2, 40, extent * 0.3);
      const steps = 14;
      const phase = between(rng, 0, Math.PI * 2);
      const shore = Array.from({ length: steps + 1 }, (_, k) => {
        const t = -edge + (2 * edge * k) / steps;
        const inward = depth * (0.85 + 0.15 * Math.sin(phase + k * 0.9));
        return shorePoint(side, t, inward);
      });
      const far = [shorePoint(side, edge, 0), shorePoint(side, -edge, 0)];
      const polygon = [...shore, ...far].map(clampToEdge);
      return {
        spec: w,
        kind,
        name: label,
        polygon,
        box: boxOf(polygon),
        width: depth,
        linear: false,
      };
    }
    const r = clamp((w.width ?? extent * 0.18) / 2, 20, extent * 0.11);
    const c: Point =
      side === "center"
        ? [between(rng, -0.1, 0.1) * H, between(rng, -0.1, 0.1) * H]
        : side === "north"
          ? [0, -0.5 * H]
          : side === "south"
            ? [0, 0.5 * H]
            : side === "east"
              ? [0.5 * H, 0]
              : [-0.5 * H, 0];
    const polygon = ellipse(c, r, r * 0.8, 24).map(
      (p, k) =>
        [
          c[0] + (p[0] - c[0]) * (1 + 0.07 * Math.sin(k * 1.9)),
          c[1] + (p[1] - c[1]) * (1 + 0.07 * Math.cos(k * 2.3)),
        ] as Point,
    );
    return {
      spec: w,
      kind: "lake",
      name: label,
      polygon,
      box: boxOf(polygon),
      width: r * 2,
      linear: false,
    };
  }
  function shorePoint(side: string, t: number, inward: number): Point {
    if (side === "north") return [t, -edge + inward];
    if (side === "south") return [t, edge - inward];
    if (side === "east") return [edge - inward, t];
    return [-edge + inward, t];
  }
  function clampToEdge(p: Point): Point {
    return [round(clamp(p[0], -edge, edge)), round(clamp(p[1], -edge, edge))];
  }

  // Bays take land from their side of the map.
  const land: Box = [...bounds];
  for (const w of water)
    if (w.kind === "bay") {
      const side = w.spec.side ?? "south";
      const reach = w.width + 20;
      if (side === "north") land[2] = Math.max(land[2], -edge + reach);
      if (side === "south") land[3] = Math.min(land[3], edge - reach);
      if (side === "west") land[0] = Math.max(land[0], -edge + reach);
      if (side === "east") land[1] = Math.min(land[1], edge - reach);
    }
  if (land[1] - land[0] < 200) [land[0], land[1]] = [-H * 0.5, H * 0.5];
  if (land[3] - land[2] < 200) [land[2], land[3]] = [-H * 0.5, H * 0.5];

  /* ---------------- districts ---------------- */
  const districts = layoutDistricts();
  function layoutDistricts(): DistrictPlan[] {
    const raw = spec.districts.map((d) => {
      const c = toWorld(d.at);
      const aspect = between(rng, 0.8, 1.25);
      const half = d.size * H;
      return {
        d,
        c,
        hw: half * Math.sqrt(aspect),
        hd: half / Math.sqrt(aspect),
      };
    });
    // Small plans spread out to fill more of the map.
    const area = raw.reduce((s, r) => s + 4 * r.hw * r.hd, 0);
    const landArea = (land[1] - land[0]) * (land[3] - land[2]);
    const grow = clamp(
      Math.sqrt((0.55 * landArea) / Math.max(area, 1)),
      1,
      1.9,
    );
    let boxes: Box[] = raw.map((r) => [
      r.c[0] - r.hw * grow,
      r.c[0] + r.hw * grow,
      r.c[1] - r.hd * grow,
      r.c[1] + r.hd * grow,
    ]);
    boxes = boxes.map((bx) => fitInto(bx, land));
    // Push overlapping districts apart, leaving room for arterials.
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const A = boxes[i],
            B = boxes[j];
          const px = Math.min(A[1], B[1]) - Math.max(A[0], B[0]) + ARTERIAL_GAP,
            pz = Math.min(A[3], B[3]) - Math.max(A[2], B[2]) + ARTERIAL_GAP;
          if (px <= 0 || pz <= 0) continue;
          moved = true;
          const ca = [(A[0] + A[1]) / 2, (A[2] + A[3]) / 2],
            cb = [(B[0] + B[1]) / 2, (B[2] + B[3]) / 2];
          if (px < pz) {
            const s =
              (ca[0] < cb[0] || (ca[0] === cb[0] && i % 2 === 0) ? -1 : 1) *
              (px / 2 + 0.5);
            boxes[i] = fitInto([A[0] + s, A[1] + s, A[2], A[3]], land);
            boxes[j] = fitInto([B[0] - s, B[1] - s, B[2], B[3]], land);
          } else {
            const s =
              (ca[1] < cb[1] || (ca[1] === cb[1] && i % 2 === 0) ? -1 : 1) *
              (pz / 2 + 0.5);
            boxes[i] = fitInto([A[0], A[1], A[2] + s, A[3] + s], land);
            boxes[j] = fitInto([B[0], B[1], B[2] - s, B[3] - s], land);
          }
        }
      if (!moved) break;
    }
    // Whatever still overlaps is trimmed from the later district.
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i],
          B = boxes[j];
        const px = Math.min(A[1], B[1]) - Math.max(A[0], B[0]) + ARTERIAL_GAP,
          pz = Math.min(A[3], B[3]) - Math.max(A[2], B[2]) + ARTERIAL_GAP;
        if (px <= 0 || pz <= 0) continue;
        const nb: Box = [...B];
        if (px < pz) {
          if ((B[0] + B[1]) / 2 > (A[0] + A[1]) / 2) nb[0] += px;
          else nb[1] -= px;
        } else if ((B[2] + B[3]) / 2 > (A[2] + A[3]) / 2) nb[2] += pz;
        else nb[3] -= pz;
        boxes[j] = nb;
      }
    // Then each side grows into free land, up to 40% of its half size.
    const limit = boxes.map((bx) => [
      ((bx[1] - bx[0]) / 2) * 0.4,
      ((bx[3] - bx[2]) / 2) * 0.4,
    ]);
    const grown = boxes.map(() => [0, 0, 0, 0]);
    for (let pass = 0; pass < 12; pass++)
      boxes.forEach((bx, i) => {
        for (let side = 0; side < 4; side++) {
          const room = limit[i][side < 2 ? 0 : 1] - grown[i][side];
          if (room <= 0) continue;
          const step = Math.min(10, room);
          const next: Box = [...bx];
          next[side] += side % 2 ? step : -step;
          if (
            next[0] < land[0] ||
            next[1] > land[1] ||
            next[2] < land[2] ||
            next[3] > land[3]
          )
            continue;
          if (
            boxes.some((o, j) => j !== i && boxesTouch(o, next, ARTERIAL_GAP))
          )
            continue;
          boxes[i] = bx = next;
          grown[i][side] += step;
        }
      });
    const plans: DistrictPlan[] = [];
    raw.forEach((r, i) => {
      const box = boxes[i].map(round) as Box;
      if (box[1] - box[0] < 40 || box[3] - box[2] < 40) return;
      const look = STYLES[r.d.style];
      plans.push({
        index: plans.length,
        spec: r.d,
        box,
        centre: [round((box[0] + box[1]) / 2), round((box[2] + box[3]) / 2)],
        kind: KINDS[r.d.kind],
        look,
        palette: r.d.palette?.length ? r.d.palette : look.palette,
      });
    });
    if (!plans.length) {
      const d = spec.districts[0];
      const box: Box = [-H * 0.4, H * 0.4, -H * 0.4, H * 0.4];
      plans.push({
        index: 0,
        spec: d,
        box,
        centre: [0, 0],
        kind: KINDS[d.kind],
        look: STYLES[d.style],
        palette: d.palette?.length ? d.palette : STYLES[d.style].palette,
      });
    }
    return plans;
  }
  function fitInto(bx: Box, within: Box): Box {
    const w = Math.min(bx[1] - bx[0], within[1] - within[0]),
      d = Math.min(bx[3] - bx[2], within[3] - within[2]);
    const x0 = clamp(bx[0], within[0], within[1] - w);
    const z0 = clamp(bx[2], within[2], within[3] - d);
    return [x0, x0 + w, z0, z0 + d];
  }

  /* ---------------- street plan ---------------- */
  const lines: PlanLine[] = [];
  const places: PatternResult["places"] = [];
  const parks: PatternResult["parks"] = [];
  const ctx: PatternContext = {
    rng,
    blockScale: level.blockScale,
    street: (d, suffix) =>
      names.street(
        d.spec.style,
        suffix,
        suffix === "Avenue" || suffix === "Road",
      ),
    place: (d, nouns) => names.place(d.spec.style, nouns),
  };
  for (const d of districts) {
    const pattern =
      d.spec.kind === "park"
        ? parkPattern
        : d.spec.streets === "organic"
          ? organicPattern
          : d.spec.streets === "radial"
            ? radialPattern
            : d.spec.streets === "diagonal"
              ? diagonalPattern
              : gridPattern;
    const result = pattern(ctx, d);
    lines.push(...result.lines);
    places.push(...result.places);
    parks.push(...result.parks);
  }

  // Arterials: a spanning tree between districts, plus a few loops.
  const arterialStyle = (): StreetStyle => ({
    roadClass: "major",
    lit: true,
    scenic: 0.25,
    width: 15,
    kind: "road",
    trees: undefined,
  });
  const gates: { at: Point; district: number }[] = [];
  const port = (d: DistrictPlan, toward: Point): Point => {
    const dx = toward[0] - d.centre[0],
      dz = toward[1] - d.centre[1];
    const hw = (d.box[1] - d.box[0]) / 2,
      hd = (d.box[3] - d.box[2]) / 2;
    const s = Math.min(hw / Math.abs(dx || 1e-9), hd / Math.abs(dz || 1e-9));
    return [round(d.centre[0] + dx * s), round(d.centre[1] + dz * s)];
  };
  if (districts.length > 1) {
    const pairs: [number, number, number][] = [];
    for (let i = 0; i < districts.length; i++)
      for (let j = i + 1; j < districts.length; j++)
        pairs.push([i, j, dist(districts[i].centre, districts[j].centre)]);
    pairs.sort((p, q) => p[2] - q[2]);
    const parent = districts.map((_, i) => i);
    const find = (i: number): number =>
      parent[i] === i ? i : (parent[i] = find(parent[i]));
    const chosen: [number, number][] = [];
    const spare: [number, number][] = [];
    for (const [i, j] of pairs) {
      if (find(i) !== find(j)) {
        parent[find(i)] = find(j);
        chosen.push([i, j]);
      } else spare.push([i, j]);
    }
    const loops = Math.floor(districts.length / 3);
    for (const [i, j] of spare.slice(0, loops)) chosen.push([i, j]);
    chosen.forEach(([i, j], n) => {
      const A = districts[i],
        B = districts[j];
      const pa = port(A, B.centre),
        pb = port(B, A.centre);
      if (dist(pa, pb) < 2) return;
      const style = arterialStyle();
      const t = (A.spec.trees + B.spec.trees) / 2;
      if (t >= 0.15) style.trees = round(34 - 22 * t);
      lines.push({
        points: [pa, pb],
        name: names.street(A.spec.style, n % 2 ? "Boulevard" : "Avenue", true),
        style,
        role: "arterial",
        district: -1,
        bridgeChance: 1,
      });
      gates.push({ at: pa, district: i }, { at: pb, district: j });
    });
  }

  // Shore walks along every river, canal, bay and lake.
  for (const w of water) {
    const walk = (points: Point[], label: string) =>
      lines.push({
        points,
        name: label,
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.95,
          width: w.kind === "canal" ? 4 : 7,
          kind: "footway",
          trees: w.kind === "canal" ? undefined : 16,
        },
        role: "promenade",
        district: -1,
        bridgeChance: 0,
      });
    const core = w.name
      .replace(/^Lake /, "")
      .replace(/ (River|Canal|Bay)$/, "");
    if (w.linear) {
      const centre = w.centre!;
      const by = w.width / 2 + 7;
      walk(
        offsetPolyline(centre, by),
        w.kind === "canal" ? `${core} Towpath` : `${core} Embankment`,
      );
      walk(
        offsetPolyline(centre, -by),
        w.kind === "canal" ? `${core} Quay` : `${core} Riverside`,
      );
    } else if (w.kind === "bay") {
      const shore = w.polygon.slice(0, -2);
      const side = w.spec.side ?? "south";
      const inland: Point =
        side === "north"
          ? [0, 1]
          : side === "south"
            ? [0, -1]
            : side === "east"
              ? [-1, 0]
              : [1, 0];
      walk(
        shore.map((p) => [p[0] + inland[0] * 9, p[1] + inland[1] * 9] as Point),
        `${core} Promenade`,
      );
    } else {
      const c = boxOf(w.polygon);
      const centre: Point = [(c[0] + c[1]) / 2, (c[2] + c[3]) / 2];
      const ring = w.polygon.map((p) => {
        const dx = p[0] - centre[0],
          dz = p[1] - centre[1];
        const len = Math.hypot(dx, dz) || 1;
        return [p[0] + (dx / len) * 9, p[1] + (dz / len) * 9] as Point;
      });
      walk([...ring, ring[0]], `${core} Lakeshore`);
    }
  }

  // Keep every line inside the map.
  const clipped: PlanLine[] = [];
  for (const l of lines)
    for (const piece of clipToBox(l.points, bounds))
      clipped.push({ ...l, points: piece });
  lines.splice(0, lines.length, ...clipped);

  /* ---------------- landmark sites ---------------- */
  const sites = planSites();
  function planSites(): Site[] {
    const list = spec.landmarks.slice(0, level.maxLandmarks);
    const built: Site[] = [];
    const arterials = lines.filter((l) => l.role === "arterial");
    const perDistrict = new Map<number, number>();
    const preferred = districts.filter(
      (d) => d.spec.kind !== "park" && d.spec.kind !== "suburb",
    );
    let roundRobin = 0;
    for (const lm of list) {
      let district = -1;
      if (lm.district) {
        const key = lm.district.toLowerCase();
        district =
          districts.find((d) => d.spec.name.toLowerCase() === key)?.index ??
          districts.find(
            (d) =>
              d.spec.name.toLowerCase().includes(key) ||
              key.includes(d.spec.name.toLowerCase()),
          )?.index ??
          -1;
      }
      let target: Point;
      if (lm.at) target = toWorld(lm.at);
      else {
        if (district < 0) {
          const pool = preferred.length ? preferred : districts;
          district = pool[roundRobin++ % pool.length].index;
        }
        const d = districts[district];
        const k = perDistrict.get(district) ?? 0;
        const reach = Math.min(d.box[1] - d.box[0], d.box[3] - d.box[2]) * 0.3;
        target =
          k === 0
            ? d.centre
            : [
                d.centre[0] + Math.cos(k * 2.4) * reach,
                d.centre[1] + Math.sin(k * 2.4) * reach,
              ];
      }
      if (district < 0)
        district = districts.find((d) => inBox(target, d.box))?.index ?? -1;
      perDistrict.set(district, (perDistrict.get(district) ?? 0) + 1);
      const cap = Math.min(170, H * 0.45);
      let width = Math.min(lm.width, cap),
        depth = Math.min(lm.depth, cap);
      let site: Site | null = null;
      for (let attempt = 0; attempt < 4 && !site; attempt++) {
        site = findSite(lm, target, width, depth, district, arterials, built);
        width = Math.max(8, width * 0.72);
        depth = Math.max(8, depth * 0.72);
      }
      if (site) built.push(site);
    }
    return built;
  }
  function findSite(
    lm: CityLandmark,
    target: Point,
    width: number,
    depth: number,
    district: number,
    arterials: PlanLine[],
    taken: Site[],
  ): Site | null {
    const m = COURT_MARGIN;
    for (let r = 0; r <= 320; r += 16) {
      const steps =
        r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 40));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2 + r * 0.01;
        const c: Point = [
          round(target[0] + Math.cos(a) * r),
          round(target[1] + Math.sin(a) * r),
        ];
        const site: Box = [
          c[0] - width / 2,
          c[0] + width / 2,
          c[1] - depth / 2,
          c[1] + depth / 2,
        ];
        const court = expand(site, m);
        if (
          !inBox([court[0], court[2]], bounds, -6) ||
          !inBox([court[1], court[3]], bounds, -6)
        )
          continue;
        if (taken.some((t) => boxesTouch(t.court, court, 6))) continue;
        const corners = boxCorners(court);
        if (
          water.some(
            (w) =>
              boxesTouch(w.box, court) && polygonsOverlap(corners, w.polygon),
          )
        )
          continue;
        let blocked = false;
        for (const l of arterials) {
          for (let i = 1; i < l.points.length && !blocked; i++)
            if (
              segmentNearBox(
                l.points[i - 1],
                l.points[i],
                court,
                l.style.width / 2 + 2,
              )
            )
              blocked = true;
          if (blocked) break;
        }
        if (blocked) continue;
        const core = landmarkCore(lm.name);
        const ringName = `${core} ${pick(rng, courtWords(lm.shape))}`;
        return {
          landmark: lm,
          centre: c,
          width: round(width),
          depth: round(depth),
          court: court.map(round) as Box,
          ringName,
          nodeName: `${core} ${pick(rng, stepWords(lm.shape))}`,
          district,
        };
      }
    }
    return null;
  }

  for (const s of sites) {
    const c = boxCorners(s.court);
    lines.push({
      points: [...c, c[0]],
      name: s.ringName,
      style: {
        roadClass: "path",
        lit: true,
        scenic: 0.75,
        width: 5,
        kind: "footway",
      },
      role: "plaza",
      district: s.district,
      bridgeChance: 0,
    });
    // Reach the network when nothing else comes near the forecourt.
    const touches = lines.some(
      (l) =>
        l.role !== "plaza" &&
        l.points.some(
          (p, i) => i > 0 && segmentNearBox(l.points[i - 1], p, s.court, 0),
        ),
    );
    if (!touches) {
      let best: { from: Point; to: Point; d: number } | null = null;
      for (const l of lines) {
        if (l.role === "plaza") continue;
        for (let i = 1; i < l.points.length; i++) {
          const to = closestOnSegment(s.centre, l.points[i - 1], l.points[i]);
          const from: Point = [
            clamp(to[0], s.court[0], s.court[1]),
            clamp(to[1], s.court[2], s.court[3]),
          ];
          const d = dist(from, to);
          if (!best || d < best.d) best = { from, to, d };
        }
      }
      if (best && best.d > 1)
        lines.push({
          points: [best.from, best.to],
          name: `${landmarkCore(s.landmark.name)} Approach`,
          style: {
            roadClass: "path",
            lit: true,
            scenic: 0.5,
            width: 4,
            kind: "footway",
          },
          role: "spur",
          district: s.district,
          bridgeChance: 1,
        });
    }
  }

  // Shore walks that meet no street get a short connecting path.
  for (const l of [...lines]) {
    if (l.role !== "promenade") continue;
    const link = reach(l);
    if (link)
      lines.push({
        points: link,
        name: `${l.name.split(" ")[0]} Steps`,
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.6,
          width: 4,
          kind: "footway",
        },
        role: "spur",
        district: -1,
        bridgeChance: 1,
      });
  }
  function reach(target: PlanLine): Point[] | null {
    let best: { from: Point; to: Point; d: number } | null = null;
    for (const l of lines) {
      if (l === target || l.role === "promenade" || l.role === "plaza")
        continue;
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1],
          c = l.points[i];
        for (let k = 1; k < target.points.length; k++) {
          const p = target.points[k - 1],
            q = target.points[k];
          const pairs: [Point, Point][] = [
            [p, closestOnSegment(p, a, c)],
            [q, closestOnSegment(q, a, c)],
            [closestOnSegment(a, p, q), a],
            [closestOnSegment(c, p, q), c],
          ];
          for (const [from, to] of pairs) {
            const d = dist(from, to);
            if (d < 1.5) return null;
            if (!best || d < best.d) best = { from, to, d };
          }
        }
      }
    }
    return best && best.d < extent * 0.6 ? [best.from, best.to] : null;
  }

  /* ---------------- join, cut and emit ---------------- */
  joinLines(lines);
  const frontage: Frontage[] = [];
  const bridges: { name: string; at: Point }[] = [];
  const edgeLine = new Map<string, PlanLine>();
  emitStreets();
  function emitStreets() {
    interface Piece {
      points: Point[];
      status: "land" | "water" | "carved";
      water?: number;
    }
    const plans: { line: PlanLine; pieces: Piece[] }[] = [];
    const candidates: {
      plan: number;
      piece: number;
      water: number;
      length: number;
      keep: boolean;
    }[] = [];
    const roll = new Map<string, boolean>();
    for (const l of lines) {
      let pts = l.points;
      if (pts.length < 2) continue;
      const lb = boxOf(pts);
      for (const w of water)
        if (boxesTouch(lb, w.box)) pts = splitAtPolygon(pts, w.polygon);
      const carveable =
        l.role !== "arterial" && l.role !== "plaza" && l.role !== "spur";
      const pieces: Piece[] = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          c = pts[i];
        const mid: Point = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        let status: Piece["status"] = "land";
        let wi: number | undefined;
        const k = water.findIndex(
          (w) => inBox(mid, w.box) && insidePolygon(mid, w.polygon),
        );
        if (k >= 0) {
          status = "water";
          wi = k;
        } else if (carveable && sites.some((s) => inBox(mid, s.court, -0.05)))
          status = "carved";
        const last = pieces.at(-1);
        if (last && last.status === status && last.water === wi)
          last.points.push(c);
        else pieces.push({ points: [a, c], status, water: wi });
      }
      const p = plans.length;
      plans.push({ line: l, pieces });
      pieces.forEach((piece, i) => {
        if (piece.status !== "water" || i === 0 || i === pieces.length - 1)
          return;
        const w = water[piece.water!];
        const length = piece.points.reduce(
          (s, q, k) => (k ? s + dist(piece.points[k - 1], q) : s),
          0,
        );
        const span = w.linear ? w.width * 2.2 + 30 : extent * 0.5;
        if (length > span) return;
        let keep = false;
        if (l.role === "arterial" || l.role === "spur") keep = true;
        else if (w.linear && l.bridgeChance > 0) {
          const key = `${l.name}|${piece.water}`;
          if (!roll.has(key))
            roll.set(
              key,
              rng() < l.bridgeChance * (w.kind === "canal" ? 1.4 : 0.8),
            );
          keep = roll.get(key)!;
        }
        candidates.push({
          plan: p,
          piece: i,
          water: piece.water!,
          length,
          keep,
        });
      });
    }
    // Every river and canal gets at least two crossings.
    water.forEach((w, wi) => {
      if (!w.linear) return;
      const mine = candidates.filter((c) => c.water === wi);
      if (mine.filter((c) => c.keep).length >= 2) return;
      mine.sort((x, y) => x.length - y.length);
      for (const c of mine.slice(0, 2)) c.keep = true;
    });
    const kept = new Set(
      candidates.filter((c) => c.keep).map((c) => `${c.plan}:${c.piece}`),
    );
    plans.forEach(({ line: l, pieces }, p) => {
      let run: Point[] = [];
      const flush = () => {
        if (run.length >= 2) {
          const before = b.edges.length;
          b.street(run, l.name, l.style);
          for (let k = before; k < b.edges.length; k++)
            edgeLine.set(b.edges[k].id, l);
        }
        run = [];
      };
      pieces.forEach((piece, i) => {
        if (piece.status === "land") {
          run = run.length
            ? [...run, ...piece.points.slice(1)]
            : [...piece.points];
          return;
        }
        flush();
        if (piece.status === "water" && kept.has(`${p}:${i}`)) {
          const w = water[piece.water!];
          const word = l.name.split(" ")[0];
          const name = w.linear
            ? `${word} ${l.style.kind === "footway" ? "Footbridge" : "Bridge"}`
            : `${word} Causeway`;
          b.street(piece.points, name, {
            ...l.style,
            lit: true,
            scenic: 0.85,
            covered: false,
            trees: undefined,
          });
          bridges.push({ name, at: piece.points[0] });
        }
      });
      flush();
    });
  }
  function collectFrontage(l: PlanLine, points: Point[]) {
    if (l.role === "park" || l.role === "spur") return;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        c = points[i];
      let district = l.district;
      if (district < 0 || l.role === "plaza") {
        const mid: Point = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        district = districts.find((d) => inBox(mid, d.box, 2))?.index ?? -1;
      }
      frontage.push({
        a,
        b: c,
        half: l.style.width / 2,
        district,
        role: l.role,
      });
    }
  }
  b.prune();
  // Buildings and street trees follow only the streets that survived.
  for (const e of b.edges) {
    const l = edgeLine.get(e.id);
    if (l) collectFrontage(l, e.points);
  }

  /* ---------------- landscapes ---------------- */
  const keepouts: Keepout[] = [];
  const landscape = (
    kind: "park" | "water",
    name: string,
    polygon: Point[],
  ) => {
    const points = polygon.map(clampToEdge);
    b.landscapes.push({
      id: `${b.prefix}-${kind}-${b.landscapes.length}`,
      kind,
      name,
      points,
    });
    keepouts.push({ polygon: points, box: boxOf(points) });
  };
  for (const w of water) landscape("water", w.name, w.polygon);
  for (const p of parks) landscape("park", p.name, p.polygon);

  /* ---------------- landmarks ---------------- */
  const placedLandmarks: SceneObject[] = [];
  const nodeNames: { name: string; at: Point }[] = [];
  for (const s of sites) {
    const lm = s.landmark;
    const d = districts[s.district];
    const color = lm.color ?? darkest(d?.palette ?? STYLES[mainStyle].palette);
    let w = s.width,
      dp = s.depth;
    let object: SceneObject | null = null;
    for (let k = 0; k < 5 && !object; k++) {
      object = b.building({
        center: s.centre,
        width: w,
        depth: dp,
        rotation: 0,
        height: lm.height,
        color,
        name: lm.name,
        kind: "landmark",
        footprint: landmarkFootprint(lm.shape, w, dp),
      });
      w *= 0.85;
      dp *= 0.85;
    }
    if (!object) continue;
    object.shape = lm.shape;
    placedLandmarks.push(object);
    keepouts.push({ polygon: boxCorners(s.court), box: s.court });
    nodeNames.push({ name: s.nodeName, at: s.centre });
  }

  /* ---------------- buildings along every frontage ---------------- */
  const keepoutHit = (rect: Point[]) => {
    const rb = boxOf(rect);
    return keepouts.some(
      (k) => boxesTouch(rb, k.box) && polygonsOverlap(rect, k.polygon),
    );
  };
  const tallNames = new Map<number, number>();
  for (const f of frontage) {
    if (f.district < 0) continue;
    const d = districts[f.district];
    if (d.spec.kind === "park") continue;
    const k = d.kind,
      look = d.look;
    const L = dist(f.a, f.b);
    if (L < 12) continue;
    const ux = (f.b[0] - f.a[0]) / L,
      uz = (f.b[1] - f.a[1]) / L;
    const nx = -uz,
      nz = ux;
    const rotation = round((Math.atan2(uz, ux) * 180) / Math.PI);
    const dens = d.spec.density * level.density;
    const fill = clamp(0.12 + 0.88 * dens, 0, 0.97);
    const corner = f.half + 2;
    const [hMin, hMax] = d.spec.heights;
    for (const side of [-1, 1]) {
      let t = corner + between(rng, 0, 3);
      while (t < L - corner - 6) {
        let w = between(rng, k.width[0], k.width[1]) * Math.sqrt(look.bulk);
        let dp = between(rng, k.depth[0], k.depth[1]) * look.bulk;
        w = Math.min(w, L - corner - t);
        const gap = between(rng, k.gap[0], k.gap[1]);
        if (w >= 6 && rng() < fill) {
          const along = t + w / 2;
          const base: Point = [f.a[0] + ux * along, f.a[1] + uz * along];
          const pickedHeight = pickHeight(d, base);
          const { f01, tall, shape } = pickedHeight;
          let h = pickedHeight.h;
          if (tall && look.towerSide) {
            w = Math.min(w, look.towerSide);
            dp = Math.min(dp, look.towerSide);
          }
          if (shape === "wind-tower") {
            w = Math.min(w, 6);
            dp = Math.min(dp, 6);
            h = Math.max(h * 1.8, 12);
          }
          const placed = place(
            d,
            f,
            side,
            base,
            nx,
            nz,
            w,
            dp,
            rotation,
            h,
            tall,
            shape,
            tallNames,
            keepoutHit,
          );
          if (placed && rng() < k.backRow * dens) {
            const off = f.half + k.setback + dp + between(rng, 2, 5);
            const dp2 = between(rng, k.depth[0], k.depth[1]) * look.bulk;
            const h2 =
              hMin + (hMax - hMin) * clamp(f01 * between(rng, 0.5, 1.05), 0, 1);
            const c2: Point = [
              base[0] + nx * side * (off + dp2 / 2),
              base[1] + nz * side * (off + dp2 / 2),
            ];
            tryBuild(
              d,
              c2,
              w * between(rng, 0.7, 1),
              dp2,
              rotation,
              h2,
              false,
              undefined,
              tallNames,
              keepoutHit,
            );
          }
        }
        t += w + gap;
      }
    }
  }
  // Block interiors: back buildings and courtyards, squared to the nearest street.
  const streetHash = new Hash<Frontage>(60);
  for (const f of frontage) streetHash.add(f, boxOf([f.a, f.b]));
  for (const d of districts) {
    if (d.spec.kind === "park") continue;
    const k = d.kind;
    const dens = d.spec.density * level.density;
    const chance = clamp((k.backRow * 1.1 + 0.15) * dens, 0, 0.9);
    if (chance < 0.03) continue;
    const step = (k.width[0] + k.width[1]) / 2 + (k.gap[0] + k.gap[1]) / 2;
    for (let x = d.box[0] + step / 2; x < d.box[1]; x += step)
      for (let z = d.box[2] + step / 2; z < d.box[3]; z += step) {
        if (rng() > chance) continue;
        const c: Point = [
          x + between(rng, -0.3, 0.3) * step,
          z + between(rng, -0.3, 0.3) * step,
        ];
        let near: Frontage | undefined,
          nearest = 90;
        for (const f of streetHash.query([
          c[0] - 90,
          c[0] + 90,
          c[1] - 90,
          c[1] + 90,
        ])) {
          const dd = pointSegmentDistance(c, f.a, f.b);
          if (dd < nearest) {
            nearest = dd;
            near = f;
          }
        }
        if (!near) continue;
        const rotation = round(
          (Math.atan2(near.b[1] - near.a[1], near.b[0] - near.a[0]) * 180) /
            Math.PI,
        );
        const { h, tall } = pickHeight(d, c);
        let w = between(rng, k.width[0], k.width[1]) * Math.sqrt(d.look.bulk),
          dp = between(rng, k.depth[0], k.depth[1]) * d.look.bulk;
        if (tall && d.look.towerSide) {
          w = Math.min(w, d.look.towerSide);
          dp = Math.min(dp, d.look.towerSide);
        }
        if (
          !tryBuild(
            d,
            c,
            w,
            dp,
            rotation,
            h * 0.85,
            tall,
            undefined,
            tallNames,
            keepoutHit,
          )
        )
          tryBuild(
            d,
            c,
            w * 0.6,
            dp * 0.6,
            rotation,
            h * 0.7,
            false,
            undefined,
            tallNames,
            keepoutHit,
          );
      }
  }

  /** A building height for a spot: taller toward the district's heart. */
  function pickHeight(d: DistrictPlan, at: Point) {
    const k = d.kind,
      look = d.look;
    const [hMin, hMax] = d.spec.heights;
    const dens = d.spec.density * level.density;
    const radius = Math.max(d.box[1] - d.box[0], d.box[3] - d.box[2]) / 2;
    const centrality = 1 - Math.min(1, dist(at, d.centre) / radius);
    let f01 = clamp(
      Math.pow(rng(), 1.8) * (1 - k.peak * 0.6) +
        k.peak * Math.pow(centrality, 1.5) * rng() * 1.15,
      0,
      1,
    );
    if (rng() < 0.04 * dens) f01 = Math.max(f01, between(rng, 0.8, 1));
    const h = hMin + (hMax - hMin) * f01;
    const tall = f01 > 0.62 && h >= 30;
    let shape: LandmarkShape | undefined;
    if (look.tallShape && f01 > 0.7 && h >= 40 && d.spec.style !== "adobe")
      shape = look.tallShape;
    if (d.spec.style === "adobe" && rng() < 0.035) shape = "wind-tower";
    return { h, f01, tall, shape };
  }
  function place(
    d: DistrictPlan,
    f: Frontage,
    side: number,
    base: Point,
    nx: number,
    nz: number,
    w: number,
    dp: number,
    rotation: number,
    h: number,
    tall: boolean,
    shape: LandmarkShape | undefined,
    tallNames: Map<number, number>,
    hit: (r: Point[]) => boolean,
  ) {
    for (const scale of [1, 0.7]) {
      const ww = w * scale,
        dd = dp * scale;
      if (ww < 5 || dd < 5) return null;
      const off = f.half + d.kind.setback + dd / 2;
      const c: Point = [base[0] + nx * side * off, base[1] + nz * side * off];
      const o = tryBuild(
        d,
        c,
        ww,
        dd,
        rotation,
        h,
        tall,
        shape,
        tallNames,
        hit,
      );
      if (o) return o;
    }
    return null;
  }
  function tryBuild(
    d: DistrictPlan,
    c: Point,
    w: number,
    dp: number,
    rotation: number,
    h: number,
    tall: boolean,
    shape: LandmarkShape | undefined,
    tallNames: Map<number, number>,
    hit: (r: Point[]) => boolean,
  ) {
    if (!inBox(c, d.box)) return null;
    if (d.look.towerSide && h >= 50) {
      w = Math.min(w, d.look.towerSide);
      dp = Math.min(dp, d.look.towerSide);
    }
    const rect = rectCorners(c, w, dp, rotation);
    if (hit(rect)) return null;
    const look = d.look;
    let name = look.building;
    if (h >= 120 && (tallNames.get(d.index) ?? 0) < 3) {
      tallNames.set(d.index, (tallNames.get(d.index) ?? 0) + 1);
      name = names.place(d.spec.style, ["Tower", "Building", "Spire"], false);
    }
    const o = b.building({
      center: c,
      width: w,
      depth: dp,
      rotation,
      height: Math.max(3, h),
      color: pick(rng, d.palette),
      name,
      footprint:
        shape === "wind-tower" ? undefined : look.footprint?.(w, dp, tall),
    });
    if (o && shape) o.shape = shape;
    return o;
  }

  /* ---------------- trees ---------------- */
  for (const d of districts) {
    const tl = treeLook(
      spec.climate.temperatureC,
      spec.climate.humidity,
      d.spec.style,
    );
    const trees = d.spec.trees;
    for (const p of parks.filter((q) => q.district === d.index)) {
      const spacing = p.big ? 9 + 6 * (1 - trees) : 11;
      b.scatterTrees(
        p.polygon,
        spacing,
        0.35 + 0.6 * trees,
        tl.palette,
        tl.size,
        tl.name,
      );
    }
    if (
      trees >= 0.25 &&
      ["residential", "suburb", "campus", "waterfront", "old-quarter"].includes(
        d.spec.kind,
      )
    )
      b.scatterTrees(
        boxCorners(d.box),
        17,
        trees * 0.5,
        tl.palette,
        tl.size,
        tl.name,
      );
  }
  // Street trees on the land side of every frontage that wants them.
  const tlMain = treeLook(
    spec.climate.temperatureC,
    spec.climate.humidity,
    mainStyle,
  );
  for (const f of frontage) {
    const spacingFor = () => {
      if (f.district >= 0) {
        const t = districts[f.district].spec.trees;
        return t >= 0.12 ? 36 - 26 * t : 0;
      }
      return f.role === "promenade" || f.role === "arterial" ? 18 : 0;
    };
    const spacing = spacingFor();
    if (!spacing) continue;
    const L = dist(f.a, f.b);
    if (L < spacing * 0.6) continue;
    const ux = (f.b[0] - f.a[0]) / L,
      uz = (f.b[1] - f.a[1]) / L;
    const off = f.half + 1.6;
    const style =
      f.district >= 0 ? districts[f.district].spec.style : mainStyle;
    const tl =
      f.district >= 0
        ? treeLook(spec.climate.temperatureC, spec.climate.humidity, style)
        : tlMain;
    for (let t = spacing / 2; t < L; t += spacing)
      for (const side of [-1, 1])
        b.tree(
          [
            f.a[0] + ux * t - uz * off * side,
            f.a[1] + uz * t + ux * off * side,
          ],
          tl.palette,
          tl.size,
          tl.name,
        );
  }

  /* ---------------- names and amenities ---------------- */
  const named = new Set<string>();
  const nameNear = (at: Point, name: string, reach = 160) => {
    if (named.has(name)) return null;
    let best: (typeof b.nodes)[number] | undefined,
      bestD = reach;
    for (const n of b.nodes) {
      if (n.name) continue;
      const d = dist(n.point, at);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    if (!best) return null;
    best.name = name;
    named.add(name);
    return best;
  };
  for (const n of nodeNames)
    if (!nameNear(n.at, n.name, 400)) nameNear(n.at, `${n.name} North`, 400);
  for (const p of places) nameNear(p.at, p.name);
  for (const d of districts) {
    if (places.some((p) => dist(p.at, d.centre) < 70)) continue;
    nameNear(d.centre, names.place(d.spec.style, d.kind.places), 260);
  }
  for (const p of parks) {
    const bx = boxOf(p.polygon);
    nameNear(
      [(bx[0] + bx[1]) / 2, (bx[2] + bx[3]) / 2],
      p.big ? `${p.name} Gate` : p.name,
      200,
    );
  }
  for (const g of gates) {
    const d = districts[g.district];
    nameNear(g.at, `${d.spec.name} Gate`, 30);
  }
  for (const br of bridges.slice(0, 8)) nameNear(br.at, br.name, 20);
  // Corners until the city has enough places to walk between.
  const want = realism === "sketch" ? 12 : realism === "detailed" ? 16 : 22;
  for (let k = 0; named.size < want && k < 80; k++) {
    const n = b.nodes[Math.floor(rng() * b.nodes.length)];
    if (!n || n.name) continue;
    const d = districts.find((q) => inBox(n.point, q.box, 4)) ?? districts[0];
    nameNear(
      n.point,
      names.place(
        d.spec.style,
        ["Corner", "Cross", "Steps", "Yard", "Market"],
        false,
      ),
      1,
    );
  }

  const namedNodes = b.nodes.filter((n) => n.name);
  const fountains = Math.max(4, Math.round(namedNodes.length * 0.6));
  namedNodes
    .slice(0, fountains)
    .forEach((n, i) =>
      b.amenity(
        "water",
        i % 3 === 0 ? `${n.name} fountain` : `Drinking water at ${n.name}`,
        [n.point[0] + 3, n.point[1] + 3],
      ),
    );
  const shelterAt = [
    ...namedNodes.filter((n) =>
      /gate|station|plaza|square|steps|quay|landing/i.test(n.name!),
    ),
    ...namedNodes,
  ];
  const shelterCount = Math.max(3, Math.round(namedNodes.length * 0.35));
  const sheltered = new Set<string>();
  for (const n of shelterAt) {
    if (sheltered.size >= shelterCount) break;
    if (sheltered.has(n.id)) continue;
    sheltered.add(n.id);
    b.amenity("shelter", `${n.name} shelter`, [n.point[0] - 3, n.point[1] + 3]);
  }

  for (const o of b.objects) o.source = "ai";

  return {
    // Two different plans with the same name are different cities.
    id: `ai-${slug}-${shortHash(`${seed}|${realism}|${JSON.stringify(spec)}`)}`,
    name: `${spec.name} · generated city`,
    origin: { lat: spec.origin.lat, lon: spec.origin.lon },
    timezone: spec.timezone,
    extent,
    objects: b.objects,
    roads: b.roads().map((r) => ({ ...r, source: "ai" as const })),
    landscapes: b.landscapes,
    amenities: b.amenities,
    graph: { nodes: b.nodes, edges: b.edges },
    terrain: {
      size: extent,
      resolution: TERRAIN_RESOLUTION,
      heights: new Array(TERRAIN_RESOLUTION ** 2).fill(0),
    },
    provenance: {
      source: "Walk-Free generated city (AI-planned, procedurally built)",
      attribution: "Walk-Free generated city",
      retrievedAt: "2026-11-01T00:00:00.000Z",
      live: false,
      notes: [
        `${spec.name} is not a real place: an AI model planned its districts and landmarks, and every street, building and tree was then procedurally built from that plan.`,
        `Coordinates near ${spec.origin.lat}, ${spec.origin.lon} only give plausible sun angles and day length; they locate nothing.`,
        "Heights, lighting, covered walkways and trees are designed inputs, so shade and heat results are an illustration, not a measurement.",
      ],
    },
  };
}

function segmentNearBox(a: Point, b: Point, box: Box, pad: number) {
  const bx = expand(box, pad);
  if (!boxesTouch(boxOf([a, b]), bx)) return false;
  if (inBox(a, bx) || inBox(b, bx)) return true;
  const c = boxCorners(bx);
  for (let i = 0; i < 4; i++) {
    const p = c[i],
      q = c[(i + 1) % 4];
    if (pointSegmentDistance(p, a, b) < 1e-6) return true;
    const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    const d3 = (q[0] - p[0]) * (a[1] - p[1]) - (q[1] - p[1]) * (a[0] - p[0]);
    const d4 = (q[0] - p[0]) * (b[1] - p[1]) - (q[1] - p[1]) * (b[0] - p[0]);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  }
  return false;
}

function landmarkCore(name: string) {
  const of = name.match(/\bof\s+(?:the\s+)?(.+)$/i);
  const words = (of ? of[1] : name.replace(/^the\s+/i, ""))
    .split(/\s+/)
    .filter((w) => !/^(of|the|and|&)$/i.test(w));
  return words.slice(0, 2).join(" ") || "Landmark";
}
function courtWords(shape: LandmarkShape) {
  if (shape === "cathedral") return ["Close", "Precinct"];
  if (shape === "arena") return ["Concourse", "Forecourt"];
  if (shape === "smokestacks" || shape === "tanks")
    return ["Yard", "Works Walk"];
  if (shape === "manor") return ["Grounds", "Drive"];
  if (shape === "glasshouse") return ["Garden Walk", "Terrace"];
  return ["Plaza", "Forecourt", "Court", "Promenade"];
}
function stepWords(shape: LandmarkShape) {
  if (shape === "cathedral") return ["Steps", "Door"];
  if (shape === "smokestacks" || shape === "tanks")
    return ["Gate", "Yard Gate"];
  if (shape === "manor") return ["Lodge", "Gatehouse"];
  if (shape === "arena") return ["Turnstiles", "Gate"];
  return ["Steps", "Entrance", "Corner", "Square"];
}
function darkest(palette: string[]) {
  const lum = (h: string) =>
    0.3 * parseInt(h.slice(1, 3), 16) +
    0.59 * parseInt(h.slice(3, 5), 16) +
    0.11 * parseInt(h.slice(5, 7), 16);
  return [...palette].sort((x, y) => lum(x) - lum(y))[0] ?? "#555555";
}
