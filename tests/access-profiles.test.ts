import { describe, expect, it } from "vitest";
import { ACCESS_PROFILES, applyAccessNeed } from "../src/lib/access-profiles";

describe("accessibility profiles", () => {
  it("sets the app up for each need", () => {
    expect(applyAccessNeed("blind", true)).toEqual({ voice: true, buzz: true });
    // No buzz where the phone can't vibrate.
    expect(applyAccessNeed("blind", false)).toEqual({ voice: true });
    expect(applyAccessNeed("deaf", true)).toEqual({ voice: false, buzz: true });
    expect(applyAccessNeed("mobility", true)).toEqual({
      avoidStairs: true,
      preference: "stepfree",
    });
    expect(applyAccessNeed("low-vision", true)).toEqual({ theme: "sunlight" });
    expect(applyAccessNeed("heat-sensitive", true)).toEqual({
      heatSensitive: true,
    });
  });

  it("explains every profile in plain words", () => {
    expect(new Set(ACCESS_PROFILES.map((p) => p.id)).size).toBe(5);
    for (const p of ACCESS_PROFILES) expect(p.does.length).toBeGreaterThan(20);
  });
});
