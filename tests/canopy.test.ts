import { describe, expect, it } from "vitest";
import {
  canopyCells,
  canopyTrees,
  fromMercator,
  mercatorBox,
  quadkeysFor,
  toMercator,
  type CanopyRaster,
} from "../shared/canopy";
import type { SceneObject } from "../shared/types";

describe("canopy tiles", () => {
  it("finds the zoom-10 quadkey that holds UT Austin", () => {
    const keys = quadkeysFor(mercatorBox(30.2855, -97.7345, 50), 10);
    expect(keys.map((k) => k.key)).toContain("0231301203");
  });

  it("round-trips Web Mercator coordinates", () => {
    const [x, y] = toMercator(37.87, -122.26);
    const back = fromMercator(x, y);
    expect(back.lat).toBeCloseTo(37.87, 9);
    expect(back.lon).toBeCloseTo(-122.26, 9);
  });

  it("spans more Mercator metres than ground metres away from the equator", () => {
    const box = mercatorBox(60, 0, 100);
    expect(box.east - box.west).toBeCloseTo(400, 3);
  });
});

/** A raster centered on the origin with one dense patch of canopy. */
function raster(origin: { lat: number; lon: number }): CanopyRaster {
  const box = mercatorBox(origin.lat, origin.lon, 60);
  const width = 60;
  const data = new Uint8Array(width * width);
  // 12 m tall canopy in the top-left 20 x 20 pixels (about 40 m square).
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) data[y * width + x] = 12;
  return {
    width,
    height: width,
    data,
    west: box.west,
    north: box.north,
    resolution: (box.east - box.west) / width,
  };
}

describe("canopy trees", () => {
  const origin = { lat: 0.001, lon: 0.001 };
  it("turns dense canopy into crowns in the right corner of the area", () => {
    const cells = canopyCells(origin, 120, raster(origin));
    expect(cells.length).toBeGreaterThan(4);
    for (const [x, y, crown, height] of cells) {
      // Top-left is west (negative x) and north (negative y) locally.
      expect(x).toBeLessThan(-15);
      expect(y).toBeLessThan(-15);
      expect(crown).toBeGreaterThan(5);
      expect(height).toBe(12);
    }
  });

  it("skips cells beside a mapped tree and cells on a roof", () => {
    const cells = canopyCells(origin, 120, raster(origin));
    const [first, second] = cells;
    const objects: SceneObject[] = [
      {
        id: "osm-tree",
        kind: "tree",
        name: "Oak",
        position: [first[0] + 2, first[1]],
        width: 8,
        depth: 8,
        height: 10,
        rotation: 0,
        source: "osm",
        heightMethod: "estimated",
      },
      {
        id: "osm-building",
        kind: "building",
        name: "Hall",
        position: [second[0], second[1]],
        width: 6,
        depth: 6,
        height: 10,
        rotation: 0,
        source: "osm",
        heightMethod: "levels",
        footprint: [
          [-3, -3],
          [3, -3],
          [3, 3],
          [-3, 3],
        ],
      },
    ];
    const trees = canopyTrees(objects, cells);
    expect(trees).toHaveLength(cells.length - 2);
    expect(trees.every((t) => t.source === "canopy")).toBe(true);
  });
});
