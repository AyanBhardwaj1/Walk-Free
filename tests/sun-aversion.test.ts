import { describe, expect, it } from "vitest";
import baseline from "./fixtures/shade-routes-baseline.json";
import { createStudyWorld } from "../src/lib/study";
import {
  compareRoutes,
  DEFAULT_SUN_AVERSION,
  sunAversionLabel,
  clampSunAversion,
} from "../src/lib/routing";
import type { Environment } from "../shared/types";

const env = (dateTime: string): Environment => ({
  dateTime,
  temperatureC: 33,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
});
const base = {
  avoidStairs: false,
  allowHypothetical: false,
  maxDetour: 2,
};

describe("sun aversion", () => {
  const w = createStudyWorld();
  const pairs = Object.keys(baseline).map((k) => k.split("|"));

  it("reproduces the previous shade routes at the default setting", () => {
    expect(DEFAULT_SUN_AVERSION).toBe(3);
    // Baseline captured from the code before this setting existed.
    for (const [t, a, b] of pairs) {
      const key = `${t}|${a}|${b}`;
      for (const sunAversion of [undefined, 3]) {
        const r = compareRoutes(w, a, b, {
          ...base,
          environment: env(t),
          sunAversion,
        }).shade;
        expect(r ? r.edges.map((e) => e.id) : null, key).toEqual(
          (baseline as Record<string, string[] | null>)[key],
        );
      }
    }
  });

  it("makes the shade route as short as the quickest when sun doesn't matter", () => {
    for (const [t, a, b] of pairs) {
      const r = compareRoutes(w, a, b, {
        ...base,
        environment: env(t),
        sunAversion: 1,
      });
      if (r.quickest && r.shade)
        expect(r.shade.distance).toBeCloseTo(r.quickest.distance, 6);
    }
  });

  it("never adds sun as aversion grows, while within the detour budget", () => {
    for (const [t, a, b] of pairs) {
      let lastSun = Infinity;
      for (const sunAversion of [1, 2, 3, 4.5, 6]) {
        const r = compareRoutes(w, a, b, {
          ...base,
          // A generous budget keeps the planner from falling back to quickest.
          maxDetour: 50,
          environment: env(t),
          sunAversion,
        }).shade;
        if (!r) continue;
        const sun = r.distance * (1 - r.shadeFraction);
        expect(sun).toBeLessThanOrEqual(lastSun + 1e-6);
        lastSun = sun;
      }
    }
  });

  it("never shows a sunnier shade route than the default because of the detour budget", () => {
    for (const [t, a, b] of pairs)
      for (const maxDetour of [1.2, 1.5, 1.8])
        for (const strongAversion of [4, 5, 6]) {
          const at = (sunAversion: number) =>
            compareRoutes(w, a, b, {
              ...base,
              maxDetour,
              environment: env(t),
              sunAversion,
            }).shade;
          const strong = at(strongAversion),
            normal = at(3);
          if (!strong || !normal) continue;
          expect(
            strong.distance * (1 - strong.shadeFraction),
          ).toBeLessThanOrEqual(
            normal.distance * (1 - normal.shadeFraction) + 1e-6,
          );
        }
  });

  it("uses the default shade route, not the quickest, when a strong one is too long", () => {
    // At the default budget this walk's strong-aversion route is too long.
    const at = (sunAversion: number) =>
      compareRoutes(w, "market-gate", "pond-deck", {
        ...base,
        maxDetour: 1.8,
        environment: env("2026-06-21T15:00:00Z"),
        sunAversion,
      }).shade!;
    const normal = at(3);
    expect(normal.warnings).toEqual([]);
    for (const strong of [4, 6]) {
      expect(at(strong).warnings).toEqual([]);
      expect(at(strong).edges.map((e) => e.id)).toEqual(
        normal.edges.map((e) => e.id),
      );
    }
  });

  it("keeps the setting in range", () => {
    expect(clampSunAversion(0)).toBe(1);
    expect(clampSunAversion(-5)).toBe(1);
    expect(clampSunAversion(99)).toBe(6);
    expect(clampSunAversion(Number.NaN)).toBe(3);
    expect(clampSunAversion(4.5)).toBe(4.5);
  });

  it("describes the setting in words", () => {
    expect(sunAversionLabel(1)).toBe("Sun doesn't bother me");
    expect(sunAversionLabel(3)).toBe("Prefer shade");
    expect(sunAversionLabel(6)).toBe("Avoid sun at almost any cost");
  });
});
