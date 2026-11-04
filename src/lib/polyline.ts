import type { Point } from "../../shared/types";
export type P3 = [number, number, number];
/** The first share k (0–1) of a polyline, by length. */
export function partialLine(points: P3[], k: number): P3[] {
  if (k >= 1 || points.length < 2) return points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    lengths.push(
      lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
    );
  }
  const target = Math.max(0, k) * lengths.at(-1)!;
  const out: P3[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (lengths[i] <= target) {
      out.push(points[i]);
      continue;
    }
    const span = lengths[i] - lengths[i - 1];
    const t = span ? (target - lengths[i - 1]) / span : 0;
    const [a, b] = [points[i - 1], points[i]];
    out.push([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]);
    break;
  }
  return out.length > 1 ? out : [points[0], points[0]];
}

/** Distance from a point to the nearest part of a polyline, in metres. */
export function distanceToLine(p: Point, line: readonly Point[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const len = dx * dx + dz * dz;
    const t = len
      ? Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len),
        )
      : 0;
    best = Math.min(
      best,
      Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz),
    );
  }
  return line.length === 1
    ? Math.hypot(p[0] - line[0][0], p[1] - line[0][1])
    : best;
}

/**
 * Trees whose crown the street-level camera would pass through on this
 * walk, so they can be hidden while walking (the view would be all leaves).
 */
export function crownsOnPath(
  trees: readonly {
    id: string;
    position: Point;
    width: number;
    depth: number;
  }[],
  path: readonly Point[],
  pad = 0.5,
) {
  const hit = new Set<string>();
  for (const t of trees)
    if (
      distanceToLine(t.position, path) <
      Math.max(t.width, t.depth) * 0.6 + pad
    )
      hit.add(t.id);
  return hit;
}
