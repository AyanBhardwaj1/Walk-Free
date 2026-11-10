import {
  smoothTrace,
  walkDistance,
  walkDuration,
  type LoggedWalk,
} from "../walk-log.js";

/**
 * One line about a walk just logged: how far, how long, how that pace
 * compares with your usual, and (when known) how much of it was in sun.
 */
export function walkSummary(
  walk: LoggedWalk,
  /** Your usual speed from your other walks, m/s (null for a first walk). */
  usual: number | null,
  sunMinutes: number | null,
  unit: "F" | "C" = "F",
) {
  const metres = walkDistance(smoothTrace(walk.points));
  const minutes = walkDuration(walk.points) / 60_000;
  if (!(minutes > 0) || metres < 50) return null;
  const speed = metres / (minutes * 60);
  const ratio = usual ? speed / usual : null;
  const pace =
    ratio === null
      ? "your first logged walk"
      : ratio > 1.08
        ? "quicker than usual"
        : ratio < 0.92
          ? "slower than usual"
          : "your usual pace";
  const distance =
    unit === "F"
      ? `${(metres / 1609.34).toFixed(2)} mi`
      : `${(metres / 1000).toFixed(2)} km`;
  const sunny = sunMinutes === null ? null : Math.round(sunMinutes);
  const sun =
    sunny === null
      ? ""
      : sunny === 0
        ? ", none of it in direct sun"
        : `, ${sunny} of them in direct sun`;
  return `Walk logged: ${distance} in ${Math.round(minutes)} min, ${pace}${sun}. Walk-Free learns from it.`;
}
