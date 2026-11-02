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
