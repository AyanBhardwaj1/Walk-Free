import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { worldSchema } from "../shared/schema.js";
import type { Environment } from "../shared/types.js";
import { pickStops, planDay } from "../src/lib/day-plan.js";
import { createFictionCity } from "../src/lib/fiction-cities.js";

const env: Environment = {
  dateTime: "2026-07-15T18:00:00Z",
  temperatureC: 35,
  humidity: 40,
  windMps: 2,
  cloudCover: 5,
  weatherMode: "scenario",
};

describe("a day in the life", () => {
  it("plans a full day on UT Austin's real campus", () => {
    const ut = worldSchema.parse(
      JSON.parse(readFileSync("public/areas/ut-austin.json", "utf8")),
    );
    const plan = planDay(ut, env)!;
    expect(plan).not.toBeNull();
    expect(plan.legs.length).toBeGreaterThanOrEqual(5);
    // Each walk is planned at its own hour of the day.
    expect(new Set(plan.legs.map((l) => l.dateTime)).size).toBe(
      plan.legs.length,
    );
    // Shade routing never puts you in more sun than the quickest route.
    expect(plan.sunMinutes).toBeLessThanOrEqual(plan.quickSunMinutes + 0.01);
    expect(plan.hottest?.hour).toBeGreaterThanOrEqual(12);
  }, 60_000);

  it("is deterministic and uses distinct stops", () => {
    const w = createFictionCity("skyline-prime")!;
    const a = pickStops(w)!,
      b = pickStops(w)!;
    expect(a).toEqual(b);
    expect(new Set(Object.values(a).map((s) => s.id)).size).toBe(5);
  });
});
