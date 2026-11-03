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
  it("keeps a cited height even with taller-looking parts inside", () => {
    const tower = parseOsmWorld(
      {
        elements: [
          building(516187631, 0, { name: "UT Tower", height: "23" }),
          {
            type: "way" as const,
            id: 98,
            nodes: [1, 2, 3, 4, 1],
            tags: { "building:part": "yes", height: "72" },
            geometry: square(0, 0).map((p) => ({
              lat: p.lat + 0.00005,
              lon: p.lon + 0.00005,
            })),
          },
        ],
      },
      worldOrigin(lat, lon),
      "Test",
      600,
    ).objects.find((o) => o.name === "UT Tower")!;
    expect(tower.height).toBeCloseTo(93.6);
  });
  it("only answers for listed ids", () => {
    expect(publishedHeight("way/1")).toBeUndefined();
    expect(publishedHeight("toString")).toBeUndefined();
  });
});

describe("outlines with 3D parts", () => {
  const lat = 40.7484,
    lon = -73.9857;
  const box = (dLat: number, dLon: number, s: number) => [
    { lat: lat + dLat, lon: lon + dLon },
    { lat: lat + dLat + s, lon: lon + dLon },
    { lat: lat + dLat + s, lon: lon + dLon + s },
    { lat: lat + dLat, lon: lon + dLon + s },
    { lat: lat + dLat, lon: lon + dLon },
  ];
  const way = (
    id: number,
    geometry: { lat: number; lon: number }[],
    tags: Record<string, string>,
  ) => ({
    type: "way" as const,
    id,
    nodes: [1, 2, 3, 4, 1],
    tags,
    geometry,
  });
  const world = parseOsmWorld(
    {
      elements: [
        // A tall envelope with a podium part and a tower part inside it.
        way(1, box(0, 0, 0.001), {
          building: "yes",
          name: "Tower Block",
          height: "443",
        }),
        way(2, box(0.0001, 0.0001, 0.0008), {
          "building:part": "yes",
          height: "75",
        }),
        way(3, box(0.0004, 0.0004, 0.0002), {
          "building:part": "yes",
          height: "380",
        }),
        // A low base whose only part is a taller tower: left alone.
        way(4, box(0.003, 0, 0.001), {
          building: "yes",
          name: "Low Base",
          "building:levels": "2",
        }),
        way(5, box(0.0034, 0.0004, 0.0002), {
          "building:part": "yes",
          height: "90",
        }),
        // A tall outline whose only part has a guessed height: left alone.
        way(7, box(0.0045, 0, 0.001), {
          building: "yes",
          name: "Guessed Part",
          height: "150",
        }),
        way(8, box(0.0049, 0.0004, 0.0002), { "building:part": "roof" }),
        // No parts at all.
        way(6, box(0.006, 0, 0.0005), {
          building: "yes",
          name: "Plain",
          height: "300",
        }),
      ],
    },
    worldOrigin(lat, lon),
    "Test",
    800,
  );
  const byName = (n: string) => world.objects.find((o) => o.name === n)!;
  it("caps an envelope at its lowest part so the setbacks show", () => {
    expect(byName("Tower Block").height).toBe(75);
    expect(byName("Tower Block").kind).toBe("building");
    expect(world.provenance.notes.join(" ")).toContain("lowered");
  });
  it("never raises an outline, and leaves outlines without parts alone", () => {
    expect(byName("Low Base").height).toBeCloseTo(6.4);
    expect(byName("Plain").height).toBe(300);
    expect(byName("Guessed Part").height).toBe(150);
    expect(world.objects.some((o) => o.height === 380)).toBe(true);
  });
});
