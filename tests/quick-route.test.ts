import { describe, expect, it } from "vitest";
import {
  DETOUR_FACTOR,
  findPlace,
  googleWalkingLink,
  haversine,
  quickRoute,
} from "../src/lib/quick-route.js";

const A = { lat: 40.758, lon: -73.9855 };
const B = { lat: 40.7516, lon: -73.9755 };

/** A fetch that answers by URL prefix, and fails everything else. */
function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error("offline");
    const body = routes[key];
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

describe("quick routes", () => {
  it("uses OSRM's foot route when it answers", async () => {
    const r = await quickRoute(
      A,
      B,
      fakeFetch({
        "https://routing.openstreetmap.de": {
          routes: [
            {
              distance: 1240,
              geometry: {
                coordinates: [
                  [A.lon, A.lat],
                  [B.lon, B.lat],
                ],
              },
              legs: [
                {
                  steps: [
                    { name: "West 42nd Street", maneuver: { type: "depart" } },
                    {
                      name: "Park Avenue",
                      maneuver: { type: "turn", modifier: "right" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
    expect(r.source).toBe("OSRM");
    expect(r.estimate).toBe(false);
    expect(Math.round(r.minutes)).toBe(16);
    expect(r.steps).toEqual([
      "Head out on West 42nd Street",
      "Turn right on Park Avenue",
    ]);
  });

  it("falls back to Valhalla, then to a labelled estimate", async () => {
    const valhalla = await quickRoute(
      A,
      B,
      fakeFetch({
        "https://valhalla1.openstreetmap.de": {
          trip: {
            summary: { length: 1.3 },
            legs: [
              {
                shape: {
                  coordinates: [
                    [A.lon, A.lat],
                    [B.lon, B.lat],
                  ],
                },
                maneuvers: [{ instruction: "Walk east." }],
              },
            ],
          },
        },
      }),
    );
    expect(valhalla.source).toBe("Valhalla");
    expect(valhalla.distance).toBe(1300);

    const estimate = await quickRoute(A, B, fakeFetch({}));
    expect(estimate.source).toBe("Estimate");
    expect(estimate.estimate).toBe(true);
    expect(estimate.distance).toBeCloseTo(haversine(A, B) * DETOUR_FACTOR);
  });

  it("finds places with Photon, then Nominatim", async () => {
    const photon = await findPlace(
      "Grand Central",
      A,
      fakeFetch({
        "https://photon.komoot.io": {
          features: [
            {
              geometry: { coordinates: [B.lon, B.lat] },
              properties: { name: "Grand Central Terminal", city: "New York" },
            },
          ],
        },
      }),
    );
    expect(photon).toMatchObject({
      source: "Photon",
      label: "Grand Central Terminal, New York",
    });
    const nominatim = await findPlace(
      "Bryant Park",
      A,
      fakeFetch({
        "https://nominatim.openstreetmap.org": [
          {
            lat: "40.7536",
            lon: "-73.9832",
            display_name: "Bryant Park, Manhattan, NY",
          },
        ],
      }),
    );
    expect(nominatim?.source).toBe("Nominatim");
    expect(await findPlace("Nowhere", A, fakeFetch({}))).toBeNull();
  });

  it("hands off to Google Maps walking directions", () => {
    expect(googleWalkingLink(A, B)).toContain("travelmode=walking");
  });
});
