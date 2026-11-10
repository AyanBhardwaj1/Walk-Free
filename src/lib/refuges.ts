import type { Environment, Point, World } from "../../shared/types.js";
import type { PlaceHeat } from "./heat.js";
import { openCoolStops } from "./cool-stops.js";
import { placeHeat } from "./heat.js";
import { nearestWalkNode } from "./routing.js";
import { hoursStatus } from "./opening-hours.js";
import { localHour } from "./heat.js";
import { COOL_STOP_HOURS } from "../../shared/cool-stops.js";

/** Walking speed used for minutes, as in route cards (m/min). */
const WALK_M_PER_MIN = 78;
/** Older people and children, as Barcelona's climate-shelter analysis
 * assumes: 3.28 km/h. */
export const SLOW_WALK_M_PER_MIN = 3280 / 60;
/** A park this shaded at the hour counts as a refuge, like Barcelona's. */
const SHADED_PARK = 0.5;
/** How far a refuge may sit from the nearest mapped path. */
const ENTRANCE_M = 120;
/** Streets this close to the map's edge aren't reported as gaps. */
const GAP_EDGE_M = 200;
/** "Within reach": Barcelona aims for a shelter within a 10-minute walk. */
export const REACH_MINUTES = [5, 10] as const;

export interface Refuge {
  name: string;
  kind: "cool-stop" | "shelter" | "shaded-park" | "indoors";
  nodeId: string;
  point: Point;
}

/**
 * Places to get out of the heat: air-conditioned cool stops (curated per
 * campus, during their usual hours), buildings with a mapped inside that
 * are open (by their hours, or in the daytime when those aren't known),
 * mapped shade shelters, and parks that are mostly shaded at this hour,
 * each with the path point nearest it (a building's: its mapped door).
 */
export function findRefuges(
  world: World,
  env: Environment,
  /** The area's ranked places, when already worked out for this hour. */
  places: PlaceHeat[] = placeHeat(world, env),
): Refuge[] {
  const point = new Map(world.graph.nodes.map((n) => [n.id, n.point]));
  const refuges: Refuge[] = openCoolStops(world, env).map((s) => ({
    name: s.name,
    kind: "cool-stop",
    nodeId: s.nodeId,
    point: point.get(s.nodeId) ?? [0, 0],
  }));
  const hour = localHour(env.dateTime, world.timezone);
  const daytime = hour >= COOL_STOP_HOURS[0] && hour < COOL_STOP_HOURS[1];
  for (const inside of world.indoor ?? []) {
    if (refuges.some((r) => r.name === inside.buildingName)) continue;
    const status = hoursStatus(
      inside.hours,
      new Date(env.dateTime),
      world.timezone,
    );
    if (status ? !status.open : !daytime) continue;
    // The outdoor end of a doorway into it.
    const tag = `indoor:${inside.buildingId}:`;
    const door = world.graph.edges.find(
      (e) => e.id.startsWith(tag) && e.indoor === "no",
    );
    const outside =
      door && [door.from, door.to].find((id) => !id.startsWith(tag));
    if (!outside || !point.has(outside)) continue;
    // The same building under another name, already a cool stop: once.
    const at = point.get(outside)!;
    if (
      refuges.some(
        (r) => Math.hypot(r.point[0] - at[0], r.point[1] - at[1]) < 25,
      )
    )
      continue;
    refuges.push({
      name: inside.buildingName,
      kind: "indoors",
      nodeId: outside,
      point: point.get(outside)!,
    });
  }
  for (const a of world.amenities ?? []) {
    if (a.kind !== "shelter") continue;
    const node = nearestWalkNode(world, a.position, ENTRANCE_M);
    if (node)
      refuges.push({
        name: a.name || "Shade shelter",
        kind: "shelter",
        nodeId: node.id,
        point: node.point,
      });
  }
  for (const p of places) {
    if (p.kind !== "park" || p.shade < SHADED_PARK) continue;
    const node = nearestWalkNode(world, p.center, ENTRANCE_M);
    if (node)
      refuges.push({
        name: p.name,
        kind: "shaded-park",
        nodeId: node.id,
        point: node.point,
      });
  }
  return refuges;
}

export interface RefugeCoverage {
  refuges: Refuge[];
  /** Walking minutes from each path to the nearest refuge. */
  minutes: Map<string, number>;
  /** Share of path length within 5 and 10 minutes of a refuge, 0-1. */
  within: [number, number];
  /** The named streets farthest from any refuge: where one would help. */
  gaps: { street: string; minutes: number; point: Point }[];
}

/**
 * Walking time from every path to the nearest refuge (a multi-source
 * shortest-path search over the walking network), the share of the network
 * within 5 and 10 minutes, and the worst-served streets.
 */
export function refugeCoverage(
  world: World,
  refuges: Refuge[],
  /** Walking pace for the minutes, m/min (the usual adult pace by default;
   * SLOW_WALK_M_PER_MIN for older people and children). */
  pace = WALK_M_PER_MIN,
): RefugeCoverage | null {
  if (!refuges.length || !world.graph.edges.length) return null;
  const links = new Map<string, { to: string; m: number }[]>();
  const link = (a: string, b: string, m: number) =>
    links.set(a, [...(links.get(a) ?? []), { to: b, m }]);
  for (const e of world.graph.edges) {
    link(e.from, e.to, e.distance);
    link(e.to, e.from, e.distance);
  }
  // Dijkstra from every refuge at once, on a small binary heap.
  const dist = new Map<string, number>();
  const heap: [number, string][] = [];
  const push = (d: number, id: string) => {
    heap.push([d, id]);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const r of refuges) {
    dist.set(r.nodeId, 0);
    push(0, r.nodeId);
  }
  while (heap.length) {
    const [d, id] = pop();
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const { to, m } of links.get(id) ?? []) {
      const next = d + m;
      if (next < (dist.get(to) ?? Infinity)) {
        dist.set(to, next);
        push(next, to);
      }
    }
  }
  const minutes = new Map<string, number>();
  let total = 0;
  const near = [0, 0];
  const streets = new Map<string, { minutes: number; point: Point }>();
  // Refuges past the map's edge aren't known, so its rim isn't a gap.
  const rim = world.extent / 2 - GAP_EDGE_M;
  const inside = (p: Point) =>
    rim <= 0 || (Math.abs(p[0]) <= rim && Math.abs(p[1]) <= rim);
  for (const e of world.graph.edges) {
    const a = dist.get(e.from) ?? Infinity,
      b = dist.get(e.to) ?? Infinity;
    // The middle of the path: half its length from the nearer end.
    const m = (Math.min(a, b) + e.distance / 2) / pace;
    if (!Number.isFinite(m)) continue;
    minutes.set(e.id, m);
    total += e.distance;
    REACH_MINUTES.forEach((limit, i) => {
      if (m <= limit) near[i] += e.distance;
    });
    const mid = e.points[Math.floor(e.points.length / 2)];
    if (
      /^(Footpath|Street|Path|Green space)$/.test(e.name) ||
      /interstate|freeway|expressway|highway/i.test(e.name) ||
      !inside(mid)
    )
      continue;
    const worst = streets.get(e.name);
    if (!worst || m > worst.minutes)
      streets.set(e.name, { minutes: m, point: mid });
  }
  if (!total) return null;
  return {
    refuges,
    minutes,
    within: [near[0] / total, near[1] / total],
    gaps: [...streets]
      .map(([street, s]) => ({ street, ...s }))
      .filter((g) => g.minutes > REACH_MINUTES[0])
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 3),
  };
}

/** Green within 5 minutes, amber to 10, red past it. */
export function refugeColor(minutes: number) {
  if (minutes <= REACH_MINUTES[0]) return "#4f8a6b";
  if (minutes <= REACH_MINUTES[1]) return "#d9a441";
  return "#c4553a";
}
