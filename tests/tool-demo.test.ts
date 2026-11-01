import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Environment, World } from "../shared/types";
import { destinationCatalog } from "../src/lib/destinations";
import type { ToolHost } from "../src/lib/assistant-tools";
import { demoPair, runToolDemo, type DemoTurn } from "../src/lib/tool-demo";

const env: Environment = {
  dateTime: "2026-07-15T17:00:00Z",
  temperatureC: 36,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const world = JSON.parse(
  readFileSync(
    new URL("../public/areas/ut-austin.json", import.meta.url),
    "utf8",
  ),
) as World;

function host(): ToolHost & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    world,
    env,
    forecast: null,
    catalog: destinationCatalog(world),
    myLocationNodeId: null,
    showRoute: (r) => calls.push(`route ${r.preference}`),
    setDateTime: (iso) => calls.push(`time ${iso}`),
    highlightPlace: (id) => calls.push(`highlight ${id}`),
    buildArea: vi.fn(),
    applyPlanting: vi.fn(),
    proposeDesign: vi.fn(),
  };
}

describe("assistant demo without a model", () => {
  it("picks the same two named places a walk apart", () => {
    const h = host();
    const pair = demoPair(h)!;
    expect(pair).toEqual(demoPair(host()));
    expect(pair[0]).not.toMatch(/^Path near/);
    expect(pair[0]).not.toBe(pair[1]);
  });

  it("runs the real tools on the map and writes replies from their numbers", async () => {
    vi.useFakeTimers();
    const h = host();
    const turns: DemoTurn[] = [];
    const done = runToolDemo(h, (t) => turns.push(t));
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    expect(turns.map((t) => t.tool)).toEqual([
      "heat_ranking",
      "place_heat",
      "plan_route",
    ]);
    expect(turns[0].reply).toMatch(/is the hottest walk here, about \d+°F/);
    expect(turns[1].reply).toMatch(
      /in the sun it feels about \d+°F, in shade \d+°F/,
    );
    expect(turns[2].reply).toMatch(
      /The shade route takes \d+ min with \d+% shade/,
    );
    // The map really changed: the street is highlighted and the route shown.
    expect(h.calls.some((c) => c.startsWith("highlight "))).toBe(true);
    expect(h.calls).toContain("route shade");
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runToolDemo(host(), () => {}, controller.signal),
    ).rejects.toThrow(/abort/i);
  });
});
