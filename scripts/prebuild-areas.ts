// Downloads each hero area from Overpass and writes it to public/areas, so
// the deployed site serves it as a static file. Run: npm run areas:build
// Dense areas are fetched as four quadrant tiles and merged, because a
// single 2 km query can exceed public Overpass time limits.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PREBUILT_AREAS, type PrebuiltArea } from "../shared/areas.js";
import { worldSchema } from "../shared/schema.js";
import {
  EARTH_RADIUS,
  RAD,
  overpassQuery,
  parseOsmWorld,
  worldOrigin,
  type OsmElement,
} from "../shared/osm.js";
import { fetchOverpass } from "../server/data.js";
import { readCanopy } from "../server/canopy.js";
import { canopyCells, withCanopy } from "../shared/canopy.js";

const limits = { budgetMs: 10 * 60_000, mirrorTimeoutMs: 180_000 };

async function buildArea(area: PrebuiltArea) {
  const half = area.radius / 2;
  const dLat = half / (RAD * EARTH_RADIUS),
    dLon = dLat / Math.cos(area.lat * RAD);
  const elements = new Map<string, OsmElement>();
  for (const [sy, sx] of [
    [1, -1],
    [1, 1],
    [-1, -1],
    [-1, 1],
  ]) {
    const tile = await fetchOverpass(
      overpassQuery(area.lat + sy * dLat, area.lon + sx * dLon, half, 180),
      limits,
    );
    for (const e of tile.elements) elements.set(`${e.type}:${e.id}`, e);
    console.log(`${area.slug}: tile ${sy},${sx} -> ${tile.elements.length}`);
  }
  const origin = worldOrigin(area.lat, area.lon);
  const world = parseOsmWorld(
    { elements: [...elements.values()] },
    origin,
    area.name,
    area.radius,
    new Date(),
    600_000,
  );
  // Fill in trees OpenStreetMap hasn't mapped from Meta's canopy height map.
  const raster = await readCanopy(origin.lat, origin.lon, area.radius, 120_000);
  return withCanopy(
    world,
    raster && canopyCells(origin, area.radius * 2, raster),
  );
}

const outDir = join(process.cwd(), "public", "areas");
await mkdir(outDir, { recursive: true });
const only = process.argv.slice(2);
let failed = 0;
for (const area of PREBUILT_AREAS) {
  if (only.length && !only.includes(area.slug)) continue;
  try {
    const world = worldSchema.parse(await buildArea(area));
    const file = join(outDir, `${area.slug}.json`);
    // Centimetre precision is plenty for a walking map and halves file size.
    await writeFile(
      file,
      // Scene coordinates are meters; keep degrees (lat/lon) exact.
      JSON.stringify(world, (key, value) =>
        typeof value === "number" &&
        !Number.isInteger(value) &&
        key !== "lat" &&
        key !== "lon"
          ? Math.round(value * 100) / 100
          : value,
      ),
    );
    console.log(
      `${area.slug}: ${world.objects.length} objects, ${world.graph.edges.length} walking edges -> ${file}`,
    );
  } catch (error) {
    failed++;
    console.error(
      `${area.slug}: ${error instanceof Error ? error.message : error}`,
    );
  }
}
process.exitCode = failed ? 1 : 0;
