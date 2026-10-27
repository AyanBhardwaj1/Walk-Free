import type { Point, Terrain } from "../../shared/types";
export function terrainHeight(p: Point, t?: Terrain) {
  if (!t) return 0;
  const x = Math.max(
    0,
    Math.min(
      t.resolution - 1,
      Math.round((p[0] / t.size + 0.5) * (t.resolution - 1)),
    ),
  );
  const z = Math.max(
    0,
    Math.min(
      t.resolution - 1,
      Math.round((p[1] / t.size + 0.5) * (t.resolution - 1)),
    ),
  );
  return t.heights[z * t.resolution + x] ?? 0;
}
export function toLocal(
  lat: number,
  lon: number,
  o: { lat: number; lon: number },
): Point {
  return [
    (lon - o.lon) * 111195 * Math.cos((o.lat * Math.PI) / 180),
    (o.lat - lat) * 111195,
  ];
}
export function toLatLon(p: Point, o: { lat: number; lon: number }) {
  return {
    lat: o.lat - p[1] / 111195,
    lon: o.lon + p[0] / (111195 * Math.cos((o.lat * Math.PI) / 180)),
  };
}
export function brushTerrain(
  t: Terrain,
  p: Point,
  mode: string,
  radius = 65,
  strength = 4,
): Terrain {
  return {
    ...t,
    heights: t.heights.map((h, i) => {
      const d = Math.hypot(
        ((i % t.resolution) / (t.resolution - 1) - 0.5) * t.size - p[0],
        (Math.floor(i / t.resolution) / (t.resolution - 1) - 0.5) * t.size -
          p[1],
      );
      return d >= radius
        ? h
        : mode === "flatten"
          ? h * (d / radius)
          : Math.max(
              -30,
              Math.min(
                80,
                h + (mode === "lower" ? -1 : 1) * strength * (1 - d / radius),
              ),
            );
    }),
  };
}
