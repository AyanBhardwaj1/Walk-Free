import SunCalc from "suncalc";
import type { Environment, Point, World } from "../../shared/types";
export function sunDirection(e: Environment, o: { lat: number; lon: number }) {
  const s = SunCalc.getPosition(new Date(e.dateTime), o.lat, o.lon);
  return {
    x: -Math.sin(s.azimuth) * Math.cos(s.altitude),
    y: Math.sin(s.altitude),
    z: Math.cos(s.azimuth) * Math.cos(s.altitude),
    altitude: s.altitude,
    azimuth: s.azimuth,
  };
}
function inside(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
export function isShaded(p: Point, w: World, e: Environment) {
  const s = sunDirection(e, w.origin);
  if (s.y <= 0) return true;
  return w.objects.some((o) => {
    const max = (o.height - 1.5) / s.y;
    if (max <= 0) return false;
    const a = (o.rotation * Math.PI) / 180,
      c = Math.cos(a),
      sn = Math.sin(a);
    const dx = p[0] - o.position[0],
      dz = p[1] - o.position[1];
    const q: Point = [dx * c - dz * sn, dx * sn + dz * c],
      v: Point = [s.x * c - s.z * sn, s.x * sn + s.z * c];
    if (o.kind === "tree") {
      const radii = [o.width * 0.5, o.height * 0.35, o.depth * 0.5];
      const origin = [q[0], 1.5 - o.height * 0.65, q[1]];
      const ray = [v[0], s.y, v[1]];
      let A = 0,
        B = 0,
        C = -1;
      for (let i = 0; i < 3; i++) {
        A += (ray[i] / radii[i]) ** 2;
        B += (2 * origin[i] * ray[i]) / radii[i] ** 2;
        C += (origin[i] / radii[i]) ** 2;
      }
      const discriminant = B * B - 4 * A * C;
      return discriminant >= 0 && (-B + Math.sqrt(discriminant)) / (2 * A) >= 0;
    }
    const poly =
      o.footprint ||
      ([
        [-o.width / 2, -o.depth / 2],
        [o.width / 2, -o.depth / 2],
        [o.width / 2, o.depth / 2],
        [-o.width / 2, o.depth / 2],
      ] as Point[]);
    if (inside(q, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const ex = b[0] - a[0],
        ez = b[1] - a[1];
      const den = v[0] * ez - v[1] * ex;
      if (Math.abs(den) < 1e-10) continue;
      const ax = a[0] - q[0],
        az = a[1] - q[1];
      const t = (ax * ez - az * ex) / den,
        u = (ax * v[1] - az * v[0]) / den;
      if (t >= 0 && t <= max && u >= 0 && u <= 1) return true;
    }
    return false;
  });
}
/** NOAA Rothfusz heat-index approximation; shade/light-wind conditions only. */
export function heatIndexC(c: number, r: number): number | null {
  if (c < 27 || r < 40) return null;
  const t = (c * 9) / 5 + 32;
  const f =
    -42.379 +
    2.04901523 * t +
    10.14333127 * r -
    0.22475541 * t * r -
    0.00683783 * t * t -
    0.05481717 * r * r +
    0.00122874 * t * t * r +
    0.00085282 * t * r * r -
    0.00000199 * t * t * r * r;
  return ((f - 32) * 5) / 9;
}
