import type { Environment, Point, World } from "../../shared/types.js";
import { COOL_STOPS, COOL_STOP_HOURS } from "../../shared/cool-stops.js";
import { prebuiltAreaFor } from "../../shared/areas.js";
import { nearestWalkNode } from "./routing.js";
import { localHour } from "./heat.js";

/** A building's door is not mapped, so use the nearest path within this. */
const ENTRANCE_SEARCH_M = 150;
const cache = new WeakMap<World, { nodeId: string; name: string }[]>();

/** Cool stops in this area with the path node nearest each building. */
export function coolStopNodes(world: World) {
  const known = cache.get(world);
  if (known) return known;
  const area = prebuiltAreaFor(
    world.origin.lat,
    world.origin.lon,
    world.extent / 2,
  );
  const stops = (area ? (COOL_STOPS[area.slug] ?? []) : []).flatMap((stop) => {
    const building = world.objects.find(
      (o) => o.kind !== "tree" && o.name === stop.building,
    );
    const node =
      building && nearestWalkNode(world, building.position, ENTRANCE_SEARCH_M);
    return node ? [{ nodeId: node.id, name: stop.building }] : [];
  });
  cache.set(world, stops);
  return stops;
}

/** Cool stops offered for this moment: only in daytime, hours unverified. */
export function openCoolStops(world: World, env: Environment) {
  const hour = localHour(env.dateTime, world.timezone);
  return hour >= COOL_STOP_HOURS[0] && hour < COOL_STOP_HOURS[1]
    ? coolStopNodes(world)
    : [];
}

/** The cool stop a walk committed to when it began, and whether it was reached. */
export interface WalkStop {
  name: string | null;
  reached: boolean;
}

/**
 * Stops a route may detour through. While walking, only the stop chosen at
 * the start, and none once it is reached: re-choosing on every GPS fix
 * would send the walker back to a stop already passed.
 */
export function walkCoolStops<S extends { name: string }>(
  stops: S[],
  walk: WalkStop | null,
): S[] {
  if (!walk) return stops;
  if (!walk.name || walk.reached) return [];
  return stops.filter((s) => s.name === walk.name);
}

/** Within this distance of a stop's path point, the walker has been there. */
const STOP_REACHED_M = 35;

export function reachedCoolStop(
  world: World,
  stops: { nodeId: string; name: string }[],
  name: string | null,
  position: Point,
) {
  const stop = name && stops.find((s) => s.name === name);
  const node = stop && world.graph.nodes.find((n) => n.id === stop.nodeId);
  return (
    !!node &&
    Math.hypot(node.point[0] - position[0], node.point[1] - position[1]) <=
      STOP_REACHED_M
  );
}
