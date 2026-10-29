import { describe, expect, it, vi } from "vitest";
import type { Environment, GraphEdge, World } from "../shared/types";
import { destinationCatalog } from "../src/lib/destinations";
import {
  matchDestinations,
  runTool,
  type ToolHost,
} from "../src/lib/assistant-tools";
import { converse, trimHistory } from "../src/lib/assistant-client";

const env: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 36,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const edge = (
  id: string,
  from: string,
  to: string,
  name: string,
  x0: number,
  x1: number,
): GraphEdge => ({
  id,
  from,
  to,
  points: [
    [x0, 0],
    [x1, 0],
  ],
  name,
  distance: Math.abs(x1 - x0),
  covered: false,
  scenic: 0.2,
  indoor: "no",
  stairs: false,
  accessible: true,
  bidirectional: true,
});
function world(): World {
  return {
    id: "tools",
    name: "UT Austin, TX",
    origin: { lat: 30.285, lon: -97.7341 },
    timezone: "America/Chicago",
    extent: 600,
    objects: [
      {
        id: "pcl",
        kind: "building",
        name: "Perry-Castañeda Library",
        position: [200, 20],
        width: 40,
        depth: 30,
        height: 20,
        rotation: 0,
        source: "osm",
      },
    ],
    roads: [],
    landscapes: [],
    graph: {
      nodes: [
        { id: "a", point: [0, 0], name: "Speedway Gate" },
        { id: "b", point: [100, 0] },
        { id: "c", point: [200, 0] },
      ],
      edges: [
        edge("e1", "a", "b", "Speedway", 0, 100),
        edge("e2", "b", "c", "Speedway", 100, 200),
      ],
    },
    provenance: {
      source: "test",
      attribution: "",
      retrievedAt: "2026-07-15T00:00:00Z",
      live: false,
      notes: [],
    },
  } as unknown as World;
}
function host(overrides: Partial<ToolHost> = {}): ToolHost {
  const w = world();
  return {
    world: w,
    env,
    forecast: null,
    catalog: destinationCatalog(w),
    myLocationNodeId: null,
    showRoute: vi.fn(),
    setDateTime: vi.fn(),
    highlightPlace: vi.fn(),
    buildArea: vi.fn(async () => "built"),
    proposeDesign: vi.fn(async () => "preview"),
    applyPlanting: vi.fn(),
    ...overrides,
  };
}

describe("assistant tools", () => {
  it("finds places by building name as well as node name", () => {
    const catalog = destinationCatalog(world());
    expect(matchDestinations(catalog, "library")[0].id).toBe("c");
    expect(matchDestinations(catalog, "speedway gate")[0].id).toBe("a");
    expect(matchDestinations(catalog, "zzz")).toEqual([]);
    // Extra words the map doesn't know still find the place.
    expect(matchDestinations(catalog, "Speedway Gate at UT Austin")[0].id).toBe(
      "a",
    );
    expect(matchDestinations(catalog, "library entrance")[0].id).toBe("c");
  });

  it("plans and shows a route at the requested local hour", async () => {
    const h = host();
    const result = (await runTool(
      h,
      "plan_route",
      JSON.stringify({
        from: "Speedway Gate",
        to: "the library",
        leave_at_hour: 9,
      }),
    )) as {
      options: { preference: string; minutes: number }[];
      leaving: string;
    };
    expect(result.options[0]).toMatchObject({
      preference: "quickest",
      minutes: 3,
    });
    expect(result.leaving).toMatch(/9:00 AM/);
    expect(h.showRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        start: "a",
        end: "c",
        preference: "shade",
        dateTime: "2026-07-15T14:00:00.000Z",
      }),
    );
  });

  it("explains missing places and invalid arguments instead of throwing", async () => {
    expect(
      await runTool(
        host(),
        "plan_route",
        JSON.stringify({ from: "Mars", to: "library" }),
      ),
    ).toEqual({ error: 'No start matching "Mars".' });
    expect(
      await runTool(host(), "set_time", JSON.stringify({ hour: 40 })),
    ).toHaveProperty("error");
    expect(await runTool(host(), "plan_route", "{not json")).toEqual({
      error: "Arguments were not valid JSON.",
    });
    expect(await runTool(host(), "delete_everything", "{}")).toHaveProperty(
      "error",
    );
  });

  it("ranks heat and highlights a named street", async () => {
    const h = host();
    const ranking = (await runTool(h, "heat_ranking", "{}")) as {
      hottest: { name: string; feels_like_f: number }[];
    };
    expect(ranking.hottest[0].name).toBe("Speedway");
    const place = (await runTool(
      h,
      "place_heat",
      JSON.stringify({ place: "speedway" }),
    )) as {
      name: string;
      hottest_hour: { hour: number };
    };
    expect(place.name).toBe("Speedway");
    expect(h.highlightPlace).toHaveBeenCalledWith("street:Speedway");
    expect(place.hottest_hour.hour).toBeGreaterThanOrEqual(11);
  });
});

describe("assistant planting", () => {
  it("plants along a named street and reports before and after", async () => {
    const h = host();
    const result = (await runTool(
      h,
      "plant_shade_trees",
      JSON.stringify({ street: "speedway" }),
    )) as { street: string; trees_planted: number; shaded_percent: number[] };
    expect(result.street).toBe("Speedway");
    expect(result.trees_planted).toBeGreaterThan(10);
    expect(result.shaded_percent[1]).toBeGreaterThanOrEqual(
      result.shaded_percent[0],
    );
    expect(h.applyPlanting).toHaveBeenCalledOnce();
    expect(
      await runTool(
        h,
        "plant_shade_trees",
        JSON.stringify({ street: "Nowhere Lane" }),
      ),
    ).toHaveProperty("error");
  });
});

describe("assistant conversation loop", () => {
  it("runs requested tools in the browser and returns the final answer", async () => {
    const h = host();
    const post = vi
      .fn()
      .mockResolvedValueOnce({
        reply: "",
        toolCalls: [
          {
            id: "t1",
            type: "function",
            function: { name: "set_time", arguments: '{"hour":15}' },
          },
        ],
      })
      .mockResolvedValueOnce({ reply: "Moved to 3 PM.", toolCalls: [] });
    const result = await converse(
      [{ role: "user", content: "Show 3pm" }],
      () => ({
        area: "UT",
        localTime: "now",
        weather: "hot",
        canBuildAreas: true,
      }),
      () => h,
      post,
    );
    expect(result.reply).toBe("Moved to 3 PM.");
    expect(h.setDateTime).toHaveBeenCalledWith("2026-07-15T20:00:00.000Z");
    const second = post.mock.calls[1][1].messages;
    expect(second.at(-1)).toMatchObject({ role: "tool", tool_call_id: "t1" });
  });

  it("trims old turns at user boundaries so tool results stay paired", () => {
    const turns = Array.from({ length: 8 }, (_, i) => [
      { role: "user" as const, content: `q${i}` },
      { role: "assistant" as const, content: `a${i}` },
    ]).flat();
    const kept = trimHistory(turns);
    expect(kept[0]).toEqual({ role: "user", content: "q2" });
    expect(kept).toHaveLength(12);
  });
});
