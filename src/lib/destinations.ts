import { BUILDING_ALIASES, searchVariants } from "../../shared/aliases.js";
import type {
  GraphNode,
  Point,
  RouteOptions,
  World,
} from "../../shared/types.js";

export type WalkConstraints = Pick<
  RouteOptions,
  "avoidStairs" | "allowHypothetical"
>;
export const publicWalk: WalkConstraints = {
  avoidStairs: false,
  allowHypothetical: false,
};
export function walkEdges(world: World, options: WalkConstraints) {
  return world.graph.edges.filter(
    (e) =>
      (!options.avoidStairs || !e.stairs) &&
      (options.allowHypothetical || e.indoor !== "hypothetical"),
  );
}

/** Choose endpoints that are connected in the direction of travel, near the scene center. */
export function defaultEndpoints(
  world: World,
  options = publicWalk,
): [string, string] {
  const nodes = new Map(world.graph.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>(),
    undirected = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, from: string, to: string) => {
    if (!map.has(from)) map.set(from, []);
    map.get(from)!.push(to);
  };
  for (const e of walkEdges(world, options)) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    add(adjacency, e.from, e.to);
    if (e.bidirectional) add(adjacency, e.to, e.from);
    add(undirected, e.from, e.to);
    add(undirected, e.to, e.from);
  }
  const seen = new Set<string>();
  let largest: string[] = [];
  for (const id of undirected.keys()) {
    if (seen.has(id)) continue;
    const component = [id];
    seen.add(id);
    for (let i = 0; i < component.length; i++) {
      for (const next of undirected.get(component[i]) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          component.push(next);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const candidates = largest.filter((id) => adjacency.has(id));
  if (!candidates.length) return ["", ""];
  const start = candidates.reduce((a, b) =>
    Math.hypot(...nodes.get(a)!.point) <= Math.hypot(...nodes.get(b)!.point)
      ? a
      : b,
  );
  const reachable = [start],
    reached = new Set([start]);
  for (let i = 0; i < reachable.length; i++) {
    for (const next of adjacency.get(reachable[i]) || []) {
      if (!reached.has(next)) {
        reached.add(next);
        reachable.push(next);
      }
    }
  }
  const origin = nodes.get(start)!.point;
  const distance = (id: string) =>
    Math.hypot(
      nodes.get(id)!.point[0] - origin[0],
      nodes.get(id)!.point[1] - origin[1],
    );
  const end = reachable.reduce((a, b) => (distance(a) >= distance(b) ? a : b));
  return [start, end];
}

export interface Destination {
  id: string;
  label: string;
  detail: string;
  search: string;
}
const meaningfulName = (s: string) =>
  !["Street", "Footpath", "Building", "Mapped tree"].includes(s);
function locationLabel(point: Point) {
  return `${Math.round(Math.abs(point[0]))} m ${point[0] < 0 ? "W" : "E"}, ${Math.round(Math.abs(point[1]))} m ${point[1] < 0 ? "N" : "S"}`;
}
/** Name every connected node, and index nearby mapped buildings without adding access links. */
export function destinationCatalog(world: World): Destination[] {
  const roads = new Map<string, Set<string>>();
  for (const e of world.graph.edges) {
    for (const id of [e.from, e.to]) {
      if (!roads.has(id)) roads.set(id, new Set());
      if (meaningfulName(e.name)) roads.get(id)!.add(e.name);
    }
  }
  const grid = new Map<string, GraphNode[]>();
  for (const n of world.graph.nodes) {
    if (!roads.has(n.id)) continue;
    const cell = `${Math.floor(n.point[0] / 80)},${Math.floor(n.point[1] / 80)}`;
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell)!.push(n);
  }
  const nearby = new Map<
    string,
    { name: string; aliases: string[]; distance: number }[]
  >();
  for (const o of world.objects) {
    if (o.kind === "tree" || !meaningfulName(o.name) || !o.name.trim())
      continue;
    const x = Math.floor(o.position[0] / 80),
      z = Math.floor(o.position[1] / 80);
    // Large buildings (stadiums, arenas) sit far from any path at their centre.
    let best: GraphNode | undefined,
      distance = Math.max(
        BUILDING_LINK_M,
        Math.max(o.width, o.depth) / 2 + BUILDING_EDGE_M,
      );
    const cells = Math.ceil(distance / 80);
    for (let dx = -cells; dx <= cells; dx++)
      for (let dz = -cells; dz <= cells; dz++) {
        for (const n of grid.get(`${x + dx},${z + dz}`) || []) {
          const d = Math.hypot(
            n.point[0] - o.position[0],
            n.point[1] - o.position[1],
          );
          if (d < distance) {
            best = n;
            distance = d;
          }
        }
      }
    if (best) {
      if (!nearby.has(best.id)) nearby.set(best.id, []);
      nearby.get(best.id)!.push({
        name: o.name,
        aliases: [...(o.aliases ?? []), ...(BUILDING_ALIASES[o.name] ?? [])],
        distance,
      });
    }
  }
  return world.graph.nodes
    .filter((n) => roads.has(n.id))
    .map((n) => {
      const places = (nearby.get(n.id) || []).sort(
        (a, b) => a.distance - b.distance,
      );
      const road = [...roads.get(n.id)!].join(" / ");
      const label =
        n.name ||
        (places.length ? `Path near ${places[0].name}` : road || "Mapped path");
      const detail = `${road && road !== label ? road + " · " : ""}${locationLabel(n.point)}`;
      return {
        id: n.id,
        label,
        detail,
        search: [
          label,
          detail,
          ...places.flatMap((p) => [p.name, ...p.aliases]),
        ]
          .join(" ")
          .toLowerCase(),
      };
    })
    .sort(
      (a, b) =>
        a.label.localeCompare(b.label) || a.detail.localeCompare(b.detail),
    );
}

/** A building's centre may sit this far from its nearest mapped path. */
const BUILDING_LINK_M = 120;
/** Extra reach beyond a building's half-width when linking it to a path. */
const BUILDING_EDGE_M = 40;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Catalog entries ranked for a query: every word (or a synonym, such as
 * hall/dormitory) must appear; exact and leading label matches rank first.
 */
export function rankDestinations(catalog: Destination[], query: string) {
  const terms = words(query);
  if (!terms.length) return [];
  const phrase = terms.join(" ");
  return catalog
    .flatMap((d) => {
      if (
        !terms.every((t) => searchVariants(t).some((v) => d.search.includes(v)))
      )
        return [];
      const label = d.label.toLowerCase();
      const score =
        (label === phrase ? 4 : 0) +
        (label.startsWith(phrase) || label.endsWith(phrase) ? 2 : 0) +
        (label.includes(phrase) ? 1 : 0) +
        (d.search.includes(phrase) ? 1 : 0);
      return [{ d, score }];
    })
    .sort((a, b) => b.score - a.score || a.d.label.length - b.d.label.length)
    .map((m) => m.d);
}

export function searchDestinations(
  catalog: Destination[],
  query: string,
  selected: string,
  limit = 60,
) {
  const matches = query.trim() ? rankDestinations(catalog, query) : catalog;
  const shown = matches.slice(0, limit);
  const current = catalog.find((n) => n.id === selected);
  if (current && !shown.some((n) => n.id === selected)) shown.unshift(current);
  return { shown, total: matches.length };
}
