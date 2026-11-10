import { describe, expect, it } from "vitest";
import { otsu, simplify, vectorizePlan } from "../src/lib/indoor/plan-image";
import { drawnLPlan, drawnPlan } from "./fixtures/floor-plan";

describe("floor plan images to rooms and corridors", () => {
  it("finds the wall threshold between ink and paper", () => {
    const t = otsu(drawnPlan());
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(255);
  });

  it("separates six rooms from one corridor despite open doorways", () => {
    const plan = vectorizePlan(drawnPlan());
    expect(plan.rooms).toHaveLength(6);
    expect(plan.corridors.length).toBeGreaterThanOrEqual(1);
    // The corridor runs along the middle, around y = 100.
    const ys = plan.corridors.flat().map((p) => p[1]);
    expect(Math.min(...ys)).toBeGreaterThan(88);
    expect(Math.max(...ys)).toBeLessThan(112);
    // Every room has a doorway onto it, at the corridor walls.
    expect(plan.doors).toHaveLength(6);
    for (const d of plan.doors)
      expect([86, 114].some((y) => Math.abs(d[1] - y) < 5)).toBe(true);
    expect(plan.bounds.minX).toBeLessThanOrEqual(31);
    expect(plan.bounds.maxX).toBeGreaterThanOrEqual(269);
  });

  it("keeps the outside out through entrances, and finds them", () => {
    const closed = vectorizePlan(drawnPlan());
    expect(closed.entrances).toEqual([]);
    const plan = vectorizePlan(drawnPlan({ entrances: true }));
    expect(plan.rooms).toHaveLength(6);
    expect(plan.corridors.length).toBeGreaterThanOrEqual(1);
    expect(plan.entrances).toHaveLength(2);
    const xs = plan.entrances.map((p) => p[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(36);
    expect(xs[1]).toBeGreaterThan(264);
    for (const p of plan.entrances)
      expect(Math.abs(p[1] - 100)).toBeLessThan(6);
  });

  it("reads an L-shaped building without cutting its corridor up", () => {
    const plan = vectorizePlan(drawnLPlan());
    // Eleven rooms (desks inside them don't split them).
    expect(plan.rooms.length).toBe(11);
    // One corridor network, reaching both arms of the L.
    const pts = plan.corridors.flat();
    expect(Math.max(...pts.map((p) => p[0]))).toBeGreaterThan(700);
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(550);
    // A doorway for every room, and the double door at the foot.
    expect(plan.doors.length).toBeGreaterThanOrEqual(11);
    expect(plan.entrances).toHaveLength(1);
    expect(plan.entrances[0][1]).toBeGreaterThan(620);
  });

  it("keeps a single hall a room, not a corridor", () => {
    const w = 300,
      h = 200;
    const data = new Uint8Array(w * h).fill(255);
    const wall = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) data[y * w + x] = 20;
    };
    // One long hall, 240 × 80.
    wall(30, 60, 270, 62);
    wall(30, 138, 270, 140);
    wall(30, 60, 32, 140);
    wall(268, 60, 270, 140);
    const plan = vectorizePlan({ width: w, height: h, data });
    expect(plan.rooms).toHaveLength(1);
    expect(plan.corridors).toHaveLength(0);
  });

  it("simplifies a wobbly line to its corners", () => {
    const line: [number, number][] = [
      [0, 0],
      [5, 0.3],
      [10, 0],
      [10, 5],
      [10.2, 10],
    ];
    expect(simplify(line, 1)).toEqual([
      [0, 0],
      [10, 0],
      [10.2, 10],
    ]);
  });
});
