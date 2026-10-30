import { describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";
import type { AddressInfo } from "node:net";
import { parseOpenMeteo, openMeteoUrl } from "../shared/weather";
import { ServiceError } from "../shared/errors";
import { loadWeather } from "../src/lib/weather-source";
import {
  liveConditions,
  describeConditions,
  uvLabel,
} from "../src/lib/live-weather";
import { heatConditions } from "../src/lib/heat";
import { friendlyError } from "../src/lib/errors";
import { locationError } from "../src/lib/navigation";
import type { Environment } from "../shared/types";

const t0 = Date.parse("2026-10-29T20:00:00Z") / 1000;
const sample = {
  current: {
    time: t0 + 600,
    temperature_2m: 31.5,
    relative_humidity_2m: 40,
    cloud_cover: 10,
    wind_speed_10m: 3.2,
    weather_code: 1,
  },
  hourly: {
    time: [t0 - 3600, t0, t0 + 3600],
    temperature_2m: [30, 31, null],
    relative_humidity_2m: [45, 42, 40],
    cloud_cover: [20, 10, 5],
    wind_speed_10m: [2, 3, 4],
    weather_code: [2, 0, 95],
  },
};
const env: Environment = {
  dateTime: "2026-10-29T20:05:00Z",
  temperatureC: 20,
  humidity: 50,
  windMps: 1,
  cloudCover: 50,
  weatherMode: "scenario",
};

describe("live weather", () => {
  it("parses Open-Meteo hourly and current conditions, skipping gaps", () => {
    const f = parseOpenMeteo(sample);
    expect(f.hours.map((h) => h.time)).toEqual([
      "2026-10-29T19:00:00.000Z",
      "2026-10-29T20:00:00.000Z",
    ]);
    expect(f.hours[1]).toMatchObject({
      temperatureC: 31,
      cloudCover: 10,
      description: "Clear sky",
    });
    expect(f.current?.temperatureC).toBe(31.5);
    expect(f.attribution).toMatch(/Open-Meteo/);
    expect(() => parseOpenMeteo({ hourly: { time: [] } })).toThrow(
      ServiceError,
    );
  });

  it("asks Open-Meteo for metric wind and UTC unix times", () => {
    const url = new URL(openMeteoUrl(30.285, -97.7341));
    expect(url.hostname).toBe("api.open-meteo.com");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
  });

  it("uses current conditions for now and forecast hours for other times", () => {
    const f = parseOpenMeteo(sample);
    expect(liveConditions(env, f, "2026-10-29T20:05:00Z")).toMatchObject({
      temperatureC: 31.5,
      weatherMode: "forecast",
    });
    expect(liveConditions(env, f, "2026-10-29T19:00:00Z").temperatureC).toBe(
      30,
    );
    expect(
      describeConditions({ ...env, dateTime: "2026-10-29T19:10:00Z" }, f),
    ).toBe("Partly cloudy");
  });

  it("reads measured sunlight and UV, and the heat model uses them", () => {
    const f = parseOpenMeteo({
      current: { ...sample.current, shortwave_radiation: 820, uv_index: 8.4 },
      hourly: {
        ...sample.hourly,
        shortwave_radiation_instant: [600, 9999, 0],
        uv_index: [6, 7, 0],
      },
    });
    expect(f.current).toMatchObject({ solarWm2: 820, uvIndex: 8.4 });
    // Impossible readings are dropped rather than trusted.
    expect(f.hours[1].solarWm2).toBeNull();
    const live = liveConditions(env, f, "2026-10-29T20:05:00Z");
    expect(live).toMatchObject({ solarWm2: 820, uvIndex: 8.4 });
    expect(uvLabel(live.uvIndex)).toEqual({
      text: "UV 8 · Very high",
      high: true,
    });
    const url = new URL(openMeteoUrl(30.285, -97.7341));
    expect(url.searchParams.get("hourly")).toContain(
      "shortwave_radiation_instant",
    );
    expect(url.searchParams.get("current")).toContain("uv_index");
  });

  it("scales the sun's heat by measured sunlight in live weather only", () => {
    const origin = { lat: 30.285, lon: -97.7341 };
    // Early afternoon in Austin: the sun is high.
    const base: Environment = {
      ...env,
      dateTime: "2026-07-15T19:00:00Z",
      cloudCover: 0,
      weatherMode: "forecast",
    };
    const bright = heatConditions({ ...base, solarWm2: 950 }, origin);
    const hazy = heatConditions({ ...base, solarWm2: 300 }, origin);
    expect(hazy.sunBoostC).toBeLessThan(bright.sunBoostC * 0.4);
    // A scenario ignores readings and uses its own cloud cover.
    const scenario = heatConditions(
      { ...base, solarWm2: 300, weatherMode: "scenario" },
      origin,
    );
    expect(scenario.sunBoostC).toBeCloseTo(
      heatConditions({ ...base, weatherMode: "scenario" }, origin).sunBoostC,
    );
  });

  it("falls back to Open-Meteo in the browser when the API fails", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith("/api/")
        ? new Response("A server error has occurred", { status: 500 })
        : new Response(JSON.stringify(sample)),
    );
    const f = await loadWeather(
      { lat: 30.285, lon: -97.7341 },
      { fetch, apiBase: "" },
    );
    expect(f.source).toMatch(/Open-Meteo/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back for guests without a session and explains a total outage", async () => {
    const guest = vi.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith("/api/")
        ? new Response(
            JSON.stringify({ error: "Please log in to continue." }),
            {
              status: 401,
            },
          )
        : new Response(JSON.stringify(sample)),
    );
    const f = await loadWeather(
      { lat: 1, lon: 1 },
      { fetch: guest, apiBase: "" },
    );
    expect(f.source).toMatch(/Open-Meteo/);
    const down = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(
      loadWeather({ lat: 1, lon: 1 }, { fetch: down, apiBase: "" }),
    ).rejects.toThrow(/Live weather is unavailable/);
  });
});

describe("friendly errors", () => {
  it("keeps sentences written for people", () => {
    expect(friendlyError(new ServiceError("X", "Two areas are loading."))).toBe(
      "Two areas are loading.",
    );
    expect(friendlyError(new Error("Please log in to continue."))).toBe(
      "Please log in to continue.",
    );
  });

  it("hides parser, validation, network and code-like messages", () => {
    let zod: unknown;
    try {
      z.object({ a: z.string() }).parse({});
    } catch (e) {
      zod = e;
    }
    expect(zod).toBeInstanceOf(ZodError);
    expect(friendlyError(zod)).toMatch(/didn't look right/);
    expect(
      friendlyError(
        new SyntaxError(
          `Unexpected token 'A', "A server e"... is not valid JSON`,
        ),
      ),
    ).toMatch(/unexpected response/);
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/offline/);
    expect(friendlyError(new Error("ECONNRESET at foo (bar.js:1)"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(friendlyError(new Error('{"error":"x"}'), "Fallback.")).toBe(
      "Fallback.",
    );
  });

  it("explains location errors by code", () => {
    expect(locationError(1)).toMatch(/permission/);
    expect(locationError(3)).toMatch(/took too long/);
  });
});

describe("API error responses", () => {
  it("never sends validation dumps or internal messages to the browser", async () => {
    vi.stubEnv("VERCEL", "1");
    const { app } = await import("../server/index");
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;
      const bad = await fetch(`${base}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: "{not json",
      });
      const body = await bad.json();
      expect(bad.status).toBe(400);
      expect(body.error).not.toMatch(/Unexpected|JSON|token/);
    } finally {
      server.close();
      vi.unstubAllEnvs();
    }
  });
});
