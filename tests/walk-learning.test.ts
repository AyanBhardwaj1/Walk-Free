import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { worldSchema } from "../shared/schema.js";
import { dayWord } from "../src/lib/leave-reminder";
import {
  addFix,
  closeOpen,
  emptyLog,
  splitAtStops,
  walkDistance,
  type TracePoint,
} from "../src/lib/walk-log.js";
import { sampleWalks } from "../src/lib/ml/sample-walks.js";
import {
  learnPace,
  personalEta,
  speedFor,
  POPULATION_SPEED,
} from "../src/lib/ml/pace-model.js";
import {
  findPlaces,
  findRoutines,
  leaveBy,
  nextTrip,
  tripKey,
} from "../src/lib/ml/routines.js";
import { guessPersona, shadeThreshold } from "../src/lib/ml/persona.js";

const ut = worldSchema.parse(
  JSON.parse(readFileSync("public/areas/ut-austin.json", "utf8")),
);
// A Monday early morning; sample walks fill the three weeks before it.
const now = new Date(2026, 10, 9, 7, 0).getTime();
const walks = sampleWalks(ut, now);

/** A straight walk north at `speed` m/s, a fix every 5 s. */
function line(start: number, seconds: number, speed = 1.3): TracePoint[] {
  const pts: TracePoint[] = [];
  for (let s = 0; s <= seconds; s += 5)
    pts.push({
      lat: 30.28 + (speed * s) / 111195,
      lon: -97.73,
      t: start + s * 1000,
      acc: 8,
    });
  return pts;
}

describe("the walk log", () => {
  it("logs nothing until learning is switched on", () => {
    const log = addFix(emptyLog(), line(0, 0)[0], "ut-austin");
    expect(log.open).toHaveLength(0);
  });

  it("thins fixes and closes a walk after a long gap", () => {
    let log = { ...emptyLog(), learning: true };
    for (const p of line(0, 300)) log = addFix(log, p, "ut-austin");
    expect(log.open.length).toBeGreaterThan(20);
    // Ten minutes later, somewhere else: the first walk closes.
    log = addFix(
      log,
      { lat: 30.29, lon: -97.74, t: 900_000, acc: 8 },
      "ut-austin",
    );
    expect(log.walks).toHaveLength(1);
    expect(walkDistance(log.walks[0].points)).toBeGreaterThan(350);
  });

  it("splits a trace where the walker stopped for a while", () => {
    const first = line(0, 200);
    const stop = Array.from({ length: 50 }, (_, i) => ({
      ...first.at(-1)!,
      t: first.at(-1)!.t + (i + 1) * 5000,
    }));
    const second = line(stop.at(-1)!.t + 5000, 200).map((p) => ({
      ...p,
      lat: p.lat + 0.003,
    }));
    expect(splitAtStops([...first, ...stop, ...second])).toHaveLength(2);
  });

  it("drops coarse fixes and walks too short to learn from", () => {
    let log = { ...emptyLog(), learning: true };
    log = addFix(log, { lat: 30.28, lon: -97.73, t: 0, acc: 200 }, "x");
    expect(log.open).toHaveLength(0);
    for (const p of line(0, 30)) log = addFix(log, p, "x");
    expect(closeOpen(log, 60_000, true).walks).toHaveLength(0);
  });
});

describe("learning from walks", () => {
  it("makes three weeks of weekday sample walks on real paths", () => {
    expect(walks.length).toBeGreaterThanOrEqual(40);
    expect(walks.every((w) => w.sample)).toBe(true);
  });

  it("learns a pace that beats a fixed one and slows in the heat", () => {
    const pace = learnPace(walks);
    expect(pace.model).not.toBeNull();
    expect(pace.modelMae!).toBeLessThan(pace.baselineMae! * 0.9);
    const cool = speedFor(pace, { feelsLikeC: 25, hour: 9.5, weekend: false });
    const hot = speedFor(pace, { feelsLikeC: 35, hour: 14, weekend: false });
    expect(cool).toBeGreaterThan(hot + 0.1);
  }, 30_000);

  it("leans on the population pace with no walks", () => {
    const pace = learnPace([]);
    expect(
      speedFor(pace, { feelsLikeC: 25, hour: 12, weekend: false }),
    ).toBeCloseTo(POPULATION_SPEED, 5);
    const eta = personalEta(pace, 1000, {
      feelsLikeC: 25,
      hour: 12,
      weekend: false,
    });
    expect(eta.minutes).toBeCloseTo(1000 / POPULATION_SPEED / 60, 1);
    expect(eta.safeMinutes).toBeGreaterThan(eta.minutes);
  });

  it("finds home, the daily routine and when to leave next", () => {
    const places = findPlaces(walks);
    expect(places.find((p) => p.home)).toBeTruthy();
    const routines = findRoutines(walks, places);
    expect(routines.length).toBeGreaterThanOrEqual(3);
    const next = nextTrip(routines, now)!;
    expect(next.routine.from.home).toBe(true);
    // The first class of the day is about 9:50.
    const at = new Date(next.arriveBy);
    expect(at.getHours() * 60 + at.getMinutes()).toBeGreaterThan(9 * 60 + 35);
    expect(at.getHours() * 60 + at.getMinutes()).toBeLessThan(10 * 60 + 5);
    const leave = leaveBy(next.arriveBy, 11.4);
    expect(next.arriveBy - leave).toBe(13 * 60_000);
  });

  it("steps past a trip that's too late to leave for", () => {
    const routines = findRoutines(walks, findPlaces(walks));
    const first = nextTrip(routines, now)!;
    const then = nextTrip(
      routines,
      now,
      new Set([tripKey(first.routine, first.arriveBy)]),
    )!;
    expect(then.arriveBy).toBeGreaterThan(first.arriveBy);
  });

  it("looks a week ahead: after Friday's last trip comes Monday's", () => {
    const routines = findRoutines(walks, findPlaces(walks));
    // Friday 13 November 2026, 11 PM: the sample routines are weekdays.
    const friday = new Date(2026, 10, 13, 23, 0).getTime();
    const next = nextTrip(routines, friday)!;
    expect(next).not.toBeNull();
    expect(new Date(next.arriveBy).getDay()).toBe(1);
    expect(dayWord(next.arriveBy, friday)).toBe("Monday");
  });

  it("names the day of a time that isn't today", () => {
    const mon = new Date(2026, 10, 9, 7, 0).getTime();
    expect(dayWord(new Date(2026, 10, 9, 23, 59).getTime(), mon)).toBe("");
    expect(dayWord(new Date(2026, 10, 10, 0, 5).getTime(), mon)).toBe(
      "tomorrow",
    );
    expect(dayWord(new Date(2026, 10, 13, 9, 0).getTime(), mon)).toBe("Friday");
    expect(dayWord(new Date(2026, 10, 16, 9, 0).getTime(), mon)).toBe(
      "next Monday",
    );
  });

  it("sees a campus student in a weekday class routine", () => {
    const places = findPlaces(walks);
    const guess = guessPersona(walks, places, true);
    expect(guess.id).toBe("campus-student");
    expect(guess.scores[0].p).toBeGreaterThan(0.4);
  });

  it("learns the heat where someone starts choosing shade", () => {
    const choices = [24, 26, 28, 29, 30, 31, 32, 33, 34, 36].map((c) => ({
      feelsLikeC: c,
      shade: c >= 30,
    }));
    const t = shadeThreshold(choices)!;
    expect(t).toBeGreaterThan(28);
    expect(t).toBeLessThan(31.5);
    expect(shadeThreshold(choices.slice(0, 3))).toBeNull();
  });
});
