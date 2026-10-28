/**
 * Hero areas shipped as static files in public/areas so they open instantly
 * and never depend on a live Overpass request. Regenerate them with
 * `npm run areas:build` (or the "Build hero areas" GitHub workflow).
 */
export interface PrebuiltArea {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  /** Half-width in meters; 1000 m covers a 2 km square. */
  radius: number;
  /** A recognizable first walk shown after the area opens. */
  walk?: { from: string; to: string };
}

export const PREBUILT_AREAS: readonly PrebuiltArea[] = [
  {
    slug: "ut-austin",
    name: "UT Austin, TX",
    lat: 30.285,
    lon: -97.7341,
    radius: 1000,
    walk: { from: "UT Tower", to: "Gregory Gymnasium" },
  },
  {
    slug: "uc-berkeley",
    name: "UC Berkeley, CA",
    lat: 37.8719,
    lon: -122.2585,
    radius: 1000,
    walk: { from: "Sproul Hall", to: "Moffitt Undergraduate Library" },
  },
];

/** How far a chosen center may drift from a hero center and still use it. */
const MATCH_DISTANCE_M = 350;

function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_008.8;
}

export function prebuiltAreaFor(
  lat: number,
  lon: number,
  radius: number,
): PrebuiltArea | undefined {
  return PREBUILT_AREAS.find(
    (area) =>
      radius <= area.radius &&
      distanceMeters(area, { lat, lon }) <= MATCH_DISTANCE_M,
  );
}
