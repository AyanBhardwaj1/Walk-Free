import type {
  GraphEdge,
  GraphNode,
  Point,
  SceneObject,
  World,
} from "../../../shared/types.js";
import { inside } from "../../../shared/canopy.js";
import type { IndoorLevel, IndoorMap, IndoorRoom } from "./types.js";
import { simplify, thin, type VectorPlan, type Px } from "./plan-image.js";

/** A building's outline in map metres (its footprint, turned and placed). */
export function footprintRing(o: SceneObject): Point[] {
  const a = (o.rotation * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a);
  const shape: Point[] = o.footprint ?? [
    [-o.width / 2, -o.depth / 2],
    [o.width / 2, -o.depth / 2],
    [o.width / 2, o.depth / 2],
    [-o.width / 2, o.depth / 2],
  ];
  return shape.map(([x, z]): Point => [
    o.position[0] + x * cos - z * sin,
    o.position[1] + x * sin + z * cos,
  ]);
}

function hull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0)
      lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export interface Rect {
  centre: Point;
  /** Direction of the long side, radians. */
  angle: number;
  long: number;
  short: number;
}

/** The smallest rectangle around a building (rotating calipers on its hull). */
export function minAreaRect(points: Point[]): Rect {
  const h = hull(points);
  let best: Rect & { area: number } = {
    centre: [0, 0],
    angle: 0,
    long: 0,
    short: 0,
    area: Infinity,
  };
  for (let i = 0; i < h.length; i++) {
    const a = h[i],
      b = h[(i + 1) % h.length];
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-angle),
      s = Math.sin(-angle);
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const p of h) {
      const u = p[0] * c - p[1] * s,
        v = p[0] * s + p[1] * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) {
      const cu = (minU + maxU) / 2,
        cv = (minV + maxV) / 2;
      // Back from rotated to map coordinates.
      const centre: Point = [
        cu * Math.cos(angle) - cv * Math.sin(angle),
        cu * Math.sin(angle) + cv * Math.cos(angle),
      ];
      const du = maxU - minU,
        dv = maxV - minV;
      best = {
        centre,
        angle: du >= dv ? angle : angle + Math.PI / 2,
        long: Math.max(du, dv),
        short: Math.min(du, dv),
        area,
      };
    }
  }
  return best;
}

/**
 * Fits a vectorised floor plan into a building: the plan's longer side
 * along the building's longer side, stretched to its outline, then turned
 * a further quarter-turns (and mirrored) as the person chooses.
 */
export function placePlan(
  plan: VectorPlan,
  building: SceneObject,
  {
    turns = 0,
    mirror = false,
    ordinal = 0,
    name,
    kinds = [],
  }: {
    turns?: number;
    mirror?: boolean;
    ordinal?: number;
    name?: string;
    /** What each traced room is, where the person said (else a room). */
    kinds?: (IndoorRoom["kind"] | undefined)[];
  } = {},
): IndoorLevel {
  const rect = minAreaRect(footprintRing(building));
  const b = plan.bounds;
  const cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2;
  const pw = Math.max(1, b.maxX - b.minX),
    ph = Math.max(1, b.maxY - b.minY);
  // The plan's long axis lies along the building's long axis.
  const planLongIsX = pw >= ph;
  // Stretch to the outline when the plan has the building's proportions;
  // otherwise scale it evenly to fit inside, so rooms keep their shapes.
  const planAspect = Math.max(pw, ph) / Math.min(pw, ph),
    buildingAspect = rect.long / Math.max(1e-6, rect.short);
  const stretch =
    Math.max(planAspect, buildingAspect) /
      Math.min(planAspect, buildingAspect) <=
    1.25;
  const even = Math.min(
    rect.long / Math.max(pw, ph),
    rect.short / Math.min(pw, ph),
  );
  const scaleLong = stretch ? rect.long / Math.max(pw, ph) : even,
    scaleShort = stretch ? rect.short / Math.min(pw, ph) : even;
  const turn = (((turns % 4) + 4) % 4) * (Math.PI / 2);
  const toMap = ([x, y]: Px): Point => {
    let u = (x - cx) * (mirror ? -1 : 1),
      v = y - cy;
    if (!planLongIsX) [u, v] = [v, -u];
    u *= scaleLong;
    v *= scaleShort;
    const a = rect.angle + turn;
    return [
      rect.centre[0] + u * Math.cos(a) - v * Math.sin(a),
      rect.centre[1] + u * Math.sin(a) + v * Math.cos(a),
    ];
  };
  return {
    ordinal,
    name: name ?? (ordinal === 0 ? "Ground floor" : `Level ${ordinal}`),
    rooms: plan.rooms.map((r, i) => {
      const kind = kinds[i] ?? "room";
      return {
        name:
          kind === "stairs" ? "Stairs" : kind === "elevator" ? "Lift" : r.label,
        ring: r.ring.map(toMap),
        kind,
      };
    }),
    paths: [...plan.corridors, ...plan.links].map((l) => l.map(toMap)),
    doors: plan.doors.map(toMap),
    entrances: plan.entrances.map(toMap),
    placed: true,
  };
}

/**
 * Walkable centre lines through corridor polygons (for imports that draw
 * corridors as areas): rasterise at half a metre, thin, and trace.
 */
/** The box around some points, by loop (spreading a huge array into
 * Math.min overflows the call stack). */
export function bounds(points: Point[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function corridorPaths(rooms: IndoorRoom[], cell = 0.5): Point[][] {
  const corridors = rooms.filter((r) => r.kind === "corridor");
  if (!corridors.length) return [];
  const box = bounds(corridors.flatMap((r) => r.ring));
  const minX = box.minX - 1,
    minY = box.minY - 1;
  const w = Math.ceil((box.maxX - minX) / cell) + 2,
    h = Math.ceil((box.maxY - minY) / cell) + 2;
  if (w * h > 4_000_000) return [];
  const mask = new Uint8Array(w * h);
  for (const r of corridors) {
    const b = bounds(r.ring);
    const x0 = Math.floor((b.minX - minX) / cell),
      x1 = Math.ceil((b.maxX - minX) / cell),
      y0 = Math.floor((b.minY - minY) / cell),
      y1 = Math.ceil((b.maxY - minY) / cell);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if (inside(r.ring, minX + (x + 0.5) * cell, minY + (y + 0.5) * cell))
          mask[y * w + x] = 1;
  }
  thin(mask, w, h);
  // Trace runs of skeleton pixels into polylines.
  const lines: Point[][] = [];
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const line: Px[] = [];
    let cur = i;
    for (let guard = 0; guard < mask.length && cur >= 0; guard++) {
      seen[cur] = 1;
      const x = cur % w,
        y = (cur - x) / w;
      line.push([x, y]);
      let next = -1;
      for (let dy = -1; dy <= 1 && next < 0; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          const q = yy * w + xx;
          if (
            (dx || dy) &&
            xx >= 0 &&
            yy >= 0 &&
            xx < w &&
            yy < h &&
            mask[q] &&
            !seen[q]
          ) {
            next = q;
            break;
          }
        }
      cur = next;
    }
    if (line.length >= 3)
      lines.push(
        simplify(line, 1.5).map(([x, y]): Point => [
          minX + (x + 0.5) * cell,
          minY + (y + 0.5) * cell,
        ]),
      );
  }
  return lines;
}

/** Path ends this close to another path are joined to it, metres. */
const SNAP_M = 2;
/** Vertices this close together are one junction, metres. */
const WELD_M = 0.8;

/**
 * Joins walkable lines that nearly meet: drawn and traced corridors stop
 * just short of each other at junctions, and imported lines rarely share
 * exact vertices. Close vertices are welded into one, then each loose end
 * is extended onto the nearest point of another line within reach (which
 * becomes a vertex of that line).
 */
export function joinPaths(paths: Point[][], reach = SNAP_M): Point[][] {
  const out = paths
    .filter((p) => p.length >= 2)
    .map((p) => p.map((q): Point => [q[0], q[1]]));
  // Weld line ends that nearly meet into one junction (union-find on a
  // coarse grid). Only ends: welding every vertex would chain through a
  // finely drawn line and collapse it to a point.
  const ends: { line: number; at: number }[] = [];
  out.forEach((line, i) => {
    ends.push({ line: i, at: 0 });
    ends.push({ line: i, at: line.length - 1 });
  });
  const pt = (e: { line: number; at: number }) => out[e.line][e.at];
  const parent = ends.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const grid = new Map<string, number[]>();
  ends.forEach((e, i) => {
    const p = pt(e);
    const cx = Math.floor(p[0] / WELD_M),
      cz = Math.floor(p[1] / WELD_M);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          // Never a line's two ends: a short line would vanish.
          if (ends[j].line === e.line) continue;
          const q = pt(ends[j]);
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= WELD_M)
            parent[find(i)] = find(j);
        }
    const key = `${cx},${cz}`;
    grid.set(key, [...(grid.get(key) ?? []), i]);
  });
  const sums = new Map<number, [number, number, number]>();
  ends.forEach((e, i) => {
    const p = pt(e),
      r = find(i);
    const t = sums.get(r) ?? [0, 0, 0];
    sums.set(r, [t[0] + p[0], t[1] + p[1], t[2] + 1]);
  });
  const moved = ends.map((_, i) => {
    const [x, z, n] = sums.get(find(i))!;
    return [x / n, z / n] as Point;
  });
  ends.forEach((e, i) => (out[e.line][e.at] = moved[i]));
  // Drop vertices a weld made repeat, and lines it shrank to a point.
  const welded = out
    .map((line) =>
      line.filter(
        (p, i) => i === 0 || p[0] !== line[i - 1][0] || p[1] !== line[i - 1][1],
      ),
    )
    .filter((line) => line.length >= 2);
  // Loose ends: an end vertex no other line touches.
  const key = (p: Point) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const uses = () => {
    const m = new Map<string, number>();
    for (const line of welded)
      for (const p of new Set(line.map(key))) m.set(p, (m.get(p) ?? 0) + 1);
    return m;
  };
  for (let i = 0; i < welded.length; i++)
    for (const first of [true, false]) {
      const line = welded[i];
      const e = first ? line[0] : line[line.length - 1];
      if ((uses().get(key(e)) ?? 0) > 1) continue;
      let best: { j: number; k: number; q: Point; d: number } | null = null;
      for (let j = 0; j < welded.length; j++) {
        if (j === i) continue;
        const other = welded[j];
        for (let s = 1; s < other.length; s++) {
          const a = other[s - 1],
            b = other[s];
          const dx = b[0] - a[0],
            dz = b[1] - a[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((e[0] - a[0]) * dx + (e[1] - a[1]) * dz) /
                (dx * dx + dz * dz || 1),
            ),
          );
          const q: Point = [a[0] + t * dx, a[1] + t * dz];
          const d = Math.hypot(e[0] - q[0], e[1] - q[1]);
          if (d <= reach && (!best || d < best.d))
            best = { j, k: s, q: t === 0 ? a : t === 1 ? b : q, d };
        }
      }
      if (!best) continue;
      const other = welded[best.j];
      if (!other.includes(best.q)) other.splice(best.k, 0, best.q);
      if (first) line.unshift(best.q);
      else line.push(best.q);
    }
  return welded;
}

/** Corridors get a node at least this often, so rooms and stairs along
 * a long one have somewhere near to join it, metres. */
const NODE_SPACING_M = 10;
function densify(path: Point[]): Point[] {
  const out: Point[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / NODE_SPACING_M);
    for (let k = 1; k < n; k++)
      out.push([
        a[0] + ((b[0] - a[0]) * k) / n,
        a[1] + ((b[1] - a[1]) * k) / n,
      ]);
    out.push(b);
  }
  return out;
}

/** The average of a ring's corners. */
const centroid = (ring: Point[]): Point => [
  ring.reduce((s, q) => s + q[0], 0) / ring.length,
  ring.reduce((s, q) => s + q[1], 0) / ring.length,
];

/** Every n-th point, so a line keeps its shape within `max` points. */
function thinOut(points: Point[], max: number) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, i) => i % step === 0).slice(0, max);
}

/**
 * Holds an interior to what a saved scene allows (shared/schema.ts), so a
 * big campus archive can't make the scene unsavable: at most 100 floors
 * (ordinals −10 to 200), 5000 rooms and paths a floor, 2000 points a line.
 */
export function fitSchema(levels: IndoorLevel[]): IndoorLevel[] {
  return levels
    .filter((l) => l.ordinal >= -10 && l.ordinal <= 200)
    .slice(0, 100)
    .map((l) => ({
      ordinal: Math.round(l.ordinal),
      name: l.name.slice(0, 100),
      rooms: l.rooms
        .filter((r) => r.ring.length >= 3)
        .slice(0, 5000)
        .map((r) => ({
          name: r.name.slice(0, 200),
          kind: r.kind,
          ring: thinOut(r.ring, 2000),
        }))
        .filter((r) => r.ring.length >= 3),
      paths: l.paths
        .filter((p) => p.length >= 2)
        .slice(0, 5000)
        .map((p) => thinOut(p, 2000))
        .filter((p) => p.length >= 2),
      doors: l.doors.slice(0, 10000),
      ...(l.entrances ? { entrances: l.entrances.slice(0, 500) } : {}),
      ...(l.placed ? { placed: true } : {}),
    }));
}

/** Indoor nodes and edges are named with this prefix and the building id. */
const PREFIX = "indoor:";
/** Corridors this close to the outline are at an entrance. */
const ENTRANCE_REACH_M = 10;
/** An entrance joins an outdoor path within this distance. */
const OUTDOOR_REACH_M = 45;
/** Indoor lines may run this far outside the outline (a drawn plan is
 * rarely an exact fit), metres. */
const OUTLINE_SLACK_M = 3;
/** A room joins its floor's corridors within this distance, metres. */
const ROOM_REACH_M = 30;
/** Stairs or lifts on two floors this close are the same core, metres. */
const CORE_MATCH_M = 8;
/** A core joins its floor's corridors within this distance, metres. */
const CORE_REACH_M = 20;
/** Walking-equivalent length of a flight of stairs and of a lift ride. */
const STAIRS_M_PER_FLOOR = 12;
const LIFT_M_PER_FLOOR = 30;
/** A marked entrance joins the indoor paths within this distance. */
const MARKED_REACH_M = 15;
/** Entrances at least this far apart. */
const ENTRANCE_SPACING_M = 12;

/**
 * Puts an interior into the world: stored for drawing, and its ground
 * floor's paths joined to the walking network (covered, indoors), with
 * entrances where corridors meet the outline. Replaces any earlier
 * interior of the same building.
 */
export function addInterior(world: World, map: IndoorMap): World {
  const building = world.objects.find((o) => o.id === map.buildingId);
  if (!building) return world;
  const tag = `${PREFIX}${map.buildingId}:`;
  const graph = {
    nodes: world.graph.nodes.filter((n) => !n.id.startsWith(tag)),
    edges: world.graph.edges.filter((e) => !e.id.startsWith(tag)),
  };
  const ground = [...map.levels].sort(
    (a, b) => Math.abs(a.ordinal) - Math.abs(b.ordinal),
  )[0];
  // The building's outline, and how far a point is from it.
  const ring = footprintRing(building);
  const toOutline = (p: Point) => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
      best = Math.min(
        best,
        Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz),
      );
    }
    return best;
  };
  // Only what lies in this building: a whole campus's IMDF venue holds
  // its neighbours' rooms and doors too.
  // A plan placed by hand was fitted to this building on purpose: keep all
  // of it even where the outline isn't a plain rectangle. Mapped data
  // (IMDF, OSM, GeoJSON) is clipped to the outline.
  const within = (p: Point) =>
    inside(ring, p[0], p[1]) || toOutline(p) <= OUTLINE_SLACK_M;
  const levels = fitSchema(map.levels)
    .map((l) =>
      // A floor placed by hand is kept whole (see placePlan).
      l.placed
        ? l
        : {
            ...l,
            rooms: l.rooms.filter((r) => within(centroid(r.ring))),
            doors: l.doors.filter(within),
            ...(l.entrances ? { entrances: l.entrances.filter(within) } : {}),
          },
    )
    .map((l) => (l.paths.length ? l : { ...l, paths: corridorPaths(l.rooms) }));
  // Lines outside the building (footways in an OSM export, the outline
  // itself) aren't indoor paths: keep only the stretches inside it.
  const clip = (paths: Point[][], placed = false) => {
    if (placed) return paths;
    const kept: Point[][] = [];
    for (const path of paths) {
      let run: Point[] = [];
      for (let i = 1; i < path.length; i++) {
        const m: Point = [
          (path[i - 1][0] + path[i][0]) / 2,
          (path[i - 1][1] + path[i][1]) / 2,
        ];
        if (within(m)) {
          if (!run.length) run.push(path[i - 1]);
          run.push(path[i]);
        } else if (run.length) {
          kept.push(run);
          run = [];
        }
      }
      if (run.length >= 2) kept.push(run);
    }
    return kept;
  };
  const groundPaths = joinPaths(
    levels.find((l) => l.ordinal === ground?.ordinal)?.paths ?? [],
  )
    .map(densify)
    .flatMap((p) => clip([p], !!ground?.placed));
  const groundOrdinal = ground?.ordinal ?? 0;
  // Nodes at every path vertex, merged where they meet (half-metre grid),
  // one set per floor. Floors other than the one with the ways in are
  // marked in their ids, so a tap on the map never lands on them.
  const nodes = new Map<string, GraphNode>();
  const nodeAt = (p: Point, level = groundOrdinal, name?: string) => {
    const key = `${level}|${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}${name ? `|${name}` : ""}`;
    let n = nodes.get(key);
    if (!n) {
      const floor = level === groundOrdinal ? "" : `f${level}`;
      n = {
        id: `${tag}${floor}${name ? "r" : "n"}${nodes.size}`,
        point: p,
        ...(name ? { name } : {}),
      };
      nodes.set(key, n);
    }
    return n;
  };
  const edges: GraphEdge[] = [];
  const edge = (
    a: GraphNode,
    b: GraphNode,
    points: Point[],
    name: string,
    indoors: boolean,
    extra: Partial<GraphEdge> = {},
  ) => {
    const distance =
      extra.distance ??
      points
        .slice(1)
        .reduce(
          (s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
          0,
        );
    if (distance < 0.3 || a.id === b.id) return;
    edges.push({
      id: `${tag}e${edges.length}`,
      from: a.id,
      to: b.id,
      points,
      name,
      covered: indoors,
      scenic: 0.15,
      indoor: indoors ? "verified" : "no",
      stairs: false,
      accessible: true,
      bidirectional: true,
      roadClass: "path",
      ...extra,
      distance,
    });
  };
  for (const path of groundPaths)
    for (let i = 1; i < path.length; i++)
      edge(
        nodeAt(path[i - 1]),
        nodeAt(path[i]),
        [path[i - 1], path[i]],
        building.name || map.buildingName,
        true,
      );
  // Outdoors means outdoors: not another building's corridors or floors.
  const outdoor = graph.nodes.filter(
    (n) => !n.id.startsWith(PREFIX) && !inside(ring, n.point[0], n.point[1]),
  );
  const linked = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  // Doorways out are from corridors and open areas, never from inside a
  // room (a link's end at a room's centre can sit near the wall too).
  const enclosed = (
    levels.find((l) => l.ordinal === ground?.ordinal)?.rooms ?? []
  ).filter((r) => r.kind !== "corridor" && r.kind !== "other");
  const candidates = [...nodes.values()]
    .filter(
      (n) => !enclosed.some((r) => inside(r.ring, n.point[0], n.point[1])),
    )
    .map((n) => ({ n, d: toOutline(n.point) }))
    .sort((a, b) => a.d - b.d);
  const near = candidates.filter((c) => c.d <= ENTRANCE_REACH_M);
  // Up to four entrances, spread out rather than four along one wall.
  const chosen: typeof candidates = [];
  for (const c of near.length ? near : candidates.slice(0, 2)) {
    if (chosen.length >= 4) break;
    if (
      chosen.every(
        (o) =>
          Math.hypot(o.n.point[0] - c.n.point[0], o.n.point[1] - c.n.point[1]) >
          ENTRANCE_SPACING_M,
      )
    )
      chosen.push(c);
  }
  let doorways = 0;
  const nearestOutdoor = (p: Point) => {
    let best: GraphNode | null = null,
      bd = OUTDOOR_REACH_M;
    for (const o of outdoor) {
      if (!linked.has(o.id)) continue;
      const d = Math.hypot(o.point[0] - p[0], o.point[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  const outName = `${building.name || "Building"} entrance`;
  // Entrances the plan or map marks are the ways in; without them, the
  // corridor ends nearest the outline stand in.
  const marked = (
    levels.find((l) => l.ordinal === ground?.ordinal)?.entrances ?? []
  ).slice(0, 12);
  const inner = [...nodes.values()];
  for (const at of marked) {
    let into: GraphNode | null = null,
      bd = MARKED_REACH_M;
    for (const n of inner) {
      const d = Math.hypot(n.point[0] - at[0], n.point[1] - at[1]);
      if (d < bd) {
        bd = d;
        into = n;
      }
    }
    const out = nearestOutdoor(at);
    if (!into || !out) continue;
    const door = nodeAt(at);
    edge(door, into, [at, into.point], building.name || map.buildingName, true);
    edge(door, out, [at, out.point], outName, false);
    doorways++;
  }
  if (!doorways)
    for (const { n } of chosen) {
      const out = nearestOutdoor(n.point);
      if (!out) continue;
      edge(n, out, [n.point, out.point], outName, false);
      doorways++;
    }
  const bname = building.name || map.buildingName;
  // The other floors' corridors, each a network of its own until stairs or
  // lifts join it to the rest.
  const pathNodes = new Map<number, GraphNode[]>();
  pathNodes.set(groundOrdinal, [...nodes.values()]);
  for (const l of levels) {
    if (l.ordinal === groundOrdinal) continue;
    const before = new Set(nodes.keys());
    for (const path of clip(joinPaths(l.paths).map(densify), !!l.placed))
      for (let i = 1; i < path.length; i++)
        edge(
          nodeAt(path[i - 1], l.ordinal),
          nodeAt(path[i], l.ordinal),
          [path[i - 1], path[i]],
          `${bname} · ${l.name}`,
          true,
        );
    pathNodes.set(
      l.ordinal,
      [...nodes.entries()].filter(([k]) => !before.has(k)).map(([, n]) => n),
    );
  }
  const nearestOn = (level: number, p: Point, reach: number) => {
    let best: GraphNode | null = null,
      bd = reach;
    for (const n of pathNodes.get(level) ?? []) {
      const d = Math.hypot(n.point[0] - p[0], n.point[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  };
  const centreOf = centroid;
  // Rooms become places to walk to: "Room 204, Mezes Hall (Level 2)".
  for (const l of levels)
    for (const room of l.rooms) {
      if (room.kind === "corridor" || room.kind === "other") continue;
      if (!room.name.trim() || room.ring.length < 3) continue;
      const at = centreOf(room.ring);
      const into = nearestOn(l.ordinal, at, ROOM_REACH_M);
      if (!into) continue;
      const label = `${room.name}, ${bname}${l.ordinal === groundOrdinal ? "" : ` (${l.name})`}`;
      // A corridor passing right through the room's middle: name that
      // point rather than add a node on top of it.
      if (Math.hypot(into.point[0] - at[0], into.point[1] - at[1]) < 0.3) {
        into.name ??= label;
        continue;
      }
      edge(nodeAt(at, l.ordinal, label), into, [at, into.point], bname, true);
    }
  // Stairs and lifts join each floor to the next where the same kind of
  // core is mapped in about the same place on both.
  const order = levels.map((l) => l.ordinal).sort((a, b) => a - b);
  for (let i = 1; i < order.length; i++) {
    const lower = levels.find((l) => l.ordinal === order[i - 1])!,
      upper = levels.find((l) => l.ordinal === order[i])!;
    for (const core of lower.rooms) {
      if (core.kind !== "stairs" && core.kind !== "elevator") continue;
      const c = centreOf(core.ring);
      const match = upper.rooms.find(
        (r) =>
          r.kind === core.kind &&
          Math.hypot(centreOf(r.ring)[0] - c[0], centreOf(r.ring)[1] - c[1]) <
            CORE_MATCH_M,
      );
      if (!match) continue;
      const c2 = centreOf(match.ring);
      const a = nearestOn(lower.ordinal, c, CORE_REACH_M),
        b = nearestOn(upper.ordinal, c2, CORE_REACH_M);
      if (!a || !b) continue;
      const stairs = core.kind === "stairs";
      edge(
        a,
        b,
        [a.point, b.point],
        stairs ? `${bname} stairs` : `${bname} lift`,
        true,
        {
          stairs,
          accessible: !stairs,
          // A storey of stairs walks like about 12 m; a lift, with the wait,
          // like about 30 m.
          distance:
            (stairs ? STAIRS_M_PER_FLOOR : LIFT_M_PER_FLOOR) *
            Math.max(1, upper.ordinal - lower.ordinal),
        },
      );
    }
  }
  // Keep only what a doorway reaches: an interior no path outside can get
  // into would be an island that routes snap to and then can't leave.
  const reach = new Set<string>();
  const doorEdges = edges.filter((e) => e.indoor === "no");
  const stack = doorEdges.flatMap((e) => [e.from, e.to]);
  const around = new Map<string, string[]>();
  for (const e of edges) {
    around.set(e.from, [...(around.get(e.from) ?? []), e.to]);
    around.set(e.to, [...(around.get(e.to) ?? []), e.from]);
  }
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id)) continue;
    reach.add(id);
    // Outdoor nodes are the far side of a doorway; don't walk past them.
    if (!id.startsWith(tag)) continue;
    for (const next of around.get(id) ?? []) stack.push(next);
  }
  const joined = edges.filter((e) => reach.has(e.from) && reach.has(e.to));
  const stored = {
    buildingId: map.buildingId,
    buildingName: map.buildingName.slice(0, 200),
    source: map.source.slice(0, 60),
    ...(map.hours?.trim() ? { hours: map.hours.trim().slice(0, 500) } : {}),
    levels,
  };
  return {
    ...world,
    indoor: [
      ...(world.indoor ?? []).filter((i) => i.buildingId !== map.buildingId),
      stored,
    ],
    graph: {
      nodes: [
        ...graph.nodes,
        ...[...nodes.values()].filter((n) => reach.has(n.id)),
      ],
      edges: [...graph.edges, ...joined],
    },
  };
}

/** Takes a building's interior (and its indoor paths) back out. */
export function removeInterior(world: World, buildingId: string): World {
  const tag = `${PREFIX}${buildingId}:`;
  return {
    ...world,
    indoor: (world.indoor ?? []).filter((i) => i.buildingId !== buildingId),
    graph: {
      nodes: world.graph.nodes.filter((n) => !n.id.startsWith(tag)),
      edges: world.graph.edges.filter((e) => !e.id.startsWith(tag)),
    },
  };
}

/** Sets (or, with null, clears) a building interior's opening hours. */
export function setInteriorHours(
  world: World,
  buildingId: string,
  hours: string | null,
): World {
  if (!world.indoor?.some((i) => i.buildingId === buildingId)) return world;
  return {
    ...world,
    indoor: world.indoor.map((i) => {
      if (i.buildingId !== buildingId) return i;
      const rest = { ...i };
      delete rest.hours;
      const h = hours?.trim().slice(0, 500);
      return h ? { ...rest, hours: h } : rest;
    }),
  };
}
