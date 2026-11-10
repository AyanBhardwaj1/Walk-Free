import type {
  Environment,
  Point,
  RouteResult,
  World,
} from "../../shared/types.js";
import { createShadeTester } from "./environment.js";

/** Sidewalks run about this far either side of a street's centre line,
 * when the map doesn't say how wide the street is. */
const SIDE_M = 5;
/** A sidewalk's middle sits this far past the kerb. */
const KERB_M = 1.5;
/** Test a point every this many metres along a street. */
const STEP_M = 8;
/** A side counts as shadier when it's this much more shaded. */
const MARGIN = 0.25;

export interface SideHint {
  side: "left" | "right";
  /** Shaded share of each side along the step, 0 to 1. */
  left: number;
  right: number;
}

/**
 * Which side of the street to walk on, step by step: for each direction
 * of a route, the streets' two sidewalks are tested for shade at the hour
 * of the walk, and the clearly shadier side is named. Paths through parks
 * and indoor or covered stretches have no sides and are skipped.
 */
export function shadySides(
  route: RouteResult,
  world: World,
  env: Environment,
): (SideHint | null)[] {
  const shaded = createShadeTester(world, env);
  // Street widths by name, from the drawn roads, so an avenue's sidewalks
  // are tested where they are rather than in its traffic lanes.
  const widths = new Map<string, number>();
  // Unnamed roads all share a generic name; their widths say nothing
  // about each other.
  const generic = new Set(["Street", "Footpath", "Path", "Road", ""]);
  for (const r of world.roads)
    if (r.kind === "road" && !generic.has(r.name))
      widths.set(r.name, Math.max(widths.get(r.name) ?? 0, r.width));
  // Which direction each edge belongs to: directions merge edges in order.
  const owner: number[] = [];
  let d = 0,
    done = 0;
  for (const e of route.edges) {
    while (
      d < route.directions.length - 1 &&
      done >= route.directions[d].distance - 0.5
    ) {
      done -= route.directions[d].distance;
      d++;
    }
    owner.push(d);
    done += e.distance;
  }
  const tally = route.directions.map(() => ({ l: 0, r: 0, n: 0 }));
  route.edges.forEach((e, i) => {
    const streetLike =
      e.roadClass === "street" ||
      e.roadClass === "major" ||
      e.roadClass === "service";
    if (!streetLike || e.covered || e.indoor !== "no") return;
    const t = tally[owner[i]];
    const w = widths.get(e.name);
    const off = w ? Math.min(14, Math.max(4, w / 2 + KERB_M)) : SIDE_M;
    for (let k = 1; k < e.points.length; k++) {
      const a = e.points[k - 1],
        b = e.points[k];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) continue;
      const ux = (b[0] - a[0]) / len,
        uz = (b[1] - a[1]) / len;
      // Facing (ux, uz) on a map whose z runs south, the left hand points
      // to (uz, -ux).
      const lx = uz,
        lz = -ux;
      for (let s = STEP_M / 2; s < len; s += STEP_M) {
        const p: Point = [a[0] + ux * s, a[1] + uz * s];
        t.n++;
        if (shaded([p[0] + lx * off, p[1] + lz * off])) t.l++;
        if (shaded([p[0] - lx * off, p[1] - lz * off])) t.r++;
      }
    }
  });
  return tally.map(({ l, r, n }) => {
    if (n < 3) return null;
    const left = l / n,
      right = r / n;
    if (Math.abs(left - right) < MARGIN) return null;
    return { side: left > right ? "left" : "right", left, right };
  });
}
