import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { World, WeatherForecast, WeatherHour } from "../shared/types.js";
import { requestJson, ServiceError } from "./network.js";
import {
  OVERPASS_ENDPOINTS,
  overpassQuery,
  overpassRetryable,
  parseOsmWorld,
  worldOrigin,
  type OsmResponse,
} from "../shared/osm.js";

export {
  isWalkable,
  localPoint,
  parseHeight,
  parseOsmWorld,
  type OsmElement,
  type OsmResponse,
} from "../shared/osm.js";

const CACHE_ROOT = process.env.VERCEL
  ? join(tmpdir(), "walk-free-cache")
  : join(process.cwd(), ".cache", "walk-free");
const pending = new Map<string, Promise<unknown>>();
let activeMapRequests = 0;
const MAX_MAP_REQUESTS = 2;
const MAP_BUDGET_MS = 55_000;
const MIRROR_TIMEOUT_MS = 30_000;
async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  try {
    const stored = JSON.parse(
      await readFile(join(CACHE_ROOT, `${key}.json`), "utf8"),
    ) as { savedAt: number; value: T };
    if (
      Number.isFinite(stored.savedAt) &&
      Date.now() - stored.savedAt < ttl &&
      stored.savedAt <= Date.now()
    )
      return stored.value;
  } catch {
    /* A missing/expired cache is a normal upstream fetch. */
  }
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const task = (async () => {
    const value = await load();
    try {
      await mkdir(CACHE_ROOT, { recursive: true });
      const temporary = join(CACHE_ROOT, `${key}-${randomUUID()}.tmp`);
      await writeFile(
        temporary,
        JSON.stringify({ savedAt: Date.now(), value }),
      );
      await rename(temporary, join(CACHE_ROOT, `${key}.json`));
      // Bound persistent cache growth. Never remove source/project files.
      const entries = (await readdir(CACHE_ROOT)).filter((x) =>
        x.endsWith(".json"),
      );
      if (entries.length > 128) {
        const dated = await Promise.all(
          entries.map(async (name) => ({
            name,
            mtime: (await stat(join(CACHE_ROOT, name))).mtimeMs,
          })),
        );
        dated.sort((a, b) => a.mtime - b.mtime);
        await Promise.all(
          dated
            .slice(0, entries.length - 128)
            .map((x) => unlink(join(CACHE_ROOT, x.name)).catch(() => {})),
        );
      }
    } catch {
      /* Read-only hosts can still return uncached live data. */
    }
    return value;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
export async function getWorld(
  lat: number,
  lon: number,
  name: string,
  radius = 800,
  limits: { budgetMs: number; mirrorTimeoutMs: number } = {
    budgetMs: MAP_BUDGET_MS,
    mirrorTimeoutMs: MIRROR_TIMEOUT_MS,
  },
): Promise<World> {
  const origin = worldOrigin(lat, lon);
  const key = `world-v3-${origin.lat}-${origin.lon}-${radius}`;
  const world = await cached(key, 24 * 60 * 60 * 1000, async () => {
    if (activeMapRequests >= MAX_MAP_REQUESTS)
      throw new ServiceError(
        "RATE_LIMITED",
        "Two areas are loading. Wait a moment before loading another.",
        429,
      );
    activeMapRequests++;
    try {
      const body = new URLSearchParams({
        data: overpassQuery(
          lat,
          lon,
          radius,
          Math.ceil(limits.mirrorTimeoutMs / 1000),
        ),
      }).toString();
      const endpoints = process.env.WALK_FREE_OVERPASS_URL
        ? [process.env.WALK_FREE_OVERPASS_URL, ...OVERPASS_ENDPOINTS]
        : [...OVERPASS_ENDPOINTS];
      // Stay inside the serverless time limit while trying each mirror once.
      const deadline = Date.now() + limits.budgetMs;
      let failure: unknown;
      for (const endpoint of new Set(endpoints)) {
        const remaining = deadline - Date.now();
        if (remaining < 3_000) break;
        try {
          const payload = await requestJson<OsmResponse>(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            timeoutMs: Math.min(limits.mirrorTimeoutMs, remaining),
            maxBytes: 20 * 1024 * 1024,
          });
          return parseOsmWorld(payload, origin, name, radius);
        } catch (error) {
          if (!overpassRetryable(error)) throw error;
          failure = error;
        }
      }
      throw (
        failure ??
        new ServiceError(
          "TIMEOUT",
          "The map providers took too long to respond. Try again shortly.",
          504,
        )
      );
    } finally {
      activeMapRequests--;
    }
  });
  return { ...world, name };
}

interface NWSValues {
  uom?: string;
  values?: { validTime: string; value: number | null }[];
}
interface NWSGrid {
  properties?: { skyCover?: NWSValues; visibility?: NWSValues };
}
interface NWSPeriod {
  startTime: string;
  temperature: number;
  temperatureUnit: string;
  relativeHumidity?: { value: number | null };
  windSpeed: string;
  shortForecast: string;
}
function durationMillis(value: string): number | null {
  const m = value.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  return m
    ? (Number(m[1] ?? 0) * 86400 +
        Number(m[2] ?? 0) * 3600 +
        Number(m[3] ?? 0) * 60 +
        Number(m[4] ?? 0)) *
        1000
    : null;
}
export function gridValueAt(
  grid: NWSValues | undefined,
  time: string,
): number | null {
  const instant = Date.parse(time);
  if (!Number.isFinite(instant)) return null;
  for (const entry of grid?.values ?? []) {
    const [start, end] = entry.validTime.split("/");
    const a = Date.parse(start);
    const duration = durationMillis(end ?? "");
    const b = duration === null ? Date.parse(end ?? "") : a + duration;
    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      instant >= a &&
      instant < b &&
      typeof entry.value === "number" &&
      Number.isFinite(entry.value)
    )
      return entry.value;
  }
  return null;
}
export function parseWind(speed: string): number | null {
  const nums = speed.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums?.length) return null;
  const average = nums.reduce((s, v) => s + v, 0) / nums.length;
  if (/mph/i.test(speed)) return average * 0.44704;
  if (/km\/h|kph/i.test(speed)) return average / 3.6;
  if (/kt|knots/i.test(speed)) return average * 0.514444;
  if (/m\/s/i.test(speed)) return average;
  if (/^calm$/i.test(speed.trim())) return 0;
  return null;
}
function visibilityMeters(
  grid: NWSValues | undefined,
  time: string,
): number | null {
  const value = gridValueAt(grid, time);
  if (value === null || value < 0) return null;
  const unit = grid?.uom?.split(":").at(-1);
  return unit === "m"
    ? value
    : unit === "km"
      ? value * 1000
      : unit === "ft"
        ? value * 0.3048
        : unit === "mi"
          ? value * 1609.344
          : null;
}
export function parseNwsForecast(
  periods: NWSPeriod[],
  grid: NWSGrid = {},
  now = new Date(),
): WeatherForecast {
  if (!Array.isArray(periods))
    throw new ServiceError(
      "INVALID_UPSTREAM_DATA",
      "The weather provider returned no hourly forecast.",
    );
  const hours: WeatherHour[] = [];
  for (const period of periods) {
    if (
      !Number.isFinite(Date.parse(period.startTime)) ||
      typeof period.temperature !== "number" ||
      !Number.isFinite(period.temperature)
    )
      continue;
    const temperatureC =
      period.temperatureUnit === "F"
        ? ((period.temperature - 32) * 5) / 9
        : period.temperatureUnit === "C"
          ? period.temperature
          : null;
    const windMps =
      typeof period.windSpeed === "string" ? parseWind(period.windSpeed) : null;
    if (temperatureC === null || windMps === null) continue;
    const humidity = period.relativeHumidity?.value;
    const cloud = gridValueAt(grid.properties?.skyCover, period.startTime);
    const cloudUnit = grid.properties?.skyCover?.uom?.split(":").at(-1);
    hours.push({
      time: period.startTime,
      temperatureC,
      humidity:
        typeof humidity === "number" && humidity >= 0 && humidity <= 100
          ? humidity
          : null,
      windMps,
      cloudCover:
        cloudUnit === "percent" && cloud !== null && cloud >= 0 && cloud <= 100
          ? cloud
          : null,
      description:
        typeof period.shortForecast === "string" ? period.shortForecast : "",
      visibilityMeters: visibilityMeters(
        grid.properties?.visibility,
        period.startTime,
      ),
    } as WeatherHour);
  }
  if (!hours.length)
    throw new ServiceError(
      "NO_DATA",
      "No usable hourly weather forecast is available for this location.",
    );
  return {
    source: "National Weather Service hourly forecast and grid data",
    fetchedAt: now.toISOString(),
    hours,
    attribution:
      "NOAA / National Weather Service · https://www.weather.gov/disclaimer",
  };
}
export async function getWeather(
  lat: number,
  lon: number,
): Promise<WeatherForecast> {
  return cached(
    `weather-v2-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    15 * 60 * 1000,
    async () => {
      const point = await requestJson<{
        properties?: { forecastHourly?: string; forecastGridData?: string };
      }>(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
        timeoutMs: 12_000,
        maxBytes: 1_000_000,
      });
      const hourly = point.properties?.forecastHourly,
        gridUrl = point.properties?.forecastGridData;
      const trustedNws = (url: string | undefined) => {
        if (!url) return false;
        try {
          const u = new URL(url);
          return (
            u.protocol === "https:" &&
            u.hostname === "api.weather.gov" &&
            !u.username &&
            !u.password
          );
        } catch {
          return false;
        }
      };
      if (!trustedNws(hourly))
        throw new ServiceError(
          "NO_DATA",
          "The National Weather Service has no hourly forecast for this location.",
        );
      const [forecast, grid] = await Promise.all([
        requestJson<{ properties?: { periods?: NWSPeriod[] } }>(hourly!, {
          timeoutMs: 12_000,
          maxBytes: 2_000_000,
        }),
        trustedNws(gridUrl)
          ? requestJson<NWSGrid>(gridUrl!, {
              timeoutMs: 12_000,
              maxBytes: 4_000_000,
            }).catch(() => ({}) as NWSGrid)
          : Promise.resolve({} as NWSGrid),
      ]);
      return parseNwsForecast(forecast.properties?.periods ?? [], grid);
    },
  );
}
