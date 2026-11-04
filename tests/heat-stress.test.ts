import { describe, expect, it } from "vitest";
import type { Environment } from "../shared/types.js";
import { heatStress, utciBand, walkUtci } from "../src/lib/heat-stress.js";

const austin = { lat: 30.285, lon: -97.734 };
const july = (iso: string, extra: Partial<Environment> = {}): Environment => ({
  dateTime: iso,
  temperatureC: 36,
  humidity: 45,
  windMps: 2,
  cloudCover: 5,
  weatherMode: "scenario",
  ...extra,
});

describe("heat stress as UTCI", () => {
  it("puts full sun a band or more above shade on a July afternoon", () => {
    const s = heatStress(july("2026-07-15T20:00:00Z"), austin)!;
    // Direct sun adds roughly 20-30 °C of mean radiant temperature.
    expect(s.sunMrtC).toBeGreaterThan(18);
    expect(s.sunMrtC).toBeLessThan(35);
    expect(utciBand(s.shadeC)).toBe(2); // strong
    expect(utciBand(s.sunC)).toBeGreaterThanOrEqual(3); // very strong
  });

  it("dims the sun's share under cloud and drops it at night", () => {
    const clear = heatStress(july("2026-07-15T20:00:00Z"), austin)!;
    const cloudy = heatStress(
      july("2026-07-15T20:00:00Z", { cloudCover: 95 }),
      austin,
    )!;
    expect(cloudy.sunC).toBeLessThan(clear.sunC);
    const night = heatStress(july("2026-07-16T04:00:00Z"), austin)!;
    expect(night.sunC).toBe(night.shadeC);
  });

  it("blends a walk by its shaded share and names the bands", () => {
    const s = { shadeC: 30, sunC: 40, sunMrtC: 25 };
    expect(walkUtci(s, 0.5)).toBe(35);
    expect([20, 27, 33, 40, 50].map(utciBand)).toEqual([0, 1, 2, 3, 4]);
  });
});
