import { describe, expect, it } from "vitest";
import type { GraphEdge, Point, SceneObject, World } from "../shared/types";
import { inside } from "../shared/canopy";
import { createStudyWorld } from "../src/lib/study";
import { nearestWalkNode, route } from "../src/lib/routing";
import { destinationCatalog, publicWalk } from "../src/lib/destinations";
import { snapWalkPosition } from "../src/lib/walk-location";
import { upstairs } from "../src/lib/indoor/ids";
import type { IndoorLevel } from "../src/lib/indoor/types";
import { vectorizePlan } from "../src/lib/indoor/plan-image";
import {
  addInterior,
  footprintRing,
  joinPaths,
  minAreaRect,
  placePlan,
  removeInterior,
  setInteriorHours,
} from "../src/lib/indoor/place";
import { closedInteriors } from "../src/lib/indoor/hours";
import { findRefuges } from "../src/lib/refuges";
import { worldSchema } from "../shared/schema";
import { featuresToLevels } from "../src/lib/indoor/import-geojson";
import { drawnPlan } from "./fixtures/floor-plan";

/** A 60 × 35 m hall turned 30° on the map, like the drawn plan's 240 × 140. */
const hall: SceneObject = {
  id: "hall",
  kind: "building",
  name: "Test Hall",
  position: [10, -5],
  width: 60,
  depth: 35,
  height: 12,
  rotation: 30,
  source: "user",
  heightMethod: "designed",
};
/** A point in the hall's own frame, on the map. */
function onMap([x, z]: Point): Point {
  const a = (hall.rotation * Math.PI) / 180;
  return [
    hall.position[0] + x * Math.cos(a) - z * Math.sin(a),
    hall.position[1] + x * Math.sin(a) + z * Math.cos(a),
  ];
}
function edge(id: string, from: Point, to: Point): GraphEdge {
  return {
    id,
    from: `${id}-a`,
    to: `${id}-b`,
    points: [from, to],
    name: id,
    distance: Math.hypot(to[0] - from[0], to[1] - from[1]),
    covered: false,
    scenic: 0,
    indoor: "no",
    stairs: false,
    accessible: true,
    bidirectional: true,
  };
}
/**
 * Two paths that stop short of the hall's two ends, with no way round:
 * the only way from one to the other is through the building.
 */
function world(): World {
  const west = edge("west", onMap([-90, 0]), onMap([-36, 0]));
  const east = edge("east", onMap([36, 0]), onMap([90, 0]));
  return {
    ...createStudyWorld(),
    origin: { lat: 0, lon: 0 },
    objects: [hall],
    graph: {
      nodes: [
        { id: "west-a", point: west.points[0] },
        { id: "west-b", point: west.points[1] },
        { id: "east-a", point: east.points[0] },
        { id: "east-b", point: east.points[1] },
      ],
      edges: [west, east],
    },
  };
}
const options = {
  environment: {
    dateTime: "2026-08-20T20:00:00Z",
    temperatureC: 36,
    humidity: 40,
    windMps: 2,
    cloudCover: 0,
    weatherMode: "scenario" as const,
  },
  avoidStairs: false,
  allowHypothetical: false,
  maxDetour: 3,
};

describe("placing a floor plan in a building", () => {
  it("finds a turned rectangle's size and direction", () => {
    const r = minAreaRect(footprintRing(hall));
    expect(r.long).toBeCloseTo(60, 5);
    expect(r.short).toBeCloseTo(35, 5);
    expect(r.centre[0]).toBeCloseTo(10, 5);
    expect(r.centre[1]).toBeCloseTo(-5, 5);
    // The long side runs at 30° (or the opposite way, 210°).
    const deg = ((((r.angle * 180) / Math.PI) % 180) + 180) % 180;
    expect(deg).toBeCloseTo(30, 3);
  });

  it("fits the plan's rooms inside the outline, with the corridor down the middle", () => {
    const level = placePlan(vectorizePlan(drawnPlan()), hall);
    const ring = footprintRing(hall);
    expect(level.rooms).toHaveLength(6);
    for (const room of level.rooms) {
      const cx = room.ring.reduce((s, p) => s + p[0], 0) / room.ring.length,
        cz = room.ring.reduce((s, p) => s + p[1], 0) / room.ring.length;
      expect(inside(ring, cx, cz)).toBe(true);
    }
    // In the hall's frame, the corridor is near z = 0 and runs its length.
    const a = (-hall.rotation * Math.PI) / 180;
    const local = level.paths.flat().map(([x, z]): Point => {
      const dx = x - hall.position[0],
        dz = z - hall.position[1];
      return [
        dx * Math.cos(a) - dz * Math.sin(a),
        dx * Math.sin(a) + dz * Math.cos(a),
      ];
    });
    // Corridor pieces lie along z = 0 and together span the hall; the
    // rest link doorways to rooms.
    const toHall = ([x, z]: Point): Point => {
      const dx = x - hall.position[0],
        dz = z - hall.position[1];
      return [
        dx * Math.cos(a) - dz * Math.sin(a),
        dx * Math.sin(a) + dz * Math.cos(a),
      ];
    };
    const corridor = level.paths
      .map((p) => p.map(toHall))
      .filter((p) => p.every(([, z]) => Math.abs(z) < 4))
      .flat();
    const xs = corridor.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(45);
    // Links reach into the rooms on both sides.
    expect(Math.max(...local.map((p) => Math.abs(p[1])))).toBeGreaterThan(6);
    expect(level.doors).toHaveLength(6);
  });

  it("keeps a plan's proportions in a building of another shape", () => {
    const square = { ...hall, width: 60, depth: 60, rotation: 0 };
    const level = placePlan(vectorizePlan(drawnPlan()), square);
    const xs = level.rooms.flatMap((r) => r.ring.map((p) => p[0])),
      zs = level.rooms.flatMap((r) => r.ring.map((p) => p[1]));
    const across = Math.max(...xs) - Math.min(...xs),
      down = Math.max(...zs) - Math.min(...zs);
    // The drawn plan is 240 × 140; it stays that shape, fitted inside.
    expect(across / down).toBeCloseTo(240 / 140, 0);
    expect(across).toBeLessThanOrEqual(60.5);
  });

  it("turns the plan a quarter at a time when asked", () => {
    const plan = vectorizePlan(drawnPlan());
    const straight = placePlan(plan, hall);
    const flipped = placePlan(plan, hall, { turns: 2 });
    // A half turn sends each room to the other side of the centre.
    const c = (l: typeof straight, i: number) => l.rooms[i].ring[0];
    const s = c(straight, 0),
      f = c(flipped, 0);
    expect((s[0] + f[0]) / 2).toBeCloseTo(10, 0);
    expect((s[1] + f[1]) / 2).toBeCloseTo(-5, 0);
  });
});

describe("walking through an interior", () => {
  const map = () => ({
    buildingId: "hall",
    buildingName: "Test Hall",
    source: "floor plan image",
    levels: [placePlan(vectorizePlan(drawnPlan()), hall)],
  });

  it("has no way across before the interior is added", () => {
    const r = route(world(), "west-a", "east-b", {
      ...options,
      preference: "quickest",
    });
    expect(r).toBeNull();
  });

  it("routes through the building once its corridor is mapped", () => {
    const w = addInterior(world(), map());
    expect(w.indoor).toHaveLength(1);
    const indoorEdges = w.graph.edges.filter((e) =>
      e.id.startsWith("indoor:hall:"),
    );
    expect(indoorEdges.some((e) => e.indoor === "verified" && e.covered)).toBe(
      true,
    );
    expect(indoorEdges.filter((e) => e.name.endsWith("entrance"))).toHaveLength(
      2,
    );
    const r = route(w, "west-a", "east-b", {
      ...options,
      preference: "indoors",
    });
    expect(r).not.toBeNull();
    expect(r!.indoorFraction).toBeGreaterThan(0.25);
    expect(r!.edges.some((e) => e.name === "Test Hall")).toBe(true);
    // Through the hall, not much longer than a straight line.
    expect(r!.distance).toBeLessThan(180 * 1.15);
  });

  it("walks around the building while it's closed", () => {
    const w = addInterior(world(), { ...map(), hours: "24/7" });
    expect(w.indoor![0].hours).toBe("24/7");
    const walk = (x: World) =>
      route(x, "west-a", "east-b", { ...options, preference: "indoors" });
    expect(walk(w)).not.toBeNull();
    // Thursday 20 August 2026, 20:00 UTC, is the afternoon here.
    const tz = { ...w, timezone: "America/Chicago" };
    const closedNow = setInteriorHours(tz, "hall", "Mo-Fr 07:00-09:00");
    expect(closedInteriors(closedNow, options.environment.dateTime)).toEqual([
      "indoor:hall:",
    ]);
    // The hall is the only way across, so there's no walk at all.
    expect(walk(closedNow)).toBeNull();
    const openNow = setInteriorHours(tz, "hall", "Mo-Fr 07:00-22:00");
    expect(walk(openNow)).not.toBeNull();
    // Unreadable or cleared hours count as open, as before.
    expect(walk(setInteriorHours(tz, "hall", "by appointment"))).not.toBeNull();
    const cleared = setInteriorHours(closedNow, "hall", null);
    expect(cleared.indoor![0].hours).toBeUndefined();
    expect(walk(cleared)).not.toBeNull();
    // Hours are kept with the saved scene.
    expect(worldSchema.safeParse(closedNow).success).toBe(true);
  });

  it("still walks out of a closed building the walk starts in", () => {
    const w = setInteriorHours(
      { ...addInterior(world(), map()), timezone: "America/Chicago" },
      "hall",
      "Mo-Fr 07:00-09:00",
    );
    // A node deep inside: every path touching it is indoors (not a door).
    const room = w.graph.nodes.find((n) => {
      const touching = w.graph.edges.filter(
        (e) => e.from === n.id || e.to === n.id,
      );
      return (
        n.id.startsWith("indoor:hall:") &&
        touching.length > 0 &&
        touching.every((e) => e.indoor !== "no")
      );
    });
    expect(room).toBeDefined();
    const r = route(w, room!.id, "east-b", {
      ...options,
      preference: "quickest",
    });
    expect(r).not.toBeNull();
  });

  it("walks out of a closed building from a GPS fix on its corridor", () => {
    const w = setInteriorHours(
      { ...addInterior(world(), map()), timezone: "America/Chicago" },
      "hall",
      "Mo-Fr 07:00-09:00",
    );
    // A fix part-way along a corridor splits it: the new node isn't tagged.
    const corridor = w.graph.edges.find(
      (e) =>
        e.id.startsWith("indoor:hall:") && e.indoor !== "no" && e.distance > 4,
    )!;
    const [a, b] = corridor.points;
    const snap = snapWalkPosition(
      w,
      [(a[0] + b[0]) / 2 + 0.3, (a[1] + b[1]) / 2],
      publicWalk,
    )!;
    expect(snap.nodeId.startsWith("indoor:")).toBe(false);
    const out = route(snap.world, snap.nodeId, "east-b", {
      ...options,
      preference: "quickest",
    });
    expect(out).not.toBeNull();
    // An outdoor end by the door doesn't open the building: still no way
    // across from west to east.
    expect(
      route(w, "west-b", "east-a", { ...options, preference: "quickest" }),
    ).toBeNull();
  });

  it("keeps a closed building's door reachable but not its corridors", () => {
    const w = setInteriorHours(
      { ...addInterior(world(), map()), timezone: "America/Chicago" },
      "hall",
      "Mo-Fr 07:00-09:00",
    );
    const link = w.graph.edges.find(
      (e) => e.id.startsWith("indoor:hall:") && e.indoor === "no",
    )!;
    const door = [link.from, link.to].find((id) => id.startsWith("indoor:"))!;
    const outside = [link.from, link.to].find((id) => id !== door)!;
    // Walking to the door from outside: fine, along its outdoor link.
    const toDoor = route(w, outside, door, {
      ...options,
      preference: "quickest",
    });
    expect(toDoor).not.toBeNull();
    expect(toDoor!.edges.every((e) => e.indoor === "no")).toBe(true);
    // Ending at the door doesn't open the building for a walk across.
    const otherSide = outside.startsWith("west") ? "east-b" : "west-a";
    expect(
      route(w, door, otherSide, { ...options, preference: "quickest" }),
    ).toBeNull();
  });

  it("counts an open building with a mapped inside as a cool refuge", () => {
    const w = { ...addInterior(world(), map()), timezone: "America/Chicago" };
    // Thursday 3 PM: unknown hours count in the daytime.
    const at3pm = options.environment;
    const refuge = findRefuges(w, at3pm, []).find((r) => r.kind === "indoors");
    expect(refuge?.name).toBe("Test Hall");
    // Its point is the outdoor end of a doorway, not inside.
    expect(refuge!.nodeId.startsWith("indoor:")).toBe(false);
    // Closed by its hours: not a refuge.
    const closed = setInteriorHours(w, "hall", "Mo-Fr 07:00-09:00");
    expect(
      findRefuges(closed, at3pm, []).some((r) => r.kind === "indoors"),
    ).toBe(false);
    // Unknown hours at night: not offered either; known 24/7 hours are.
    const night = { ...at3pm, dateTime: "2026-08-21T07:00:00Z" };
    expect(findRefuges(w, night, []).some((r) => r.kind === "indoors")).toBe(
      false,
    );
    const allDay = setInteriorHours(w, "hall", "24/7");
    expect(
      findRefuges(allDay, night, []).some((r) => r.kind === "indoors"),
    ).toBe(true);
  });

  it("reads a building's hours from OSM or IMDF", () => {
    const square = [
      [0, 0],
      [0.0001, 0],
      [0.0001, 0.0001],
      [0, 0.0001],
      [0, 0],
    ];
    const room = {
      type: "Feature",
      properties: { indoor: "room", level: "0", name: "A" },
      geometry: { type: "Polygon", coordinates: [square] },
    };
    const osm = featuresToLevels(
      [
        room,
        {
          type: "Feature",
          properties: {
            building: "university",
            opening_hours: "Mo-Fr 07:00-22:00",
          },
          geometry: { type: "Polygon", coordinates: [square] },
        },
      ] as never,
      { lat: 0, lon: 0 },
    );
    expect(osm.hours).toBe("Mo-Fr 07:00-22:00");
    // Hours on a room are the room's, not the building's.
    const roomOnly = featuresToLevels(
      [
        {
          ...room,
          properties: { ...room.properties, opening_hours: "Mo 09:00-10:00" },
        },
      ] as never,
      { lat: 0, lon: 0 },
    );
    expect(roomOnly.hours).toBeUndefined();
    const imdf = featuresToLevels(
      [
        { ...room, feature_type: "unit", properties: { category: "room" } },
        {
          type: "Feature",
          feature_type: "venue",
          properties: { hours: "24/7" },
          geometry: null,
        },
      ] as never,
      { lat: 0, lon: 0 },
    );
    expect(imdf.hours).toBe("24/7");
  });

  it("goes in through the doors the plan shows", () => {
    const level = placePlan(
      vectorizePlan(drawnPlan({ entrances: true })),
      hall,
    );
    expect(level.entrances).toHaveLength(2);
    const w = addInterior(world(), { ...map(), levels: [level] });
    const doors = w.graph.edges.filter((e) => e.name === "Test Hall entrance");
    expect(doors).toHaveLength(2);
    // Each starts at a marked entrance, on the outline.
    const ring = footprintRing(hall);
    for (const e of doors) {
      const at = e.points[0];
      expect(
        level.entrances!.some(
          (p) => Math.hypot(p[0] - at[0], p[1] - at[1]) < 0.01,
        ),
      ).toBe(true);
      const d = Math.min(
        ...ring.map((a, i) => {
          const b = ring[(i + 1) % ring.length];
          const dx = b[0] - a[0],
            dz = b[1] - a[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((at[0] - a[0]) * dx + (at[1] - a[1]) * dz) / (dx * dx + dz * dz),
            ),
          );
          return Math.hypot(at[0] - a[0] - t * dx, at[1] - a[1] - t * dz);
        }),
      );
      expect(d).toBeLessThan(1.5);
    }
    const r = route(w, "west-a", "east-b", {
      ...options,
      preference: "indoors",
    });
    expect(r).not.toBeNull();
  });

  it("adds no island when no path outside reaches the building", () => {
    const far = world();
    // Move the outdoor paths 200 m away.
    far.graph.nodes = far.graph.nodes.map((n) => ({
      ...n,
      point: [n.point[0] + 200, n.point[1]] as Point,
    }));
    far.graph.edges = far.graph.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => [p[0] + 200, p[1]] as Point),
    }));
    const w = addInterior(far, map());
    expect(w.indoor).toHaveLength(1); // still drawn
    expect(w.graph).toEqual(far.graph); // but not walkable
  });

  it("keeps only the stretches of imported lines inside the building", () => {
    const w = addInterior(world(), {
      ...map(),
      source: "OpenStreetMap indoor",
      levels: [
        {
          ordinal: 0,
          name: "Ground floor",
          rooms: [],
          // A footway from 80 m west, through the hall, to 80 m east.
          paths: [[onMap([-80, 5]), onMap([80, 5])]],
          doors: [],
        },
      ],
    });
    const a = (-hall.rotation * Math.PI) / 180;
    for (const e of w.graph.edges.filter(
      (e) => e.id.startsWith("indoor:hall:") && e.indoor === "verified",
    ))
      for (const [x, z] of e.points) {
        const dx = x - hall.position[0],
          dz = z - hall.position[1];
        expect(Math.abs(dx * Math.cos(a) - dz * Math.sin(a))).toBeLessThan(34);
      }
  });

  it("joins lines without collapsing a finely drawn one", () => {
    const fine: Point[] = Array.from({ length: 40 }, (_, i) => [i * 0.5, 0]);
    const out = joinPaths([
      fine,
      [
        [19.6, 0.4],
        [19.6, 10],
      ],
    ]);
    expect(out[0].length).toBeGreaterThanOrEqual(40);
    expect(out[0][0]).toEqual([0, 0]);
    // The second line's end met the first's end: one junction.
    expect(out[1][0]).toEqual(out[0][out[0].length - 1]);
  });

  it("keeps every room of a hand-placed plan in a building that isn't a rectangle", () => {
    // An L-shaped hall: the plan fits its bounding rectangle, and part of
    // it lies outside the L.
    const ell: SceneObject = {
      ...hall,
      footprint: [
        [-30, -17.5],
        [30, -17.5],
        [30, 0],
        [0, 0],
        [0, 17.5],
        [-30, 17.5],
      ],
    };
    const w0 = { ...world(), objects: [ell] };
    const level = placePlan(vectorizePlan(drawnPlan()), ell);
    const w = addInterior(w0, { ...map(), levels: [level] });
    expect(w.indoor![0].levels[0].rooms).toHaveLength(6);
  });

  it("reads OSM corridor lines and leaves walls and fences out", () => {
    const line = (props: Record<string, unknown>) => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [0.0003, 0],
        ],
      },
      properties: props,
    });
    const { levels } = featuresToLevels(
      [
        line({ highway: "corridor", level: "1" }),
        line({ indoor: "wall", level: "1" }),
        line({ barrier: "fence" }),
        // Present so the file reads as OSM indoor tagging.
        { ...line({ indoor: "room", level: "1", name: "Lab" }) },
      ],
      { lat: 0, lon: 0 },
    );
    const paths = levels.flatMap((l) => l.paths);
    // The corridor, and the room's own line (a room drawn as a line is
    // still not a path): only the corridor walks.
    expect(paths).toHaveLength(1);
    expect(levels.every((l) => l.ordinal === 1)).toBe(true);
  });

  it("replaces an earlier interior and takes it back out cleanly", () => {
    const once = addInterior(world(), map());
    const twice = addInterior(once, map());
    expect(twice.indoor).toHaveLength(1);
    expect(twice.graph.edges.length).toBe(once.graph.edges.length);
    const gone = removeInterior(twice, "hall");
    expect(gone.indoor).toEqual([]);
    expect(gone.graph).toEqual(world().graph);
  });

  it("joins an imported GeoJSON corridor drawn as an area", () => {
    // A corridor polygon along the hall's length, as OSM indoor maps it.
    const ring = [
      [-29, -2],
      [29, -2],
      [29, 2],
      [-29, 2],
      [-29, -2],
    ].map(([x, z]) => onMap([x, z]));
    // Local metres to lon/lat near (0, 0), as geo.ts measures them.
    const toLonLat = ([x, z]: Point) => [x / 111_195, -z / 111_195];
    const { levels, source } = featuresToLevels(
      [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring.map(toLonLat)] },
          properties: { indoor: "corridor", level: "0", name: "Main hall" },
        },
      ],
      { lat: 0, lon: 0 },
    );
    expect(source).toBe("OpenStreetMap indoor");
    expect(levels[0].rooms[0].kind).toBe("corridor");
    const w = addInterior(world(), {
      buildingId: "hall",
      buildingName: "Test Hall",
      source,
      levels,
    });
    const r = route(w, "west-a", "east-b", {
      ...options,
      preference: "indoors",
    });
    expect(r).not.toBeNull();
  });

  describe("upper floors", () => {
    /** A box room in the hall's frame, centred at (x, z), w × d metres. */
    const box = (x: number, z: number, w: number, d: number): Point[] =>
      [
        [x - w / 2, z - d / 2],
        [x + w / 2, z - d / 2],
        [x + w / 2, z + d / 2],
        [x - w / 2, z + d / 2],
      ].map((p) => onMap(p as Point));
    const corridor = [onMap([-29, 0]), onMap([29, 0])];
    const floor = (ordinal: number, extra: IndoorLevel["rooms"]) => ({
      ordinal,
      name: ordinal === 0 ? "Ground floor" : `Level ${ordinal}`,
      rooms: [
        { name: "", ring: box(20, 4, 4, 4), kind: "stairs" as const },
        { name: "", ring: box(-20, 4, 3, 3), kind: "elevator" as const },
        ...extra,
      ],
      paths: [corridor],
      doors: [],
    });
    const twoFloors = () =>
      addInterior(world(), {
        buildingId: "hall",
        buildingName: "Test Hall",
        source: "IMDF",
        levels: [
          floor(0, []),
          floor(1, [{ name: "Room 204", ring: box(0, 8, 8, 6), kind: "room" }]),
        ],
      });
    const roomId = (w: World) =>
      w.graph.nodes.find((n) => n.name === "Room 204, Test Hall (Level 1)")?.id;

    it("walks up the stairs to a room on the next floor", () => {
      const w = twoFloors();
      const to = roomId(w);
      expect(to).toBeDefined();
      // From the east, the stairs (east end) are nearer than the lift.
      const r = route(w, "east-b", to!, { ...options, preference: "quickest" });
      expect(r).not.toBeNull();
      expect(r!.edges.some((e) => e.name === "Test Hall stairs")).toBe(true);
    });

    it("takes the lift on a step-free walk", () => {
      const w = twoFloors();
      const r = route(w, "east-b", roomId(w)!, {
        ...options,
        avoidStairs: true,
        preference: "quickest",
      });
      expect(r).not.toBeNull();
      expect(r!.edges.some((e) => e.stairs)).toBe(false);
      expect(r!.edges.some((e) => e.name === "Test Hall lift")).toBe(true);
    });

    it("lists the room as a place to walk to", () => {
      const labels = destinationCatalog(twoFloors()).map((d) => d.label);
      expect(labels).toContain("Room 204, Test Hall (Level 1)");
    });

    it("never starts a GPS walk on an upper floor or the stairs", () => {
      const w = twoFloors();
      // Standing in the corridor, where every floor's corridor coincides.
      const snap = snapWalkPosition(w, onMap([10, 0]), publicWalk);
      expect(snap).not.toBeNull();
      expect(upstairs(snap!.nodeId)).toBe(false);
      const touching = snap!.world.graph.edges.filter(
        (e) => e.from === snap!.nodeId || e.to === snap!.nodeId,
      );
      for (const e of touching)
        expect(upstairs(e.from) || upstairs(e.to)).toBe(false);
    });

    it("never snaps a tap on the map to an upper floor", () => {
      const w = twoFloors();
      // Right over the room: the nearest node is on the ground floor.
      const n = nearestWalkNode(w, onMap([0, 8]));
      expect(n).not.toBeNull();
      expect(n!.id).not.toMatch(/:f1/);
    });
  });
});

describe("reading an IMDF archive", () => {
  it("unpacks its GeoJSON, levels first, and skips other files", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { readFeatures } = await import("../src/lib/indoor/import-geojson");
    const fc = (features: unknown[]) =>
      strToU8(JSON.stringify({ type: "FeatureCollection", features }));
    const zip = zipSync({
      "venue/unit.geojson": fc([
        { type: "Feature", id: "u1", geometry: null, properties: {} },
      ]),
      "venue/level.geojson": fc([
        {
          type: "Feature",
          id: "l1",
          geometry: null,
          properties: { ordinal: 0 },
        },
      ]),
      "venue/readme.txt": strToU8("not geojson"),
    });
    const features = readFeatures([{ name: "venue.zip", data: zip }]);
    expect(features.map((f) => f.feature_type)).toEqual(["level", "unit"]);
  });

  it("ignores the extra files a Mac adds to a zip", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { readFeatures } = await import("../src/lib/indoor/import-geojson");
    const zip = zipSync({
      "venue/unit.geojson": strToU8(
        JSON.stringify({ type: "FeatureCollection", features: [] }),
      ),
      "__MACOSX/venue/._unit.geojson": new Uint8Array([0, 5, 22, 7, 0, 2]),
      "venue/broken.geojson": strToU8("{not json"),
    });
    expect(() =>
      readFeatures([{ name: "venue.zip", data: zip }]),
    ).not.toThrow();
  });
});
