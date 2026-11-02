import type {
  Amenity,
  GraphEdge,
  GraphNode,
  Landscape,
  ObjectKind,
  Point,
  SceneObject,
  SceneRoad,
} from "../../../shared/types.js";

/** Seeded PRNG (string hash into mulberry32); never Math.random. */
export type Rng = () => number;
export function seededRng(key: string): Rng {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
export const pick = <T>(rng: Rng, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length)];
export const round = (v: number) => Math.round(v * 100) / 100;

export interface StreetStyle {
  roadClass: NonNullable<GraphEdge["roadClass"]>;
  lit: boolean;
  scenic: number;
  width: number;
  kind: SceneRoad["kind"];
  covered?: boolean;
  /** Street trees every this many metres along each side. */
  trees?: number;
}
export interface LineSpec {
  name: string;
  style: StreetStyle;
}
/** A buildable rectangle; width runs along local x, depth along local z. */
export interface Lot {
  center: Point;
  rotation: number;
  width: number;
  depth: number;
  taken?: boolean;
}
export interface BuildingSpec {
  center: Point;
  width: number;
  depth: number;
  rotation: number;
  height: number;
  color: string;
  name?: string;
  kind?: ObjectKind;
  footprint?: Point[];
  aliases?: string[];
}

/** Corners of an object's rectangle as the scene turns it (by -rotation). */
export function rectCorners(
  center: Point,
  width: number,
  depth: number,
  rotation: number,
): Point[] {
  return (
    [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ] as Point[]
  ).map((p) => toWorld(center, rotation, p));
}
export function toWorld(center: Point, rotation: number, p: Point): Point {
  const a = (-rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [center[0] + p[0] * c + p[1] * s, center[1] - p[0] * s + p[1] * c];
}
/** Rotation that points an object's local +z along the heading `theta` (radians). */
export const facing = (theta: number) =>
  round(((theta - Math.PI / 2) * 180) / Math.PI);

export function insidePolygon(p: Point, poly: Point[]) {
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
function pointSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const cross = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segmentSegment(a: Point, b: Point, c: Point, d: Point) {
  if (
    cross(c, d, a) * cross(c, d, b) < 0 &&
    cross(a, b, c) * cross(a, b, d) < 0
  )
    return 0;
  return Math.min(
    pointSegment(a, c, d),
    pointSegment(b, c, d),
    pointSegment(c, a, b),
    pointSegment(d, a, b),
  );
}
function polygonSegment(poly: Point[], a: Point, b: Point) {
  if (insidePolygon(a, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++)
    best = Math.min(
      best,
      segmentSegment(poly[i], poly[(i + 1) % poly.length], a, b),
    );
  return best;
}
function polygonsOverlap(p: Point[], q: Point[]) {
  if (p.some((v) => insidePolygon(v, q)) || q.some((v) => insidePolygon(v, p)))
    return true;
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      if (
        segmentSegment(
          p[i],
          p[(i + 1) % p.length],
          q[j],
          q[(j + 1) % q.length],
        ) === 0
      )
        return true;
  return false;
}

/** Spatial hash of bounding boxes. */
class Grid<T> {
  private cells = new Map<number, T[]>();
  constructor(private size = 32) {}
  private range(minX: number, maxX: number, minZ: number, maxZ: number) {
    return [
      Math.floor(minX / this.size),
      Math.floor(maxX / this.size),
      Math.floor(minZ / this.size),
      Math.floor(maxZ / this.size),
    ];
  }
  add(item: T, minX: number, maxX: number, minZ: number, maxZ: number) {
    const [x0, x1, z0, z1] = this.range(minX, maxX, minZ, maxZ);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const key = (x + 1000) * 4096 + z + 1000;
        const cell = this.cells.get(key);
        if (cell) cell.push(item);
        else this.cells.set(key, [item]);
      }
  }
  query(minX: number, maxX: number, minZ: number, maxZ: number) {
    const [x0, x1, z0, z1] = this.range(minX, maxX, minZ, maxZ);
    const found = new Set<T>();
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const item of this.cells.get((x + 1000) * 4096 + z + 1000) ?? [])
          found.add(item);
    return found;
  }
}
const bounds = (poly: Point[]) => {
  const xs = poly.map((p) => p[0]),
    zs = poly.map((p) => p[1]);
  return [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...zs),
    Math.max(...zs),
  ] as const;
};

interface Segment {
  a: Point;
  b: Point;
  half: number;
}
interface Run {
  name: string;
  style: StreetStyle;
  edges: string[];
}

/** Footprints are offsets inside the object's width × depth rectangle. */
export const footprints = {
  octagon(w: number, d: number): Point[] {
    const c = Math.min(w, d) * 0.29;
    return roundAll([
      [-w / 2 + c, -d / 2],
      [w / 2 - c, -d / 2],
      [w / 2, -d / 2 + c],
      [w / 2, d / 2 - c],
      [w / 2 - c, d / 2],
      [-w / 2 + c, d / 2],
      [-w / 2, d / 2 - c],
      [-w / 2, -d / 2 + c],
    ]);
  },
  round(w: number, d: number, sides = 16): Point[] {
    return roundAll(
      Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        return [(Math.cos(a) * w) / 2, (Math.sin(a) * d) / 2] as Point;
      }),
    );
  },
  ell(w: number, d: number, fx: number, fz: number): Point[] {
    const cw = w * fx,
      cd = d * fz;
    return roundAll([
      [-w / 2, -d / 2],
      [w / 2 - cw, -d / 2],
      [w / 2 - cw, -d / 2 + cd],
      [w / 2, -d / 2 + cd],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ]);
  },
  notched(w: number, d: number, n: number): Point[] {
    return roundAll([
      [-w / 2 + n, -d / 2],
      [w / 2 - n, -d / 2],
      [w / 2 - n, -d / 2 + n],
      [w / 2, -d / 2 + n],
      [w / 2, d / 2 - n],
      [w / 2 - n, d / 2 - n],
      [w / 2 - n, d / 2],
      [-w / 2 + n, d / 2],
      [-w / 2 + n, d / 2 - n],
      [-w / 2, d / 2 - n],
      [-w / 2, -d / 2 + n],
      [-w / 2 + n, -d / 2 + n],
    ]);
  },
  /** A cathedral plan: nave along z, transept across it. */
  cross(w: number, d: number): Point[] {
    const nw = w * 0.24,
      tz = -d * 0.18,
      th = d * 0.12;
    return roundAll([
      [-nw, -d / 2],
      [nw, -d / 2],
      [nw, tz - th],
      [w / 2, tz - th],
      [w / 2, tz + th],
      [nw, tz + th],
      [nw, d / 2],
      [-nw, d / 2],
      [-nw, tz + th],
      [-w / 2, tz + th],
      [-w / 2, tz - th],
      [-nw, tz - th],
    ]);
  },
};
function roundAll(points: Point[]): Point[] {
  return points.map(([x, z]) => [round(x), round(z)]);
}

export function arc(r: number, a0: number, a1: number, steps: number) {
  return Array.from(
    { length: steps + 1 },
    (_, i) =>
      [
        round(r * Math.cos(a0 + ((a1 - a0) * i) / steps)),
        round(r * Math.sin(a0 + ((a1 - a0) * i) / steps)),
      ] as Point,
  );
}

/**
 * Collects a fictional city: a walking network first, then lots, buildings
 * that keep clear of every path, trees, parks and amenities.
 */
export class CityBuilder {
  readonly nodes: GraphNode[] = [];
  readonly edges: GraphEdge[] = [];
  readonly objects: SceneObject[] = [];
  readonly landscapes: Landscape[] = [];
  readonly amenities: Amenity[] = [];
  readonly lots: Lot[] = [];
  private nodeByKey = new Map<string, GraphNode>();
  private nodeById = new Map<string, GraphNode>();
  private runs: Run[] = [];
  private edgeStyle = new Map<string, StreetStyle>();
  private segments: Grid<Segment> | null = null;
  private solids = new Grid<Point[]>(40);
  private keepout: Point[][] = [];
  private counter = { building: 0, tree: 0, amenity: 0 };

  constructor(
    readonly rng: Rng,
    readonly prefix: string,
    readonly half = 480,
  ) {}

  node(point: Point, name?: string) {
    const p: Point = [round(point[0]), round(point[1])];
    const key = `${p[0]},${p[1]}`;
    let n = this.nodeByKey.get(key);
    if (!n) {
      n = { id: `${this.prefix}-n${this.nodes.length}`, point: p };
      this.nodes.push(n);
      this.nodeByKey.set(key, n);
      this.nodeById.set(n.id, n);
    }
    if (name) n.name = name;
    return n.id;
  }

  /** A named street through `points`, one walking edge per consecutive pair. */
  street(
    points: Point[],
    name: string,
    style: StreetStyle,
    via?: (i: number) => Point[],
  ) {
    const run: Run = { name, style, edges: [] };
    const ids = points.map((p) => this.node(p));
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] === ids[i - 1]) continue;
      const a = this.nodeById.get(ids[i - 1])!,
        b = this.nodeById.get(ids[i])!;
      const line: Point[] = [
        a.point,
        ...(via?.(i - 1) ?? []).map((p) => [round(p[0]), round(p[1])] as Point),
        b.point,
      ];
      let distance = 0;
      for (let k = 1; k < line.length; k++)
        distance += Math.hypot(
          line[k][0] - line[k - 1][0],
          line[k][1] - line[k - 1][1],
        );
      const id = `${this.prefix}-e${this.edges.length}`;
      this.edges.push({
        id,
        from: a.id,
        to: b.id,
        points: line,
        name,
        distance,
        covered: style.covered ?? false,
        scenic: style.scenic,
        indoor: "no",
        stairs: false,
        accessible: true,
        bidirectional: true,
        lit: style.lit,
        roadClass: style.roadClass,
      });
      this.edgeStyle.set(id, style);
      run.edges.push(id);
    }
    if (run.edges.length) this.runs.push(run);
    this.segments = null;
    return ids;
  }

  /** Keep only the largest connected piece of the walking network. */
  prune() {
    const parent = new Map(this.nodes.map((n) => [n.id, n.id]));
    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      parent.set(id, root);
      return root;
    };
    for (const e of this.edges) parent.set(find(e.from), find(e.to));
    const size = new Map<string, number>();
    for (const e of this.edges)
      size.set(find(e.from), (size.get(find(e.from)) ?? 0) + 1);
    const main = [...size].sort((a, b) => b[1] - a[1])[0]?.[0];
    const keepEdges = this.edges.filter((e) => find(e.from) === main);
    const used = new Set(keepEdges.flatMap((e) => [e.from, e.to]));
    const keepNodes = this.nodes.filter((n) => used.has(n.id));
    this.edges.splice(0, this.edges.length, ...keepEdges);
    this.nodes.splice(0, this.nodes.length, ...keepNodes);
    for (const [key, n] of this.nodeByKey)
      if (!used.has(n.id)) {
        this.nodeByKey.delete(key);
        this.nodeById.delete(n.id);
      }
    this.segments = null;
  }

  private segmentIndex() {
    if (!this.segments) {
      this.segments = new Grid<Segment>(32);
      for (const e of this.edges) {
        const half = this.edgeStyle.get(e.id)!.width / 2;
        for (let i = 1; i < e.points.length; i++) {
          const a = e.points[i - 1],
            b = e.points[i];
          this.segments.add(
            { a, b, half },
            Math.min(a[0], b[0]) - half - 2,
            Math.max(a[0], b[0]) + half + 2,
            Math.min(a[1], b[1]) - half - 2,
            Math.max(a[1], b[1]) + half + 2,
          );
        }
      }
    }
    return this.segments;
  }

  /** True when the polygon keeps `margin` metres beyond every path's half width. */
  clearOfPaths(poly: Point[], margin: number) {
    const [x0, x1, z0, z1] = bounds(poly);
    for (const s of this.segmentIndex().query(x0, x1, z0, z1))
      if (polygonSegment(poly, s.a, s.b) < s.half + margin) return false;
    return true;
  }

  /** Shrink a lot evenly until it keeps clear of every path, or drop it. */
  fitLot(lot: Lot): Lot | null {
    for (let inset = 0; inset <= 8; inset++) {
      const width = lot.width - inset * 2,
        depth = lot.depth - inset * 2;
      if (width < 6 || depth < 6) return null;
      if (
        this.clearOfPaths(
          rectCorners(lot.center, width, depth, lot.rotation),
          1,
        )
      )
        return { ...lot, width, depth };
    }
    return null;
  }

  /** Parks, plazas and water stay open: no building may enter them. */
  landscape(kind: Landscape["kind"], name: string, points: Point[]) {
    const id = `${this.prefix}-${kind}-${this.landscapes.length}`;
    const poly = roundAll(points);
    this.landscapes.push({ id, kind, name, points: poly });
    this.keepout.push(poly);
    return poly;
  }

  inWater(p: Point) {
    return this.landscapes.some(
      (l) => l.kind === "water" && insidePolygon(p, l.points),
    );
  }

  building(spec: BuildingSpec): SceneObject | null {
    if (spec.width < 4 || spec.depth < 4) return null;
    const rect = rectCorners(
      spec.center,
      spec.width,
      spec.depth,
      spec.rotation,
    );
    if (
      rect.some((p) => Math.abs(p[0]) > this.half || Math.abs(p[1]) > this.half)
    )
      return null;
    if (!this.clearOfPaths(rect, 0.75)) return null;
    if (this.keepout.some((k) => polygonsOverlap(rect, k))) return null;
    const [x0, x1, z0, z1] = bounds(rect);
    for (const other of this.solids.query(x0, x1, z0, z1))
      if (polygonsOverlap(rect, other)) return null;
    this.solids.add(rect, x0, x1, z0, z1);
    const slender = Math.max(spec.width, spec.depth) <= 26;
    const kind: ObjectKind =
      spec.kind ??
      (spec.height >= 100
        ? "skyscraper"
        : spec.height >= 50 && slender
          ? "tower"
          : "building");
    const object: SceneObject = {
      id: `${this.prefix}-b${this.counter.building++}`,
      kind,
      name: spec.name ?? "Building",
      position: [round(spec.center[0]), round(spec.center[1])],
      width: round(spec.width),
      depth: round(spec.depth),
      height: round(spec.height),
      rotation: round(spec.rotation),
      color: spec.color,
      source: "study",
      heightMethod: "designed",
      ...(spec.footprint ? { footprint: spec.footprint } : {}),
      ...(spec.aliases ? { aliases: spec.aliases } : {}),
    };
    this.objects.push(object);
    return object;
  }

  tree(
    p: Point,
    palette: readonly string[],
    size: [number, number],
    name: string,
  ) {
    if (Math.abs(p[0]) > this.half || Math.abs(p[1]) > this.half) return false;
    if (this.inWater(p)) return false;
    // The trunk zone must stay clear; crowns may overhang streets and roofs.
    const r = 1.2;
    const box: Point[] = [
      [p[0] - r, p[1] - r],
      [p[0] + r, p[1] - r],
      [p[0] + r, p[1] + r],
      [p[0] - r, p[1] + r],
    ];
    if (!this.clearOfPaths(box, 0.3)) return false;
    for (const solid of this.solids.query(
      p[0] - r,
      p[0] + r,
      p[1] - r,
      p[1] + r,
    ))
      if (polygonsOverlap(box, solid)) return false;
    const crown = round(between(this.rng, size[0], size[1]));
    this.objects.push({
      id: `${this.prefix}-t${this.counter.tree++}`,
      kind: "tree",
      name,
      position: [round(p[0]), round(p[1])],
      width: crown,
      depth: crown,
      height: round(crown * between(this.rng, 1.2, 1.7)),
      rotation: Math.floor(this.rng() * 360),
      color: pick(this.rng, palette),
      source: "study",
      heightMethod: "designed",
    });
    return true;
  }

  /** Trees on a jittered grid inside a polygon. */
  scatterTrees(
    poly: Point[],
    spacing: number,
    density: number,
    palette: readonly string[],
    size: [number, number],
    name: string,
  ) {
    const [x0, x1, z0, z1] = bounds(poly);
    let planted = 0;
    for (let x = x0 + spacing / 2; x < x1; x += spacing)
      for (let z = z0 + spacing / 2; z < z1; z += spacing) {
        if (this.rng() > density) continue;
        const p: Point = [
          x + between(this.rng, -0.35, 0.35) * spacing,
          z + between(this.rng, -0.35, 0.35) * spacing,
        ];
        if (insidePolygon(p, poly) && this.tree(p, palette, size, name))
          planted++;
      }
    return planted;
  }

  /** Street trees along every run that asks for them, on both sides. */
  streetTrees(
    palette: readonly string[],
    size: [number, number],
    name: string,
  ) {
    const byId = new Map(this.edges.map((e) => [e.id, e]));
    for (const run of this.runs) {
      const spacing = run.style.trees;
      if (!spacing) continue;
      const offset = run.style.width / 2 + 1.6;
      for (const id of run.edges) {
        const pts = byId.get(id)?.points;
        if (!pts) continue;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1],
            b = pts[i];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const nx = -(b[1] - a[1]) / len,
            nz = (b[0] - a[0]) / len;
          for (let t = spacing / 2; t < len; t += spacing)
            for (const side of [-1, 1]) {
              const p: Point = [
                a[0] + ((b[0] - a[0]) * t) / len + nx * offset * side,
                a[1] + ((b[1] - a[1]) * t) / len + nz * offset * side,
              ];
              this.tree(p, palette, size, name);
            }
        }
      }
    }
  }

  /** The nearest free lot to a point; it is marked taken. */
  takeLot(near: Point) {
    let best: Lot | undefined,
      distance = Infinity;
    for (const lot of this.lots) {
      if (lot.taken) continue;
      const d = Math.hypot(lot.center[0] - near[0], lot.center[1] - near[1]);
      if (d < distance) {
        best = lot;
        distance = d;
      }
    }
    if (best) best.taken = true;
    return best;
  }

  /** Give the nearest unnamed walking node a place name. */
  nameNode(near: Point, name: string) {
    let best: GraphNode | undefined,
      distance = Infinity;
    for (const n of this.nodes) {
      if (n.name) continue;
      const d = Math.hypot(n.point[0] - near[0], n.point[1] - near[1]);
      if (d < distance) {
        best = n;
        distance = d;
      }
    }
    if (best) best.name = name;
    return best;
  }

  amenity(kind: Amenity["kind"], name: string, near: Point) {
    this.amenities.push({
      id: `${this.prefix}-a${this.counter.amenity++}`,
      kind,
      name,
      position: [round(near[0]), round(near[1])],
    });
  }

  /** Streets drawn as continuous lines wherever their edges survived. */
  roads(): SceneRoad[] {
    const byId = new Map(this.edges.map((e) => [e.id, e]));
    const roads: SceneRoad[] = [];
    for (const run of this.runs) {
      let line: Point[] = [];
      const flush = () => {
        if (line.length >= 2)
          roads.push({
            id: `${this.prefix}-r${roads.length}`,
            name: run.name,
            points: line,
            width: run.style.width,
            kind: run.style.kind,
            source: "study",
          });
        line = [];
      };
      let last: string | undefined;
      for (const id of run.edges) {
        const e = byId.get(id);
        if (!e || (last && e.from !== last)) flush();
        if (!e) {
          last = undefined;
          continue;
        }
        line = line.length ? [...line, ...e.points.slice(1)] : [...e.points];
        last = e.to;
      }
      flush();
    }
    return roads;
  }
}

/** Fill a lot with nx × nz buildings, leaving `gap` metres between them. */
export function subdivide(
  rng: Rng,
  lot: Lot,
  nx: number,
  nz: number,
  gap: number,
): Lot[] {
  const weights = (n: number) => {
    const w = Array.from({ length: n }, () => between(rng, 0.75, 1.25));
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v / sum);
  };
  const wx = weights(nx),
    wz = weights(nz);
  const lots: Lot[] = [];
  let ox = -lot.width / 2;
  for (const fx of wx) {
    const width = fx * lot.width;
    let oz = -lot.depth / 2;
    for (const fz of wz) {
      const depth = fz * lot.depth;
      lots.push({
        center: toWorld(lot.center, lot.rotation, [
          ox + width / 2,
          oz + depth / 2,
        ]),
        rotation: lot.rotation,
        width: width - (nx > 1 ? gap : 0),
        depth: depth - (nz > 1 ? gap : 0),
      });
      oz += depth;
    }
    ox += width;
  }
  return lots;
}

/** Shrink a rectangle so that, turned by `tilt` degrees, it still fits the lot. */
export function tiltedFit(width: number, depth: number, tilt: number) {
  const t = (Math.abs(tilt) * Math.PI) / 180,
    c = Math.cos(t),
    s = Math.sin(t);
  const k = Math.min(
    1,
    width / (width * c + depth * s),
    depth / (width * s + depth * c),
  );
  return [width * k, depth * k] as const;
}

export interface BlockSpec {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  kind: "park" | "plaza" | "water" | "lot";
  name: string;
  /** For water: horizontal street lines (by index) that bridge across. */
  bridges?: (j: number) => boolean;
}
export interface Block {
  spec: BlockSpec;
  lot: Lot;
  polygon: Point[];
}

/**
 * A rectilinear street lattice on lines xs × zs. Lines may be streets,
 * alleys or footways; blocks merge cells into parks, plazas, water or
 * one large lot. Free cells become lots, set back from their streets.
 */
export function lattice(
  b: CityBuilder,
  xs: number[],
  zs: number[],
  line: (axis: "x" | "z", index: number) => LineSpec | null,
  present: (axis: "x" | "z", index: number, segment: number) => boolean,
  blocks: BlockSpec[],
): Block[] {
  const inBlock = (i: number, j: number) =>
    blocks.find((k) => i >= k.i0 && i < k.i1 && j >= k.j0 && j < k.j1);
  // horizontal[j][i]: along z-line j from xs[i] to xs[i+1]; vertical[i][j].
  const horizontal: (LineSpec | null)[][] = zs.map((_, j) => {
    const spec = line("z", j);
    return xs.slice(1).map((_, i) => {
      if (!spec || !present("z", j, i)) return null;
      const k = blocks.find(
        (k) => j > k.j0 && j < k.j1 && i >= k.i0 && i < k.i1,
      );
      if (!k) return spec;
      return k.kind === "water" && k.bridges?.(j) && spec.style.kind === "road"
        ? spec
        : null;
    });
  });
  const vertical: (LineSpec | null)[][] = xs.map((_, i) => {
    const spec = line("x", i);
    return zs.slice(1).map((_, j) => {
      if (!spec || !present("x", i, j)) return null;
      const k = blocks.find(
        (k) => i > k.i0 && i < k.i1 && j >= k.j0 && j < k.j1,
      );
      return k ? null : spec;
    });
  });
  const emit = (segs: (LineSpec | null)[], point: (k: number) => Point) => {
    let start = -1;
    for (let k = 0; k <= segs.length; k++) {
      const same =
        k < segs.length &&
        segs[k] &&
        start >= 0 &&
        segs[k]!.name === segs[start]!.name;
      if (same) continue;
      if (start >= 0) {
        const pts: Point[] = [];
        for (let m = start; m <= k; m++) pts.push(point(m));
        b.street(pts, segs[start]!.name, segs[start]!.style);
      }
      start = k < segs.length && segs[k] ? k : -1;
    }
  };
  horizontal.forEach((segs, j) => emit(segs, (i) => [xs[i], zs[j]]));
  vertical.forEach((segs, i) => emit(segs, (j) => [xs[i], zs[j]]));

  const setback = (s: LineSpec | null) =>
    s ? s.style.width / 2 + (s.style.kind === "road" ? 3 : 1.5) : 1.5;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      if (inBlock(i, j)) continue;
      const x0 = xs[i] + setback(vertical[i][j]),
        x1 = xs[i + 1] - setback(vertical[i + 1][j]),
        z0 = zs[j] + setback(horizontal[j][i]),
        z1 = zs[j + 1] - setback(horizontal[j + 1][i]);
      if (x1 - x0 < 6 || z1 - z0 < 6) continue;
      const lot = b.fitLot({
        center: [(x0 + x1) / 2, (z0 + z1) / 2],
        rotation: 0,
        width: x1 - x0,
        depth: z1 - z0,
      });
      if (lot) b.lots.push(lot);
    }
  return blocks.map((spec) => {
    const side = (segs: (LineSpec | null)[]) =>
      Math.max(1.5, ...segs.map(setback));
    const x0 = xs[spec.i0] + side(vertical[spec.i0].slice(spec.j0, spec.j1)),
      x1 = xs[spec.i1] - side(vertical[spec.i1].slice(spec.j0, spec.j1)),
      z0 = zs[spec.j0] + side(horizontal[spec.j0].slice(spec.i0, spec.i1)),
      z1 = zs[spec.j1] - side(horizontal[spec.j1].slice(spec.i0, spec.i1));
    return {
      spec,
      lot: {
        center: [(x0 + x1) / 2, (z0 + z1) / 2] as Point,
        rotation: 0,
        width: x1 - x0,
        depth: z1 - z0,
      },
      polygon: [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ] as Point[],
    };
  });
}

/** Evenly spaced line positions with a little deterministic jitter. */
export function lines(
  rng: Rng,
  from: number,
  to: number,
  count: number,
  jitter = 0,
) {
  const step = (to - from) / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    round(
      from +
        step * i +
        (i && i < count - 1 ? between(rng, -jitter, jitter) : 0),
    ),
  );
}
/** Insert a midpoint between each pair of lines (alleys, passages, lanes). */
export function withMidlines(rng: Rng, coarse: number[], jitter = 0) {
  const fine: number[] = [];
  coarse.forEach((v, i) => {
    if (i)
      fine.push(round((coarse[i - 1] + v) / 2 + between(rng, -jitter, jitter)));
    fine.push(v);
  });
  return fine;
}
