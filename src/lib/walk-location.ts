import type { Point, World } from "../../shared/types.js";
import { walkEdges, type WalkConstraints } from "./destinations.js";

/** Project onto a real walkable edge. Splitting preserves its direction and access attributes. */
export function snapWalkPosition(
  world: World,
  position: Point,
  constraints: WalkConstraints,
  maxDistance = 40,
) {
  let best: {
    edge: World["graph"]["edges"][number];
    point: Point;
    segment: number;
    along: number;
    total: number;
  } | null = null;
  let distance = maxDistance;
  for (const edge of walkEdges(world, constraints)) {
    const lengths = edge.points
      .slice(1)
      .map((p, i) =>
        Math.hypot(p[0] - edge.points[i][0], p[1] - edge.points[i][1]),
      );
    const total = lengths.reduce((a, b) => a + b, 0);
    let passed = 0;
    for (let i = 0; i < lengths.length; i++) {
      const a = edge.points[i],
        b = edge.points[i + 1],
        length = lengths[i];
      if (!length) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((position[0] - a[0]) * (b[0] - a[0]) +
            (position[1] - a[1]) * (b[1] - a[1])) /
            length ** 2,
        ),
      );
      const point: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const d = Math.hypot(position[0] - point[0], position[1] - point[1]);
      if (d < distance) {
        distance = d;
        best = { edge, point, segment: i, along: passed + t * length, total };
      }
      passed += length;
    }
  }
  if (!best) return null;
  const { edge, point, segment, along, total } = best;
  if (along < 0.1)
    return { world, nodeId: edge.from, point: edge.points[0], distance };
  if (total - along < 0.1)
    return { world, nodeId: edge.to, point: edge.points.at(-1)!, distance };
  let nodeId = "walk-free:location";
  const ids = new Set(world.graph.nodes.map((n) => n.id));
  while (ids.has(nodeId)) nodeId += ":";
  const compact = (points: Point[]) =>
    points.filter(
      (p, i) =>
        i === 0 ||
        Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-8,
    );
  const first = {
    ...edge,
    id: edge.id + SPLIT_SUFFIXES[0],
    to: nodeId,
    points: compact([...edge.points.slice(0, segment + 1), point]),
    distance: (edge.distance * along) / total,
  };
  const last = {
    ...edge,
    id: edge.id + SPLIT_SUFFIXES[1],
    from: nodeId,
    points: compact([point, ...edge.points.slice(segment + 1)]),
    distance: (edge.distance * (total - along)) / total,
  };
  return {
    nodeId,
    point,
    distance,
    world: {
      ...world,
      graph: {
        nodes: [
          ...world.graph.nodes,
          { id: nodeId, point, name: "Your location on mapped path" },
        ],
        edges: [...world.graph.edges.filter((e) => e !== edge), first, last],
      },
    },
  };
}

export interface LocationFix {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}
export function usableFix(fix: LocationFix, now = Date.now()) {
  return (
    [fix.lat, fix.lon, fix.accuracy, fix.timestamp].every(Number.isFinite) &&
    Math.abs(fix.lat) <= 85 &&
    Math.abs(fix.lon) <= 180 &&
    fix.accuracy >= 0 &&
    fix.accuracy <= 50 &&
    now - fix.timestamp <= 30000 &&
    fix.timestamp <= now + 5000
  );
}
export function hasArrived(
  position: Point,
  destination: Point,
  accuracy: number,
  remaining: number | null,
) {
  return (
    accuracy <= 25 &&
    Math.hypot(position[0] - destination[0], position[1] - destination[1]) <=
      15 &&
    remaining !== null &&
    remaining <= 25
  );
}

/** Suffixes of the two halves of a path split at the walker's location. */
const SPLIT_SUFFIXES = [":location-a", ":location-b"] as const;

/** The mapped edge a (possibly split) route edge came from. */
export function baseEdgeId(id: string) {
  for (const suffix of SPLIT_SUFFIXES)
    if (id.endsWith(suffix)) return id.slice(0, -suffix.length);
  return id;
}
