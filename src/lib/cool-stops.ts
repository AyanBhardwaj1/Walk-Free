import type { Environment, World } from "../../shared/types.js";
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
