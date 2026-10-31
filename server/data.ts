import { canopyCells, type CanopyCell } from "../shared/canopy.js";
import { readCanopy } from "./canopy.js";
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
  openMeteoUrl,
  parseOpenMeteo,
  type OpenMeteoResponse,
} from "../shared/weather.js";
import {
  airQualityUrl,
  coarse,
  nwsAlertsUrl,
  parseAirQuality,
  parseWalkAlerts,
  type Outlook,
} from "../shared/outlook.js";
import {
  MAX_TILED_ELEMENTS,
  areaTiles,
  mergeOsm,
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

const CACHE_ROOT =
  process.env.WALK_FREE_CACHE_DIR ||
  (process.env.VERCEL
    ? join(tmpdir(), "walk-free-cache")
    : join(process.cwd(), ".cache", "walk-free"));
const pending = new Map<string, Promise<unknown>>();
let activeMapRequests = 0;
const MAX_MAP_REQUESTS = 2;
const MAP_BUDGET_MS = 55_000;
const LIVE_WEATHER_TTL_MS = 10 * 60 * 1000;
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
/** Runs one Overpass query, trying each mirror within the time budget. */
export async function fetchOverpass(
  query: string,
  limits: { budgetMs: number; mirrorTimeoutMs: number },
): Promise<OsmResponse> {
  const body = new URLSearchParams({ data: query }).toString();
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
      return await requestJson<OsmResponse>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        timeoutMs: Math.min(limits.mirrorTimeoutMs, remaining),
        maxBytes: 40 * 1024 * 1024,
      });
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
      // Large districts load as tiles in parallel, each within the budget.
      const tiles = areaTiles(lat, lon, radius);
      const payload = mergeOsm(
        await Promise.all(
          tiles.map((t) =>
            fetchOverpass(
              overpassQuery(
                t.lat,
                t.lon,
                t.radius,
                Math.ceil(limits.mirrorTimeoutMs / 1000),
              ),
              limits,
            ),
          ),
        ),
      );
      return parseOsmWorld(
        payload,
        origin,
        name,
        radius,
        new Date(),
        tiles.length > 1 ? MAX_TILED_ELEMENTS : undefined,
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
/**
 * Live weather: Open-Meteo first (open data, worldwide, refreshed every
 * ~15 minutes), then the National Weather Service for US locations.
 */
export async function getWeather(
  lat: number,
  lon: number,
): Promise<WeatherForecast> {
  return cached(
    `weather-v3-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    LIVE_WEATHER_TTL_MS,
    async () => {
      try {
        return parseOpenMeteo(
          await requestJson<OpenMeteoResponse>(openMeteoUrl(lat, lon), {
            timeoutMs: 10_000,
            maxBytes: 1_000_000,
          }),
        );
      } catch (openMeteoError) {
        try {
          return await getNwsWeather(lat, lon);
        } catch {
          throw openMeteoError;
        }
      }
    },
  );
}

export async function getNwsWeather(
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

/** Canopy for an area: crown cells relative to `origin`, in metres. */
export interface CanopyArea {
  origin: { lat: number; lon: number };
  cells: CanopyCell[];
}
/** Radii canopy is computed for; requests round up to one of them. */
const CANOPY_RADII = [500, 900, 1100, 1600];
const CANOPY_CACHE_SIZE = 48;
const MAX_CANOPY_READS = 3;
const MAX_CANOPY_QUEUE = 12;
const canopyCache = new Map<string, CanopyArea>();
const canopyPending = new Map<string, Promise<CanopyArea | null>>();
let canopyReads = 0;
const canopyQueue: (() => void)[] = [];

/**
 * Inferred crown cells around a point from Meta's canopy height map, or
 * null when the map can't be read. Requests snap to a coarse grid (about
 * 100 m) and a few radii, so nearby areas share one cached result; the
 * caller shifts cells from the returned origin to its own.
 */
export async function getCanopy(
  lat: number,
  lon: number,
  radius: number,
): Promise<CanopyArea | null> {
  const origin = {
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(lon * 1000) / 1000,
  };
  // Cover the request even after the centre moves to the grid.
  const r = CANOPY_RADII.find((x) => x >= radius + 80) ?? CANOPY_RADII.at(-1)!;
  const key = `${origin.lat},${origin.lon},${r}`;
  const hit = canopyCache.get(key);
  if (hit) {
    canopyCache.delete(key);
    canopyCache.set(key, hit);
    return hit;
  }
  const existing = canopyPending.get(key);
  if (existing) return existing;
  const task = (async () => {
    // A public endpoint: bound tile reads per instance and queue the rest.
    if (canopyReads >= MAX_CANOPY_READS) {
      if (canopyQueue.length >= MAX_CANOPY_QUEUE) return null;
      await new Promise<void>((resolve) => canopyQueue.push(resolve));
    }
    canopyReads++;
    try {
      const raster = await readCanopy(origin.lat, origin.lon, r);
      if (!raster) return null;
      const area = { origin, cells: canopyCells(origin, r * 2, raster) };
      canopyCache.set(key, area);
      if (canopyCache.size > CANOPY_CACHE_SIZE)
        canopyCache.delete(canopyCache.keys().next().value!);
      return area;
    } finally {
      canopyReads--;
      canopyQueue.shift()?.();
    }
  })();
  canopyPending.set(key, task);
  try {
    return await task;
  } finally {
    canopyPending.delete(key);
  }
}

const OUTLOOK_TTL_MS = 10 * 60 * 1000;
/** Loads one outlook part, caching only real answers (a failure is retried). */
async function outlookPart<T>(
  key: string,
  load: () => Promise<T | null>,
): Promise<T | null> {
  try {
    return await cached(key, OUTLOOK_TTL_MS, async () => {
      const value = await load();
      if (value === null)
        throw new ServiceError("NO_DATA", "No usable answer.");
      return value;
    });
  } catch {
    return null;
  }
}

/**
 * Air quality and active NWS heat/air alerts near a point. Each part is
 * fetched and cached on its own, so one failing source never hides the other.
 */
export async function getOutlook(
  lat: number,
  lon: number,
  now = new Date(),
): Promise<Outlook> {
  const at = `${coarse(lat)}-${coarse(lon)}`;
  const [air, alerts] = await Promise.all([
    outlookPart(`air-v1-${at}`, async () =>
      parseAirQuality(
        await requestJson(airQualityUrl(lat, lon), {
          timeoutMs: 10_000,
          maxBytes: 200_000,
        }),
      ),
    ),
    outlookPart(`alerts-v1-${at}`, async () =>
      parseWalkAlerts(
        await requestJson(nwsAlertsUrl(lat, lon), {
          timeoutMs: 10_000,
          maxBytes: 2_000_000,
          headers: { Accept: "application/geo+json" },
        }),
        now,
      ),
    ),
  ]);
  return {
    air,
    // Cached alerts can run out while cached.
    alerts:
      alerts?.filter((a) => !a.ends || Date.parse(a.ends) > now.getTime()) ??
      null,
    fetchedAt: now.toISOString(),
  };
}
