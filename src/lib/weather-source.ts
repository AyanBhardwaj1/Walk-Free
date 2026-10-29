import type { WeatherForecast } from "../../shared/types.js";
import { ServiceError } from "../../shared/errors.js";
import {
  openMeteoUrl,
  parseOpenMeteo,
  type OpenMeteoResponse,
} from "../../shared/weather.js";

export interface WeatherDeps {
  fetch: typeof fetch;
  apiBase: string;
}
const FINAL_STATUSES = new Set([400, 401, 403]);

/**
 * Live weather from the API (Open-Meteo, then NWS), or straight from
 * Open-Meteo in the browser if the API is unavailable.
 */
export async function loadWeather(
  origin: { lat: number; lon: number },
  deps: WeatherDeps,
): Promise<WeatherForecast> {
  try {
    const response = await deps.fetch(
      `${deps.apiBase}/api/weather?lat=${origin.lat}&lon=${origin.lon}`,
      { credentials: "include" },
    );
    const data = await response.json().catch(() => null);
    if (response.ok && data?.hours?.length) return data as WeatherForecast;
    if (FINAL_STATUSES.has(response.status))
      throw new ServiceError(
        "REQUEST_REJECTED",
        data?.error || "Weather is unavailable right now.",
        response.status,
      );
  } catch (error) {
    if (error instanceof ServiceError) throw error;
  }
  try {
    const response = await deps.fetch(openMeteoUrl(origin.lat, origin.lon), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseOpenMeteo((await response.json()) as OpenMeteoResponse);
  } catch {
    throw new ServiceError(
      "WEATHER_UNAVAILABLE",
      "Live weather is unavailable right now. Your weather scenario is still in use.",
      503,
    );
  }
}
