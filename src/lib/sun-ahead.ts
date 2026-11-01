import { baseEdgeId } from "./walk-location.js";

/** A stretch counts as shaded at half shade or more. */
const SHADED = 0.5;
const WALK_M_PER_MIN = 78;

/**
 * What the rest of a walk holds for sun: whether the walker is in shade
 * now, how far the shade lasts or how far until the next shade, and the
 * minutes still to walk in the sun. Stretches without a reading are skipped.
 */
export function sunAhead(
  edges: { id: string; distance: number }[],
  reading: (edgeId: string) => { shade: number } | undefined,
) {
  const known = edges.flatMap((e) => {
    const r = reading(baseEdgeId(e.id));
    return r ? [{ distance: e.distance, shade: r.shade }] : [];
  });
  if (!known.length) return null;
  const inShade = known[0].shade >= SHADED;
  let run = 0,
    sun = 0,
    changeAt: number | null = null;
  for (const k of known) {
    sun += k.distance * (1 - k.shade);
    if (changeAt === null && k.shade >= SHADED !== inShade) changeAt = run;
    run += k.distance;
  }
  return {
    inShade,
    /** In shade: metres of shade left before the next sunny stretch. */
    shadeForM: inShade ? Math.round(changeAt ?? run) : null,
    /** In sun: metres to the next shaded stretch, or null if none. */
    shadeInM: inShade ? null : changeAt === null ? null : Math.round(changeAt),
    sunMinutesLeft: Math.round((sun / WALK_M_PER_MIN) * 10) / 10,
  };
}
