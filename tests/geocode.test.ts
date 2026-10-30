import { afterEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();
vi.mock("../server/network.js", async (original) => ({
  ...(await original<typeof import("../server/network")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));
const { findCities } = await import("../server/geocode");

afterEach(() => requestJson.mockReset());

describe("city search fallback", () => {
  it("answers from the bundled index without a network call", async () => {
    const found = await findCities("san");
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found[0].name).toMatch(/^San/);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("asks the geocoder for places the index lacks, with their time zone", async () => {
    requestJson.mockResolvedValueOnce({
      results: [
        {
          id: 2643743,
          name: "London",
          latitude: 51.50853,
          longitude: -0.12574,
          timezone: "Europe/London",
          admin1: "England",
          country: "United Kingdom",
          country_code: "GB",
        },
        { id: 1, name: "Nowhere", latitude: 1, longitude: 1, timezone: "Mars/Base" },
      ],
    });
    const found = await findCities("london uk");
    expect(found).toEqual([
      {
        id: "geo-2643743",
        name: "London",
        state: "England, United Kingdom",
        lat: 51.50853,
        lon: -0.12574,
        timezone: "Europe/London",
      },
    ]);
    expect(String(requestJson.mock.calls[0][0])).toMatch(
      /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?name=london\+uk/,
    );
  });

  it("still answers from the index when the geocoder is down", async () => {
    requestJson.mockRejectedValueOnce(new Error("offline"));
    await expect(findCities("zzqx town")).resolves.toEqual([]);
  });
});
