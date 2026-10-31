import { afterEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();
vi.mock("../server/network.js", async (original) => ({
  ...(await original<typeof import("../server/network")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));
const { getOutlook } = await import("../server/data");

afterEach(() => requestJson.mockReset());

// A fresh spot per run, so the file cache from earlier runs never answers.
const spot = () => ({
  lat: 10 + Math.random() * 40,
  lon: -120 + Math.random() * 40,
});
const air = { current: { time: "2026-07-14T19:00", us_aqi: 72 } };
const alerts = (ends: string) => ({
  features: [
    {
      properties: {
        event: "Heat Advisory",
        headline: "Heat Advisory",
        ends,
        senderName: "NWS",
      },
    },
  ],
});

describe("outlook endpoint data", () => {
  it("keeps air quality when the alert service fails, and says alerts are unknown", async () => {
    const { lat, lon } = spot();
    requestJson.mockImplementation((url: string) =>
      url.includes("air-quality")
        ? Promise.resolve(air)
        : Promise.reject(new Error("HTTP 500")),
    );
    const outlook = await getOutlook(
      lat,
      lon,
      new Date("2026-07-14T20:00:00Z"),
    );
    expect(outlook.air?.usAqi).toBe(72);
    expect(outlook.alerts).toBeNull();
  });

  it("does not cache a failure", async () => {
    const { lat, lon } = spot();
    const now = new Date("2026-07-14T20:00:00Z");
    requestJson.mockRejectedValue(new Error("offline"));
    expect((await getOutlook(lat, lon, now)).air).toBeNull();
    requestJson.mockReset();
    requestJson.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("air-quality") ? air : alerts("2026-07-15T03:00:00Z"),
      ),
    );
    const second = await getOutlook(lat, lon, now);
    expect(second.air?.usAqi).toBe(72);
    expect(second.alerts).toHaveLength(1);
  });

  it("caches answers and drops alerts that ran out while cached", async () => {
    const { lat, lon } = spot();
    requestJson.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("air-quality") ? air : alerts("2026-07-14T21:00:00Z"),
      ),
    );
    const first = await getOutlook(lat, lon, new Date("2026-07-14T20:00:00Z"));
    expect(first.alerts).toHaveLength(1);
    const calls = requestJson.mock.calls.length;
    const later = await getOutlook(lat, lon, new Date("2026-07-14T21:30:00Z"));
    expect(requestJson.mock.calls.length).toBe(calls);
    expect(later.alerts).toEqual([]);
  });

  it("sends only a coarse location to both services", async () => {
    requestJson.mockResolvedValue({ features: [] });
    const lat = 20 + Math.floor(Math.random() * 20) + 0.285123;
    // Random whole degrees too, so a cached answer from a recent run can't hit.
    const lon = -(60 + Math.floor(Math.random() * 60)) - 0.734567;
    await getOutlook(lat, lon);
    expect(requestJson).toHaveBeenCalledTimes(2);
    for (const [url] of requestJson.mock.calls) {
      expect(url).toContain(`${Math.floor(lat)}.29`);
      expect(url).not.toMatch(/\.285|\.7345/);
    }
  });
});
