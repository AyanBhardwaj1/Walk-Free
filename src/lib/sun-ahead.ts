import { baseEdgeId } from "./walk-location.js";

/** A stretch counts as shaded at half shade or more. */
const SHADED = 0.5;
const WALK_M_PER_MIN = 78;
/** Shade or sun shorter than this along the walk isn't announced, m. */
const MIN_RUN_M = 20;

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
  if (!stretches.some((k) => k.shade !== undefined)) return null;
  // Runs of shade and sun along the walk. Stretches without a reading
  // still count toward distance (so "in 80 m" is measured along the real
  // walk) but don't decide shade or sun.
  const runs: { shaded: boolean; length: number }[] = [];
  let lead = 0,
    sun = 0,
    total = 0;
  for (const k of stretches) {
    total += k.distance;
    if (k.shade === undefined) {
      if (runs.length) runs[runs.length - 1].length += k.distance;
      else lead += k.distance;
      continue;
    }
    sun += k.distance * (1 - k.shade);
    const shaded = k.shade >= SHADED;
    const last = runs[runs.length - 1];
    if (last && last.shaded === shaded) last.length += k.distance;
    else runs.push({ shaded, length: k.distance + (runs.length ? 0 : lead) });
  }
  // A few metres of shade (or sun) is noise, not a change worth announcing:
  // fold runs shorter than MIN_RUN_M into their neighbours.
  for (let i = 0; runs.length > 1 && i < runs.length;) {
    if (runs[i].length >= MIN_RUN_M) {
      i++;
      continue;
    }
    const into = i > 0 ? i - 1 : i + 1;
    runs[into].length += runs[i].length;
    runs.splice(i, 1);
    // Neighbours of the same kind are now one run.
    for (let j = 1; j < runs.length; j++)
      if (runs[j].shaded === runs[j - 1].shaded) {
        runs[j - 1].length += runs[j].length;
        runs.splice(j--, 1);
      }
    i = 0;
  }
  const inShade = runs[0].shaded;
  const changeAt = runs.length > 1 ? runs[0].length : null;
  return {
    inShade,
    /** In shade: metres of shade left before the next sunny stretch. */
    shadeForM: inShade ? Math.round(changeAt ?? total) : null,
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
