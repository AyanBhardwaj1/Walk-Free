import type { LoggedWalk } from "../walk-log.js";

/** A local calendar day, as a number of days (for counting runs). */
const dayOf = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;
};

/**
 * Days in a row with at least one logged walk, ending today, or yesterday
 * when today has no walk yet (a streak isn't lost until the day is over).
 * Sample walks never count.
 */
export function walkStreak(walks: LoggedWalk[], now = Date.now()) {
  const days = new Set(
    walks
      .filter((w) => !w.sample && w.points.length > 0)
      .map((w) => dayOf(w.points[0].t)),
  );
  const today = dayOf(now);
  let day = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day--;
  }
  return { days: streak, today: days.has(today) };
}
