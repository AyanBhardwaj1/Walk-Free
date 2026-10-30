// Adds Meta's canopy-height trees to the shipped hero areas without
// downloading OpenStreetMap again. Run: npm run areas:canopy [slug…]
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PREBUILT_AREAS } from "../shared/areas.js";
import { worldSchema } from "../shared/schema.js";
import { readCanopy } from "../server/canopy.js";
import { canopyCells, withCanopy } from "../shared/canopy.js";
import type { World } from "../shared/types.js";

const only = process.argv.slice(2);
let failed = 0;
for (const area of PREBUILT_AREAS) {
  if (only.length && !only.includes(area.slug)) continue;
  const file = join(process.cwd(), "public", "areas", `${area.slug}.json`);
  const world = JSON.parse(await readFile(file, "utf8")) as World;
  const raster = await readCanopy(
    world.origin.lat,
    world.origin.lon,
    world.extent / 2,
    120_000,
  );
  if (!raster) {
    failed++;
    console.error(`${area.slug}: canopy height map unavailable`);
    continue;
  }
  const next = worldSchema.parse(
    withCanopy(world, canopyCells(world.origin, world.extent, raster)),
  );
  await writeFile(
    file,
    JSON.stringify(next, (key, value) =>
      typeof value === "number" &&
      !Number.isInteger(value) &&
      key !== "lat" &&
      key !== "lon"
        ? Math.round(value * 100) / 100
        : value,
    ),
  );
  console.log(`${area.slug}: ${next.provenance.notes.at(-1)}`);
}
if (failed) process.exitCode = 1;
