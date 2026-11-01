import { describe, expect, it, vi } from "vitest";

// Fixed tool answers, so the "cooler than now" sentence is always reached.
vi.mock("../src/lib/assistant-tools.js", () => ({
  runTool: async (_host: unknown, name: string) =>
    ({
      heat_ranking: {
        at: "3:00 PM",
        hottest: [{ name: "Speedway", feels_like_f: 104, shaded_percent: 0 }],
        coolest: [{ name: "Sparks Ave", feels_like_f: 95, shaded_percent: 70 }],
      },
      place_heat: { shaded_percent: 0, in_sun_f: 104, in_shade_f: 95 },
      plan_route: {
        options: [
          {
            preference: "quickest",
            minutes: 9,
            shaded_percent: 20,
            minutes_in_sun: 7,
          },
          {
            preference: "shade",
            minutes: 10,
            shaded_percent: 60,
            minutes_in_sun: 4,
          },
        ],
      },
      best_time_to_leave: {
        weather: "live forecast",
        day: "today",
        best: { leave_at: "7 PM", feels_like_f: 95 },
        cooler_than_now_f: 9,
      },
    })[name],
}));
vi.mock("../src/lib/cool-stops.js", () => ({
  coolStopNodes: () => [
    { nodeId: "a", name: "Library" },
    { nodeId: "b", name: "Union" },
  ],
}));

const { runToolDemo } = await import("../src/lib/tool-demo");
const host = {
  world: {
    graph: {
      nodes: [
        { id: "a", point: [0, 0] },
        { id: "b", point: [500, 0] },
      ],
    },
  },
  catalog: [],
} as never;

async function replies(unit: "F" | "C") {
  vi.useFakeTimers();
  const out: string[] = [];
  const done = runToolDemo(host, (t) => out.push(t.reply), undefined, unit);
  await vi.runAllTimersAsync();
  await done;
  vi.useRealTimers();
  return out;
}

describe("demo temperature differences", () => {
  it("says 9° cooler in °F", async () => {
    expect((await replies("F"))[3]).toBe(
      "Leave at 7 PM: it should feel about 95°F, 9° cooler than now.",
    );
  });
  it("converts the difference (not just the reading) in °C", async () => {
    expect((await replies("C"))[3]).toBe(
      "Leave at 7 PM: it should feel about 35°C, 5° cooler than now.",
    );
  });
});
