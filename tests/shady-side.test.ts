import { describe, expect, it } from "vitest";
import type { GraphEdge, RouteResult, World } from "../shared/types";
import { createStudyWorld } from "../src/lib/study";
import { walkingDirections } from "../src/lib/routing";
import { shadySides } from "../src/lib/shady-side";

/** A street running north from (0, 0) to (0, -100) with a row of
 * two-storey fronts on its west side only. */
const world: World = {
  ...createStudyWorld(),
  origin: { lat: 30.285, lon: -97.742 },
  objects: Array.from({ length: 10 }, (_, i) => ({
    id: `w${i}`,
    kind: "building" as const,
    name: "",
    position: [-10, -5 - i * 10] as [number, number],
    width: 4,
    depth: 10,
    height: 8,
    rotation: 0,
    source: "user" as const,
    heightMethod: "designed" as const,
  })),
};
const north: GraphEdge = {
  id: "s",
  from: "a",
  to: "b",
  points: [
    [0, 0],
    [0, -100],
  ],
  name: "Guadalupe Street",
  distance: 100,
  covered: false,
  scenic: 0,
  indoor: "no",
  stairs: false,
  accessible: true,
  bidirectional: true,
  roadClass: "street",
};
const routeOf = (edges: GraphEdge[]): RouteResult => ({
  id: "r",
  preference: "quickest",
  points: edges.flatMap((e) => e.points),
  edges,
  distance: 100,
  durationMinutes: 1.3,
  shadeFraction: 0,
  indoorFraction: 0,
  hypothetical: false,
  directions: walkingDirections(edges),
  warnings: [],
});
// 4 PM in June: the sun is high in the west.
const afternoon = {
  dateTime: "2026-06-21T21:00:00Z",
  temperatureC: 36,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario" as const,
};

describe("the shady side of the street", () => {
  it("names the west sidewalk, on your left walking north", () => {
    const [hint] = shadySides(routeOf([north]), world, afternoon);
    expect(hint).not.toBeNull();
    expect(hint!.side).toBe("left");
    expect(hint!.left).toBeGreaterThan(hint!.right);
  });

  it("is on your right walking the other way", () => {
    const south = { ...north, points: [...north.points].reverse() };
    const [hint] = shadySides(routeOf([south]), world, afternoon);
    expect(hint?.side).toBe("right");
  });

  it("says nothing for a park path, which has no sides", () => {
    const path = { ...north, roadClass: "path" as const };
    expect(shadySides(routeOf([path]), world, afternoon)).toEqual([null]);
  });
});
