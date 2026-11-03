import { describe, expect, it } from "vitest";
import { routeProfile } from "../src/components/RouteProfile";

const route = {
  edges: [
    { id: "a", distance: 100 },
    { id: "b", distance: 50 },
    { id: "c", distance: 150 },
    { id: "d", distance: 100 },
  ],
} as never;
const shade: Record<string, number> = { a: 0.2, b: 0.1, c: 0.9, d: 0.3 };

describe("sun along the way", () => {
  it("lays out each stretch by length and colours it by shade", () => {
    const p = routeProfile(route, (id) => shade[id]);
    expect(p.stops.map((s) => [s.from, s.to])).toEqual([
      [0, 0.25],
      [0.25, 0.375],
      [0.375, 0.75],
      [0.75, 1],
    ]);
    // (20 + 5 + 135 + 30) / 400
    expect(p.shade).toBeCloseTo(0.475);
  });
  it("finds the longest unbroken sunny stretch", () => {
    expect(routeProfile(route, (id) => shade[id]).longestSunM).toBe(150);
  });
});
