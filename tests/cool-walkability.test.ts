import { describe, expect, it } from "vitest";
import { createStudyWorld } from "../src/lib/study";
import { samplePairs, coolWalkability } from "../src/lib/cool-walkability";
import type { Environment } from "../shared/types";

const env = (dateTime: string): Environment => ({
  dateTime,
  temperatureC: 34,
  humidity: 35,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
});

describe("CoolWalkability", () => {
  const w = createStudyWorld();

  it("samples the same walks every time, at walking distances", () => {
    const a = samplePairs(w, 12);
    expect(a).toEqual(samplePairs(w, 12));
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(12);
    for (const [from, to] of a) expect(from).not.toBe(to);
  });

  it("compares shade routes with quickest routes over the sample", async () => {
    const r = (await coolWalkability(w, env("2026-06-21T20:00:00Z"), {
      pairs: 12,
    }))!;
    expect(r.walks).toBeGreaterThan(0);
    // Shade routes are never less shaded on average, nor shorter.
    expect(r.shadeShare).toBeGreaterThanOrEqual(r.quickShare - 1e-9);
    expect(r.extraDistance).toBeGreaterThanOrEqual(-1e-9);
    expect(r.sunMinutesSaved).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    // On this map, shade routing does avoid some sun at midday.
    expect(r.sunMinutesSaved).toBeGreaterThan(0);
    expect(r.shadeShare).toBeGreaterThan(r.quickShare);
  });

  it("finds nothing to gain after dark", async () => {
    const r = (await coolWalkability(w, env("2026-06-21T06:00:00Z"), {
      pairs: 8,
    }))!;
    expect(r.sunMinutesSaved).toBe(0);
  });

  it("can be cancelled between walks", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      coolWalkability(w, env("2026-06-21T20:00:00Z"), {
        pairs: 8,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
  });

  it("stops part-way when cancelled during the run", async () => {
    const controller = new AbortController();
    const run = coolWalkability(w, env("2026-06-21T20:00:00Z"), {
      pairs: 12,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 0);
    await expect(run).rejects.toThrow(/abort/i);
  });

  it("returns null for a map with no walks", async () => {
    const empty = { ...w, graph: { nodes: [], edges: [] } };
    expect(
      await coolWalkability(empty, env("2026-06-21T20:00:00Z")),
    ).toBeNull();
  });
});
