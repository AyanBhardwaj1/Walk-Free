import { describe, expect, it } from "vitest";
import type { Environment, GraphEdge, World } from "../shared/types";
import { compareRoutes, nightMultiplier } from "../src/lib/routing";
import { litValue, roadClass, steepIncline } from "../shared/osm";

const env: Environment = {
  dateTime: "2026-07-15T18:00:00Z",
  temperatureC: 33,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const edge = (
  id: string,
  from: string,
  to: string,
  points: [number, number][],
  extra: Partial<GraphEdge> = {},
): GraphEdge => ({
  id,
  from,
  to,
  points,
  name: id,
  distance: points
    .slice(1)
    .reduce(
      (s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    ),
  covered: false,
  scenic: 0.2,
  indoor: "no",
  stairs: false,
  accessible: true,
  bidirectional: true,
  ...extra,
});
// A to D: a short dark path with steps, or a longer lit street via C; B is
// a building's nearest path node for cool stops.
function world(): World {
  return {
    id: "types",
    name: "Route types",
    origin: { lat: 30.285, lon: -97.7341 },
    timezone: "America/Chicago",
    extent: 800,
    objects: [],
    roads: [],
    landscapes: [],
    graph: {
      nodes: [
        { id: "A", point: [0, 0] },
        { id: "B", point: [100, 0] },
        { id: "C", point: [100, 120] },
        { id: "D", point: [200, 0] },
      ],
      edges: [
        edge(
          "dark-steps-1",
          "A",
          "B",
          [
            [0, 0],
            [100, 0],
          ],
          { stairs: true, accessible: false, lit: false, roadClass: "path" },
        ),
        edge(
          "dark-steps-2",
          "B",
          "D",
          [
            [100, 0],
            [200, 0],
          ],
          { lit: false, roadClass: "path" },
        ),
        edge(
          "lit-1",
          "A",
          "C",
          [
            [0, 0],
            [100, 120],
          ],
          { lit: true, roadClass: "street" },
        ),
        edge(
          "lit-2",
          "C",
          "D",
          [
            [100, 120],
            [200, 0],
          ],
          { lit: true, roadClass: "street" },
        ),
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
const options = {
  avoidStairs: false,
  allowHypothetical: false,
  maxDetour: 2,
  environment: env,
};
const ids = (r: { edges: GraphEdge[] } | null) => r?.edges.map((e) => e.id);

describe("route types", () => {
  it("keeps step-free routes off stairs and never falls back to them", () => {
    const routes = compareRoutes(world(), "A", "D", options);
    expect(ids(routes.quickest)).toEqual(["dark-steps-1", "dark-steps-2"]);
    expect(ids(routes.stepfree)).toEqual(["lit-1", "lit-2"]);
    const blocked = world();
    blocked.graph.edges = blocked.graph.edges.filter(
      (e) => !e.id.startsWith("lit"),
    );
    expect(compareRoutes(blocked, "A", "D", options).stepfree).toBeNull();
  });
  it("starts step-free from the nearest step-free point when the exact one has none", () => {
    const pocket = world();
    pocket.graph.edges = pocket.graph.edges.filter(
      (e) => !e.id.startsWith("lit"),
    );
    // A ramp starts 30 m from A; A itself only connects by steps.
    pocket.graph.nodes.push({ id: "E", point: [0, 30] });
    pocket.graph.edges.push(
      edge("ramp", "E", "D", [
        [0, 30],
        [200, 30],
        [200, 0],
      ]),
    );
    const r = compareRoutes(pocket, "A", "D", options).stepfree;
    expect(ids(r)).toEqual(["ramp"]);
    expect(r?.stepFreeGap).toEqual({ start: 30, end: 0 });
    // The 230 m ramp plus the 30 m to reach it: never quicker than it is.
    expect(r?.distance).toBeCloseTo(260);
    // Points close together still get a walk, not an empty one.
    const near = world();
    near.graph.nodes = [
      { id: "A", point: [0, 0] },
      { id: "D", point: [60, 0] },
      { id: "E", point: [0, 10] },
      { id: "F", point: [60, 10] },
    ];
    near.graph.edges = [
      edge(
        "steps",
        "A",
        "D",
        [
          [0, 0],
          [60, 0],
        ],
        { stairs: true, accessible: false },
      ),
      edge("ramp", "E", "F", [
        [0, 10],
        [60, 10],
      ]),
    ];
    const close = compareRoutes(near, "A", "D", options).stepfree;
    expect(ids(close)).toEqual(["ramp"]);
    expect(close?.stepFreeGap).toEqual({ start: 10, end: 10 });
    // Never so far that it is a different place.
    pocket.graph.nodes.find((n) => n.id === "E")!.point = [0, 200];
    pocket.graph.edges.at(-1)!.points[0] = [0, 200];
    expect(compareRoutes(pocket, "A", "D", options).stepfree).toBeNull();
  });

  it("prefers lit streets at night", () => {
    expect(ids(compareRoutes(world(), "A", "D", options).night)).toEqual([
      "lit-1",
      "lit-2",
    ]);
    expect(
      nightMultiplier(
        edge(
          "x",
          "a",
          "b",
          [
            [0, 0],
            [1, 0],
          ],
          { lit: false },
        ),
      ),
    ).toBeGreaterThan(
      nightMultiplier(
        edge(
          "y",
          "a",
          "b",
          [
            [0, 0],
            [1, 0],
          ],
          { roadClass: "major" },
        ),
      ),
    );
  });

  it("routes through a cool stop and names it", () => {
    const routes = compareRoutes(world(), "A", "D", {
      ...options,
      coolStops: [{ nodeId: "C", name: "Union Building" }],
    });
    expect(routes.indoors?.coolStop).toBe("Union Building");
    expect(routes.indoors?.edges.map((e) => e.to)).toContain("C");
    expect(
      compareRoutes(world(), "A", "D", options).indoors?.coolStop,
    ).toBeUndefined();
  });

  it("reads lighting, street type and slope from OSM tags", () => {
    expect([
      litValue("yes"),
      litValue("no"),
      litValue(undefined),
      litValue("disused"),
    ]).toEqual([true, false, undefined, undefined]);
    expect([
      roadClass("secondary"),
      roadClass("residential"),
      roadClass("footway"),
    ]).toEqual(["major", "street", "path"]);
    expect([
      steepIncline("12%"),
      steepIncline("-5%"),
      steepIncline("up"),
    ]).toEqual([true, false, false]);
  });
});
