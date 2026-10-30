import { afterEach, describe, expect, it, vi } from "vitest";
import type { OsmResponse } from "../shared/osm";
import { ServiceError } from "../shared/errors";
import { prebuiltAreaFor } from "../shared/areas";
import { loadWorld } from "../src/lib/world-source";
import type { World } from "../shared/types";

const requestJson = vi.fn();
vi.mock("../server/network.js", async (original) => ({
  ...(await original<typeof import("../server/network")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

afterEach(() => {
  requestJson.mockReset();
  vi.unstubAllEnvs();
});

// A single public footway is enough for the parser to produce a world.
function osm(lat: number, lon: number): OsmResponse {
  return {
    elements: [
      { type: "node", id: 1, lat, lon },
      { type: "node", id: 2, lat: lat + 0.001, lon },
      {
        type: "way",
        id: 10,
        nodes: [1, 2],
        tags: { highway: "footway", name: "Speedway" },
        geometry: [
          { lat, lon },
          { lat: lat + 0.001, lon },
        ],
      },
    ],
  };
}
// getWorld caches on disk, so each server test needs coordinates of its own.
const uniqueLat = () => 41 + Math.round(Math.random() * 1e5) / 1e5;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("server map mirrors", () => {
  it("falls back to the next Overpass mirror when one is unavailable", async () => {
    vi.stubEnv("WALK_FREE_OVERPASS_URL", "");
    const lat = uniqueLat();
    const { getWorld } = await import("../server/data");
    requestJson
      .mockRejectedValueOnce(
        new ServiceError("UPSTREAM_UNAVAILABLE", "HTTP 504", 502),
      )
      .mockResolvedValueOnce(osm(lat, -90.10101));
    const world = await getWorld(lat, -90.10101, "Mirror test", 300);
    expect(world.roads[0].name).toBe("Speedway");
    expect(requestJson.mock.calls.map((c) => c[0])).toEqual([
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
    ]);
  });

  it("does not retry other mirrors when the area itself is too large", async () => {
    const { getWorld } = await import("../server/data");
    requestJson.mockRejectedValueOnce(
      new ServiceError("RESPONSE_TOO_LARGE", "Too much data", 502),
    );
    await expect(getWorld(uniqueLat(), -90.20202, "Big", 300)).rejects.toThrow(
      "Too much data",
    );
    expect(requestJson).toHaveBeenCalledTimes(1);
  });
});

describe("client world sources", () => {
  const far = { lat: 41.3, lon: -90.3, name: "Elsewhere", radius: 400 };

  it("matches hero areas only near their center and within their size", () => {
    expect(prebuiltAreaFor(30.2855, -97.7345, 800)?.slug).toBe("ut-austin");
    expect(prebuiltAreaFor(30.285, -97.7341, 1500)).toBeUndefined();
    expect(prebuiltAreaFor(30.3, -97.7341, 800)).toBeUndefined();
  });

  it("serves a shipped hero area without calling the API", async () => {
    const provenance = { notes: ["Tree canopy: 3 tree crowns inferred"] };
    const fetch = vi.fn(async () =>
      json({ id: "hero", name: "old", provenance }),
    );
    const result = await loadWorld(
      { lat: 37.8719, lon: -122.2585, name: "UC Berkeley, CA", radius: 1000 },
      { fetch, apiBase: "" },
    );
    expect(result).toEqual({
      source: "prebuilt",
      world: { id: "hero", name: "UC Berkeley, CA", provenance },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/areas/uc-berkeley.json");
  });

  it("uses the API when it succeeds", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL) =>
      json({ id: "server-world" }),
    );
    const result = await loadWorld(far, { fetch, apiBase: "" });
    expect(result.source).toBe("server");
    expect(String(fetch.mock.calls[0][0])).toMatch(/^\/api\/world\?lat=41.3/);
  });

  it("builds in the browser when the API returns a plain-text crash page", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith("/api/")
        ? new Response("A server error has occurred", { status: 500 })
        : String(url).includes("overpass-api.de")
          ? new Response("busy", { status: 429 })
          : json(osm(41.3, -90.3)),
    );
    const result = await loadWorld(far, { fetch, apiBase: "" });
    expect(result.source).toBe("browser");
    expect((result.world as { roads: unknown[] }).roads).toHaveLength(1);
    expect(
      fetch.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => !u.startsWith("/api/canopy")),
    ).toEqual([
      expect.stringMatching(/^\/api\/world/),
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
    ]);
  });

  it("shows login errors instead of bypassing the account check", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL) =>
      json({ error: "Please log in to continue." }, 401),
    );
    await expect(loadWorld(far, { fetch, apiBase: "" })).rejects.toThrow(
      "Please log in to continue.",
    );
    // No Overpass request went around the account check.
    expect(
      fetch.mock.calls.every((c) => String(c[0]).startsWith("/api/")),
    ).toBe(true);
  });

  it("lets guests build straight from the browser without the API", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL) =>
      json(osm(41.3, -90.3)),
    );
    const result = await loadWorld(far, {
      fetch,
      apiBase: "",
      skipServer: true,
    });
    expect(result.source).toBe("browser");
    expect(
      fetch.mock.calls.some((c) => String(c[0]).startsWith("/api/world")),
    ).toBe(false);
  });

  it("adds canopy trees where no tree is mapped, and notes the source", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith("/api/canopy")
        ? json({
            cells: [
              [0, 0, 8, 12],
              [200, 200, 6, 9],
            ],
          })
        : json(osm(41.3, -90.3)),
    );
    const result = await loadWorld(far, {
      fetch,
      apiBase: "",
      skipServer: true,
    });
    const world = result.world as World;
    const canopy = world.objects.filter((o) => o.source === "canopy");
    expect(canopy.map((o) => o.position)).toEqual([
      [0, 0],
      [200, 200],
    ]);
    expect(canopy[0]).toMatchObject({ kind: "tree", width: 8, height: 12 });
    expect(world.provenance.attribution).toMatch(/Canopy Height Maps/);
    expect(world.provenance.notes.at(-1)).toMatch(/^Tree canopy: 2 tree/);
  });

  it("keeps the map and says so when the canopy service is down", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith("/api/canopy")
        ? json({ error: "down" }, 503)
        : json(osm(41.3, -90.3)),
    );
    const result = await loadWorld(far, {
      fetch,
      apiBase: "",
      skipServer: true,
    });
    const world = result.world as World;
    expect(world.roads).toHaveLength(1);
    expect(world.provenance.notes.at(-1)).toMatch(/^Tree canopy unavailable/);
  });

  it("explains when every provider fails", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(loadWorld(far, { fetch, apiBase: "" })).rejects.toThrow(
      /Every map provider is busy/,
    );
  });
});

describe("provider error reasons", () => {
  it("reads the message from common error body shapes", async () => {
    const { providerReason } = await import("../server/network");
    expect(providerReason('{"error":{"message":"Invalid model"}}')).toBe(
      "Invalid model",
    );
    expect(providerReason('{"error":"bad key"}')).toBe("bad key");
    expect(providerReason('{"detail":"Not found"}')).toBe("Not found");
    expect(providerReason("  plain\n text ")).toBe("plain text");
    expect(providerReason('{"ok":false}')).toBeUndefined();
  });
});
