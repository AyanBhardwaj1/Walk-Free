import { describe, expect, it } from "vitest";
import {
  WalkTracker,
  followableFix,
  outsideArea,
  FOLLOW_MAX_ACCURACY_M,
} from "../src/lib/follow";

/** A seeded noise source, so the test is the same every run. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    // Roughly normal: the sum of uniforms, centred.
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      s = (s * 16807) % 2147483647;
      sum += s / 2147483647;
    }
    return (sum - 3) * Math.SQRT2;
  };
}

describe("follow-me location", () => {
  it("accepts a laptop's coarse Wi-Fi fix but not a stale or wild one", () => {
    const now = 1_000_000;
    const fix = { lat: 30.28, lon: -97.73, accuracy: 90, timestamp: now };
    expect(followableFix(fix, now)).toBe(true);
    expect(
      followableFix({ ...fix, accuracy: FOLLOW_MAX_ACCURACY_M + 1 }, now),
    ).toBe(false);
    expect(followableFix({ ...fix, timestamp: now - 120_000 }, now)).toBe(
      false,
    );
    expect(followableFix({ ...fix, lat: Number.NaN }, now)).toBe(false);
  });

  it("smooths noisy fixes into a steady walk with speed and heading", () => {
    // Walking east at 1.4 m/s for two minutes, fixes every 2 s at ±8 m.
    const n = noise(7);
    const tracker = new WalkTracker();
    let last;
    let rawError = 0,
      smoothError = 0;
    for (let i = 0; i <= 60; i++) {
      const t = i * 2000;
      const truth = [1.4 * (t / 1000), 0];
      const fix: [number, number] = [truth[0] + 8 * n(), truth[1] + 8 * n()];
      last = tracker.update(fix, 8, t);
      if (i > 10) {
        rawError += Math.hypot(fix[0] - truth[0], fix[1] - truth[1]);
        smoothError += Math.hypot(
          last.position[0] - truth[0],
          last.position[1] - truth[1],
        );
      }
    }
    expect(smoothError).toBeLessThan(rawError * 0.75);
    expect(last!.speed).toBeGreaterThan(1.0);
    expect(last!.speed).toBeLessThan(1.8);
    // East is 90°.
    expect(Math.abs(last!.heading! - 90)).toBeLessThan(20);
  });

  it("shrugs off a single wild jump", () => {
    const tracker = new WalkTracker();
    for (let i = 0; i < 10; i++) tracker.update([0, 0], 10, i * 1000);
    const after = tracker.update([400, 0], 10, 10_000);
    expect(after.position[0]).toBeLessThan(60);
  });

  it("reports no heading while standing still", () => {
    const tracker = new WalkTracker();
    let e;
    for (let i = 0; i < 20; i++) e = tracker.update([5, 5], 20, i * 1000);
    expect(e!.heading).toBeNull();
  });

  it("knows when the walker has left the loaded area", () => {
    expect(outsideArea([100, -200], 2000)).toBe(0);
    expect(outsideArea([1300, 0], 2000)).toBe(300);
  });
});
