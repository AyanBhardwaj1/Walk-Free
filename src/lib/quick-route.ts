/**
 * A quick walking route between any two places, anywhere, without building
 * the detailed 3D area first. Each layer falls back to the next:
 *   places: Photon (OSM) → Nominatim (OSM)
 *   route:  OSRM foot profile (OSM) → Valhalla pedestrian (OSM) → an
 *           honest straight-line estimate with a Google Maps handoff.
 * The result always says which source answered.
 */
export interface LatLon {
  lat: number;
  lon: number;
}
export interface FoundPlace extends LatLon {
  label: string;
  source: "Photon" | "Nominatim";
}
export interface QuickRoute {
  source: "OSRM" | "Valhalla" | "Estimate";
  /** Metres along the route (or the estimate). */
  distance: number;
  /** Walking minutes. */
  minutes: number;
  /** [lon, lat] pairs, as map libraries expect. */
  line: [number, number][];
  steps: string[];
  estimate: boolean;
}
type Fetch = typeof fetch;
const TIMEOUT_MS = 9000;
const WALK_M_PER_MIN = 80;
/** Streets wander: straight lines undercount walking distance by ~30%. */
export const DETOUR_FACTOR = 1.3;

export function haversine(a: LatLon, b: LatLon) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r,
    dLon = (b.lon - a.lon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

async function getJson(fetcher: Fetch, url: string, init?: RequestInit) {
  const r = await fetcher(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as unknown;
}

/** The best match for a place name near a point. */
export async function findPlace(
  query: string,
  near: LatLon,
  fetcher: Fetch = fetch,
): Promise<FoundPlace | null> {
  const q = query.trim().slice(0, 160);
  if (!q) return null;
  try {
    const data = (await getJson(
      fetcher,
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${near.lat}&lon=${near.lon}&limit=1`,
    )) as {
      features?: {
        geometry?: { coordinates?: unknown[] };
        properties?: Record<string, unknown>;
      }[];
    };
    const f = data.features?.[0];
    const [lon, lat] = (f?.geometry?.coordinates ?? []) as unknown[];
    if (finite(lat) && finite(lon)) {
      const p = f!.properties ?? {};
      const label = [p.name, p.street, p.city]
        .filter((v): v is string => typeof v === "string" && !!v)
        .join(", ");
      return { lat, lon, label: label || q, source: "Photon" };
    }
  } catch {
    /* Fall through to Nominatim. */
  }
  try {
    const d = 0.25;
    const data = (await getJson(
      fetcher,
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}&viewbox=${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`,
    )) as { lat?: string; lon?: string; display_name?: string }[];
    const hit = data[0];
    const lat = Number(hit?.lat),
      lon = Number(hit?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon))
      return {
        lat,
        lon,
        label: (hit!.display_name ?? q).split(",").slice(0, 2).join(","),
        source: "Nominatim",
      };
  } catch {
    /* No geocoder answered. */
  }
  return null;
}

function osrmStep(s: {
  name?: string;
  maneuver?: { type?: string; modifier?: string };
}) {
  const turn = s.maneuver?.modifier
    ? `Turn ${s.maneuver.modifier}`
    : s.maneuver?.type === "depart"
      ? "Head out"
      : s.maneuver?.type === "arrive"
        ? "Arrive"
        : "Continue";
  return s.name ? `${turn} on ${s.name}` : turn;
}

/** A walking route, from the first routing service that answers. */
export async function quickRoute(
  from: LatLon,
  to: LatLon,
  fetcher: Fetch = fetch,
): Promise<QuickRoute> {
  try {
    const data = (await getJson(
      fetcher,
      `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`,
    )) as {
      routes?: {
        distance?: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: { steps?: Parameters<typeof osrmStep>[0][] }[];
      }[];
    };
    const r = data.routes?.[0];
    const line = r?.geometry?.coordinates ?? [];
    if (r && finite(r.distance) && line.length > 1)
      return {
        source: "OSRM",
        distance: r.distance,
        minutes: r.distance / WALK_M_PER_MIN,
        line,
        steps: (r.legs?.[0]?.steps ?? []).map(osrmStep).slice(0, 12),
        estimate: false,
      };
  } catch {
    /* Try Valhalla. */
  }
  try {
    const data = (await getJson(
      fetcher,
      "https://valhalla1.openstreetmap.de/route",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: [
            { lat: from.lat, lon: from.lon },
            { lat: to.lat, lon: to.lon },
          ],
          costing: "pedestrian",
          directions_options: { units: "kilometers" },
          shape_format: "geojson",
        }),
      },
    )) as {
      trip?: {
        summary?: { length?: number };
        legs?: {
          shape?: { coordinates?: [number, number][] };
          maneuvers?: { instruction?: string }[];
        }[];
      };
    };
    const leg = data.trip?.legs?.[0];
    const km = data.trip?.summary?.length;
    const line = leg?.shape?.coordinates ?? [];
    if (finite(km) && line.length > 1)
      return {
        source: "Valhalla",
        distance: km * 1000,
        minutes: (km * 1000) / WALK_M_PER_MIN,
        line,
        steps: (leg?.maneuvers ?? [])
          .map((m) => m.instruction ?? "")
          .filter(Boolean)
          .slice(0, 12),
        estimate: false,
      };
  } catch {
    /* Estimate below. */
  }
  const straight = haversine(from, to);
  const distance = straight * DETOUR_FACTOR;
  return {
    source: "Estimate",
    distance,
    minutes: distance / WALK_M_PER_MIN,
    line: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    steps: [],
    estimate: true,
  };
}

/** Google Maps walking directions between two points. */
export function googleWalkingLink(from: LatLon, to: LatLon) {
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}`;
}
