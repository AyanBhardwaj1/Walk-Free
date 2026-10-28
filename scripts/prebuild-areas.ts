// Downloads each hero area from Overpass once and writes it to public/areas,
// so the deployed site serves it as a static file. Run: npm run areas:build
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PREBUILT_AREAS } from "../shared/areas.js";
import { worldSchema } from "../shared/schema.js";
import { getWorld } from "../server/data.js";

const outDir = join(process.cwd(), "public", "areas");
await mkdir(outDir, { recursive: true });
const only = process.argv.slice(2);
let failed = 0;
for (const area of PREBUILT_AREAS) {
  if (only.length && !only.includes(area.slug)) continue;
  try {
    const world = worldSchema.parse(
      await getWorld(area.lat, area.lon, area.name, area.radius),
    );
    const file = join(outDir, `${area.slug}.json`);
    await writeFile(file, JSON.stringify(world));
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
