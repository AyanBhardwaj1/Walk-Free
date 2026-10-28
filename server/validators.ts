import { ServiceError } from "./network.js";
export function coordinates(
  lat: unknown,
  lon: unknown,
): { lat: number; lon: number } {
  const a =
    typeof lat === "string" && lat.trim() !== ""
      ? Number(lat)
      : typeof lat === "number"
        ? lat
        : NaN;
  const b =
    typeof lon === "string" && lon.trim() !== ""
      ? Number(lon)
      : typeof lon === "number"
        ? lon
        : NaN;
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    Math.abs(a) > 85 ||
    Math.abs(b) > 180
  )
    throw new ServiceError(
      "INVALID_INPUT",
      "Provide valid latitude (−85 to 85) and longitude (−180 to 180).",
      400,
    );
  return { lat: a, lon: b };
}
export function cleanName(
  value: unknown,
  fallback = "Selected neighborhood",
): string {
  if (typeof value !== "string") return fallback;
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 120) || fallback
  );
}
export function boundedRadius(value: unknown): number {
  if (value === undefined) return 800;
  if (typeof value !== "string" || value.trim() === "")
    throw new ServiceError(
      "INVALID_INPUT",
      "Area radius must be between 200 and 1,000 meters.",
      400,
    );
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius < 200 || radius > 1000)
    throw new ServiceError(
      "INVALID_INPUT",
      "Area radius must be between 200 and 1,000 meters.",
      400,
    );
  return radius;
}
