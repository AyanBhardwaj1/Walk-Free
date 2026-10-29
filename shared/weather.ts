import { ServiceError } from "./errors.js";
import type { WeatherForecast, WeatherHour } from "./types.js";

/**
 * Open-Meteo: open-source weather API (CC BY 4.0 data), no key, updated
 * about every 15 minutes, and usable from both the server and the browser.
 */
const VARIABLES =
  "temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m,weather_code";

export function openMeteoUrl(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: VARIABLES,
    current: VARIABLES,
    wind_speed_unit: "ms",
    timeformat: "unixtime",
    timezone: "GMT",
    past_hours: "6",
    forecast_hours: "48",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/** WMO weather interpretation codes, as documented by Open-Meteo. */
const CODES: [number[], string][] = [
  [[0], "Clear sky"],
  [[1], "Mostly clear"],
  [[2], "Partly cloudy"],
  [[3], "Overcast"],
  [[45, 48], "Fog"],
  [[51, 53, 55, 56, 57], "Drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Rain"],
  [[71, 73, 75, 77, 85, 86], "Snow"],
  [[95, 96, 99], "Thunderstorms"],
];
export function describeWeatherCode(code: unknown) {
  return CODES.find(([codes]) => codes.includes(code as number))?.[1] ?? "";
}

interface OpenMeteoBlock {
  time?: number | number[];
  temperature_2m?: number | (number | null)[];
  relative_humidity_2m?: number | (number | null)[];
  cloud_cover?: number | (number | null)[];
  wind_speed_10m?: number | (number | null)[];
  weather_code?: number | (number | null)[];
}
export interface OpenMeteoResponse {
  current?: OpenMeteoBlock;
  hourly?: OpenMeteoBlock;
}

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const percent = (v: unknown) => (finite(v) && v >= 0 && v <= 100 ? v : null);

function hourAt(block: OpenMeteoBlock, i?: number): WeatherHour | null {
  const pick = (v: unknown) => (i === undefined ? v : (v as unknown[])?.[i]);
  const time = pick(block.time),
    temperature = pick(block.temperature_2m),
    wind = pick(block.wind_speed_10m);
  if (
    !finite(time) ||
    !finite(temperature) ||
    temperature < -90 ||
    temperature > 65
  )
    return null;
  return {
    time: new Date(time * 1000).toISOString(),
    temperatureC: temperature,
    humidity: percent(pick(block.relative_humidity_2m)),
    windMps: finite(wind) && wind >= 0 && wind < 120 ? wind : 0,
    cloudCover: percent(pick(block.cloud_cover)),
    description: describeWeatherCode(pick(block.weather_code)),
  };
}

export function parseOpenMeteo(
  data: OpenMeteoResponse,
  now = new Date(),
): WeatherForecast {
  const times = Array.isArray(data.hourly?.time) ? data.hourly.time : [];
  const hours = times
    .map((_, i) => hourAt(data.hourly!, i))
    .filter((h): h is WeatherHour => h !== null);
  if (!hours.length)
    throw new ServiceError(
      "NO_DATA",
      "No usable hourly weather is available for this location.",
    );
  return {
    source: "Open-Meteo live forecast",
    fetchedAt: now.toISOString(),
    hours,
    current: (data.current && hourAt(data.current)) || undefined,
    attribution: "Weather data by Open-Meteo.com · CC BY 4.0",
  };
}
