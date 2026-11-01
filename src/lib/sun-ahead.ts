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
  const stretches = edges.map((e) => ({
    distance: e.distance,
    shade: reading(baseEdgeId(e.id))?.shade,
  }));
  const first = stretches.find((k) => k.shade !== undefined);
  if (!first) return null;
  const inShade = first.shade! >= SHADED;
  // Stretches without a reading still count toward distance, so "in 80 m"
  // is measured along the real walk; they don't decide shade or sun.
  let run = 0,
    sun = 0,
    changeAt: number | null = null;
  for (const k of stretches) {
    if (k.shade !== undefined) {
      sun += k.distance * (1 - k.shade);
      if (changeAt === null && k.shade >= SHADED !== inShade) changeAt = run;
    }
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

/** A short spoken hint to add to a turn, when shade is close ahead. */
export function spokenShadeHint(ahead: ReturnType<typeof sunAhead>) {
  if (!ahead || ahead.inShade || ahead.shadeInM === null) return "";
  if (ahead.shadeInM > 300) return "";
  return ahead.shadeInM < 20
    ? " Shade just ahead."
    : ` Shade in ${Math.round(ahead.shadeInM / 10) * 10} metres.`;
}
