import type { World } from "../../../shared/types.js";
import { isOpen, parseOpeningHours } from "../opening-hours.js";

/**
 * Id prefixes ("indoor:<building>:", as place.ts tags every node and edge
 * of an interior) of the interiors closed at this time, by their opening
 * hours. Unknown or unreadable hours count as open, as before hours were
 * known. Kept apart from place.ts so routing doesn't load the plan tracer.
 */
export function closedInteriors(world: World, iso: string): string[] {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return [];
  return (world.indoor ?? []).flatMap((i) => {
    const week = parseOpeningHours(i.hours);
    return week && !isOpen(week, at, world.timezone)
      ? [`indoor:${i.buildingId}:`]
      : [];
  });
}
