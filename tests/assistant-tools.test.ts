import { describe, expect, it, vi } from "vitest";
import type { Environment, GraphEdge, World } from "../shared/types";
import { destinationCatalog } from "../src/lib/destinations";
import { snapWalkPosition } from "../src/lib/walk-location";
import {
  matchDestinations,
  runTool,
  type ToolHost,
} from "../src/lib/assistant-tools";
import {
  converse,
  PartialChatError,
  trimHistory,
} from "../src/lib/assistant-client";

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
    generateCity: vi.fn(async () => "Generated."),
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

  it("passes on the heat check and buildings closed at that hour", async () => {
    const w = world();
    w.indoor = [
      {
        buildingId: "pcl",
        buildingName: "Perry-Castañeda Library",
        source: "IMDF",
        hours: "Mo-Fr 10:00-18:00",
        levels: [],
      },
    ];
    // Wednesday 15 July 2026, 3 PM: hot, and the library is open.
    const hot = { ...env, temperatureC: 38, humidity: 30 };
    const at = (hour: number) =>
      runTool(
        host({ world: w, env: hot }),
        "plan_route",
        JSON.stringify({
          from: "Speedway Gate",
          to: "the library",
          leave_at_hour: hour,
        }),
      ) as Promise<{ heat_check?: string[]; closed_buildings?: unknown[] }>;
    const afternoon = await at(15);
    expect(afternoon.closed_buildings).toBeUndefined();
    // At 7 PM it has closed.
    const evening = await at(19);
    expect(evening.closed_buildings).toEqual([
      {
        building: "Perry-Castañeda Library",
        hours: "Closed · opens Thu 10 AM",
      },
    ]);
    // A short, unshaded walk at 38 °C: very strong heat stress, so the
    // warning signs (no shadier swap exists on one street).
    expect(afternoon.heat_check).toEqual([
      expect.stringMatching(/dizzy, sick or confused/),
    ]);
  });

  it("sets a mapped building's hours from what the model read", async () => {
    const w = world();
    w.indoor = [
      {
        buildingId: "pcl",
        buildingName: "Perry-Castañeda Library",
        source: "IMDF",
        levels: [],
      },
    ];
    const setBuildingHours = vi.fn();
    const h = host({ world: w, setBuildingHours });
    const set = (building: string, hours: string) =>
      runTool(h, "set_building_hours", JSON.stringify({ building, hours }));
    const ok = (await set(
      "Perry-Castañeda",
      "Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off",
    )) as { building: string; at_the_time_shown?: string };
    expect(setBuildingHours).toHaveBeenCalledWith(
      "pcl",
      "Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off",
    );
    expect(ok.building).toBe("Perry-Castañeda Library");
    // Wednesday 15 July, 3 PM in Austin.
    expect(ok.at_the_time_shown).toBe("Open until 10 PM");
    // Words that aren't the syntax are refused, not guessed at.
    expect(await set("Perry-Castañeda", "open late on weekdays")).toMatchObject(
      {
        error: expect.stringMatching(/aren't OpenStreetMap opening_hours/),
      },
    );
    // A building without a mapped inside, or a name too short to match.
    expect(await set("Gregory Gym", "24/7")).toMatchObject({
      error: expect.stringMatching(/No building with a mapped inside/),
    });
    expect(await set("Li", "24/7")).toMatchObject({
      error: expect.stringMatching(/No building with a mapped inside/),
    });
    // Empty hours clear them.
    await set("Perry-Castañeda Library", "");
    expect(setBuildingHours).toHaveBeenLastCalledWith("pcl", null);
    expect(setBuildingHours).toHaveBeenCalledTimes(2);
  });

  it("picks the building asked for among similar names", async () => {
    const w = world();
    const room = (id: string, name: string) => ({
      buildingId: id,
      buildingName: name,
      source: "IMDF",
      levels: [],
    });
    w.indoor = [
      room("b1", "Green Library"),
      room("b2", "Green Library Annex"),
      room("b3", "Main Hall"),
      room("b4", "Main Hall East"),
    ];
    const setBuildingHours = vi.fn();
    const h = host({ world: w, setBuildingHours });
    const set = (building: string) =>
      runTool(
        h,
        "set_building_hours",
        JSON.stringify({ building, hours: "24/7" }),
      );
    await set("Green Library Annex");
    expect(setBuildingHours).toHaveBeenLastCalledWith("b2", "24/7");
    await set("green library");
    expect(setBuildingHours).toHaveBeenLastCalledWith("b1", "24/7");
    // "the library in Main Hall East" names the longer building.
    await set("the library in Main Hall East");
    expect(setBuildingHours).toHaveBeenLastCalledWith("b4", "24/7");
    // Whole words only: "Smart Hall" isn't the building called "Art".
    w.indoor.push(room("b5", "Art"), room("b6", "Pétion Hall"));
    expect(await set("Smart Hall")).toMatchObject({
      error: expect.stringMatching(/No building with a mapped inside/),
    });
    // Accents don't get in the way.
    await set("Petion Hall");
    expect(setBuildingHours).toHaveBeenLastCalledWith("b6", "24/7");
    // Only part of a name that fits two buildings: ask which.
    expect(await set("Green")).toMatchObject({
      error: expect.stringMatching(
        /could be Green Library or Green Library Annex/,
      ),
    });
  });

  it("starts 'my location' at the walk's current start when there's no fix", async () => {
    const h = host({ currentStartNodeId: "a" });
    const result = (await runTool(
      h,
      "plan_route",
      JSON.stringify({ from: "my location", to: "the library" }),
    )) as { from: string; note?: string };
    expect(result.note).toMatch(/current start/);
    expect(h.showRoute).toHaveBeenCalledWith(
      expect.objectContaining({ start: "a", end: "c" }),
    );
    // With a fix, the walker's own position wins, with no note.
    const fixed = (await runTool(
      host({ currentStartNodeId: "a", myLocationNodeId: "b" }),
      "plan_route",
      JSON.stringify({ from: "my location", to: "the library" }),
    )) as { note?: string };
    expect(fixed.note).toBeUndefined();
    // Neither: ask for a start.
    expect(
      await runTool(
        host(),
        "plan_route",
        JSON.stringify({ from: "my location", to: "the library" }),
      ),
    ).toHaveProperty("error");
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

describe("planting with a GPS fix", () => {
  it("plants in the saved scene, never the copy split at the walker", async () => {
    const base = host();
    const [a, b] = base.world.graph.edges[0].points;
    const middle: [number, number] = [(a[0] + b[0]) / 2 + 2, (a[1] + b[1]) / 2];
    const snapped = snapWalkPosition(base.world, middle, {
      avoidStairs: false,
      allowHypothetical: false,
    })!;
    expect(snapped.world).not.toBe(base.world);
    const h = host({ world: snapped.world, scene: base.world });
    await runTool(
      h,
      "plant_shade_trees",
      JSON.stringify({ street: "speedway" }),
    );
    const [result, before] = vi.mocked(h.applyPlanting).mock.calls[0];
    expect(before).toBe(base.world);
    expect(
      result.world.graph.nodes.some((n) =>
        n.id.startsWith("walk-free:location"),
      ),
    ).toBe(false);
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

describe("assistant failures midway", () => {
  it("keeps actions already taken when a later round fails", async () => {
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
      .mockRejectedValueOnce(new Error("The AI provider is rate-limiting."));
    const failure = await converse(
      [{ role: "user", content: "Show 3pm" }],
      () => ({ area: "A", localTime: "", weather: "", canBuildAreas: false }),
      () => h,
      post,
    ).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PartialChatError);
    const { messages, message } = failure as PartialChatError;
    expect(message).toMatch(/rate-limiting/);
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(h.setDateTime).toHaveBeenCalled();
  });

  it("stays inside the server's limits for replies and tool calls", async () => {
    const h = host();
    const calls = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      type: "function" as const,
      function: { name: "set_time", arguments: '{"hour":15}' },
    }));
    const post = vi
      .fn()
      .mockResolvedValueOnce({ reply: "", toolCalls: calls })
      .mockResolvedValueOnce({ reply: "x".repeat(9000), toolCalls: [] });
    const { messages } = await converse(
      [{ role: "user", content: "Show 3pm" }],
      () => ({ area: "A", localTime: "", weather: "", canBuildAreas: false }),
      () => h,
      post,
    );
    const asked = messages[1] as { tool_calls: unknown[] };
    expect(asked.tool_calls).toHaveLength(8);
    expect(messages.filter((m) => m.role === "tool")).toHaveLength(8);
    expect((messages.at(-1)!.content as string).length).toBeLessThanOrEqual(
      6000,
    );
  });
});

describe("generate_city", () => {
  it("passes the description and realism to the host", async () => {
    const generateCity = vi.fn(async () => "Generated Ravenmoor.");
    const result = await runTool(
      host({ generateCity }),
      "generate_city",
      JSON.stringify({ description: "a rainy gothic city", realism: "dense" }),
    );
    expect(generateCity).toHaveBeenCalledWith("a rainy gothic city", "dense");
    expect(result).toEqual({ result: "Generated Ravenmoor." });
  });
  it("defaults to detailed realism", async () => {
    const generateCity = vi.fn(async () => "ok");
    await runTool(
      host({ generateCity }),
      "generate_city",
      JSON.stringify({ description: "a desert city" }),
    );
    expect(generateCity).toHaveBeenCalledWith("a desert city", "detailed");
  });
});
