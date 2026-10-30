import { describe, expect, it } from "vitest";
import { plantShadeRow } from "../src/lib/planting";
import type { World } from "../shared/types";

function street(length: number, buildings: World["objects"] = []): World {
  return {
    id: "w",
    name: "Test",
    origin: { lat: 30, lon: -97 },
    timezone: "America/Chicago",
    extent: 4000,
    objects: buildings,
    roads: [],
    landscapes: [],
    graph: {
      nodes: [
        { id: "a", point: [-length / 2, 0] },
        { id: "b", point: [length / 2, 0] },
      ],
      edges: [
        {
          id: "e",
          from: "a",
          to: "b",
          points: [
            [-length / 2, 0],
            [length / 2, 0],
          ],
          name: "Long Avenue",
          distance: length,
          covered: false,
          scenic: 0,
          indoor: "no",
          stairs: false,
          accessible: true,
          bidirectional: true,
        },
      ],
    },
    provenance: {
      source: "test",
      attribution: "",
      retrievedAt: "",
      live: false,
      notes: [],
    },
  };
}

describe("planting a shade row", () => {
  it("never plants more than the cap", () => {
    const result = plantShadeRow(street(3000), "e")!;
    expect(result.planted).toBe(150);
  });

  it("keeps trees off building footprints, including turned ones", () => {
    const hall = {
      id: "hall",
      kind: "building" as const,
      name: "Hall",
      position: [0, 12] as [number, number],
      width: 80,
      depth: 20,
      height: 15,
      rotation: 0,
      source: "osm" as const,
      heightMethod: "levels" as const,
      footprint: [
        [-40, -10],
        [40, -10],
        [40, 10],
        [-40, 10],
      ] as [number, number][],
    };
    const result = plantShadeRow(street(200, [hall]), "e")!;
    const trees = result.world.objects.filter((o) => o.kind === "tree");
    // Trees on the hall's side (y = +5) between x = -40 and 40 would be inside it.
    expect(
      trees.some((t) => t.position[1] > 0 && Math.abs(t.position[0]) < 40),
    ).toBe(false);
    expect(trees.some((t) => t.position[1] < 0)).toBe(true);
  });
});
