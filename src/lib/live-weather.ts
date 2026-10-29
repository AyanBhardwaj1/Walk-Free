import type { Environment, WeatherForecast } from "../../shared/types.js";
import { weatherAt } from "./heat.js";

/** Current conditions apply when the chosen time is within this window. */
const CURRENT_WINDOW_MS = 45 * 60 * 1000;

/**
 * Weather for a moment: the matching forecast hour, refined by the
 * provider's current conditions when the moment is now.
 */
export function liveConditions(
  env: Environment,
  forecast: WeatherForecast,
  dateTime = new Date().toISOString(),
): Environment {
  const at = weatherAt(env, dateTime, forecast);
  const current = forecast.current;
  const near =
    current &&
    Math.abs(Date.parse(dateTime) - Date.parse(current.time)) <
      CURRENT_WINDOW_MS;
  return {
    ...(near
      ? {
          ...at,
          temperatureC: current.temperatureC,
          humidity: current.humidity ?? at.humidity,
          windMps: current.windMps,
          cloudCover: current.cloudCover ?? at.cloudCover,
        }
      : at),
    weatherMode: "forecast",
  };
}

/** Short description of the hour shown, such as "Partly cloudy". */
export function describeConditions(
  env: Environment,
  forecast: WeatherForecast,
) {
  const t = Date.parse(env.dateTime);
  const hour = forecast.hours.reduce((best, h) =>
    Math.abs(Date.parse(h.time) - t) < Math.abs(Date.parse(best.time) - t)
      ? h
      : best,
  );
  return hour.description || `${Math.round(env.cloudCover)}% cloud`;
}
