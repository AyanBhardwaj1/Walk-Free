import { describe, expect, it } from "vitest";
import type { GraphEdge, Point, World } from "../shared/types";
import { createStudyWorld } from "../src/lib/study";
import { toLocal } from "../src/lib/geo";
import { sunAvoided } from "../src/lib/ml/sun-avoided";
import type { LoggedWalk } from "../src/lib/walk-log";

const origin = { lat: 30.285, lon: -97.742 };
const env = {
  dateTime: "2026-06-21T18:00:00Z",
  temperatureC: 34,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario" as const,
};
/** A 10-minute walk east from the origin. */
function walk(id: string, start: number): LoggedWalk {
  return {
    id,
    area: "open",
    points: Array.from({ length: 11 }, (_, i) => ({
      lat: origin.lat,
      lon: origin.lon + i * 0.0008,
      t: start + i * 60_000,
      acc: 5,
    })),
  };
}
const end = toLocal(origin.lat, origin.lon + 0.008, origin);
const edge = (
  id: string,
  from: string,
  to: string,
  a: Point,
  b: Point,
): GraphEdge => ({
  id,
  from,
  to,
  points: [a, b],
  name: "Open Walk",
  distance: Math.hypot(b[0] - a[0], b[1] - a[1]),
  covered: false,
  scenic: 0,
  indoor: "no",
  stairs: false,
  accessible: true,
  bidirectional: true,
});
/** One unshaded path along the walk. */
const open: World = {
  ...createStudyWorld(),
  id: "open",
  origin,
  objects: [],
  graph: {
    nodes: [
      { id: "a", point: [0, 0] },
      { id: "b", point: end },
    ],
    edges: [edge("ab", "a", "b", [0, 0], end)],
  },
};

describe("sun avoided against the quickest way", () => {
  const noon = Date.parse("2026-06-21T13:00:00-05:00");

  it("counts the sun a walk was spared against the quickest way", () => {
    const w = walk("w", noon);
    // The walk itself got 2 minutes of sun (say, under trees the map
    // doesn't know); the quickest way is all sun for its 10 minutes.
    const r = sunAvoided(
      [w],
      [{ id: "w", start: noon, minutes: 10, sunMinutes: 2 }],
      open,
      env,
    );
    expect(r.walks).toBe(1);
    expect(r.minutes).toBeCloseTo(8, 5);
  });

  it("measures both sides alike: a roof on the map counts for neither", () => {
    // Routing calls a covered path shade, but the walk's own replay only
    // knows buildings and trees; the comparison uses the same test for both.
    const covered: World = {
      ...open,
      graph: {
        ...open.graph,
        edges: [{ ...open.graph.edges[0], covered: true }],
      },
    };
    const r = sunAvoided(
      [walk("w", noon)],
      [{ id: "w", start: noon, minutes: 10, sunMinutes: 10 }],
      covered,
      env,
    );
    expect(r.minutes).toBeCloseTo(0, 5);
  });

  it("credits a longer shady detour only with the sun it saved", () => {
    // 385 m north, 770 m east, 385 m back south: twice the quickest way,
    // in 20 minutes, 6 of them in sun. At this pace the all-sun quickest
    // way takes 10 minutes, so 4 minutes were saved (not 14).
    const north = 0.00346;
    const corners: [number, number][] = [
      [0, 0],
      [north, 0],
      [north, 0.008],
      [0, 0.008],
    ];
    const lengths = [5, 10, 5];
    const points = [{ lat: origin.lat, lon: origin.lon, t: noon, acc: 5 }];
    let k = 0;
    corners.slice(1).forEach(([dlat, dlon], c) => {
      const [plat, plon] = corners[c];
      for (let i = 1; i <= lengths[c]; i++) {
        const f = i / lengths[c];
        points.push({
          lat: origin.lat + plat + (dlat - plat) * f,
          lon: origin.lon + plon + (dlon - plon) * f,
          t: noon + ++k * 60_000,
          acc: 5,
        });
      }
    });
    const detour: LoggedWalk = { id: "d", area: "open", points };
    const r = sunAvoided(
      [detour],
      [{ id: "d", start: noon, minutes: 20, sunMinutes: 6 }],
      open,
      env,
    );
    expect(r.walks).toBe(1);
    expect(r.minutes).toBeGreaterThan(3.5);
    expect(r.minutes).toBeLessThan(4.6);
  });

  it("leaves out night walks, walks off the map and round trips", () => {
    const night = Date.parse("2026-06-21T02:00:00-05:00");
    const far: LoggedWalk = {
      ...walk("far", noon),
      points: walk("far", noon).points.map((p) => ({
        ...p,
        lat: p.lat + 0.01,
      })),
    };
    const loop: LoggedWalk = {
      ...walk("loop", noon),
      points: [
        ...walk("loop", noon).points.slice(0, 6),
        { ...walk("loop", noon).points[0], t: noon + 6 * 60_000 },
      ],
    };
    const r = sunAvoided(
      [walk("n", night), far, loop],
      [
        { id: "n", start: night, minutes: 10, sunMinutes: 0 },
        { id: "far", start: noon, minutes: 10, sunMinutes: 10 },
        { id: "loop", start: noon, minutes: 6, sunMinutes: 6 },
      ],
      open,
      env,
    );
    expect(r).toEqual({ walks: 0, minutes: 0 });
  });
});
