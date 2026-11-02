import { describe, expect, it } from "vitest";
import { partialLine, type P3 } from "../src/lib/polyline.js";

const L: P3[] = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 0, 30],
];

describe("partialLine", () => {
  it("returns the whole line at k = 1", () => {
    expect(partialLine(L, 1)).toBe(L);
  });
  it("cuts by length, mid-segment", () => {
    expect(partialLine(L, 0.5)).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
    ]);
  });
  it("keeps a drawable two-point line at the start", () => {
    expect(partialLine(L, 0)).toHaveLength(2);
  });
});
