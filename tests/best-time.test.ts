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

// "Now" for these tests: 9 AM in Austin that day.
const nine = "2026-07-15T14:00:00Z";

describe("best time to leave", () => {
  it("shows the whole walking day and picks the coolest hour still ahead", () => {
    const plan = bestTimeToLeave(world, env, route, null, nine)!;
    expect(plan.hours[0].hour).toBe(6);
    expect(plan.hours.at(-1)!.hour).toBe(20);
    const ahead = plan.hours.filter((h) => h.hour >= 9);
    expect(plan.best.feelsLikeC).toBe(
      Math.min(...ahead.map((h) => h.feelsLikeC)),
    );
    expect(plan.best.hour).toBeGreaterThanOrEqual(9);
    expect(plan.now.hour).toBe(9);
    expect(plan.dayOffset).toBe(0);
    expect(plan.savingF).toBeGreaterThanOrEqual(0);
  });

  it("keeps the whole day when an hour is picked, comparing with that hour", () => {
    const three = { ...env, dateTime: "2026-07-15T20:00:00Z" };
    const plan = bestTimeToLeave(world, three, route, null, nine)!;
    expect(plan.hours).toHaveLength(15);
    expect(plan.now.hour).toBe(15);
  });

  it("lets any hour count on another day", () => {
    const tomorrow = { ...env, dateTime: "2026-07-16T14:00:00Z" };
    const plan = bestTimeToLeave(world, tomorrow, route, null, nine)!;
    expect(plan.best.feelsLikeC).toBe(
      Math.min(...plan.hours.map((h) => h.feelsLikeC)),
    );
  });

  it("feels hotter in the afternoon sun than early evening", () => {
    const plan = bestTimeToLeave(world, env, route, null, nine)!;
    const at = (h: number) => plan.hours.find((x) => x.hour === h)!;
    expect(at(14).feelsLikeC).toBeGreaterThan(at(20).feelsLikeC);
  });

  it("plans tomorrow once today's walking day is over", () => {
    const late = "2026-07-16T04:30:00Z"; // 11:30 PM
    const plan = bestTimeToLeave(
      world,
      { ...env, dateTime: late },
      route,
      null,
      late,
    )!;
    expect(plan.dayOffset).toBe(1);
    expect(plan.hours).toHaveLength(15);
    expect(plan.best.feelsLikeC).toBe(
      Math.min(...plan.hours.map((h) => h.feelsLikeC)),
    );
  });
});
