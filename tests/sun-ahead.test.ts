import { describe, expect, it } from "vitest";
import { spokenShadeHint, sunAhead } from "../src/lib/sun-ahead";

const edges = (...parts: [string, number][]) =>
  parts.map(([id, distance]) => ({ id, distance }));
const shade = (m: Record<string, number>) => (id: string) =>
  id in m ? { shade: m[id] } : undefined;

describe("sun ahead on a walk", () => {
  it("says how far until shade when walking in the sun", () => {
    const r = sunAhead(
      edges(["a", 50], ["b", 30], ["c", 100]),
      shade({ a: 0.1, b: 0.2, c: 0.9 }),
    );
    expect(r).toMatchObject({
      inShade: false,
      shadeInM: 80,
      sunMinutesLeft: 1.0,
    });
  });

  it("says how long the shade lasts when in shade", () => {
    const r = sunAhead(
      edges(["a", 120], ["b", 40], ["c", 60]),
      shade({ a: 0.8, b: 0.7, c: 0 }),
    );
    expect(r).toMatchObject({ inShade: true, shadeForM: 160 });
  });

  it("uses the mapped edge for a stretch split at the walker", () => {
    const r = sunAhead(
      edges(["a:location-b", 20], ["c", 50]),
      shade({ a: 0, c: 1 }),
    );
    expect(r?.shadeInM).toBe(20);
  });

  it("has no shade ahead when the rest is sunny", () => {
    const r = sunAhead(edges(["a", 100], ["b", 56]), shade({ a: 0, b: 0.3 }));
    expect(r?.shadeInM).toBeNull();
    expect(r?.sunMinutesLeft).toBe(1.8);
  });

  it("counts stretches without a reading toward distance only", () => {
    const r = sunAhead(edges(["x", 100], ["a", 40]), shade({ a: 0.9 }));
    expect(r).toMatchObject({ inShade: true, shadeForM: 140 });
    const s = sunAhead(
      edges(["a", 50], ["x", 300], ["c", 60]),
      shade({ a: 0, c: 1 }),
    );
    expect(s?.shadeInM).toBe(350);
  });

  it("returns nothing for an empty route", () => {
    expect(sunAhead([], shade({}))).toBeNull();
  });
});

describe("spoken shade hint", () => {
  const ahead = (inShade: boolean, shadeInM: number | null) => ({
    inShade,
    shadeInM,
    shadeForM: null,
    sunMinutesLeft: 1,
  });
  it("mentions close shade, rounded to 10 m", () => {
    expect(spokenShadeHint(ahead(false, 84))).toBe(" Shade in 80 metres.");
    expect(spokenShadeHint(ahead(false, 12))).toBe(" Shade just ahead.");
  });
  it("stays quiet in shade, with no shade ahead, or when it's far", () => {
    expect(spokenShadeHint(ahead(true, null))).toBe("");
    expect(spokenShadeHint(ahead(false, null))).toBe("");
    expect(spokenShadeHint(ahead(false, 450))).toBe("");
    expect(spokenShadeHint(null)).toBe("");
  });
});
