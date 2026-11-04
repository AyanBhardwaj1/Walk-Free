import { describe, expect, it } from "vitest";
import { gridBit, shadedGround } from "../src/components/StreetPhotoCheck";

describe("photo check ground shade", () => {
  it("marks ground well below the sunlit brightness as shaded", () => {
    const ground = [...Array(6).fill(200), ...Array(4).fill(90)];
    const split = shadedGround(ground);
    expect(split?.share).toBeCloseTo(0.4);
    expect(split?.shaded.slice(-4)).toEqual([true, true, true, true]);
    expect(split?.even).toBe(false);
  });
  it("calls evenly lit ground even instead of guessing", () => {
    const split = shadedGround(Array.from({ length: 20 }, (_, i) => 120 + i));
    expect(split?.even).toBe(true);
    expect(split?.share).toBe(0);
  });
  it("needs enough ground to tell", () => {
    expect(shadedGround([200, 90, 80])).toBeNull();
  });
  it("reads bits from the server's grid", () => {
    const bytes = new Uint8Array([0b00000101, 0b10000000]);
    expect([0, 1, 2, 15].map((i) => gridBit(bytes, i))).toEqual([1, 0, 1, 1]);
  });
});
