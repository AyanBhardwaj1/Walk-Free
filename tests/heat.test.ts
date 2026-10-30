import { describe, expect, it } from "vitest";
import type { Environment, GraphEdge, World } from "../shared/types";
import {
  atLocalHour,
  dailyProfile,
  edgeHeatMap,
  heatConditions,
  heatLevel,
  localHour,
  placeHeat,
  readHeat,
  routeHeat,
  toF,
} from "../src/lib/heat";

const origin = { lat: 30.285, lon: -97.7341 };
// 3pm CDT on a clear July afternoon in Austin.
const afternoon: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 36,
  humidity: 45,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const edge = (
  id: string,
  name: string,
  x: number,
  extra: Partial<GraphEdge> = {},
): GraphEdge => ({
  id,
  from: `${id}-a`,
  to: `${id}-b`,
  points: [
    [x, -60],
    [x, 60],
  ],
  name,
  distance: 120,
  covered: false,
  scenic: 0.2,
  indoor: "no",
  stairs: false,
  accessible: true,
  bidirectional: true,
  ...extra,
});
// Speedway runs in the open; the South Mall runs under a line of big oaks.
function campus(): World {
  return {
    id: "heat-test",
    name: "Heat test",
    origin,
    timezone: "America/Chicago",
    extent: 400,
    objects: Array.from({ length: 13 }, (_, i) => ({
      id: `oak-${i}`,
      kind: "tree" as const,
      name: "Oak",
      position: [100, -60 + i * 10] as [number, number],
      width: 14,
      depth: 14,
      height: 12,
      rotation: 0,
      source: "osm" as const,
    })),
    roads: [],
    landscapes: [],
    graph: {
      nodes: [],
      edges: [edge("speedway", "Speedway", 0), edge("mall", "South Mall", 100)],
    },
    provenance: {
      source: "test",
      attribution: "",
      retrievedAt: "2026-07-15T00:00:00Z",
      live: false,
      notes: [],
    },
  } as unknown as World;
}

describe("heat estimates", () => {
  it("adds a solar load in the afternoon sun and none at night", () => {
    const day = heatConditions(afternoon, origin);
    expect(day.sunBoostC).toBeGreaterThan(5);
    const night = heatConditions(
      { ...afternoon, dateTime: "2026-07-16T07:00:00Z" },
      origin,
    );
    expect(night.sunBoostC).toBe(0);
  });

  it("damps the solar load under cloud", () => {
    const clear = heatConditions(afternoon, origin).sunBoostC;
    const overcast = heatConditions(
      { ...afternoon, cloudCover: 100 },
      origin,
    ).sunBoostC;
    expect(overcast).toBeLessThan(clear / 2);
  });

  it("rates feels-like temperatures into five levels", () => {
    expect(
      [70, 80, 90, 100, 110].map((f) => heatLevel(((f - 32) * 5) / 9)),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it("blends sun and shade by the shaded share", () => {
    const c = { shadeFeelsC: 35, sunBoostC: 6 };
    expect(readHeat(c, 1).feelsLikeC).toBe(35);
    expect(readHeat(c, 0).feelsLikeC).toBe(41);
    expect(readHeat(c, 0.5).feelsLikeC).toBe(38);
  });

  it("ranks an open street hotter than a tree-lined walk", () => {
    const places = placeHeat(campus(), afternoon);
    expect(places.map((p) => p.name)).toEqual(["Speedway", "South Mall"]);
    const [speedway, mall] = places;
    expect(speedway.shade).toBeLessThan(0.2);
    expect(mall.shade).toBeGreaterThan(0.6);
    expect(toF(speedway.feelsLikeC) - toF(mall.feelsLikeC)).toBeGreaterThan(5);
  });

  it("treats covered edges as fully shaded and skips hypothetical ones", () => {
    const w = campus();
    w.graph.edges.push(
      edge("arcade", "Arcade", 200, { covered: true }),
      edge("idea", "Idea", 300, { indoor: "hypothetical" }),
    );
    const heat = edgeHeatMap(w, afternoon);
    expect(heat.get("arcade")?.shade).toBe(1);
    expect(heat.has("idea")).toBe(false);
  });

  it("converts local wall-clock hours across the time zone", () => {
    expect(atLocalHour(afternoon.dateTime, "America/Chicago", 9)).toBe(
      "2026-07-15T14:00:00.000Z",
    );
    expect(localHour("2026-07-15T20:30:00Z", "America/Chicago")).toBe(15.5);
    expect(atLocalHour("2026-01-15T20:00:00Z", "America/Chicago", 9)).toBe(
      "2026-01-15T15:00:00.000Z",
    );
  });

  it("profiles a street through the day using forecast hours when present", () => {
    const w = campus();
    const forecast = {
      source: "test",
      fetchedAt: "",
      attribution: "",
      hours: [
        {
          time: "2026-07-15T20:00:00Z",
          temperatureC: 40,
          humidity: 30,
          windMps: 1,
          cloudCover: 0,
          description: "Sunny",
        },
      ],
    };
    const profile = dailyProfile(
      w,
      afternoon,
      { edgeIds: ["speedway"], samples: [] },
      forecast,
      [9, 15],
    );
    expect(profile.map((p) => p.hour)).toEqual([9, 15]);
    // 40 °C at 30% humidity: the NWS heat index is about 43 °C.
    expect(profile[1].shadeFeelsC).toBeCloseTo(43.1, 0);
    expect(profile[0].feelsLikeC).toBeLessThan(profile[1].feelsLikeC);
  });

  it("reports minutes in direct sun for a route", () => {
    const heat = routeHeat(
      { shadeFraction: 0.25, durationMinutes: 12 },
      afternoon,
      origin,
    );
    expect(heat.sunMinutes).toBe(9);
  });
});
