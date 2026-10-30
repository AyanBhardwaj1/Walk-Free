import { describe, expect, it } from "vitest";
import { heatIndexC, isShaded } from "../src/lib/environment";
import type { Environment, World } from "../shared/types";

describe("heat index (NWS method)", () => {
  it("matches the NWS calculator on hot, dry and humid days", () => {
    expect(heatIndexC(40, 39)!).toBeCloseTo(47.7, 0);
    expect(heatIndexC(40, 30)!).toBeCloseTo(43.1, 0);
    expect(heatIndexC(26.9, 100)!).toBeCloseTo(32.6, 0);
  });

  it("has no jumps at humidity or temperature thresholds", () => {
    // The old cutoffs: 40% humidity and 27 °C.
    expect(Math.abs(heatIndexC(40, 40)! - heatIndexC(40, 39)!)).toBeLessThan(1);
    expect(
      Math.abs(heatIndexC(27, 100)! - heatIndexC(26.9, 100)!),
    ).toBeLessThan(0.5);
    // Smooth everywhere else too (the old cutoff jumped 8 °C).
    // Realistic air: very hot air is never also saturated.
    for (const [c, maxR] of [
      [28, 99],
      [32, 99],
      [36, 80],
      [40, 60],
      [44, 40],
    ])
      for (let r = 5; r < maxR; r++)
        expect(
          Math.abs(heatIndexC(c, r + 1)! - heatIndexC(c, r)!),
        ).toBeLessThan(1);
    for (let c = 21; c < 42; c += 0.1)
      expect(
        Math.abs(heatIndexC(c + 0.1, 50)! - heatIndexC(c, 50)!),
      ).toBeLessThan(0.6);
  });

  it("leaves cool air to the thermometer", () => {
    expect(heatIndexC(12, 60)).toBeNull();
  });
});

describe("shade from rotated buildings", () => {
  it("falls where the building is drawn, not its mirror image", () => {
    // A 60 m by 2 m wall turned 45°, 20 m tall, with the sun nearly overhead.
    const world = {
      origin: { lat: 23.4, lon: 0 },
      objects: [
        {
          id: "wall",
          kind: "building",
          name: "Wall",
          position: [0, 0],
          width: 60,
          depth: 2,
          height: 20,
          rotation: 45,
          source: "user",
          heightMethod: "designed",
        },
      ],
    } as unknown as World;
    const noon: Environment = {
      dateTime: "2026-06-21T12:00:00Z",
      temperatureC: 30,
      humidity: 40,
      windMps: 1,
      cloudCover: 0,
      weatherMode: "scenario",
    };
    // The 3D scene and 2D map turn (x, 0) to (x·cos, x·sin).
    expect(isShaded([17.7, 17.7], world, noon)).toBe(true);
    expect(isShaded([17.7, -17.7], world, noon)).toBe(false);
  });
});

describe("forecast lookup", () => {
  it("uses the nearest forecast hour at half past, instead of keeping the old weather", async () => {
    const { weatherAt } = await import("../src/lib/heat");
    const hour = (iso: string, temperatureC: number) => ({
      time: iso,
      temperatureC,
      humidity: 50,
      windMps: 1,
      cloudCover: 0,
      description: "",
    });
    const forecast = {
      source: "test",
      fetchedAt: "2026-07-01T00:00:00Z",
      attribution: "",
      hours: [
        hour("2026-07-01T11:00:00Z", 24),
        hour("2026-07-01T12:00:00Z", 27.6),
      ],
    };
    const env: Environment = {
      dateTime: "2026-07-01T20:00:00Z",
      temperatureC: 33.9,
      humidity: 40,
      windMps: 1,
      cloudCover: 0,
      weatherMode: "forecast",
    };
    expect(
      weatherAt(env, "2026-07-01T11:30:00Z", forecast).temperatureC,
    ).not.toBe(33.9);
    expect(weatherAt(env, "2026-07-01T11:20:00Z", forecast).temperatureC).toBe(
      24,
    );
    // Far from any forecast hour, the current values stay.
    expect(weatherAt(env, "2026-07-01T15:00:00Z", forecast).temperatureC).toBe(
      33.9,
    );
  });
});
