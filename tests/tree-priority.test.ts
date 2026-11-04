import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { worldSchema } from "../shared/schema.js";
import type { Environment } from "../shared/types.js";
import { treePriorities } from "../src/lib/tree-priority.js";
import { placeHeat } from "../src/lib/heat.js";
import { runTool, type ToolHost } from "../src/lib/assistant-tools.js";

// 3 PM CDT on a clear July afternoon.
const env: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 36,
  humidity: 45,
  windMps: 2,
  cloudCover: 5,
  weatherMode: "scenario",
};
const ut = worldSchema.parse(
  JSON.parse(readFileSync("public/areas/ut-austin.json", "utf8")),
);

describe("where the next trees should go", () => {
  it("ranks sunny, well-walked streets on UT Austin by sun saved", async () => {
    const plan = (await treePriorities(ut, env, { pairs: 40, top: 3 }))!;
    expect(plan.walks).toBeGreaterThan(30);
    expect(plan.streets.length).toBe(3);
    const [first, second] = plan.streets;
    expect(first.sunMinutesSavedPer100).toBeGreaterThanOrEqual(
      second.sunMinutesSavedPer100,
    );
    for (const s of plan.streets) {
      expect(s.shadeAfter).toBeGreaterThan(s.shadeNow);
      expect(s.walkShare).toBeGreaterThan(0);
      expect(s.trees).toBeGreaterThan(0);
      expect(s.street).not.toMatch(/interstate|^Footpath$/i);
    }
  }, 60000);

  it("names only streets the heat ranking knows, so planting by name matches", async () => {
    const plan = (await treePriorities(ut, env, { pairs: 40, top: 5 }))!;
    const ranked = new Set(
      placeHeat(ut, env)
        .filter((p) => p.kind === "street")
        .map((p) => p.name),
    );
    for (const s of plan.streets) expect(ranked.has(s.street)).toBe(true);
  }, 60000);

  it("has nothing to plant after dark", async () => {
    const night = { ...env, dateTime: "2026-07-16T04:00:00Z" };
    const plan = await treePriorities(ut, night, { pairs: 10 });
    expect(plan?.streets ?? []).toEqual([]);
  }, 60000);

  it("is a tool the assistant can call, highlighting the top street", async () => {
    let highlighted = "";
    const host = {
      world: ut,
      env,
      forecast: null,
      catalog: [],
      myLocationNodeId: null,
      highlightPlace: (id: string) => (highlighted = id),
    } as unknown as ToolHost;
    const out = (await runTool(
      host,
      "plan_tree_planting",
      JSON.stringify({ count: 2 }),
    )) as { streets: { street: string }[] };
    expect(out.streets).toHaveLength(2);
    expect(highlighted).toBe(`street:${out.streets[0].street}`);
  }, 60000);
});
