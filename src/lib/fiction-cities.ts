import type { World } from "../../shared/types.js";
import { CityBuilder, seededRng } from "./fiction-cities/kit.js";
import {
  auroraRealm,
  neonDistrict,
  noirHarbor,
  skylinePrime,
  velocityBay,
} from "./fiction-cities/layouts.js";

import { FICTION_CITIES, type FictionCitySlug } from "./fiction-catalog.js";
export {
  FICTION_CITIES,
  type FictionAmbient,
  type FictionCity,
  type FictionCitySlug,
} from "./fiction-catalog.js";

const LAYOUTS: Record<FictionCitySlug, (b: CityBuilder) => void> = {
  "noir-harbor": noirHarbor,
  "skyline-prime": skylinePrime,
  "velocity-bay": velocityBay,
  "aurora-realm": auroraRealm,
  "neon-district": neonDistrict,
};
const EXTENT = 1000;
const TERRAIN_RESOLUTION = 33;

/**
 * A fictional city as a walkable World, generated the same way every time
 * from a seed keyed by its slug; null when the slug is not one of ours.
 */
export function createFictionCity(slug: string): World | null {
  const meta = FICTION_CITIES.find((c) => c.slug === slug);
  if (!meta) return null;
  const b = new CityBuilder(
    seededRng(`walk-free-fiction:${meta.slug}`),
    meta.slug,
    EXTENT / 2 - 20,
  );
  LAYOUTS[meta.slug](b);
  return {
    id: `fiction-${meta.slug}`,
    name: `${meta.name} · fictional city`,
    origin: { ...meta.origin },
    timezone: meta.timezone,
    extent: EXTENT,
    objects: b.objects,
    roads: b.roads(),
    landscapes: b.landscapes,
    amenities: b.amenities,
    graph: { nodes: b.nodes, edges: b.edges },
    terrain: {
      size: EXTENT,
      resolution: TERRAIN_RESOLUTION,
      heights: new Array(TERRAIN_RESOLUTION ** 2).fill(0),
    },
    provenance: {
      source: "Walk-Free fictional city (procedurally generated)",
      attribution: "Walk-Free fictional city",
      retrievedAt: "2026-11-01T00:00:00.000Z",
      live: false,
      notes: [
        `${meta.name} is not a real place: every street, building, tree and landmark is procedurally generated from a fixed seed.`,
        `Coordinates near ${meta.origin.lat}, ${meta.origin.lon} only give plausible sun angles and day length; they locate nothing.`,
        "Heights, lighting, covered walkways and trees are designed inputs, so shade and heat results are illustrations, not measurements.",
      ],
    },
  };
}
