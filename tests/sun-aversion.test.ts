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
