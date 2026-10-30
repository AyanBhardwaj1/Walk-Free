import { BaseClient, BaseResponse, fromCustomClient } from "geotiff";
import { EnvHttpProxyAgent, fetch } from "undici";
import {
  mercatorBox,
  quadkeysFor,
  type CanopyRaster,
} from "../shared/canopy.js";

/**
 * Meta and WRI's Canopy Height Map v2 on the public Data for Good bucket:
 * Cloud-Optimized GeoTIFFs of uint8 metres in Web Mercator, one per zoom-10
 * quadkey, with 512 px internal tiles and overviews. The bucket sends no
 * CORS headers, so the browser cannot read it; the server reads only the
 * byte ranges that cover the area.
 */
export const CANOPY_TILES =
  process.env.WALK_FREE_CANOPY_URL ||
  "https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3/chm/";
const ZOOM = 10;
/** About 2 m on the ground: enough to see single crowns, a quarter of the bytes. */
const TARGET_RESOLUTION = 2.2;

const dispatcher = new EnvHttpProxyAgent();
class Response extends BaseResponse {
  constructor(private response: Awaited<ReturnType<typeof fetch>>) {
    super();
  }
  get ok() {
    return this.response.ok;
  }
  get status() {
    return this.response.status;
  }
  getHeader(name: string) {
    return this.response.headers.get(name) ?? undefined;
  }
  async getData() {
    return this.response.arrayBuffer();
  }
}
/** No tile exists for this quadkey: open water, nothing to add. */
class MissingTile extends Error {}

/** Range requests through the same proxy-aware client as other providers. */
class Client extends BaseClient {
  constructor(
    url: string,
    private signal: AbortSignal,
  ) {
    super(url);
  }
  async request(options: RequestInit = {}) {
    const response = await fetch(this.url, {
      dispatcher,
      headers: options.headers as Record<string, string>,
      signal: this.signal,
    });
    // geotiff turns any failure into a status-less error, so name this one.
    if (response.status === 403 || response.status === 404) {
      await response.body?.cancel();
      throw new MissingTile(`No canopy tile at ${this.url}`);
    }
    return new Response(response);
  }
}

/**
 * Canopy heights covering a circle around a point, or null when no tile
 * covers it (open ocean) or the provider is unreachable. Never throws:
 * canopy is an extra layer, and the map works without it.
 */
export async function readCanopy(
  lat: number,
  lon: number,
  radius: number,
  timeoutMs = 20_000,
): Promise<CanopyRaster | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  const box = mercatorBox(lat, lon, radius);
  const mercatorRes = TARGET_RESOLUTION / Math.cos((lat * Math.PI) / 180);
  const width = Math.ceil((box.east - box.west) / mercatorRes);
  const height = Math.ceil((box.north - box.south) / mercatorRes);
  const out: CanopyRaster = {
    width,
    height,
    data: new Uint8Array(width * height),
    west: box.west,
    north: box.north,
    resolution: (box.east - box.west) / width,
  };
  try {
    const tiles = await Promise.all(
      quadkeysFor(box, ZOOM).map((tile) => readTile(tile, out, signal)),
    );
    return tiles.some(Boolean) ? out : null;
  } catch (error) {
    console.warn("Canopy height map unavailable:", (error as Error).message);
    return null;
  }
}

async function readTile(
  tile: { key: string; west: number; north: number; size: number },
  out: CanopyRaster,
  signal: AbortSignal,
) {
  let tiff;
  try {
    tiff = await fromCustomClient(
      new Client(`${CANOPY_TILES}${tile.key}.tif`, signal),
      {},
      signal,
    );
  } catch (error) {
    if (error instanceof MissingTile) return false;
    throw error;
  }
  // Pick the coarsest image (full size or an overview) that is still at
  // least as sharp as the target; masks are skipped.
  const count = await tiff.getImageCount();
  let best = await tiff.getImage(0);
  for (let i = 1; i < count; i++) {
    const image = await tiff.getImage(i);
    const subfile = Number(image.fileDirectory.getValue("NewSubfileType") ?? 0);
    if (subfile & 4) continue;
    if (tile.size / image.getWidth() <= out.resolution * 1.05) best = image;
  }
  const res = tile.size / best.getWidth();
  const [imageWidth, imageHeight] = [best.getWidth(), best.getHeight()];
  // Output pixels whose centres fall inside this tile.
  const tileEast = tile.west + tile.size,
    tileSouth = tile.north - tile.size;
  const ox0 = Math.max(
    0,
    Math.ceil((tile.west - out.west) / out.resolution - 0.5),
  );
  const ox1 = Math.min(
    out.width,
    Math.ceil((tileEast - out.west) / out.resolution - 0.5),
  );
  const oy0 = Math.max(
    0,
    Math.ceil((out.north - tile.north) / out.resolution - 0.5),
  );
  const oy1 = Math.min(
    out.height,
    Math.ceil((out.north - tileSouth) / out.resolution - 0.5),
  );
  if (ox1 <= ox0 || oy1 <= oy0) return false;
  // Source pixel under each output pixel centre, read once at native
  // resolution so registration is exact and tile seams leave no gaps.
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  const sourceCol = (ox: number) =>
    clamp(
      Math.floor((out.west + (ox + 0.5) * out.resolution - tile.west) / res),
      imageWidth,
    );
  const sourceRow = (oy: number) =>
    clamp(
      Math.floor(
        (tile.north - (out.north - (oy + 0.5) * out.resolution)) / res,
      ),
      imageHeight,
    );
  const window = [
    sourceCol(ox0),
    sourceRow(oy0),
    sourceCol(ox1 - 1) + 1,
    sourceRow(oy1 - 1) + 1,
  ];
  const width = window[2] - window[0];
  const raster = (await best.readRasters({
    window,
    samples: [0],
    interleave: true,
    signal,
  })) as unknown as ArrayLike<number>;
  const cols = Array.from(
    { length: ox1 - ox0 },
    (_, i) => sourceCol(ox0 + i) - window[0],
  );
  for (let oy = oy0; oy < oy1; oy++) {
    const row = (sourceRow(oy) - window[1]) * width;
    const base = oy * out.width;
    for (let i = 0; i < cols.length; i++)
      out.data[base + ox0 + i] = raster[row + cols[i]];
  }
  return true;
}
