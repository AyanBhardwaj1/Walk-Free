import type {
  World,
  RouteOptions,
  RouteResult,
  GraphEdge,
  Point,
} from "../../shared/types";
import { isShaded } from "./environment";
export function route(
  w: World,
  start: string,
  end: string,
  o: RouteOptions,
): RouteResult | null {
  if (start === end) return null;
  const adjacency = new Map<string, GraphEdge[]>();
  const shade = new Map<string, number>();
  for (const e of w.graph.edges) {
    if (
      (o.avoidStairs && e.stairs) ||
      (e.indoor === "hypothetical" && !o.allowHypothetical)
    )
      continue;
    const a = e.points[0],
      b = e.points.at(-1)!;
    let shaded = 0;
    const count = Math.max(1, Math.min(8, Math.ceil(e.distance / 25)));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      shaded += Number(
        isShaded(
          [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          w,
          o.environment,
        ),
      );
    }
    shade.set(e.id, e.covered || e.indoor !== "no" ? 1 : shaded / count);
    adjacency.set(e.from, [...(adjacency.get(e.from) || []), e]);
    if (e.bidirectional)
      adjacency.set(e.to, [
        ...(adjacency.get(e.to) || []),
        { ...e, from: e.to, to: e.from, points: [...e.points].reverse() },
      ]);
  }
  function solve(pref: string) {
    const d = new Map([[start, 0]]),
      prev = new Map<string, GraphEdge>(),
      visited = new Set<string>();
    while (true) {
      let id = "",
        best = Infinity;
      for (const [n, c] of d)
        if (!visited.has(n) && c < best) {
          id = n;
          best = c;
        }
      if (!id || id === end) break;
      visited.add(id);
      for (const e of adjacency.get(id) || []) {
        const multiplier =
          pref === "shade"
            ? 1 + (1 - (shade.get(e.id) || 0)) * 2
            : pref === "indoors"
              ? e.indoor === "no"
                ? 4
                : 1
              : pref === "scenic"
                ? 1 + (1 - e.scenic) * 2
                : 1;
        const cost = best + e.distance * multiplier;
        if (cost < (d.get(e.to) ?? Infinity)) {
          d.set(e.to, cost);
          prev.set(e.to, e);
        }
      }
    }
    if (!prev.has(end)) return null;
    const result: GraphEdge[] = [];
    let cur = end;
    while (cur !== start) {
      const e = prev.get(cur);
      if (!e) return null;
      result.unshift(e);
      cur = e.from;
    }
    return result;
  }
  const quick = solve("quickest");
  if (!quick) return null;
  let edges = solve(o.preference) || quick;
  const len = (es: GraphEdge[]) => es.reduce((s, e) => s + e.distance, 0);
  const warnings: string[] = [];
  if (len(edges) > len(quick) * o.maxDetour) {
    edges = quick;
    warnings.push(
      "Preferred alternative exceeded your detour budget; showing the quickest connected route.",
    );
  }
  const distance = len(edges);
  const points: Point[] = edges.flatMap((e, i) =>
    i ? e.points.slice(1) : e.points,
  );
  return {
    id: crypto.randomUUID(),
    preference: o.preference,
    points,
    edges,
    distance,
    durationMinutes: distance / 78,
    shadeFraction:
      edges.reduce((s, e) => s + e.distance * (shade.get(e.id) || 0), 0) /
      distance,
    indoorFraction:
      edges.reduce((s, e) => s + (e.indoor !== "no" ? e.distance : 0), 0) /
      distance,
    hypothetical: edges.some((e) => e.indoor === "hypothetical"),
    directions: walkingDirections(edges),
    warnings,
  };
}

export function walkingDirections(edges: GraphEdge[]) {
  return edges.map((e, i) => {
    let instruction = "Head along";
    if (i) {
      const prev = edges[i - 1].points;
      const a = prev.at(-2)!,
        b = prev.at(-1)!,
        c = e.points[0],
        d = e.points[1];
      let angle =
        ((Math.atan2(d[0] - c[0], -(d[1] - c[1])) -
          Math.atan2(b[0] - a[0], -(b[1] - a[1]))) *
          180) /
        Math.PI;
      angle = ((angle + 540) % 360) - 180;
      instruction =
        Math.abs(angle) > 150
          ? "Turn around onto"
          : angle > 35
            ? "Turn right onto"
            : angle < -35
              ? "Turn left onto"
              : "Continue along";
    }
    return {
      text: `${instruction} ${e.name}`,
      distance: e.distance,
      point: e.points[0],
    };
  });
}
