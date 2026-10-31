import {
  airQualityUrl,
  coarse,
  nwsAlertsUrl,
  parseAirQuality,
  parseWalkAlerts,
  type Outlook,
} from "../../shared/outlook.js";

export interface OutlookDeps {
  fetch: typeof fetch;
  apiBase: string;
}

async function direct<T>(
  deps: OutlookDeps,
  url: string,
  parse: (data: unknown) => T | null,
  accept?: string,
): Promise<T | null> {
  try {
    const response = await deps.fetch(url, {
      signal: AbortSignal.timeout(10_000),
      ...(accept ? { headers: { Accept: accept } } : {}),
    });
    return response.ok ? parse(await response.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Air quality and official alerts: from the API (cached for everyone), or
 * straight from Open-Meteo and the NWS when the API can't answer, such as
 * for guests. Each part fails on its own; nothing here throws.
 */
export async function loadOutlook(
  origin: { lat: number; lon: number },
  deps: OutlookDeps,
): Promise<Outlook> {
  try {
    const response = await deps.fetch(
      `${deps.apiBase}/api/outlook?lat=${coarse(origin.lat)}&lon=${coarse(origin.lon)}`,
      { credentials: "include" },
    );
    if (response.ok) {
      const data = (await response.json()) as Outlook;
      if (data && "air" in data && "alerts" in data) return data;
    }
  } catch {
    /* Fall through to the providers. */
  }
  const [air, alerts] = await Promise.all([
    direct(deps, airQualityUrl(origin.lat, origin.lon), parseAirQuality),
    direct(
      deps,
      nwsAlertsUrl(origin.lat, origin.lon),
      (d) => parseWalkAlerts(d),
      "application/geo+json",
    ),
  ]);
  return { air, alerts, fetchedAt: new Date().toISOString() };
}
