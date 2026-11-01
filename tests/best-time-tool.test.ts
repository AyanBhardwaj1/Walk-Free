import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Environment, World } from "../shared/types";
import { destinationCatalog } from "../src/lib/destinations";
import { runTool, type ToolHost } from "../src/lib/assistant-tools";
import { ASSISTANT_TOOLS } from "../shared/assistant";

const world = JSON.parse(
  readFileSync(
    new URL("../public/areas/ut-austin.json", import.meta.url),
    "utf8",
  ),
) as World;
// 11 AM in Austin on a clear July day.
const env: Environment = {
  dateTime: "2026-07-15T16:00:00Z",
  temperatureC: 35,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
function host(nowIso: string) {
  const calls: string[] = [];
  const h: ToolHost = {
    world,
    env,
    forecast: null,
    catalog: destinationCatalog(world),
    myLocationNodeId: null,
    now: () => nowIso,
    showRoute: (r) => calls.push(`route ${r.preference} ${r.dateTime}`),
    setDateTime: (iso) => calls.push(`time ${iso}`),
    highlightPlace: vi.fn(),
    buildArea: vi.fn(),
    applyPlanting: vi.fn(),
    proposeDesign: vi.fn(),
  };
  return { h, calls };
}
type Result = {
  error?: string;
  day: string;
  best: { leave_at: string; feels_like_f: number };
  now: { hour: string; feels_like_f: number };
  cooler_than_now_f: number;
  by_hour: { leave_at: string; feels_like_f: number }[];
};

describe("best_time_to_leave tool", () => {
  it("is offered to the model", () => {
    expect(ASSISTANT_TOOLS.map((t) => t.function.name)).toContain(
      "best_time_to_leave",
    );
  });

  it("finds the coolest hour still ahead and shows the route without moving the clock", async () => {
    const { h, calls } = host("2026-07-15T16:00:00Z");
    const r = (await runTool(
      h,
      "best_time_to_leave",
      JSON.stringify({
        from: "Perry-Castañeda Library",
        to: "Gregory Gymnasium",
      }),
    )) as Result;
    expect(r.error).toBeUndefined();
    expect(r.day).toBe("today");
    expect(r.by_hour[0].leave_at).toBe("6 AM");
    expect(r.by_hour.at(-1)!.leave_at).toBe("8 PM");
    // Best is an hour from 11 AM on, and never warmer than leaving now.
    const ahead = r.by_hour.slice(5);
    expect(ahead.map((x) => x.leave_at)).toContain(r.best.leave_at);
    expect(r.best.feels_like_f).toBeLessThanOrEqual(r.now.feels_like_f);
    expect(r.cooler_than_now_f).toBeGreaterThanOrEqual(0);
    expect(calls).toEqual([`route shade ${env.dateTime}`]);
  });

  it("plans tomorrow after 8 PM", async () => {
    const { h } = host("2026-07-16T03:00:00Z"); // 10 PM in Austin
    const r = (await runTool(
      h,
      "best_time_to_leave",
      JSON.stringify({
        from: "Perry-Castañeda Library",
        to: "Gregory Gymnasium",
      }),
    )) as Result;
    expect(r.day).toBe("tomorrow");
  });

  it("explains unknown places", async () => {
    const { h } = host("2026-07-15T16:00:00Z");
    const r = (await runTool(
      h,
      "best_time_to_leave",
      JSON.stringify({ from: "Atlantis", to: "Gregory Gymnasium" }),
    )) as Result;
    expect(r.error).toMatch(/No start matching/);
  });
});
