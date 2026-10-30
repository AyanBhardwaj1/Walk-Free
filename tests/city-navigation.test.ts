import { describe, it, expect, vi } from "vitest";
import { parseOsmWorld, type OsmResponse } from "../server/data";
import {
  defaultEndpoints,
  destinationCatalog,
  searchDestinations,
} from "../src/lib/destinations";
import { compareRoutes, route } from "../src/lib/routing";
import {
  snapWalkPosition,
  usableFix,
  hasArrived,
  type LocationFix,
} from "../src/lib/walk-location";
import {
  LocationSession,
  type LocationAdapter,
} from "../src/lib/location-session";
import type { World } from "../shared/types";

const origin = { lat: 37.87, lon: -122.26 };
const options = {
  avoidStairs: false,
  allowHypothetical: false,
  maxDetour: 2,
  environment: {
    dateTime: "2026-07-15T20:00:00Z",
    temperatureC: 30,
    humidity: 50,
    windMps: 3,
    cloudCover: 0,
    weatherMode: "scenario" as const,
  },
};
// Synthetic OSM-format campus: two public walks, stairs, a private drive, and a disconnected path.
function campus() {
  const positions: Record<number, [number, number]> = {
    1: [37.87, -122.261],
    2: [37.87, -122.26],
    3: [37.87, -122.259],
    4: [37.871, -122.26],
    5: [37.871, -122.259],
    6: [37.873, -122.263],
    7: [37.874, -122.263],
  };
  const way = (id: number, nodes: number[], tags: Record<string, string>) => ({
    type: "way" as const,
    id,
    nodes,
    tags,
    geometry: nodes.map((n) => ({
      lat: positions[n][0],
      lon: positions[n][1],
    })),
  });
  const response: OsmResponse = {
    elements: [
      ...Object.entries(positions).map(([id, p]) => ({
        type: "node" as const,
        id: +id,
        lat: p[0],
        lon: p[1],
      })),
      way(100, [1, 2, 3], { highway: "footway", name: "College Walk" }),
      way(101, [2, 4, 5, 3], {
        highway: "footway",
        name: "Library Walk",
        covered: "yes",
      }),
      way(102, [1, 4], { highway: "steps", name: "Library Steps" }),
      way(103, [3, 6], {
        highway: "service",
        access: "private",
        name: "Private Drive",
      }),
      way(104, [6, 7], { highway: "footway", name: "Remote Path" }),
      {
        type: "way",
        id: 200,
        tags: { building: "yes", name: "Campus Library" },
        geometry: [
          { lat: 37.8711, lon: -122.2601 },
          { lat: 37.8711, lon: -122.2599 },
          { lat: 37.8713, lon: -122.2599 },
          { lat: 37.8713, lon: -122.2601 },
          { lat: 37.8711, lon: -122.2601 },
        ],
      },
    ],
  };
  return parseOsmWorld(response, origin, "Campus integration fixture");
}
describe("built campus navigation", () => {
  it("offers a connected default walk despite an unrelated last node", () => {
    const w = campus(),
      [start, end] = defaultEndpoints(w);
    expect(end).not.toBe(w.graph.nodes.at(-1)?.id);
    const choices = compareRoutes(w, start, end, options);
    for (const r of Object.values(choices)) {
      expect(r?.distance).toBeGreaterThan(0);
      expect(r?.hypothetical).toBe(false);
    }
  });
  it("routes all preferences on the newly parsed network, excluding private access", () => {
    const w = campus();
    for (const r of Object.values(
      compareRoutes(w, "osm-node-1", "osm-node-5", options),
    )) {
      expect(r?.points[0]).toEqual(
        w.graph.nodes.find((n) => n.id === "osm-node-1")?.point,
      );
      expect(r?.points.at(-1)).toEqual(
        w.graph.nodes.find((n) => n.id === "osm-node-5")?.point,
      );
    }
    expect(w.graph.edges.some((e) => e.name === "Private Drive")).toBe(false);
    expect(
      route(w, "osm-node-1", "osm-node-7", {
        ...options,
        preference: "quickest",
      }),
    ).toBeNull();
  });
  it("finds campus buildings and streets without creating building-entry edges", () => {
    const w = campus(),
      catalog = destinationCatalog(w);
    const found = searchDestinations(catalog, "campus library", "", 60);
    expect(found.total).toBe(1);
    expect(found.shown[0].label).toBe("Path near Campus Library");
    expect(found.shown[0].id).toBe("osm-node-4");
    // The street's plain path points share one label and are listed once.
    expect(searchDestinations(catalog, "college walk", "", 60).total).toBe(2);
    expect(catalog.length).toBe(w.graph.nodes.length);
  });
  it("searches beyond the initial option limit and keeps the current point available", () => {
    const catalog = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      label: `Point ${i}`,
      detail: "",
      search: `point ${i}`,
      keys: [{ text: `point ${i}`, place: false }],
    }));
    expect(
      searchDestinations(catalog, "point 499", "0").shown.map((n) => n.id),
    ).toEqual(["0", "499"]);
  });
  it("handles empty graphs and picks the proper direction on one-way routes", () => {
    const w = campus();
    w.graph.edges = [];
    expect(defaultEndpoints(w)).toEqual(["", ""]);
    const e = campus().graph.edges[0];
    w.graph.edges = [
      {
        ...e,
        bidirectional: false,
        from: e.to,
        to: e.from,
        points: [...e.points].reverse(),
      },
    ];
    const [start, end] = defaultEndpoints(w);
    expect(start).toBe(e.to);
    expect(end).toBe(e.from);
  });
});
function straightWorld(): World {
  return {
    ...campus(),
    objects: [],
    graph: {
      nodes: [
        { id: "a", point: [0, 0] },
        { id: "b", point: [400, 0] },
      ],
      edges: [
        {
          id: "road",
          from: "a",
          to: "b",
          points: [
            [0, 0],
            [400, 0],
          ],
          distance: 400,
          name: "Campus walk",
          covered: false,
          scenic: 0.5,
          indoor: "no",
          stairs: false,
          accessible: true,
          bidirectional: true,
        },
      ],
    },
  };
}
describe("GPS on the current walking network", () => {
  it("starts midway along a long path, preserving remaining length in either direction", () => {
    const w = straightWorld(),
      snap = snapWalkPosition(w, [150, 8], options)!;
    expect(snap.point).toEqual([150, 0]);
    expect(snap.distance).toBe(8);
    expect(
      route(snap.world, snap.nodeId, "b", {
        ...options,
        preference: "quickest",
      })?.distance,
    ).toBe(250);
    expect(
      route(snap.world, snap.nodeId, "a", {
        ...options,
        preference: "quickest",
      })?.distance,
    ).toBe(150);
    expect(w.graph.nodes).toHaveLength(2);
    expect(w.graph.edges).toHaveLength(1);
  });
  it("does not reverse one-way paths or admit stairs/hypothetical links against settings", () => {
    const w = straightWorld();
    w.graph.edges[0].bidirectional = false;
    const snap = snapWalkPosition(w, [150, 0], options)!;
    expect(
      route(snap.world, snap.nodeId, "a", {
        ...options,
        preference: "quickest",
      }),
    ).toBeNull();
    w.graph.edges[0].stairs = true;
    expect(
      snapWalkPosition(w, [150, 0], { ...options, avoidStairs: true }),
    ).toBeNull();
    w.graph.edges[0].indoor = "hypothetical";
    expect(snapWalkPosition(w, [150, 0], options)).toBeNull();
  });
  it("preserves polyline geometry and total distance when splitting a bend", () => {
    const w = straightWorld();
    w.graph.edges[0].points = [
      [0, 0],
      [0, 200],
      [200, 200],
    ];
    w.graph.nodes[1].point = [200, 200];
    const snap = snapWalkPosition(w, [50, 200], options)!;
    const r = route(snap.world, snap.nodeId, "a", {
      ...options,
      preference: "quickest",
    });
    expect(r?.distance).toBe(250);
    expect(r?.points).toEqual([
      [50, 200],
      [0, 200],
      [0, 0],
    ]);
  });
  it("does not leave duplicate vertices when GPS is exactly on a polyline bend", () => {
    const w = straightWorld();
    w.graph.edges[0].points = [
      [0, 0],
      [0, 200],
      [200, 200],
    ];
    w.graph.nodes[1].point = [200, 200];
    const snap = snapWalkPosition(w, [0, 200], options)!;
    expect(
      route(snap.world, snap.nodeId, "b", {
        ...options,
        preference: "quickest",
      })?.points,
    ).toEqual([
      [0, 200],
      [200, 200],
    ]);
  });
  it("reports off-network fixes and never uses another city's coordinates", () => {
    const w = straightWorld();
    expect(snapWalkPosition(w, [150, 41], options)).toBeNull();
    expect(snapWalkPosition(w, [5000, 5000], options)).toBeNull();
  });
  it("checks freshness and accuracy, and does not announce arrival across a disconnected gap", () => {
    const now = 100000,
      fix = { lat: 37, lon: -122, accuracy: 10, timestamp: now };
    expect(usableFix(fix, now)).toBe(true);
    expect(usableFix({ ...fix, accuracy: 80 }, now)).toBe(false);
    expect(usableFix({ ...fix, timestamp: now - 31000 }, now)).toBe(false);
    expect(hasArrived([10, 0], [0, 0], 10, 15)).toBe(true);
    expect(hasArrived([10, 0], [0, 0], 40, 15)).toBe(false);
    expect(hasArrived([10, 0], [0, 0], 10, 500)).toBe(false);
    expect(hasArrived([10, 0], [0, 0], 10, null)).toBe(false);
  });
});
describe("GPS lifecycle", () => {
  const fix: LocationFix = {
    lat: 37,
    lon: -122,
    accuracy: 5,
    timestamp: Date.now(),
  };
  it("cleans up a pending permission/watcher request after cancellation", async () => {
    let resolve!: (cleanup: () => void) => void,
      deliver!: (fix: LocationFix) => void;
    const cleanup = vi.fn(),
      onFix = vi.fn();
    const adapter: LocationAdapter = (callback) => {
      deliver = callback;
      return new Promise((r) => {
        resolve = r;
      });
    };
    const session = new LocationSession(adapter),
      pending = session.start(onFix, vi.fn());
    session.stop();
    deliver(fix);
    resolve(cleanup);
    await pending;
    expect(onFix).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("ignores late callbacks from a prior city/session", async () => {
    const callbacks: ((fix: LocationFix) => void)[] = [],
      cleanups = [vi.fn(), vi.fn()];
    const session = new LocationSession(async (cb) => {
      callbacks.push(cb);
      return cleanups[callbacks.length - 1];
    });
    const old = vi.fn(),
      current = vi.fn();
    await session.start(old, vi.fn());
    await session.start(current, vi.fn());
    callbacks[0](fix);
    callbacks[1](fix);
    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledOnce();
    expect(cleanups[0]).toHaveBeenCalledOnce();
    session.stop();
    expect(cleanups[1]).toHaveBeenCalledOnce();
  });
  it("stops even if the adapter errors before returning its cleanup", async () => {
    const cleanup = vi.fn(),
      error = vi.fn();
    const session = new LocationSession(async (_, fail) => {
      fail("Permission denied");
      return cleanup;
    });
    await session.start(vi.fn(), error);
    expect(error).toHaveBeenCalledWith("Permission denied");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
