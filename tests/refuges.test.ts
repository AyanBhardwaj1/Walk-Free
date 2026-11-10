import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { worldSchema } from "../shared/schema.js";
import type { Environment, World } from "../shared/types.js";
import {
  findRefuges,
  refugeColor,
  refugeCoverage,
  SLOW_WALK_M_PER_MIN,
} from "../src/lib/refuges.js";
import { runTool, type ToolHost } from "../src/lib/assistant-tools.js";

// 3 PM CDT in July.
const env: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 36,
  humidity: 45,
  windMps: 2,
  cloudCover: 5,
  weatherMode: "scenario",
};

// Three paths in a row, 156 m each (2 minutes' walk): a refuge at one end.
function line(): World {
  const node = (id: string, x: number) => ({ id, point: [x, 0] });
  const edge = (id: string, from: string, to: string, x: number) => ({
    id,
    from,
    to,
    points: [
      [x, 0],
      [x + 156, 0],
    ],
    name: `${id} Street`,
    distance: 156,
    covered: false,
    scenic: 0,
    indoor: "no",
    stairs: false,
    accessible: true,
    bidirectional: true,
  });
  return {
    id: "line",
    name: "Line",
    origin: { lat: 30.28, lon: -97.73 },
    timezone: "America/Chicago",
    extent: 2000,
    objects: [],
    roads: [],
    landscapes: [],
    graph: {
      nodes: [node("a", 0), node("b", 156), node("c", 312), node("d", 468)],
      edges: [
        edge("A", "a", "b", 0),
        edge("B", "b", "c", 156),
        edge("C", "c", "d", 312),
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

describe("cool refuges within reach", () => {
  it("measures walking minutes from every path to the nearest refuge", () => {
    const cov = refugeCoverage(line(), [
      { name: "Library", kind: "cool-stop", nodeId: "a", point: [0, 0] },
    ])!;
    expect(cov.minutes.get("A")).toBeCloseTo(1, 5);
    expect(cov.minutes.get("C")).toBeCloseTo(5, 5);
    expect(cov.within[0]).toBe(1);
    expect(cov.gaps).toEqual([]);
  });

  it("has nothing to say without refuges", () => {
    expect(refugeCoverage(line(), [])).toBeNull();
  });

  it("colours near, middling and far paths", () => {
    expect(
      new Set([refugeColor(3), refugeColor(8), refugeColor(20)]).size,
    ).toBe(3);
  });

  it("finds UT Austin's refuges and the streets farthest from them", () => {
    const ut = worldSchema.parse(
      JSON.parse(readFileSync("public/areas/ut-austin.json", "utf8")),
    );
    const refuges = findRefuges(ut, env);
    expect(refuges.some((r) => r.kind === "cool-stop")).toBe(true);
    const cov = refugeCoverage(ut, refuges)!;
    expect(cov.within[1]).toBeGreaterThan(cov.within[0]);
    for (const g of cov.gaps) expect(g.street).not.toMatch(/interstate/i);
  });

  it("is a tool the assistant can call", async () => {
    const ut = worldSchema.parse(
      JSON.parse(readFileSync("public/areas/ut-austin.json", "utf8")),
    );
    const out = (await runTool(
      { world: ut, env } as unknown as ToolHost,
      "cool_refuges",
      "{}",
    )) as { paths_within_10_min_percent: number };
    expect(out.paths_within_10_min_percent).toBeGreaterThan(0);
  });
});

describe("refuge coverage at an older walker's pace", () => {
  it("counts more minutes, and fewer paths in reach, at 3.28 km/h", () => {
    const refuge = [
      {
        name: "Library",
        kind: "cool-stop" as const,
        nodeId: "a",
        point: [0, 0] as [number, number],
      },
    ];
    const usual = refugeCoverage(line(), refuge)!;
    const slow = refugeCoverage(line(), refuge, SLOW_WALK_M_PER_MIN)!;
    // The far path is 5 minutes away at 78 m/min, about 7.1 at 54.7.
    expect(slow.minutes.get("C")!).toBeCloseTo(
      (5 * 78) / SLOW_WALK_M_PER_MIN,
      5,
    );
    expect(slow.within[0]).toBeLessThan(usual.within[0]);
  });
});
