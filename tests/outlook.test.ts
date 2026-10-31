import { describe, expect, it, vi } from "vitest";
import {
  airQualityUrl,
  aqiCategory,
  nwsAlertsUrl,
  outlookAdvice,
  parseAirQuality,
  parseWalkAlerts,
  coarse,
} from "../shared/outlook";
import { loadOutlook } from "../src/lib/outlook-source";

/** Open-Meteo's answer for Austin on 2026-10-31 (probe run 41187242484). */
const AUSTIN_AIR = {
  latitude: 30.300003,
  longitude: -97.7,
  timezone: "GMT",
  current_units: { us_aqi: "USAQI", pm2_5: "μg/m³", ozone: "μg/m³" },
  current: {
    time: "2026-10-31T09:00",
    interval: 3600,
    us_aqi: 41,
    pm2_5: 4.7,
    ozone: 70.0,
  },
  hourly: {
    time: [
      "2026-10-31T09:00",
      "2026-10-31T10:00",
      "2026-10-31T11:00",
      "2026-10-31T12:00",
      "2026-10-31T13:00",
      "2026-10-31T14:00",
    ],
    us_aqi: [41, 40, 39, 39, 39, 38],
    pm2_5: [4.7, 4.8, 4.9, 5.1, 5.5, 6.0],
  },
};

/**
 * Hand-built alert features in the NWS GeoJSON shape (the probe saw one live
 * Phoenix alert but its body wasn't saved), trimmed to the fields read here.
 */
const feature = (props: Record<string, unknown>) => ({
  type: "Feature",
  geometry: null,
  properties: {
    "@id": "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.abc",
    status: "Actual",
    messageType: "Alert",
    senderName: "NWS Phoenix AZ",
    severity: "Severe",
    ...props,
  },
});
const PHOENIX_ALERTS = {
  type: "FeatureCollection",
  features: [
    feature({
      event: "Extreme Heat Warning",
      headline: "Extreme Heat Warning issued July 14 by NWS Phoenix AZ",
      ends: "2026-07-15T03:00:00-07:00",
      expires: "2026-07-14T20:00:00-07:00",
      instruction: "Drink plenty of fluids, stay in an air-conditioned room.",
    }),
    feature({
      event: "Wind Advisory",
      headline: "Wind Advisory issued July 14",
      ends: "2026-07-15T03:00:00-07:00",
    }),
    feature({
      event: "Air Quality Alert",
      headline: "Air Quality Alert for ozone",
      severity: "Unknown",
      ends: null,
      expires: "2026-07-15T00:00:00-07:00",
    }),
    feature({
      event: "Excessive Heat Watch",
      headline: "Old-style name, already over",
      ends: "2026-07-13T20:00:00-07:00",
    }),
  ],
};
const AUSTIN_NO_ALERTS = {
  "@context": { "@version": "1.1" },
  type: "FeatureCollection",
  features: [],
  title: "Current watches, warnings, and advisories for 30.285 N, 97.734 W",
  updated: "2026-10-31T09:05:05+00:00",
};

describe("air quality", () => {
  it("asks Open-Meteo for US AQI, PM2.5 and ozone at a coarse location", () => {
    const url = new URL(airQualityUrl(30.28512, -97.73391));
    expect(url.origin).toBe("https://air-quality-api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("30.29");
    expect(url.searchParams.get("longitude")).toBe("-97.73");
    expect(url.searchParams.get("current")).toBe("us_aqi,pm2_5,ozone");
  });

  it("reads the recorded Austin response", () => {
    const air = parseAirQuality(AUSTIN_AIR)!;
    expect(air).toMatchObject({
      usAqi: 41,
      pm25: 4.7,
      ozone: 70,
      category: "Good",
      level: 0,
      time: "2026-10-31T09:00:00.000Z",
    });
    expect(air.hours).toHaveLength(6);
    expect(air.hours[5]).toEqual({
      time: "2026-10-31T14:00:00.000Z",
      usAqi: 38,
    });
    expect(air.attribution).toMatch(/Open-Meteo/);
  });

  it("uses EPA breakpoints for the category", () => {
    expect(aqiCategory(50)).toEqual({ level: 0, label: "Good" });
    expect(aqiCategory(51)).toEqual({ level: 1, label: "Moderate" });
    expect(aqiCategory(101).label).toBe("Unhealthy for sensitive groups");
    expect(aqiCategory(151).label).toBe("Unhealthy");
    expect(aqiCategory(201).label).toBe("Very unhealthy");
    expect(aqiCategory(301)).toEqual({ level: 5, label: "Hazardous" });
  });

  it("drops impossible or missing values instead of showing them", () => {
    expect(parseAirQuality({})).toBeNull();
    expect(
      parseAirQuality({ current: { time: "2026-10-31T09:00", us_aqi: -3 } }),
    ).toBeNull();
    const partial = parseAirQuality({
      current: {
        time: "2026-10-31T09:00",
        us_aqi: 120,
        pm2_5: null,
        ozone: 9e9,
      },
      hourly: { time: ["2026-10-31T10:00", "bad"], us_aqi: [130, 5] },
    })!;
    expect(partial).toMatchObject({ usAqi: 120, pm25: null, ozone: null });
    expect(partial.hours).toEqual([
      { time: "2026-10-31T10:00:00.000Z", usAqi: 130 },
    ]);
  });
});

describe("NWS alerts that change a walk", () => {
  const now = new Date("2026-07-14T12:00:00-07:00");

  it("asks the NWS for active alerts at a coarse point", () => {
    expect(nwsAlertsUrl(33.42551, -111.94)).toBe(
      "https://api.weather.gov/alerts/active?point=33.43,-111.94&status=actual",
    );
  });

  it("keeps heat and air-quality alerts, drops others and ones already over", () => {
    const alerts = parseWalkAlerts(PHOENIX_ALERTS, now)!;
    expect(alerts.map((a) => a.event)).toEqual([
      "Extreme Heat Warning",
      "Air Quality Alert",
    ]);
    expect(alerts[0]).toMatchObject({
      kind: "heat",
      sender: "NWS Phoenix AZ",
      ends: "2026-07-15T10:00:00.000Z",
      url: "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.abc",
    });
    expect(alerts[0].instruction).toMatch(/fluids/);
    // Without an end time, the expiry is used.
    expect(alerts[1]).toMatchObject({
      kind: "air",
      ends: "2026-07-15T07:00:00.000Z",
    });
  });

  it("orders warnings before watches and advisories", () => {
    const alerts = parseWalkAlerts(
      {
        features: [
          feature({ event: "Heat Advisory", ends: "2026-07-15T03:00:00Z" }),
          feature({
            event: "Extreme Heat Watch",
            ends: "2026-07-16T03:00:00Z",
          }),
          feature({
            event: "Extreme Heat Warning",
            ends: "2026-07-15T03:00:00Z",
          }),
        ],
      },
      now,
    )!;
    expect(alerts.map((a) => a.event)).toEqual([
      "Extreme Heat Warning",
      "Heat Advisory",
      "Extreme Heat Watch",
    ]);
  });

  it("keeps an alert with no end or expiry time", () => {
    const [alert] = parseWalkAlerts(
      {
        features: [
          feature({ event: "Heat Advisory", ends: null, expires: null }),
        ],
      },
      now,
    )!;
    expect(alert.ends).toBeNull();
  });

  it("reads the recorded empty Austin answer as no alerts", () => {
    expect(parseWalkAlerts(AUSTIN_NO_ALERTS, now)).toEqual([]);
  });

  it("returns null for an answer that isn't an alert list", () => {
    expect(parseWalkAlerts({ title: "error" }, now)).toBeNull();
    expect(parseWalkAlerts(null, now)).toBeNull();
  });

  it("ignores links that don't point at the NWS", () => {
    const [alert] = parseWalkAlerts(
      {
        features: [
          feature({
            "@id": "javascript:alert(1)",
            event: "Heat Advisory",
            ends: "2026-07-15T03:00:00Z",
          }),
        ],
      },
      now,
    )!;
    expect(alert.url).toBeUndefined();
  });
});

describe("advice", () => {
  it("says nothing when the air is fine and there are no alerts", () => {
    expect(
      outlookAdvice({ air: parseAirQuality(AUSTIN_AIR), alerts: [] }),
    ).toBeNull();
  });
  it("puts an official heat warning first", () => {
    const alerts = parseWalkAlerts(
      PHOENIX_ALERTS,
      new Date("2026-07-14T12:00:00-07:00"),
    );
    expect(outlookAdvice({ air: null, alerts })).toMatch(
      /Extreme Heat Warning/,
    );
  });
  it("suggests the indoor route when the air is unhealthy", () => {
    const air = parseAirQuality({
      current: { time: "2026-10-31T09:00", us_aqi: 160 },
    });
    expect(outlookAdvice({ air, alerts: null })).toMatch(/indoor/i);
  });
});

describe("coarse locations", () => {
  it("rounds to about a kilometre", () => {
    expect(coarse(30.28512)).toBe("30.29");
    expect(coarse(-0.004)).toBe("0.00");
  });
});

describe("loading the outlook", () => {
  const ok = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  it("uses the API when it answers", async () => {
    const fetch = vi.fn((_url: string) =>
      ok({ air: parseAirQuality(AUSTIN_AIR), alerts: [], fetchedAt: "x" }),
    );
    const outlook = await loadOutlook(
      { lat: 30.285, lon: -97.734 },
      { fetch: fetch as unknown as typeof globalThis.fetch, apiBase: "" },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe(
      "/api/outlook?lat=30.29&lon=-97.73",
    );
    expect(outlook.air?.usAqi).toBe(41);
  });

  it("falls back to the providers directly, each on its own", async () => {
    const fetch = vi.fn((url: string) => {
      if (url.startsWith("/api/"))
        return Promise.resolve(new Response("", { status: 401 }));
      if (url.includes("air-quality")) return ok(AUSTIN_AIR);
      return Promise.reject(new Error("offline"));
    });
    const outlook = await loadOutlook(
      { lat: 30.285, lon: -97.734 },
      { fetch: fetch as unknown as typeof globalThis.fetch, apiBase: "" },
    );
    expect(outlook.air?.usAqi).toBe(41);
    // Unknown, not "no alerts", when the NWS couldn't be reached.
    expect(outlook.alerts).toBeNull();
  });
});

describe("assistant context", () => {
  it("summarises the outlook in a few bounded words", async () => {
    const { outlookContext } = await import("../shared/outlook");
    expect(outlookContext(null)).toEqual({});
    expect(
      outlookContext({ air: parseAirQuality(AUSTIN_AIR), alerts: [] }),
    ).toEqual({ airQuality: "US AQI 41 (Good)" });
    const alerts = parseWalkAlerts(
      PHOENIX_ALERTS,
      new Date("2026-07-14T12:00:00-07:00"),
    );
    expect(outlookContext({ air: null, alerts }).alerts).toBe(
      "Extreme Heat Warning until 2026-07-15T10:00:00.000Z; Air Quality Alert until 2026-07-15T07:00:00.000Z",
    );
  });
});
