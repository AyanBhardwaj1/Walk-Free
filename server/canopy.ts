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
  constructor(
    private response: Awaited<ReturnType<typeof fetch>>,
  ) {
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
  const mercatorRes =
    TARGET_RESOLUTION / Math.cos((lat * Math.PI) / 180);
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
      quadkeysFor(box, ZOOM).map((tile) => readTile(tile, box, out, signal)),
    );
    return tiles.some(Boolean) ? out : null;
  } catch (error) {
    console.warn("Canopy height map unavailable:", (error as Error).message);
    return null;
  }
}

async function readTile(
  tile: { key: string; west: number; north: number; size: number },
  box: { west: number; east: number; south: number; north: number },
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
    // No tile for this quadkey (all water): nothing to add.
    if (/40[34]/.test(String((error as Error).message))) return false;
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
  // The part of the area inside this tile, in the chosen image's pixels.
  const west = Math.max(box.west, tile.west);
  const east = Math.min(box.east, tile.west + tile.size);
  const north = Math.min(box.north, tile.north);
  const south = Math.max(box.south, tile.north - tile.size);
  if (east <= west || north <= south) return false;
  const window = [
    Math.floor((west - tile.west) / res),
    Math.floor((tile.north - north) / res),
    Math.ceil((east - tile.west) / res),
    Math.ceil((tile.north - south) / res),
  ];
  const [x0, y0] = [
    Math.round((west - out.west) / out.resolution),
    Math.round((out.north - north) / out.resolution),
  ];
  const w = Math.min(
    out.width - x0,
    Math.round((east - west) / out.resolution),
  );
  const h = Math.min(
    out.height - y0,
    Math.round((north - south) / out.resolution),
  );
  if (w <= 0 || h <= 0) return false;
  const raster = (await best.readRasters({
    window,
    width: w,
    height: h,
    samples: [0],
    interleave: true,
    resampleMethod: "nearest",
    signal,
  })) as unknown as ArrayLike<number>;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      out.data[(y0 + y) * out.width + x0 + x] = raster[y * w + x];
  return true;
}
