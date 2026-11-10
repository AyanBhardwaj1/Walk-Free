import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { worldSchema } from "../shared/schema.js";
import type { World } from "../shared/types.js";
import { toLatLon } from "../src/lib/geo.js";
import { tripAdvice, tripHeat } from "../src/lib/ml/trip-heat.js";

const ut = worldSchema.parse(
  JSON.parse(readFileSync("public/areas/ut-austin.json", "utf8")),
) as World;
const at = (name: string) => {
  const o = ut.objects.find((x) => x.name === name);
  if (!o) throw Error(`no ${name}`);
  return toLatLon(o.position, ut.origin);
};
const summer = {
  dateTime: "2026-07-15T21:00:00Z", // 4 PM in Austin
  temperatureC: 37,
  humidity: 35,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario" as const,
};
const f = (c: number) => `${Math.round((c * 9) / 5 + 32)}°F`;

describe("the heat of a routine walk", () => {
  it("compares sun on the quickest and the More shade route", () => {
    const h = tripHeat(
      ut,
      at("Perry-Castañeda Library"),
      at("Gregory Gymnasium"),
      summer,
    );
    expect(h).not.toBeNull();
    expect(h!.quickest.minutes).toBeGreaterThan(2);
    expect(h!.quickest.sunMinutes).toBeLessThanOrEqual(h!.quickest.minutes);
    expect(h!.sunFeelsC).toBeGreaterThan(h!.shadeFeelsC);
    if (h!.shade)
      expect(h!.shade.sunMinutes).toBeLessThanOrEqual(
        h!.quickest.sunMinutes + 0.01,
      );
    expect(tripAdvice(h!, f)).toMatch(/feel like \d+°F/);
  });

  it("says nothing on a mild day with little to gain", () => {
    const mild = {
      ...summer,
      temperatureC: 18,
      dateTime: "2026-01-15T15:00:00Z",
    };
    const h = tripHeat(
      ut,
      at("Perry-Castañeda Library"),
      at("Gregory Gymnasium"),
      mild,
    )!;
    const advice = tripAdvice({ ...h, shade: null }, f);
    expect(advice).toBeNull();
  });

  it("gives up off the map", () => {
    expect(
      tripHeat(ut, { lat: 0, lon: 0 }, at("Gregory Gymnasium"), summer),
    ).toBeNull();
  });
});
