/**
 * Plane geometry for generated cities: a street plan is drawn as free
 * polylines first, then split wherever two lines cross or one ends on
 * another, so every junction becomes a shared walking node.
 */
import type { Point } from "../../../shared/types.js";
import { insidePolygon, round } from "../fiction-cities/kit.js";

export type Box = [x0: number, x1: number, z0: number, z1: number];

export const dist = (a: Point, b: Point) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const roundPoint = (p: Point): Point => [round(p[0]), round(p[1])];

export function boxOf(points: Point[]): Box {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const [x, z] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return [x0, x1, z0, z1];
}
export const boxesTouch = (a: Box, b: Box, pad = 0) =>
  a[0] - pad <= b[1] &&
  b[0] - pad <= a[1] &&
  a[2] - pad <= b[3] &&
  b[2] - pad <= a[3];
export const boxCorners = ([x0, x1, z0, z1]: Box): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
export const inBox = (p: Point, [x0, x1, z0, z1]: Box, pad = 0) =>
  p[0] >= x0 - pad && p[0] <= x1 + pad && p[1] >= z0 - pad && p[1] <= z1 + pad;
export const expand = ([x0, x1, z0, z1]: Box, m: number): Box => [
  x0 - m,
  x1 + m,
  z0 - m,
  z1 + m,
];

export function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = clamp(
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = clamp(
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  );
  return [a[0] + t * dx, a[1] + t * dz];
}

/** Proper crossing parameters (t along ab, u along cd), or null. */
export function crossing(a: Point, b: Point, c: Point, d: Point) {
  const rx = b[0] - a[0],
    rz = b[1] - a[1],
    sx = d[0] - c[0],
    sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0],
    qz = c[1] - a[1];
  const t = (qx * sz - qz * sx) / den,
    u = (qx * rz - qz * rx) / den;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return { t, u, point: [a[0] + rx * t, a[1] + rz * t] as Point };
}

/** True when a segment enters a polygon or crosses its edge. */
export function segmentHitsPolygon(a: Point, b: Point, poly: Point[]) {
  if (insidePolygon(a, poly) || insidePolygon(b, poly)) return true;
  for (let i = 0; i < poly.length; i++)
    if (crossing(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  return false;
}
export function polygonsOverlap(p: Point[], q: Point[]) {
  if (!boxesTouch(boxOf(p), boxOf(q))) return false;
  if (p.some((v) => insidePolygon(v, q)) || q.some((v) => insidePolygon(v, p)))
    return true;
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      if (crossing(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length]))
        return true;
  return false;
}

/** Clip a polyline to a box, returning the pieces that lie inside it. */
export function clipToBox(points: Point[], box: Box): Point[][] {
  const pieces: Point[][] = [];
  let current: Point[] = [];
  const flush = () => {
    if (current.length >= 2) pieces.push(current);
    current = [];
  };
  for (let i = 1; i < points.length; i++) {
    const seg = clipSegment(points[i - 1], points[i], box);
    if (!seg) {
      flush();
      continue;
    }
    const [p, q] = seg;
    const last = current.at(-1);
    if (!last || dist(last, p) > 1e-6) {
      flush();
      current.push(p);
    }
    current.push(q);
    if (seg[2]) flush();
  }
  flush();
  return pieces;
}
/** Liang-Barsky; the third value is true when the segment was cut at its end. */
function clipSegment(a: Point, b: Point, [x0, x1, z0, z1]: Box) {
  let t0 = 0,
    t1 = 1;
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const checks: [number, number][] = [
    [-dx, a[0] - x0],
    [dx, x1 - a[0]],
    [-dz, a[1] - z0],
    [dz, z1 - a[1]],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  if (t1 - t0 < 1e-9) return null;
  return [
    [a[0] + dx * t0, a[1] + dz * t0] as Point,
    [a[0] + dx * t1, a[1] + dz * t1] as Point,
    t1 < 1,
  ] as const;
}

/** The part of the infinite line through `p` with direction `d` inside a box. */
export function lineInBox(p: Point, d: Point, box: Box): [Point, Point] | null {
  const far = 1e5;
  const seg = clipSegment(
    [p[0] - d[0] * far, p[1] - d[1] * far],
    [p[0] + d[0] * far, p[1] + d[1] * far],
    box,
  );
  return seg ? [seg[0], seg[1]] : null;
}

/** Offset a polyline sideways by `by` metres (left of travel is positive). */
export function offsetPolyline(points: Point[], by: number): Point[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const len = dist(a, b) || 1;
    return [
      p[0] - ((b[1] - a[1]) / len) * by,
      p[1] + ((b[0] - a[0]) / len) * by,
    ];
  });
}

/** Spatial hash keyed by integer cells. */
export class Hash<T> {
  private cells = new Map<number, T[]>();
  constructor(private size: number) {}
  private key(x: number, z: number) {
    return (x + 4096) * 8192 + (z + 4096);
  }
  add(item: T, [x0, x1, z0, z1]: Box) {
    const s = this.size;
    for (let x = Math.floor(x0 / s); x <= Math.floor(x1 / s); x++)
      for (let z = Math.floor(z0 / s); z <= Math.floor(z1 / s); z++) {
        const k = this.key(x, z);
        const cell = this.cells.get(k);
        if (cell) cell.push(item);
        else this.cells.set(k, [item]);
      }
  }
  query([x0, x1, z0, z1]: Box, out = new Set<T>()) {
    const s = this.size;
    for (let x = Math.floor(x0 / s); x <= Math.floor(x1 / s); x++)
      for (let z = Math.floor(z0 / s); z <= Math.floor(z1 / s); z++)
        for (const item of this.cells.get(this.key(x, z)) ?? []) out.add(item);
    return out;
  }
}

export interface Line {
  points: Point[];
}

/**
 * Insert a shared vertex wherever two lines cross, or where one line's
 * vertex lies on (within `snap` metres of) another line, so the builder's
 * coordinate-keyed nodes join them. Lines are edited in place.
 */
export function joinLines(lines: Line[], snap = 0.8) {
  interface Seg {
    line: number;
    index: number;
    a: Point;
    b: Point;
    cuts: { t: number; p: Point }[];
  }
  const segs: Seg[] = [];
  const hash = new Hash<Seg>(48);
  lines.forEach((l, li) => {
    l.points = l.points.map(roundPoint);
    for (let i = 1; i < l.points.length; i++) {
      const s: Seg = {
        line: li,
        index: i - 1,
        a: l.points[i - 1],
        b: l.points[i],
        cuts: [],
      };
      segs.push(s);
      hash.add(s, expand(boxOf([s.a, s.b]), snap));
    }
  });
  const found = new Set<Seg>();
  for (const s of segs) {
    found.clear();
    hash.query(expand(boxOf([s.a, s.b]), snap), found);
    for (const o of found) {
      if (o === s) continue;
      // Proper crossings, once per pair.
      if (o.line > s.line || (o.line === s.line && o.index > s.index + 1)) {
        const x = crossing(s.a, s.b, o.a, o.b);
        if (x) {
          const p = roundPoint(x.point);
          s.cuts.push({ t: x.t, p });
          o.cuts.push({ t: x.u, p });
        }
      }
      // A vertex of s resting on o's interior: a T-junction.
      if (o.line === s.line && Math.abs(o.index - s.index) <= 1) continue;
      for (const v of [s.a, s.b]) {
        if (dist(v, o.a) <= snap || dist(v, o.b) <= snap) continue;
        if (pointSegmentDistance(v, o.a, o.b) > snap) continue;
        const len2 = (o.b[0] - o.a[0]) ** 2 + (o.b[1] - o.a[1]) ** 2;
        const t =
          ((v[0] - o.a[0]) * (o.b[0] - o.a[0]) +
            (v[1] - o.a[1]) * (o.b[1] - o.a[1])) /
          len2;
        o.cuts.push({ t, p: v });
      }
    }
  }
  // Rebuild each line with its cut points in order.
  const bySegment = new Map<number, Seg[]>();
  for (const s of segs) {
    const arr = bySegment.get(s.line);
    if (arr) arr.push(s);
    else bySegment.set(s.line, [s]);
  }
  for (const [li, list] of bySegment) {
    const out: Point[] = [list[0].a];
    for (const s of list) {
      s.cuts.sort((x, y) => x.t - y.t);
      for (const c of s.cuts) out.push(c.p);
      out.push(s.b);
    }
    lines[li].points = dedupe(out);
  }
  snapVertices(lines, snap * 0.5);
}

/** Merge vertices that lie within `tolerance` metres of each other. */
function snapVertices(lines: Line[], tolerance: number) {
  const hash = new Hash<Point>(Math.max(1, tolerance * 4));
  const canonical = (p: Point): Point => {
    const box: Box = [
      p[0] - tolerance,
      p[0] + tolerance,
      p[1] - tolerance,
      p[1] + tolerance,
    ];
    for (const q of hash.query(box)) if (dist(p, q) <= tolerance) return q;
    hash.add(p, [p[0], p[0], p[1], p[1]]);
    return p;
  };
  for (const l of lines) l.points = dedupe(l.points.map(canonical));
}

export function dedupe(points: Point[]) {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** Split a polyline wherever it crosses a polygon's boundary. */
export function splitAtPolygon(points: Point[], poly: Point[]): Point[] {
  const pb = boxOf(poly);
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (boxesTouch(boxOf([a, b]), pb)) {
      const cuts: { t: number; p: Point }[] = [];
      for (let k = 0; k < poly.length; k++) {
        const x = crossing(a, b, poly[k], poly[(k + 1) % poly.length]);
        if (x) cuts.push({ t: x.t, p: roundPoint(x.point) });
      }
      cuts.sort((x, y) => x.t - y.t);
      for (const c of cuts) out.push(c.p);
    }
    out.push(b);
  }
  return dedupe(out);
}

/** Points of an ellipse, clockwise from +x. */
export function ellipse(
  c: Point,
  rx: number,
  rz: number,
  steps: number,
  phase = 0,
): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = phase + (i / steps) * Math.PI * 2;
    return [c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * rz] as Point;
  });
}

export { insidePolygon };
