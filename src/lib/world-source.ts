import { prebuiltAreaFor } from "../../shared/areas.js";
import { ServiceError } from "../../shared/errors.js";
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

/**
 * Builds an area from the fastest reliable source: a shipped hero area, the
 * API (with its own mirror fallback and cache), then Overpass directly from
 * the browser, which avoids serverless time limits and shared-IP throttling.
 */
export async function loadWorld(
  request: AreaRequest,
  deps: WorldSourceDeps,
): Promise<{ world: unknown; source: WorldSource }> {
  const prebuilt = await fromPrebuilt(request, deps);
  if (prebuilt) return { world: prebuilt, source: "prebuilt" };
  deps.onStage?.("Downloading OpenStreetMap data…");
  const server = deps.skipServer ? null : await fromServer(request, deps);
  if (server) return { world: server, source: "server" };
  deps.onStage?.("Map servers are busy · trying directly from your browser…");
  return { world: await fromBrowser(request, deps), source: "browser" };
}
