import { describe, expect, it } from "vitest";
import type { Environment, GraphEdge, World } from "../shared/types";
import { plantShadeRow } from "../src/lib/planting";
import { areaHeat, edgeHeatMap } from "../src/lib/heat";

// 3:30 PM CDT: low-ish western sun, so trees beside a north-south street
// cast shade across it.
const afternoon: Environment = {
  dateTime: "2026-07-15T20:30:00Z",
  temperatureC: 36,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const edge = (id: string, name: string, z0: number): GraphEdge => ({
  id,
  from: `${id}a`,
  to: `${id}b`,
  points: [
    [0, z0],
    [0, z0 + 50],
  ],
  name,
  distance: 50,
  covered: false,
  scenic: 0.2,
  indoor: "no",
  stairs: false,
  accessible: true,
  bidirectional: true,
});
function world(): World {
  return {
    id: "plant",
    name: "Planting",
    origin: { lat: 30.285, lon: -97.7341 },
    timezone: "America/Chicago",
    extent: 600,
    objects: [],
    roads: [],
    landscapes: [],
    graph: {
      nodes: [],
      edges: [
        edge("s1", "Speedway", -100),
        edge("s2", "Speedway", -50),
        edge("p", "Footpath", 100),
      ],
    },
    provenance: {
      source: "test",
      attribution: "",
      retrievedAt: "",
      live: false,
      notes: [],
    },
  } as unknown as World;
}

describe("planting shade trees", () => {
  it("lines a whole named street on both sides and cools it", () => {
    const before = world();
    const result = plantShadeRow(before, "s1")!;
    expect(result.street).toBe("Speedway");
    expect(result.edgeIds).toEqual(["s1", "s2"]);
    expect(result.planted).toBeGreaterThan(10);
    const trees = result.world.objects;
    expect(
      trees.every((t) => t.kind === "tree" && Math.abs(t.position[0]) === 5),
    ).toBe(true);
    const street = new Set(result.edgeIds);
    const was = areaHeat(before, edgeHeatMap(before, afternoon), street)!;
    const now = areaHeat(
      result.world,
      edgeHeatMap(result.world, afternoon),
      street,
    )!;
    expect(was.shade).toBe(0);
    expect(now.shade).toBeGreaterThan(0.4);
    expect(now.feelsLikeC).toBeLessThan(was.feelsLikeC - 2);
  });

  it("plants only the clicked path when it is unnamed, without stacking trees", () => {
    const first = plantShadeRow(world(), "p")!;
    expect(first.street).toBe("this path");
    expect(first.edgeIds).toEqual(["p"]);
    expect(plantShadeRow(first.world, "p")).toBeNull();
    expect(plantShadeRow(world(), "missing")).toBeNull();
  });
});
