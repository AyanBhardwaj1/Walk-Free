import { describe, expect, it } from "vitest";
import { parseOsmWorld, typicalHeight, worldOrigin } from "../shared/osm.js";
import { publishedHeight } from "../shared/landmark-heights.js";

describe("typical building heights", () => {
  it("scales by building type", () => {
    expect(typicalHeight("shed")).toBe(3);
    expect(typicalHeight("house")).toBeLessThan(typicalHeight("apartments"));
    expect(typicalHeight("cathedral")).toBeGreaterThan(typicalHeight("church"));
  });
  it("keeps 10 m for unknown or generic buildings", () => {
    expect(typicalHeight("yes")).toBe(10);
    expect(typicalHeight(undefined)).toBe(10);
  });
});

describe("published landmark heights", () => {
  const lat = 30.286,
    lon = -97.739;
  const square = (dLat: number, dLon: number) => {
    const s = 0.0002;
    return [
      { lat: lat + dLat, lon: lon + dLon },
      { lat: lat + dLat + s, lon: lon + dLon },
      { lat: lat + dLat + s, lon: lon + dLon + s },
      { lat: lat + dLat, lon: lon + dLon + s },
      { lat: lat + dLat, lon: lon + dLon },
    ];
  };
  const building = (
    id: number,
    dLat: number,
    tags: Record<string, string>,
  ) => ({
    type: "way" as const,
    id,
    nodes: [1, 2, 3, 4, 1],
    tags: { building: "yes", ...tags },
    geometry: square(dLat, 0),
  });
  const world = parseOsmWorld(
    {
      elements: [
        building(516187631, 0, { name: "UT Tower", height: "23" }),
        building(99, 0.001, { name: "Other", height: "23" }),
      ],
    },
    worldOrigin(lat, lon),
    "Test",
    600,
  );
  it("uses the cited height for the UT Tower, keeping its masonry look", () => {
    const tower = world.objects.find((o) => o.name === "UT Tower")!;
    expect(tower.height).toBeCloseTo(93.6);
    expect(tower.heightMethod).toBe("published");
    expect(tower.kind).toBe("building");
  });
  it("leaves other buildings with their mapped height", () => {
    const other = world.objects.find((o) => o.name === "Other")!;
    expect(other.height).toBe(23);
    expect(other.heightMethod).toBe("mapped");
  });
  it("only answers for listed ids", () => {
    expect(publishedHeight("way/1")).toBeUndefined();
    expect(publishedHeight("toString")).toBeUndefined();
  });
});
