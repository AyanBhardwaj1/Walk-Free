import type { Environment, GraphEdge, World } from "../../shared/types.js";
import { planRoutes } from "./routing.js";
import { samplePairs } from "./cool-walkability.js";
import { createShadeTester } from "./environment.js";
import { edgeShadeFraction } from "./heat.js";
import { plantShadeRow } from "./planting.js";
import { baseEdgeId } from "./walk-location.js";

/** Walking speed used for minutes, as in route cards (m/min). */
const WALK_M_PER_MIN = 78;
/** As in the heat ranking: the map's rim, and streets shorter than this. */
const EDGE_BAND_M = 60;
const MIN_STREET_M = 60;
/** Unnamed paths can't be named in a proposal, so they aren't ranked. */
const GENERIC = new Set(["Footpath", "Street", "Path", "Green space"]);
/** Roads people don't walk along, even when a route crosses them. */
const NOT_FOR_WALKING = /interstate|freeway|expressway|highway|\bI-\d/i;

export interface TreePriority {
  street: string;
  /** Every path of the street, to highlight and to plant. */
  edgeIds: string[];
  /** Share of the sampled walks that use this street, 0-1. */
  walkShare: number;
  /** Shaded share of the walked metres now and after planting, 0-1. */
  shadeNow: number;
  shadeAfter: number;
  /** Trees a row along the whole street would take. */
  trees: number;
  /** Minutes in full sun the planting saves per 100 walks across the area. */
  sunMinutesSavedPer100: number;
}

export interface TreePlan {
  /** Typical walks sampled (quickest routes between paths 250 m – 1 km apart). */
  walks: number;
  streets: TreePriority[];
}

/**
 * Where new street trees would keep the most walkers out of the sun: samples
 * typical walks across the area, finds the sunny streets they share, plants
 * a trial row on the leading candidates and ranks them by sun avoided per
 * walk (metres walked × shade gained), like a cool-corridor plan.
 * Yields between steps so the page stays responsive.
 */
export async function treePriorities(
  w: World,
  env: Environment,
  {
    pairs = 60,
    top = 5,
    signal,
  }: { pairs?: number; top?: number; signal?: AbortSignal } = {},
): Promise<TreePlan | null> {
  const pause = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };
  const shadedAt = createShadeTester(w, env);
  const byId = new Map(w.graph.edges.map((e) => [e.id, e]));
  // The same streets the heat ranking names: past the map's edge nothing
  // casts shade, and short stubs aren't streets.
  const reach = w.extent / 2 - EDGE_BAND_M;
  const inArea = (e: GraphEdge) => {
    const p = e.points[Math.floor(e.points.length / 2)];
    return reach <= 0 || (Math.abs(p[0]) <= reach && Math.abs(p[1]) <= reach);
  };
  const streetLength = new Map<string, number>();
  for (const e of w.graph.edges)
    if (plantable(e) && inArea(e))
      streetLength.set(e.name, (streetLength.get(e.name) ?? 0) + e.distance);
  // Metres walked on each path, and by how many walks, per street.
  const streets = new Map<
    string,
    { walked: Map<string, number>; walks: number }
  >();
  let walks = 0;
  for (const [a, b] of samplePairs(w, pairs)) {
    await pause();
    const quick = planRoutes(
      w,
      a,
      b,
      {
        avoidStairs: false,
        allowHypothetical: false,
        maxDetour: 1.8,
        environment: env,
      },
      ["quickest"] as const,
    ).quickest;
    if (!quick) continue;
    walks++;
    const seen = new Set<string>();
    for (const part of quick.edges) {
      const edge = byId.get(baseEdgeId(part.id)) ?? part;
      if (
        !plantable(edge) ||
        !inArea(edge) ||
        (streetLength.get(edge.name) ?? 0) < MIN_STREET_M
      )
        continue;
      const s = streets.get(edge.name) ?? { walked: new Map(), walks: 0 };
      s.walked.set(edge.id, (s.walked.get(edge.id) ?? 0) + part.distance);
      if (!seen.has(edge.name)) s.walks++;
      seen.add(edge.name);
      streets.set(edge.name, s);
    }
  }
  if (!walks) return null;
  const shadeOf = (tester: (p: [number, number]) => boolean, id: string) => {
    const e = byId.get(id);
    return e ? edgeShadeFraction(e, tester) : 1;
  };
  // Sun metres walked on each street now; the sunniest busy ones go on.
  const candidates = [...streets]
    .map(([name, s]) => {
      let metres = 0,
        sun = 0;
      for (const [id, m] of s.walked) {
        metres += m;
        sun += m * (1 - shadeOf(shadedAt, id));
      }
      return { name, ...s, metres, sun };
    })
    .filter((c) => c.sun > 0)
    .sort((a, b) => b.sun - a.sun)
    .slice(0, top * 2);
  const ranked: TreePriority[] = [];
  for (const c of candidates) {
    await pause();
    const first = [...c.walked.keys()][0];
    const planted = plantShadeRow(w, first);
    if (!planted) continue;
    const after = createShadeTester(planted.world, env);
    let sunAfter = 0;
    for (const [id, m] of c.walked) sunAfter += m * (1 - shadeOf(after, id));
    const saved = Math.max(0, c.sun - sunAfter);
    if (saved <= 0) continue;
    ranked.push({
      street: c.name,
      edgeIds: planted.edgeIds,
      walkShare: c.walks / walks,
      shadeNow: 1 - c.sun / c.metres,
      shadeAfter: 1 - sunAfter / c.metres,
      trees: planted.planted,
      sunMinutesSavedPer100: (saved / walks / WALK_M_PER_MIN) * 100,
    });
  }
  ranked.sort((a, b) => b.sunMinutesSavedPer100 - a.sunMinutesSavedPer100);
  return { walks, streets: ranked.slice(0, top) };
}

function plantable(e: GraphEdge) {
  return (
    !GENERIC.has(e.name) &&
    !NOT_FOR_WALKING.test(e.name) &&
    !e.covered &&
    e.indoor === "no"
  );
}
