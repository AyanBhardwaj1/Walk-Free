import { describe, expect, it } from "vitest";
import type { GraphEdge, World } from "../shared/types";
import { createStudyWorld } from "../src/lib/study";
import {
  compareRoutes,
  nearestWalkNode,
  route,
  samplePolyline,
  walkingDirections,
} from "../src/lib/routing";
import { createShadeTester } from "../src/lib/environment";

const environment = {
  dateTime: "2026-03-20T12:00:00Z",
  temperatureC: 30,
  humidity: 50,
  windMps: 3,
  cloudCover: 0,
  weatherMode: "scenario" as const,
};
const options = {
  environment,
  avoidStairs: false,
  allowHypothetical: false,
  maxDetour: 2,
};
function edge(
  id: string,
  from: string,
  to: string,
  distance: number,
  extra: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id,
    from,
    to,
    distance,
    points: [
      [0, 0],
      [distance, 0],
    ],
    name: id,
    covered: false,
    scenic: 0,
    indoor: "no",
    stairs: false,
    accessible: true,
    bidirectional: true,
    ...extra,
  };
}
function world(): World {
  return {
    ...createStudyWorld(),
    origin: { lat: 0, lon: 0 },
    objects: [],
    graph: {
      nodes: [
        { id: "a", point: [0, 0] },
        { id: "b", point: [100, 0] },
        { id: "c", point: [50, 50] },
      ],
      edges: [
        edge("direct", "a", "b", 100),
        edge("green-1", "a", "c", 70, {
          covered: true,
          scenic: 1,
          indoor: "verified",
        }),
        edge("green-2", "c", "b", 70, {
          covered: true,
          scenic: 1,
          indoor: "verified",
        }),
      ],
    },
  };
}
describe("route comparisons", () => {
  it("offers a longer covered/scenic/indoor path alongside the quickest", () => {
    const choices = compareRoutes(world(), "a", "b", options);
    expect(choices.quickest?.distance).toBe(100);
    for (const p of ["shade", "scenic", "indoors"] as const) {
      expect(choices[p]?.distance).toBe(140);
      expect(choices[p]?.shadeFraction).toBe(1);
      expect(choices[p]?.indoorFraction).toBe(1);
    }
  });
  it("falls back with a warning when a preferred route exceeds the detour budget", () => {
    const choices = compareRoutes(world(), "a", "b", {
      ...options,
      maxDetour: 1.2,
    });
    for (const p of ["shade", "scenic", "indoors"] as const) {
      expect(choices[p]?.edges.map((e) => e.id)).toEqual(["direct"]);
      expect(choices[p]?.warnings[0]).toContain("detour budget");
    }
  });
  it("preserves one-way and stair restrictions for every preference", () => {
    const w = world();
    w.graph.edges = [
      edge("one-way", "a", "b", 100, { bidirectional: false, stairs: true }),
    ];
    expect(
      Object.values(compareRoutes(w, "b", "a", options)).every(
        (r) => r === null,
      ),
    ).toBe(true);
    expect(
      Object.values(
        compareRoutes(w, "a", "b", { ...options, avoidStairs: true }),
      ).every((r) => r === null),
    ).toBe(true);
    expect(
      route(w, "a", "b", { ...options, preference: "quickest" })?.distance,
    ).toBe(100);
  });
  it("does not invent connections for missing or identical endpoints", () => {
    for (const end of ["a", "missing"]) {
      expect(
        Object.values(compareRoutes(world(), "a", end, options)).every(
          (r) => r === null,
        ),
      ).toBe(true);
    }
  });
  it("updates tentative routes when a cheaper path reaches the same node", () => {
    const w = world();
    w.graph.nodes.push({ id: "d", point: [100, 100] });
    w.graph.edges = [
      edge("expensive", "a", "b", 100),
      edge("short", "a", "c", 5),
      edge("connect", "c", "b", 5),
      edge("finish", "b", "d", 5),
      edge("long", "c", "d", 200),
    ];
    expect(
      route(w, "a", "d", { ...options, preference: "quickest" })?.edges.map(
        (e) => e.id,
      ),
    ).toEqual(["short", "connect", "finish"]);
  });
  it("keeps hypothetical links excluded unless explicitly enabled", () => {
    const w = world();
    w.graph.edges = w.graph.edges
      .slice(1)
      .map((e) => ({ ...e, indoor: "hypothetical" }));
    expect(
      Object.values(compareRoutes(w, "a", "b", options)).every(
        (r) => r === null,
      ),
    ).toBe(true);
    expect(
      Object.values(
        compareRoutes(w, "a", "b", { ...options, allowHypothetical: true }),
      ).every((r) => r?.hypothetical),
    ).toBe(true);
  });
});
describe("map endpoints and directions", () => {
  it("snaps only to connected nodes within the selection radius", () => {
    const w = world();
    w.graph.nodes.push({ id: "isolated", point: [2, 2] });
    expect(nearestWalkNode(w, [2, 2])?.id).toBe("a");
    expect(nearestWalkNode(w, [1000, 1000])).toBeNull();
    expect(nearestWalkNode(w, [0, -40])?.id).toBe("a");
  });
  it("merges straight same-road segments but retains turns and indoor transitions", () => {
    const a = edge("1", "a", "b", 10, {
      name: "Park walk",
      points: [
        [0, 0],
        [10, 0],
      ],
    });
    const b = edge("2", "b", "c", 10, {
      name: "Park walk",
      points: [
        [10, 0],
        [20, 0],
      ],
    });
    const c = edge("3", "c", "d", 10, {
      name: "Park walk",
      points: [
        [20, 0],
        [20, 10],
      ],
    });
    expect(walkingDirections([a, b, c]).map((d) => d.distance)).toEqual([
      20, 10,
    ]);
    expect(walkingDirections([a, b, c])[1].text).toContain("right");
    expect(walkingDirections([a, { ...b, indoor: "verified" }])).toHaveLength(
      2,
    );
  });
});
describe("shade along real path geometry", () => {
  it("samples corners and duplicate vertices without shortcuts", () => {
    expect(
      samplePolyline(
        [
          [0, 0],
          [0, 0],
          [0, 100],
          [100, 100],
        ],
        4,
      ),
    ).toEqual([
      [0, 25],
      [0, 75],
      [25, 100],
      [75, 100],
    ]);
    expect(
      samplePolyline(
        [
          [1, 1],
          [1, 1],
        ],
        4,
      ),
    ).toEqual([[1, 1]]);
  });
  it("measures shade on a curved path rather than its endpoint chord", () => {
    const w = world();
    w.objects = [
      {
        id: "roof",
        name: "Roof",
        kind: "building",
        position: [0, 50],
        width: 10,
        depth: 110,
        height: 10,
        rotation: 0,
        source: "study",
        heightMethod: "designed",
      },
    ];
    w.graph.edges = [
      edge("bend", "a", "b", 200, {
        points: [
          [0, 0],
          [0, 100],
          [100, 100],
        ],
      }),
    ];
    const r = route(w, "a", "b", { ...options, preference: "shade" });
    expect(r?.shadeFraction).toBeGreaterThan(0.4);
    expect(r?.shadeFraction).toBeLessThan(0.65);
  });
  it("handles rotated footprints, tree canopies and nighttime", () => {
    const w = world();
    w.objects = [
      {
        id: "roof",
        name: "Roof",
        kind: "building",
        position: [0, 0],
        width: 10,
        depth: 10,
        height: 10,
        rotation: 90,
        footprint: [
          [-30, -5],
          [30, -5],
          [30, 5],
          [-30, 5],
        ],
        source: "study",
        heightMethod: "designed",
      },
    ];
    expect(createShadeTester(w, environment)([0, 20])).toBe(true);
    expect(createShadeTester(w, environment)([20, 0])).toBe(false);
    w.objects = [
      {
        ...w.objects[0],
        kind: "tree",
        footprint: undefined,
        width: 20,
        depth: 20,
      },
    ];
    expect(createShadeTester(w, environment)([0, 0])).toBe(true);
    expect(
      createShadeTester(w, {
        ...environment,
        dateTime: "2026-03-20T00:00:00Z",
      })([999, 999]),
    ).toBe(true);
  });
});
