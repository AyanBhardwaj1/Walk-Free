import type { City } from "../shared/types.js";
import { normalize, searchCities } from "./cities.js";
import { requestJson } from "./network.js";

/**
 * Open-Meteo's keyless geocoder (GeoNames data, CC BY 4.0), used only when
 * the bundled index has few matches, so any town worldwide can be found.
 */
const geocoded = new Map<string, { at: number; value: City[] }>();
export async function geocodeCities(query: string): Promise<City[]> {
  const q = normalize(query.slice(0, 120));
  if (q.length < 3) return [];
  const hit = geocoded.get(q);
  if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) return hit.value;
  const params = new URLSearchParams({
    name: query.split(",")[0].trim().slice(0, 120),
    count: "10",
    language: "en",
    format: "json",
  });
  const data = await requestJson<{
    results?: {
      id?: number;
      name?: string;
      latitude?: number;
      longitude?: number;
      timezone?: string;
      admin1?: string;
      country?: string;
      country_code?: string;
      population?: number;
    }[];
  }>(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
    timeoutMs: 5000,
    maxBytes: 200_000,
  });
  const value = (data.results ?? [])
    .filter(
      (r) =>
        r.name &&
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude) &&
        r.timezone &&
        validTimezone(r.timezone),
    )
    .map((r): City => ({
      id: `geo-${r.id}`,
      name: r.name!,
      state:
        r.country_code === "US"
          ? (r.admin1 ?? "")
          : [r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude!,
      lon: r.longitude!,
      timezone: r.timezone!,
      ...(r.population ? { population: r.population } : {}),
    }));
  if (geocoded.size > 500) geocoded.clear();
  geocoded.set(q, { at: Date.now(), value });
  return value;
}

function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Indexed matches first, then geocoded places the index lacks. */
export async function findCities(
  query: string,
  geocode = true,
): Promise<City[]> {
  const local = searchCities(query);
  if (!geocode || local.length >= 3 || normalize(query).length < 3)
    return local;
  try {
    const near = (a: City, b: City) =>
      Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;
    const extra = (await geocodeCities(query)).filter(
      (g) => !local.some((l) => near(l, g)),
    );
    return [...local, ...extra].slice(0, 25);
  } catch {
    // The index alone still answers when the geocoder is unreachable.
    return local;
  }
}
