import { describe, expect, it } from "vitest";
import { reachedCoolStop, walkCoolStops } from "../src/lib/cool-stops";
import type { World } from "../shared/types";

const stops = [
  { nodeId: "a", name: "Gregory Gym" },
  { nodeId: "b", name: "Perry-Castañeda Library" },
];

describe("cool stops during a walk", () => {
  it("offers every open stop while planning", () => {
    expect(walkCoolStops(stops, null)).toEqual(stops);
  });

  it("keeps the stop chosen when the walk began, so it never switches", () => {
    expect(
      walkCoolStops(stops, { name: "Gregory Gym", reached: false }),
    ).toEqual([stops[0]]);
  });

  it("stops detouring once the walker has been there", () => {
    expect(
      walkCoolStops(stops, { name: "Gregory Gym", reached: true }),
    ).toEqual([]);
    expect(walkCoolStops(stops, { name: null, reached: false })).toEqual([]);
  });

  it("notices arrival within a few steps of the stop's path point", () => {
    const world = {
      graph: {
        nodes: [
          { id: "a", point: [100, 100] },
          { id: "b", point: [400, 0] },
        ],
      },
    } as unknown as World;
    expect(reachedCoolStop(world, stops, "Gregory Gym", [120, 110])).toBe(true);
    expect(reachedCoolStop(world, stops, "Gregory Gym", [200, 100])).toBe(
      false,
    );
    expect(reachedCoolStop(world, stops, null, [100, 100])).toBe(false);
  });
});

describe("split path edges", () => {
  it("map back to the mapped edge they came from", async () => {
    const { baseEdgeId, snapWalkPosition } =
      await import("../src/lib/walk-location");
    const world = {
      origin: { lat: 0, lon: 0 },
      graph: {
        nodes: [
          { id: "n1", point: [0, 0] },
          { id: "n2", point: [100, 0] },
        ],
        edges: [
          {
            id: "osm-edge-7",
            from: "n1",
            to: "n2",
            points: [
              [0, 0],
              [100, 0],
            ],
            name: "Speedway",
            distance: 100,
            covered: false,
            scenic: 0,
            indoor: "no",
            stairs: false,
            accessible: true,
            bidirectional: true,
          },
        ],
      },
    } as unknown as World;
    const snapped = snapWalkPosition(world, [50, 3], {
      avoidStairs: false,
      allowHypothetical: false,
    });
    const split = snapped!.world.graph.edges.map((e) => e.id);
    expect(split.length).toBeGreaterThan(1);
    expect(new Set(split.map(baseEdgeId))).toEqual(new Set(["osm-edge-7"]));
    expect(baseEdgeId("osm-edge-7")).toBe("osm-edge-7");
  });
});
