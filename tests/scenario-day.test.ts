import { describe, expect, it } from "vitest";
import type { Environment } from "../shared/types";
import { atLocalHour, scenarioAt, weatherAt } from "../src/lib/heat";

const tz = "America/Chicago";
// 3 PM CDT on a July afternoon, the hour a heat scenario describes.
const afternoon: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 38,
  humidity: 35,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const at = (env: Environment, hour: number) =>
  scenarioAt(env, atLocalHour(env.dateTime, tz, hour), tz);

describe("scenario weather through the day", () => {
  it("keeps the set hour exactly as set", () => {
    const same = at(afternoon, 15);
    expect(same.temperatureC).toBeCloseTo(38);
    expect(same.humidity).toBeCloseTo(35);
  });
  it("is coolest before dawn and warmest mid-afternoon", () => {
    const dawn = at(afternoon, 5);
    expect(afternoon.temperatureC - dawn.temperatureC).toBeCloseTo(9, 0);
    // Same moisture in cooler air: higher relative humidity.
    expect(dawn.humidity).toBeGreaterThan(afternoon.humidity + 15);
    expect(at(afternoon, 9).temperatureC).toBeLessThan(38);
    expect(at(afternoon, 21).temperatureC).toBeLessThan(38);
    expect(at(afternoon, 21).temperatureC).toBeGreaterThan(dawn.temperatureC);
  });
  it("comes back to the same weather when the clock returns", () => {
    const evening = at(afternoon, 21);
    const back = at(evening, 15);
    expect(back.temperatureC).toBeCloseTo(38, 5);
    expect(back.humidity).toBeCloseTo(35, 5);
  });
  it("leaves live forecasts alone", () => {
    const live = { ...afternoon, weatherMode: "forecast" as const };
    expect(at(live, 5).temperatureC).toBe(38);
  });
  it("lets hourly views follow the day when given the time zone", () => {
    const dawn = weatherAt(
      afternoon,
      atLocalHour(afternoon.dateTime, tz, 5),
      null,
      tz,
    );
    expect(dawn.temperatureC).toBeLessThan(31);
    // Without a time zone (old callers) nothing changes.
    expect(
      weatherAt(afternoon, atLocalHour(afternoon.dateTime, tz, 5)).temperatureC,
    ).toBe(38);
  });
});
