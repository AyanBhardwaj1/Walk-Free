import { describe, expect, it } from "vitest";
import { overpassQuery, parseOsmWorld, worldOrigin } from "../shared/osm";
import { compareRoutes } from "../src/lib/routing";
import { worldSchema } from "../shared/schema";

const lat = 30.28,
  lon = -97.73;
const node = (
  id: number,
  dLat: number,
  dLon: number,
  tags?: Record<string, string>,
) => ({
  type: "node" as const,
  id,
  lat: lat + dLat,
  lon: lon + dLon,
  ...(tags ? { tags } : {}),
});
const elements = [
  node(1, 0, 0),
  node(2, 0.001, 0),
  node(3, 0.002, 0),
  {
    type: "way" as const,
    id: 10,
    nodes: [1, 2, 3],
    tags: { highway: "footway", name: "Speedway" },
    geometry: [
      { lat, lon },
      { lat: lat + 0.001, lon },
      { lat: lat + 0.002, lon },
    ],
  },
  // Beside the path, far from it, private, and a shade shelter.
  node(20, 0.001, 0.0001, { amenity: "drinking_water" }),
  node(21, 0.001, 0.003, { amenity: "drinking_water" }),
  node(22, 0.0015, 0, { amenity: "drinking_water", access: "private" }),
  node(23, 0.0005, 0.0001, { amenity: "shelter", shelter_type: "picnic_shelter" }),
  node(24, 0.0005, 0, { amenity: "toilets", drinking_water: "yes" }),
];

describe("heat-relief amenities", () => {
  it("asks Overpass for drinking water and shelters", () => {
    const q = overpassQuery(lat, lon, 300);
    expect(q).toContain('node["amenity"~"^(drinking_water|water_point|shelter)$"]');
    expect(q).toContain('node["drinking_water"="yes"]');
  });

  it("keeps public water and shelters, and counts water along a route", () => {
    const world = worldSchema.parse(
      parseOsmWorld({ elements }, worldOrigin(lat, lon), "Test", 600),
    );
    expect(world.amenities!.map((a) => [a.kind, a.name])).toEqual([
      ["water", "Drinking water"],
      ["water", "Drinking water"],
      ["shelter", "Shade shelter"],
      ["water", "Drinking water"],
    ]);
    const ids = world.graph.nodes.map((n) => n.id);
    const routes = compareRoutes(world, ids[0], ids.at(-1)!, {
      avoidStairs: false,
      allowHypothetical: false,
      maxDetour: 2,
      environment: {
        dateTime: "2026-07-15T20:00:00Z",
        temperatureC: 33,
        humidity: 40,
        windMps: 2,
        cloudCover: 0,
        weatherMode: "scenario",
      },
    });
    // The fountain beside the path and the one at the toilets, not the far one.
    expect(routes.quickest?.waterStops).toBe(2);
  });
});
