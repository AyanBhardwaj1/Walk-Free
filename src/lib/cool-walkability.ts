import type { Environment, World } from "../../shared/types.js";
import { planRoutes } from "./routing.js";

/** Walking speed used for minutes, as in route cards (m/min). */
const WALK_M_PER_MIN = 78;
const MIN_PAIR_M = 250;
const MAX_PAIR_M = 1000;

/** A small seeded random generator, so every visit samples the same walks. */
function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Start and end nodes for up to `count` typical walks (250 m – 1 km apart). */
export function samplePairs(w: World, count: number): [string, string][] {
  const linked = new Set(w.graph.edges.flatMap((e) => [e.from, e.to]));
  const nodes = w.graph.nodes.filter((n) => linked.has(n.id));
  if (nodes.length < 2) return [];
  const random = seeded(w.id);
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (let tries = 0; tries < count * 40 && pairs.length < count; tries++) {
    const a = nodes[Math.floor(random() * nodes.length)];
    const b = nodes[Math.floor(random() * nodes.length)];
    const d = Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1]);
    const key = `${a.id}|${b.id}`;
    if (a === b || d < MIN_PAIR_M || d > MAX_PAIR_M || seen.has(key)) continue;
    seen.add(key);
    pairs.push([a.id, b.id]);
  }
  return pairs;
}

export interface CoolWalkability {
  /** Walks compared. */
  walks: number;
  /** Shaded share of the distance on quickest and on shade routes, 0-1. */
  quickShare: number;
  shadeShare: number;
  /** How much longer shade routes are, as a fraction of quickest. */
  extraDistance: number;
  /** Minutes in the sun avoided per walk, on average. */
  sunMinutesSaved: number;
  /** Share of the sun on quickest walks that shade routing avoids, 0-100. */
  score: number;
}

/**
 * How much shade routing helps here (CoolWalks-style), from a fixed sample
 * of walks at the given hour. Yields between walks so the page stays
 * responsive, and stops when `signal` aborts.
 */
export async function coolWalkability(
  w: World,
  env: Environment,
  {
    pairs = 24,
    sunAversion,
    signal,
  }: { pairs?: number; sunAversion?: number; signal?: AbortSignal } = {},
): Promise<CoolWalkability | null> {
  let walks = 0,
    quickD = 0,
    quickSun = 0,
    shadeD = 0,
    shadeSun = 0;
  for (const [a, b] of samplePairs(w, pairs)) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const r = planRoutes(
      w,
      a,
      b,
      {
        avoidStairs: false,
        allowHypothetical: false,
        maxDetour: 1.8,
        environment: env,
        sunAversion,
      },
      ["quickest", "shade"] as const,
    );
    if (!r.quickest || !r.shade) continue;
    walks++;
    quickD += r.quickest.distance;
    quickSun += r.quickest.distance * (1 - r.quickest.shadeFraction);
    shadeD += r.shade.distance;
    shadeSun += r.shade.distance * (1 - r.shade.shadeFraction);
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!walks) return null;
  const saved = Math.max(0, quickSun - shadeSun);
  return {
    walks,
    quickShare: 1 - quickSun / quickD,
    shadeShare: 1 - shadeSun / shadeD,
    extraDistance: shadeD / quickD - 1,
    sunMinutesSaved: saved / WALK_M_PER_MIN / walks,
    score: quickSun > 0 ? Math.round((100 * saved) / quickSun) : 0,
  };
}
