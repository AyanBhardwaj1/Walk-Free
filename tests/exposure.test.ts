import { describe, expect, it } from "vitest";
import type { World } from "../shared/types";
import { createStudyWorld } from "../src/lib/study";
import { sunWeek, walkSun } from "../src/lib/ml/exposure";
import type { LoggedWalk } from "../src/lib/walk-log";

const origin = { lat: 30.285, lon: -97.742 };
/** Open ground: nothing to cast shade. */
const open: World = {
  ...createStudyWorld(),
  id: "open",
  origin,
  objects: [],
};
const env = {
  dateTime: "2026-06-21T18:00:00Z",
  temperatureC: 34,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario" as const,
};
/** A 10-minute walk east from the origin starting at `start`. */
function walk(id: string, start: number, area = "open"): LoggedWalk {
  return {
    id,
    area,
    points: Array.from({ length: 11 }, (_, i) => ({
      lat: origin.lat,
      lon: origin.lon + i * 0.0008,
      t: start + i * 60_000,
      acc: 5,
    })),
  };
}

describe("sun on your walks", () => {
  it("counts a midday walk on open ground as all sun", () => {
    const [w] = walkSun(
      [walk("a", Date.parse("2026-06-21T13:00:00-05:00"))],
      open,
      env,
    );
    expect(w.minutes).toBeCloseTo(10, 5);
    expect(w.sunMinutes).toBeCloseTo(10, 5);
  });

  it("counts a walk at night as no sun", () => {
    const [w] = walkSun(
      [walk("b", Date.parse("2026-06-21T02:00:00-05:00"))],
      open,
      env,
    );
    expect(w.minutes).toBeCloseTo(10, 5);
    expect(w.sunMinutes).toBe(0);
  });

  it("counts no sun just after sunset, even in a half hour that had some", () => {
    // Austin sunset on 2026-06-21 is about 8:37 PM CDT.
    const [w] = walkSun(
      [walk("dusk", Date.parse("2026-06-21T20:41:00-05:00"))],
      open,
      env,
    );
    expect(w.sunMinutes).toBe(0);
  });

  it("counts shade from a building beside the walk", () => {
    // A tall block just south of the path: at 9 AM in winter the sun is
    // low in the south-east, so the path is in its shadow.
    const shaded: World = {
      ...open,
      objects: [
        {
          id: "block",
          kind: "building",
          name: "Block",
          position: [380, 25],
          width: 900,
          depth: 30,
          height: 60,
          rotation: 0,
          source: "user",
          heightMethod: "designed",
        },
      ],
    };
    const start = Date.parse("2026-12-21T09:30:00-06:00");
    const [w] = walkSun([walk("c", start)], shaded, env);
    const [o] = walkSun([walk("c", start)], open, env);
    expect(o.sunMinutes).toBeGreaterThan(9);
    expect(w.sunMinutes).toBeLessThan(o.sunMinutes / 2);
  });

  it("only counts walks on this map, and sums the week with a trend", () => {
    const now = Date.parse("2026-06-21T20:00:00-05:00");
    const day = 24 * 3600_000;
    const list = walkSun(
      [
        walk("this", now - day),
        walk("last", now - 9 * day),
        walk("elsewhere", now - day, "other-map"),
      ],
      open,
      env,
    );
    expect(list.map((w) => w.id).sort()).toEqual(["last", "this"]);
    const week = sunWeek(list, now);
    expect(week.walks).toBe(1);
    expect(week.minutes).toBeCloseTo(10, 5);
    expect(week.previousShare).not.toBeNull();
  });
});
