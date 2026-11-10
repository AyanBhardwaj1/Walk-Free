import type { Environment, World } from "../../../shared/types.js";
import { toLocal } from "../geo.js";
import { heatConditions } from "../heat.js";
import { nearestWalkNode, planRoutes } from "../routing.js";

/** A place a routine starts or ends, as walk-log places are. */
interface At {
  lat: number;
  lon: number;
}

export interface TripHeat {
  /** Feels-like at the hour of the walk, in the shade and in the sun. */
  shadeFeelsC: number;
  sunFeelsC: number;
  quickest: { minutes: number; sunMinutes: number };
  /** The More shade route, when it differs from the quickest. */
  shade: { minutes: number; sunMinutes: number } | null;
}

/** Places this far from any path (a mapped building's middle) still count. */
const REACH_M = 150;

/**
 * The heat of a routine walk at the hour it will be walked: how hot it
 * will feel, and how many minutes of direct sun the quickest and the More
 * shade route each have. `env` is the weather at that hour.
 */
export function tripHeat(
  world: World,
  from: At,
  to: At,
  env: Environment,
): TripHeat | null {
  const a = nearestWalkNode(
      world,
      toLocal(from.lat, from.lon, world.origin),
      REACH_M,
    ),
    b = nearestWalkNode(world, toLocal(to.lat, to.lon, world.origin), REACH_M);
  if (!a || !b || a.id === b.id) return null;
  const plans = planRoutes(
    world,
    a.id,
    b.id,
    {
      avoidStairs: false,
      allowHypothetical: false,
      maxDetour: 1.5,
      environment: env,
    },
    ["quickest", "shade"] as const,
  );
  const quick = plans.quickest;
  if (!quick) return null;
  const sunMin = (r: NonNullable<typeof quick>) =>
    r.durationMinutes * (1 - r.shadeFraction);
  const shade = plans.shade;
  const c = heatConditions(env, world.origin);
  return {
    shadeFeelsC: c.shadeFeelsC,
    sunFeelsC: c.shadeFeelsC + c.sunBoostC,
    quickest: { minutes: quick.durationMinutes, sunMinutes: sunMin(quick) },
    shade:
      shade &&
      shade.edges.map((e) => e.id).join() !==
        quick.edges.map((e) => e.id).join()
        ? { minutes: shade.durationMinutes, sunMinutes: sunMin(shade) }
        : null,
  };
}

/** One line of advice for the walk, or null when there's nothing to add. */
export function tripAdvice(
  h: TripHeat,
  formatTemp: (c: number) => string,
): string | null {
  const hot = h.sunFeelsC >= 30;
  const saves = h.shade ? h.quickest.sunMinutes - h.shade.sunMinutes : 0;
  if (h.shade && saves >= 2 && (hot || saves >= 4)) {
    const extra = Math.max(0, Math.round(h.shade.minutes - h.quickest.minutes));
    return `It'll feel like ${formatTemp(h.sunFeelsC)} in the sun. The More shade route has ${Math.round(h.shade.sunMinutes)} min in sun instead of ${Math.round(h.quickest.sunMinutes)}${extra ? `, for ${extra} min more` : ", for no extra time"}.`;
  }
  if (hot)
    return `It'll feel like ${formatTemp(h.sunFeelsC)} in the sun, with ${Math.round(h.quickest.sunMinutes)} min of the walk in sun.`;
  return null;
}
