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
  /** Everything searchable about this point, folded (see `fold`). */
  search: string;
  /** Folded names that can match a query on their own: buildings, parks,
   * their codes and aliases (place: true), and street names. */
  keys: { text: string; place: boolean }[];
}

/**
 * Lower case without accents or punctuation, with letters and digits apart,
 * so "Perry-Castañeda", "perry castaneda" and "ISTB4"/"(ISTB) 4" all meet.
 */
export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
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
  // Named buildings, plus named parks and squares (as their middle).
  const named = [
    ...world.objects
      .filter(
        (o) => o.kind !== "tree" && meaningfulName(o.name) && o.name.trim(),
      )
      .map((o) => ({
        name: o.name,
        aliases: o.aliases ?? [],
        position: o.position,
        size: Math.max(o.width, o.depth),
      })),
    ...world.landscapes
      .filter(
        (l) => l.kind === "park" && l.name !== "Green space" && l.name.trim(),
      )
      .map((l) => {
        const xs = l.points.map((p) => p[0]),
          zs = l.points.map((p) => p[1]);
        const [minX, maxX, minZ, maxZ] = [
          Math.min(...xs),
          Math.max(...xs),
          Math.min(...zs),
          Math.max(...zs),
        ];
        return {
          name: l.name,
          aliases: [] as string[],
          position: [(minX + maxX) / 2, (minZ + maxZ) / 2] as Point,
          size: Math.max(maxX - minX, maxZ - minZ),
        };
      }),
  ];
  for (const o of named) {
    const x = Math.floor(o.position[0] / 80),
      z = Math.floor(o.position[1] / 80);
    // Large buildings (stadiums, arenas) sit far from any path at their centre.
    let best: GraphNode | undefined,
      distance = Math.max(BUILDING_LINK_M, o.size / 2 + BUILDING_EDGE_M);
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
        aliases: [...o.aliases, ...(BUILDING_ALIASES[o.name] ?? [])],
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
      const keys = [
        ...places.flatMap((p) =>
          [p.name, ...p.aliases].map((t) => ({ text: fold(t), place: true })),
        ),
        ...[...roads.get(n.id)!, ...(n.name ? [n.name] : [])].map((t) => ({
          text: fold(t),
          place: false,
        })),
      ].filter((k) => k.text);
      return {
        id: n.id,
        label,
        detail,
        search: fold(
          [
            label,
            detail,
            ...places.flatMap((p) => [p.name, ...p.aliases]),
          ].join(" "),
        ),
        keys,
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

const words = (s: string) => fold(s).split(" ").filter(Boolean);

/** How well one name matches the whole query: exact beats a prefix beats a word. */
function keyScore(key: string, phrase: string) {
  if (key === phrase) return 100;
  if (key.startsWith(phrase + " ")) return 70;
  if (key.startsWith(phrase)) return 60;
  if (key.includes(" " + phrase)) return 40;
  return key.includes(phrase) ? 20 : 0;
}

function rank(catalog: Destination[], terms: string[]) {
  const phrase = terms.join(" ");
  const seen = new Set<string>();
  return (
    catalog
      .flatMap((d) => {
        if (
          !terms.every((t) =>
            searchVariants(t).some((v) => d.search.includes(v)),
          )
        )
          return [];
        // The best name match; buildings and parks edge out streets on a tie.
        const score = Math.max(
          5,
          ...d.keys.map((k) => {
            const s = keyScore(k.text, phrase);
            return s && k.place ? s + 10 : s;
          }),
        );
        return [{ d, score }];
      })
      .sort((a, b) => b.score - a.score || a.d.label.length - b.d.label.length)
      .map((m) => m.d)
      // A street is many path points with one label; list it once.
      .filter((d) => !seen.has(d.label) && seen.add(d.label))
  );
}

/** Distinct words in the catalog's names, for typo matching. */
const vocabularies = new WeakMap<Destination[], string[]>();
function vocabulary(catalog: Destination[]) {
  let words = vocabularies.get(catalog);
  if (!words) {
    words = [
      ...new Set(
        catalog.flatMap((d) => d.keys.flatMap((k) => k.text.split(" "))),
      ),
    ].filter((w) => w.length >= 3);
    vocabularies.set(catalog, words);
  }
  return words;
}

/** True when a and b differ by at most one inserted, dropped or changed letter. */
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    a.slice(i) === b.slice(i + 1) ||
    a.slice(i + 1) === b.slice(i)
  );
}

/**
 * Catalog entries ranked for a query: every word (or a synonym, such as
 * hall/dormitory) must appear; exact names and campus codes rank first.
 * When nothing matches, a word of four or more letters may be one typo off.
 */
export function rankDestinations(catalog: Destination[], query: string) {
  const terms = words(query);
  if (!terms.length) return [];
  const found = rank(catalog, terms);
  if (found.length) return found;
  const vocab = vocabulary(catalog);
  const corrected = terms.map((t) =>
    t.length >= 4 && !vocab.includes(t)
      ? (vocab.find((w) => w[0] === t[0] && oneEdit(t, w)) ?? t)
      : t,
  );
  return corrected.join(" ") === terms.join(" ")
    ? []
    : rank(catalog, corrected);
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
