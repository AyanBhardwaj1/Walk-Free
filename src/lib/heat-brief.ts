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
    ...(b.trees
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
    "",
    "These are modeled estimates from mapped buildings and trees, sunlight and the weather shown, not measurements.",
    "Made with Walk-Free · https://walk-free.vercel.app",
  ];
  return { title, text: lines.join("\n") };
}
