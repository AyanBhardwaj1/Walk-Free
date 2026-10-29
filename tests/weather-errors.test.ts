import { describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";
import type { AddressInfo } from "node:net";
import { parseOpenMeteo, openMeteoUrl } from "../shared/weather";
import { ServiceError } from "../shared/errors";
import { loadWeather } from "../src/lib/weather-source";
import { liveConditions, describeConditions } from "../src/lib/live-weather";
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

  it("does not bypass a login error and explains a total outage", async () => {
    const denied = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Please log in to continue." }), {
          status: 401,
        }),
    );
    await expect(
      loadWeather({ lat: 1, lon: 1 }, { fetch: denied, apiBase: "" }),
    ).rejects.toThrow("Please log in to continue.");
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
