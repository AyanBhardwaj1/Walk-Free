import { prebuiltAreaFor } from "../../shared/areas.js";
import { ServiceError } from "../../shared/errors.js";
import { hasCanopy, withCanopy, type CanopyCell } from "../../shared/canopy.js";
import type { World } from "../../shared/types.js";
import {
  MAX_TILED_ELEMENTS,
  areaTiles,
  mergeOsm,
  OVERPASS_ENDPOINTS,
  overpassQuery,
  overpassRetryable,
  parseOsmWorld,
  worldOrigin,
  localPoint,
  type OsmResponse,
} from "../../shared/osm.js";

export type WorldSource = "prebuilt" | "server" | "browser";
export interface AreaRequest {
  lat: number;
  lon: number;
  name: string;
  radius: number;
}
export interface WorldSourceDeps {
  fetch: typeof fetch;
  apiBase: string;
  timeoutMs?: number;
  /** Guests have no session, so go straight to the browser fallback. */
  skipServer?: boolean;
  /** Progress text for the loading screen. */
  onStage?: (stage: string) => void;
}

/** Server answers the client should show rather than work around. */
const FINAL_STATUSES = new Set([400, 401, 403, 404]);
const BROWSER_TIMEOUT_MS = 45_000;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fromPrebuilt(request: AreaRequest, deps: WorldSourceDeps) {
  const area = prebuiltAreaFor(request.lat, request.lon, request.radius);
  if (!area) return null;
  try {
    const response = await deps.fetch(`/areas/${area.slug}.json`);
    if (!response.ok) return null;
    const world = await readJson(response);
    // A missing file falls through to a live build instead of failing.
    return world && typeof world === "object"
      ? { ...(world as object), name: request.name }
      : null;
  } catch {
    return null;
  }
}

async function fromServer(request: AreaRequest, deps: WorldSourceDeps) {
  const params = new URLSearchParams({
    lat: String(request.lat),
    lon: String(request.lon),
    name: request.name,
    radius: String(request.radius),
  });
  let response: Response;
  try {
    response = await deps.fetch(`${deps.apiBase}/api/world?${params}`, {
      credentials: "include",
    });
  } catch {
    return null;
  }
  const data = (await readJson(response)) as { error?: string } | null;
  if (response.ok && data) return data;
  if (FINAL_STATUSES.has(response.status))
    throw new ServiceError(
      "REQUEST_REJECTED",
      data?.error || "This area could not be built.",
      response.status,
    );
  return null;
}

/** One Overpass query from the browser, trying each mirror in turn. */
async function browserQuery(query: string, deps: WorldSourceDeps) {
  const body = new URLSearchParams({ data: query });
  let failure: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await deps.fetch(endpoint, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(deps.timeoutMs ?? BROWSER_TIMEOUT_MS),
      });
      if (!response.ok)
        throw new ServiceError(
          "UPSTREAM_UNAVAILABLE",
          `Map provider returned HTTP ${response.status}.`,
        );
      const payload = (await readJson(response)) as OsmResponse | null;
      if (!payload)
        throw new ServiceError(
          "INVALID_UPSTREAM_DATA",
          "Map provider returned invalid data.",
        );
      return payload;
    } catch (error) {
      if (!overpassRetryable(error)) throw error;
      failure = error;
    }
  }
  throw new ServiceError(
    "MAP_UNAVAILABLE",
    "Every map provider is busy right now. Wait a minute and try again, or choose a smaller area.",
    503,
    failure instanceof Error ? failure.message : undefined,
  );
}

async function fromBrowser(request: AreaRequest, deps: WorldSourceDeps) {
  const tiles = areaTiles(request.lat, request.lon, request.radius);
  const payload = mergeOsm(
    await Promise.all(
      tiles.map((t) =>
        browserQuery(overpassQuery(t.lat, t.lon, t.radius), deps),
      ),
    ),
  );
  return parseOsmWorld(
    payload,
    worldOrigin(request.lat, request.lon),
    request.name,
    request.radius,
    new Date(),
    tiles.length > 1 ? MAX_TILED_ELEMENTS : undefined,
  );
}

/** Where an area's canopy is requested for: its centre and half-width. */
interface CanopyTarget {
  origin: { lat: number; lon: number };
  radius: number;
}

/**
 * Inferred tree crowns from the canopy map, moved onto the target's local
 * grid and trimmed to it, or null if the map can't be read. The server
 * snaps requests to a coarse grid so neighbouring areas share its cache.
 */
async function canopyFor(target: CanopyTarget, deps: WorldSourceDeps) {
  const params = new URLSearchParams({
    lat: String(target.origin.lat),
    lon: String(target.origin.lon),
    radius: String(target.radius),
  });
  try {
    const response = await deps.fetch(`${deps.apiBase}/api/canopy?${params}`, {
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await readJson(response)) as {
      cells?: unknown;
      origin?: { lat?: unknown; lon?: unknown };
    } | null;
    if (!response.ok || !Array.isArray(data?.cells)) return null;
    const from = data.origin;
    const [dx, dy] =
      typeof from?.lat === "number" && typeof from.lon === "number"
        ? localPoint(from.lat, from.lon, target.origin)
        : [0, 0];
    return (data.cells as CanopyCell[])
      .map(([x, y, crown, height]): CanopyCell => [
        Math.round((x + dx) * 10) / 10,
        Math.round((y + dy) * 10) / 10,
        crown,
        height,
      ])
      .filter(
        ([x, y]) => Math.abs(x) < target.radius && Math.abs(y) < target.radius,
      );
  } catch {
    return null;
  }
}

/** Adds canopy trees when the world is a parsed map that lacks them. */
export function addCanopy<W>(world: W, cells: CanopyCell[] | null): W {
  const w = world as Partial<World> | null;
  if (!Array.isArray(w?.objects) || !Array.isArray(w?.provenance?.notes))
    return world;
  return withCanopy(w as World, cells) as W;
}

export interface LoadedWorld {
  world: unknown;
  source: WorldSource;
  /**
   * Canopy crowns for this world, still loading, so the map can show first;
   * null when the world already has them.
   */
  canopy: Promise<CanopyCell[] | null> | null;
}

/**
 * Builds an area from the fastest reliable source: a shipped hero area, the
 * API (with its own mirror fallback and cache), then Overpass directly from
 * the browser, which avoids serverless time limits and shared-IP throttling.
 * Meta's canopy map, which fills in unmapped trees, loads alongside.
 */
export async function loadWorld(
  request: AreaRequest,
  deps: WorldSourceDeps,
): Promise<LoadedWorld> {
  const prebuilt = (await fromPrebuilt(request, deps)) as World | null;
  if (prebuilt) {
    const done =
      hasCanopy(prebuilt) ||
      !prebuilt.origin ||
      !Number.isFinite(prebuilt.extent);
    return {
      world: prebuilt,
      source: "prebuilt",
      canopy: done
        ? null
        : canopyFor(
            { origin: prebuilt.origin, radius: prebuilt.extent / 2 },
            deps,
          ),
    };
  }
  deps.onStage?.("Downloading OpenStreetMap data…");
  const pending = deps.skipServer ? null : fromServer(request, deps);
  // A built area's origin and size follow from the request.
  const canopy = canopyFor(
    {
      origin: worldOrigin(request.lat, request.lon),
      radius: request.radius,
    },
    deps,
  );
  // Errors in the map build win; the canopy request never rejects.
  const server = await pending;
  if (server) return { world: server, source: "server", canopy };
  deps.onStage?.("Map servers are busy · trying directly from your browser…");
  return {
    world: await fromBrowser(request, deps),
    source: "browser",
    canopy,
  };
}
