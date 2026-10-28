import type {
  World,
  RouteOptions,
  RouteResult,
  GraphEdge,
  GraphNode,
  Point,
  RoutePreference,
} from "../../shared/types";
import { createShadeTester } from "./environment";

export const routePreferences: RoutePreference[] = [
  "quickest",
  "shade",
  "scenic",
  "indoors",
];

/** A binary heap avoids scanning all reached nodes at every routing step. */
class MinQueue {
  private items: { id: string; cost: number }[] = [];
  push(item: { id: string; cost: number }) {
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].cost <= item.cost) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < this.items.length &&
          this.items[child + 1].cost < this.items[child].cost
        )
          child++;
        if (last.cost <= this.items[child].cost) break;
        this.items[i] = this.items[child];
        i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
}

/** Sample along bends by distance instead of cutting across the endpoints. */
export function samplePolyline(points: Point[], count: number): Point[] {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return points.length ? [points[0]] : [];
  const samples: Point[] = [];
  let segment = 0,
    passed = 0;
  for (let i = 0; i < count; i++) {
    const distance = (total * (i + 0.5)) / count;
    while (
      segment < lengths.length - 1 &&
      passed + lengths[segment] < distance
    ) {
      passed += lengths[segment++];
    }
    const t = (distance - passed) / lengths[segment];
    samples.push([
      points[segment][0] + (points[segment + 1][0] - points[segment][0]) * t,
      points[segment][1] + (points[segment + 1][1] - points[segment][1]) * t,
    ]);
  }
  return samples;
}

/** Snap to an existing path node, never create an off-network connection. */
export function nearestWalkNode(
  w: World,
  point: Point,
  maxDistance = 40,
): GraphNode | null {
  const connected = new Set(w.graph.edges.flatMap((e) => [e.from, e.to]));
  let best: GraphNode | null = null,
    distance = maxDistance;
  for (const n of w.graph.nodes) {
    if (!connected.has(n.id)) continue;
    const d = Math.hypot(n.point[0] - point[0], n.point[1] - point[1]);
    if (d <= distance) {
      best = n;
      distance = d;
    }
  }
  return best;
}

function planner(
  w: World,
  start: string,
  end: string,
  o: Omit<RouteOptions, "preference">,
) {
  const adjacency = new Map<string, GraphEdge[]>();
  const shade = new Map<string, number>();
  const shadedAt = createShadeTester(w, o.environment);
  const nodeIds = new Set(w.graph.nodes.map((n) => n.id));
  for (const e of w.graph.edges) {
    if (
      !nodeIds.has(e.from) ||
      !nodeIds.has(e.to) ||
      e.distance <= 0 ||
      !Number.isFinite(e.distance) ||
      (o.avoidStairs && e.stairs) ||
      (e.indoor === "hypothetical" && !o.allowHypothetical)
    )
      continue;
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from)!.push(e);
    if (e.bidirectional) {
      if (!adjacency.has(e.to)) adjacency.set(e.to, []);
      adjacency
        .get(e.to)!
        .push({
          ...e,
          from: e.to,
          to: e.from,
          points: [...e.points].reverse(),
        });
    }
  }
  function edgeShade(e: GraphEdge) {
    if (!shade.has(e.id)) {
      const samples = samplePolyline(
        e.points,
        Math.max(1, Math.min(32, Math.ceil(e.distance / 15))),
      );
      shade.set(
        e.id,
        e.covered || e.indoor !== "no"
          ? 1
          : samples.filter(shadedAt).length / Math.max(1, samples.length),
      );
    }
    return shade.get(e.id)!;
  }
  function solve(pref: RoutePreference): GraphEdge[] | null {
    if (start === end || !nodeIds.has(start) || !nodeIds.has(end)) return null;
    const d = new Map([[start, 0]]),
      prev = new Map<string, GraphEdge>();
    const queue = new MinQueue();
    queue.push({ id: start, cost: 0 });
    for (let item = queue.pop(); item; item = queue.pop()) {
      if (item.cost !== d.get(item.id)) continue;
      if (item.id === end) break;
      for (const e of adjacency.get(item.id) || []) {
        const multiplier =
          pref === "shade"
            ? 1 + (1 - edgeShade(e)) * 2
            : pref === "indoors"
              ? e.indoor === "no"
                ? 4
                : 1
              : pref === "scenic"
                ? 1 + (1 - e.scenic) * 2
                : 1;
        const cost = item.cost + e.distance * multiplier;
        if (cost < (d.get(e.to) ?? Infinity)) {
          d.set(e.to, cost);
          prev.set(e.to, e);
          queue.push({ id: e.to, cost });
        }
      }
    }
    if (!prev.has(end)) return null;
    const edges: GraphEdge[] = [];
    for (let id = end; id !== start;) {
      const e = prev.get(id);
      if (!e) return null;
      edges.push(e);
      id = e.from;
    }
    return edges.reverse();
  }
  const quick = solve("quickest");
  const length = (edges: GraphEdge[]) =>
    edges.reduce((sum, e) => sum + e.distance, 0);
  return (preference: RoutePreference): RouteResult | null => {
    if (!quick) return null;
    let edges = preference === "quickest" ? quick : solve(preference) || quick;
    const warnings: string[] = [];
    if (length(edges) > length(quick) * o.maxDetour) {
      edges = quick;
      warnings.push(
        "Preferred alternative exceeded your detour budget; showing the quickest connected route.",
      );
    }
    const distance = length(edges);
    return {
      id: crypto.randomUUID(),
      preference,
      edges,
      distance,
      points: edges.flatMap((e, i) => (i ? e.points.slice(1) : e.points)),
      durationMinutes: distance / 78,
      shadeFraction:
        edges.reduce((s, e) => s + e.distance * edgeShade(e), 0) / distance,
      indoorFraction:
        edges.reduce((s, e) => s + (e.indoor !== "no" ? e.distance : 0), 0) /
        distance,
      hypothetical: edges.some((e) => e.indoor === "hypothetical"),
      directions: walkingDirections(edges),
      warnings,
    };
  };
}

export function route(
  w: World,
  start: string,
  end: string,
  o: RouteOptions,
): RouteResult | null {
  return planner(w, start, end, o)(o.preference);
}

/** Compare all preferences with one graph, quickest route and shade cache. */
export function compareRoutes(
  w: World,
  start: string,
  end: string,
  o: Omit<RouteOptions, "preference">,
) {
  const plan = planner(w, start, end, o);
  return Object.fromEntries(
    routePreferences.map((p) => [p, plan(p)]),
  ) as Record<RoutePreference, RouteResult | null>;
}

export function walkingDirections(edges: GraphEdge[]) {
  const directions: RouteResult["directions"] = [];
  edges.forEach((e, i) => {
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
      if (
        Math.abs(angle) <= 35 &&
        edges[i - 1].name === e.name &&
        edges[i - 1].indoor === e.indoor
      ) {
        directions.at(-1)!.distance += e.distance;
        return;
      }
      instruction =
        Math.abs(angle) > 150
          ? "Turn around onto"
          : angle > 35
            ? "Turn right onto"
            : angle < -35
              ? "Turn left onto"
              : "Continue along";
    }
    directions.push({
      text: `${instruction} ${e.name}`,
      distance: e.distance,
      point: e.points[0],
    });
  });
  return directions;
}
