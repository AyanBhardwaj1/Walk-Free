import { describe, expect, it } from "vitest";
import { walkStreak } from "../src/lib/ml/streak";
import type { LoggedWalk } from "../src/lib/walk-log";

const at = (y: number, m: number, d: number, h = 9) =>
  new Date(y, m - 1, d, h).getTime();
const walk = (t: number, sample = false): LoggedWalk => ({
  id: String(t),
  area: "a",
  points: [{ lat: 0, lon: 0, t, acc: 5 }],
  ...(sample ? { sample } : {}),
});

describe("walking streak", () => {
  it("counts days in a row up to today", () => {
    const walks = [
      at(2026, 11, 4),
      at(2026, 11, 5),
      at(2026, 11, 6, 8),
      at(2026, 11, 6, 17),
    ].map((t) => walk(t));
    expect(walkStreak(walks, at(2026, 11, 6, 20))).toEqual({
      days: 3,
      today: true,
    });
  });

  it("keeps yesterday's streak until today is over", () => {
    const walks = [at(2026, 11, 4), at(2026, 11, 5)].map((t) => walk(t));
    expect(walkStreak(walks, at(2026, 11, 6, 7))).toEqual({
      days: 2,
      today: false,
    });
    // A missed day ends it.
    expect(walkStreak(walks, at(2026, 11, 7, 7))).toEqual({
      days: 0,
      today: false,
    });
  });

  it("never counts sample walks", () => {
    expect(
      walkStreak([walk(at(2026, 11, 6), true)], at(2026, 11, 6, 20)).days,
    ).toBe(0);
  });
});
