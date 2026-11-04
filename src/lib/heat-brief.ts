import type { PlaceHeat } from "./heat.js";
import { formatTemp, type TempUnit } from "./units.js";

/** Streets shorter than this are left out of the lists (stubs, crossings). */
const MIN_LENGTH_M = 100;
const LIST = 5;

export interface BriefInput {
  area: string;
  at: string;
  places: PlaceHeat[];
  /** Trees from OpenStreetMap and crowns from the canopy map, if known. */
  trees?: { mapped: number; canopy: number };
  /** A Compare walks result, if one was run for this hour. */
  walks?: {
    score: number;
    sunMinutesSaved: number;
    extraDistance: number;
    walks: number;
  };
  /** How far paths are from a cool refuge, if worked out. */
  refuges?: {
    within: [number, number];
    count: number;
    gaps: { street: string; minutes: number }[];
  } | null;
  /** The tree plan, if one was made: streets where trees help most. */
  treePlan?: {
    walks: number;
    streets: {
      street: string;
      walkShare: number;
      shadeNow: number;
      shadeAfter: number;
      trees: number;
      sunMinutesSavedPer100: number;
    }[];
  } | null;
  unit: TempUnit;
}

/**
 * A one-page, plain-text heat brief for an area at one hour, for planners:
 * the hottest and coolest walks, the trees behind the shade, and how much
 * shade routing helps. Only modeled numbers the app already shows.
 */
export function heatBrief(b: BriefInput) {
  const title = `Heat brief: ${b.area} at ${b.at}`;
  const streets = b.places.filter((p) => p.length >= MIN_LENGTH_M);
  const byHeat = [...streets].sort((x, y) => y.feelsLikeC - x.feelsLikeC);
  const line = (p: PlaceHeat, i: number) =>
    `${i + 1}. ${p.name}: about ${formatTemp(p.feelsLikeC, b.unit)}, ${Math.round(p.shade * 100)}% shaded`;
  const n = (x: number) => x.toLocaleString("en-US");
  const lines = [
    title,
    "",
    "Hottest walks:",
    ...byHeat.slice(0, LIST).map(line),
    "",
    "Coolest walks:",
    ...byHeat.slice(-LIST).reverse().map(line),
    ...(b.trees && b.trees.canopy === 0
      ? ["", `Trees: ${n(b.trees.mapped)} trees mapped in OpenStreetMap.`]
      : b.trees
        ? [
            "",
            `Trees: ${n(b.trees.mapped)} trees mapped in OpenStreetMap, and ${n(b.trees.canopy)} more crowns from Meta and WRI's canopy map (DINOv3).`,
          ]
        : []),
    ...(b.walks
      ? [
          "",
          `Shade routing: the shade route avoids ${b.walks.score}% of the sun on ${b.walks.walks} sample walks (about ${b.walks.sunMinutesSaved.toFixed(1)} minutes less in the sun) for ${Math.max(0, Math.round(b.walks.extraDistance * 100))}% more walking.`,
        ]
      : []),
    ...(b.refuges
      ? [
          "",
          `Cool refuges: ${Math.round(b.refuges.within[0] * 100)}% of paths are within a 5-minute walk and ${Math.round(b.refuges.within[1] * 100)}% within 10 minutes of one of ${b.refuges.count} refuges (air-conditioned buildings, shade shelters, shaded parks).`,
          ...(b.refuges.gaps.length
            ? [
                `Farthest from any refuge: ${b.refuges.gaps
                  .map((g) => `${g.street} (${Math.round(g.minutes)} min)`)
                  .join(", ")}.`,
              ]
            : []),
        ]
      : []),
    ...(b.treePlan?.streets.length
      ? [
          "",
          `Where new trees would help the most walkers (from ${b.treePlan.walks} typical walks):`,
          ...b.treePlan.streets.map(
            (s, i) =>
              `${i + 1}. ${s.street}: on ${Math.round(s.walkShare * 100)}% of walks; shade ${Math.round(s.shadeNow * 100)}% to ${Math.round(s.shadeAfter * 100)}% with ${s.trees} trees; ${Math.round(s.sunMinutesSavedPer100)} fewer minutes in full sun per 100 walks.`,
          ),
        ]
      : []),
    "",
    "These are modeled estimates from mapped buildings and trees, sunlight and the weather shown, not measurements.",
    "Made with Walk-Free · https://walk-free.vercel.app",
  ];
  return { title, text: lines.join("\n") };
}
