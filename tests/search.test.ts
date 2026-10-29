import { describe, expect, it } from "vitest";
import type { World } from "../shared/types";
import { destinationCatalog, rankDestinations } from "../src/lib/destinations";
import {
  buildingAliases,
  parseOsmWorld,
  type OsmResponse,
} from "../shared/osm";

const origin = { lat: 30.285, lon: -97.7341 };
function campus(): World {
  const building = (
    id: string,
    name: string,
    x: number,
    tags: Record<string, string> = {},
  ) => ({
    id,
    kind: "building" as const,
    name,
    position: [x, 30] as [number, number],
    width: 40,
    depth: 30,
    height: 20,
    rotation: 0,
    source: "osm" as const,
    heightMethod: "estimated" as const,
    ...(Object.keys(tags).length
      ? { aliases: buildingAliases({ name, ...tags }) }
      : {}),
  });
  return {
    id: "search",
    name: "UT",
    origin,
    timezone: "America/Chicago",
    extent: 800,
    objects: [
      building("a", "Andrews Dormitory", 0),
      building("g", "Bill and Melinda Gates Computer Science Complex", 200),
      building("r", "Robert B. Rowling Hall", 400, { ref: "RRH" }),
    ],
    roads: [],
    landscapes: [],
    graph: {
      nodes: [
        { id: "n0", point: [0, 0] },
        { id: "n1", point: [200, 0] },
        { id: "n2", point: [400, 0] },
      ],
      edges: ["n0-n1", "n1-n2"].map((id) => {
        const [from, to] = id.split("-");
        const x = from === "n0" ? 0 : 200;
        return {
          id,
          from,
          to,
          points: [
            [x, 0],
            [x + 200, 0],
          ] as [number, number][],
          name: "Inner Campus Drive",
          distance: 200,
          covered: false,
          scenic: 0.3,
          indoor: "no" as const,
          stairs: false,
          accessible: true,
          bidirectional: true,
        };
      }),
    },
    provenance: {
      source: "test",
      attribution: "",
      retrievedAt: "",
      live: true,
      notes: [],
    },
  } as unknown as World;
}
const top = (q: string) =>
  rankDestinations(destinationCatalog(campus()), q)[0]?.id;

describe("campus search", () => {
  it("treats hall and dormitory as the same word", () => {
    expect(top("Andrews Hall")).toBe("n0");
    expect(top("andrews dorm")).toBe("n0");
  });
  it("finds buildings by campus codes and OSM refs", () => {
    expect(top("GDC")).toBe("n1");
    expect(top("gates dell")).toBe("n1");
    expect(top("RRH")).toBe("n2");
    expect(top("Rowling")).toBe("n2");
  });
  it("returns nothing for places that are not on the map", () => {
    expect(
      rankDestinations(destinationCatalog(campus()), "Disneyland"),
    ).toEqual([]);
  });
});

describe("OSM buildings", () => {
  it("keeps courtyard buildings and their alternate names", () => {
    const ring = (lat: number, lon: number, d: number) =>
      [
        [lat, lon],
        [lat, lon + d],
        [lat + d, lon + d],
        [lat + d, lon],
        [lat, lon],
      ].map(([la, lo]) => ({ lat: la, lon: lo }));
    const response: OsmResponse = {
      elements: [
        {
          type: "relation",
          id: 7,
          tags: {
            building: "dormitory",
            name: "Kinsolving Dormitory",
            ref: "KIN",
            alt_name: "Kinsolving Residence Hall",
          },
          members: [
            {
              type: "way",
              ref: 70,
              role: "outer",
              geometry: ring(30.285, -97.734, 0.0006),
            },
            {
              type: "way",
              ref: 71,
              role: "inner",
              geometry: ring(30.2852, -97.7338, 0.0002),
            },
          ],
        },
      ],
    };
    const world = parseOsmWorld(response, origin, "Test", 500);
    const kin = world.objects.find((o) => o.name === "Kinsolving Dormitory");
    expect(kin).toBeDefined();
    expect(kin?.aliases).toEqual(["KIN", "Kinsolving Residence Hall"]);
    expect(world.provenance.notes.join(" ")).toMatch(
      /drawn without their courtyards/,
    );
  });
});
