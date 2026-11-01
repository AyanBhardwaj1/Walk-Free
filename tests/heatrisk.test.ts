import { describe, expect, it } from "vitest";
import {
  heatRiskUrl,
  parseHeatRisk,
  HEAT_RISK_LEVELS,
  outlookAdvice,
  outlookContext,
} from "../shared/outlook";

/** Shape of the NWS HeatRisk identify answer (Phoenix, probe run 41187242484), values changed. */
const item = (day: number, valid: number) => ({
  attributes: {
    name: `HeatRisk_${day}_Mercator`,
    category: 1,
    idp_validtime: valid,
  },
});
const PHOENIX = {
  objectId: 0,
  name: "Pixel",
  value: "2",
  properties: { Values: ["3", "2", "4", "1", "0", "1", "2"] },
  catalogItems: {
    features: [
      item(4, 1793707200000),
      item(1, 1793448000000),
      item(7, 1793966400000),
      item(6, 1793880000000),
      item(3, 1793620800000),
      item(5, 1793793600000),
      item(2, 1793534400000),
    ],
  },
};

describe("NWS HeatRisk", () => {
  it("asks the HeatRisk image service about a coarse point", () => {
    const url = new URL(heatRiskUrl(33.42551, -111.9401));
    expect(url.hostname).toBe("mapservices.weather.noaa.gov");
    expect(url.pathname).toMatch(/NWS_HeatRisk\/ImageServer\/identify$/);
    expect(JSON.parse(url.searchParams.get("geometry")!)).toEqual({
      x: -111.94,
      y: 33.43,
      spatialReference: { wkid: 4326 },
    });
    expect(url.searchParams.get("returnGeometry")).toBe("false");
  });

  it("puts each day's value with its own forecast day", () => {
    const risk = parseHeatRisk(PHOENIX)!;
    // Values follow the catalog order, which isn't sorted by day.
    expect(risk.days.map((d) => d.level)).toEqual([2, 2, 0, 3, 1, 1, 4]);
    expect(risk.days[0]).toEqual({
      day: 1,
      date: new Date(1793448000000).toISOString(),
      level: 2,
      label: "Moderate",
    });
    expect(risk.today).toBe(2);
    expect(risk.peak).toEqual(risk.days[6]);
  });

  it("names the five levels as the NWS does", () => {
    expect(HEAT_RISK_LEVELS.map((l) => l.label)).toEqual([
      "Little to none",
      "Minor",
      "Moderate",
      "Major",
      "Extreme",
    ]);
  });

  it("falls back to today's value when the days can't be matched", () => {
    const risk = parseHeatRisk({
      value: "3",
      properties: {},
      catalogItems: {},
    })!;
    expect(risk.days).toEqual([]);
    expect(risk.today).toBe(3);
  });

  it("returns null outside coverage or for nonsense", () => {
    expect(parseHeatRisk({ value: "NoData" })).toBeNull();
    expect(parseHeatRisk({ value: "9" })).toBeNull();
    expect(parseHeatRisk(null)).toBeNull();
    expect(parseHeatRisk({ error: { code: 400 } })).toBeNull();
  });

  it("warns about Major or Extreme HeatRisk today", () => {
    const risk = parseHeatRisk({ ...PHOENIX, value: "3" })!;
    expect(outlookAdvice({ air: null, alerts: [], heatRisk: risk })).toMatch(
      /HeatRisk is Major today/,
    );
    const mild = parseHeatRisk({ ...PHOENIX, value: "1" })!;
    expect(outlookAdvice({ air: null, alerts: [], heatRisk: mild })).toBeNull();
  });

  it("tells the assistant today's level and the week's peak", () => {
    const risk = parseHeatRisk(PHOENIX)!;
    expect(
      outlookContext(
        { air: null, alerts: [], heatRisk: risk },
        "America/Phoenix",
      ).heatRisk,
    ).toBe("Today 2 (Moderate); peak 4 (Extreme) on Fri, Nov 6");
  });
});
