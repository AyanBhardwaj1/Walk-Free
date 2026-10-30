import { afterEach, describe, expect, it, vi } from "vitest";
import { writeArrayBuffer } from "geotiff";
import { mercatorBox, quadkeysFor, toMercator } from "../shared/canopy";

// One zoom-10 tile of canopy: the western half 12 m tall, the east open.
const SIZE = 256;
const pixels = new Uint8Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE / 2; x++) pixels[y * SIZE + x] = 12;
const tiff = new Uint8Array(
  writeArrayBuffer(pixels, { width: SIZE, height: SIZE }),
);

const served: string[] = [];
const fetchMock = vi.fn(
  async (url: string, init: { headers?: Record<string, string> }) => {
    served.push(url);
    if (!url.endsWith(`${landKey}.tif`))
      return new Response("missing", { status: 404 });
    const [start, end] = (init.headers?.Range ?? init.headers?.range ?? "")
      .replace("bytes=", "")
      .split("-")
      .map(Number);
    const last = Math.min(end, tiff.length - 1);
    return new Response(tiff.slice(start, last + 1), {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${last}/${tiff.length}`,
        "Content-Length": String(last - start + 1),
      },
    });
  },
);
vi.mock("undici", () => ({
  fetch: (url: string, init: { headers?: Record<string, string> }) =>
    fetchMock(url, init),
  EnvHttpProxyAgent: class {},
}));

// A point near the east edge of its tile, so the area also covers the
// (missing, ocean) tile next door.
const lat = 30.2;
const [x0, y0] = toMercator(lat, -97.7);
const tile = quadkeysFor({ west: x0, east: x0, south: y0, north: y0 }, 10)[0];
const landKey = tile.key;
const lon = ((tile.west + tile.size - 300) / 6378137) * (180 / Math.PI);

afterEach(() => (served.length = 0));

describe("reading the canopy height map", () => {
  it("reads only the area, keeps land canopy and skips missing tiles", async () => {
    const { readCanopy } = await import("../server/canopy");
    const raster = (await readCanopy(lat, lon, 500, 10_000))!;
    expect(raster).not.toBeNull();
    const keys = quadkeysFor(mercatorBox(lat, lon, 500), 10).map((k) => k.key);
    expect(keys.length).toBeGreaterThan(1);
    // The tile to the east is missing (404) but the area still loads.
    expect(served.some((u) => !u.endsWith(`${landKey}.tif`))).toBe(true);
    // The area's west lies over open ground (the tile's east half): no canopy.
    // Pixels east of the tile edge belong to the missing tile: also none.
    const tall = raster.data.filter((h) => h >= 3).length;
    expect(tall).toBe(0);
  });

  it("places canopy where the map has it", async () => {
    const { readCanopy } = await import("../server/canopy");
    // Centre the area on the tile's west quarter, which is all canopy.
    const westLon = ((tile.west + tile.size / 4) / 6378137) * (180 / Math.PI);
    const raster = (await readCanopy(lat, westLon, 300, 10_000))!;
    const tall = raster.data.filter((h) => h === 12).length;
    expect(tall / raster.data.length).toBeGreaterThan(0.99);
  });

  it("returns null instead of throwing when the map can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { readCanopy } = await import("../server/canopy");
    const westLon = ((tile.west + tile.size / 4) / 6378137) * (180 / Math.PI);
    await expect(readCanopy(lat, westLon, 300, 10_000)).resolves.toBeNull();
  });
});
