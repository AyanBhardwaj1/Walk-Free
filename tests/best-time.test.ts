import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bestTimeToLeave } from "../src/lib/best-time";
import { compareRoutes } from "../src/lib/routing";
import { destinationCatalog } from "../src/lib/destinations";
import { matchDestinations } from "../src/lib/assistant-tools";
import type { Environment, World } from "../shared/types";

const world = JSON.parse(
  readFileSync("public/areas/ut-austin.json", "utf8"),
) as World;
const env: Environment = {
  // 9 AM in Austin (CDT) on a July day.
  dateTime: "2026-07-15T14:00:00Z",
  temperatureC: 33,
  humidity: 45,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const catalog = destinationCatalog(world);
const from = matchDestinations(catalog, "Andrews Hall")[0].id;
const to = matchDestinations(catalog, "GDC")[0].id;
const route = compareRoutes(world, from, to, {
  avoidStairs: false,
  allowHypothetical: false,
  maxDetour: 1.8,
  environment: env,
}).quickest!;

describe("best time to leave", () => {
  it("rates the rest of today's daytime hours and picks the coolest", () => {
    const plan = bestTimeToLeave(world, env, route, null)!;
    expect(plan.hours[0].hour).toBe(9);
    expect(plan.hours.at(-1)!.hour).toBe(20);
    const coolest = Math.min(...plan.hours.map((h) => h.feelsLikeC));
    expect(plan.best.feelsLikeC).toBe(coolest);
    expect(plan.now.hour).toBe(9);
    expect(plan.savingF).toBeGreaterThanOrEqual(0);
  });

  it("feels hotter in the afternoon sun than early evening", () => {
    const plan = bestTimeToLeave(world, env, route, null)!;
    const at = (h: number) => plan.hours.find((x) => x.hour === h)!;
    expect(at(14).feelsLikeC).toBeGreaterThan(at(20).feelsLikeC);
  });

  it("has nothing to suggest late at night", () => {
    const late = { ...env, dateTime: "2026-07-16T04:30:00Z" }; // 11:30 PM
    expect(bestTimeToLeave(world, late, route, null)).toBeNull();
  });
});
