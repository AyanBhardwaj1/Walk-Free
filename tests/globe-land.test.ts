import { describe, expect, it } from "vitest";
import { isLand, landDots, lonLatToXYZ } from "../src/lib/globe-land";
import { PREBUILT_AREAS } from "../shared/areas";

describe("landing globe land mask", () => {
  it("puts every prebuilt area on land", () => {
    for (const a of PREBUILT_AREAS)
      expect(isLand(a.lon, a.lat), a.slug).toBe(true);
  });

  it("finds land on each continent and water in the oceans and seas", () => {
    const land: [number, number][] = [
      [-100, 45], // Great Plains
      [-60, -10], // Amazon
      [10, 50], // Germany
      [32.8, 39.9], // Ankara
      [20, 5], // Central Africa
      [45, 24], // Arabia
      [80, 60], // Siberia
      [78, 22], // India
      [134, -25], // Outback
      [-40, 75], // Greenland
      [0, -80], // Antarctica
    ];
    const water: [number, number][] = [
      [-150, 20], // Pacific
      [-40, 30], // Atlantic
      [80, -20], // Indian Ocean
      [34, 43.2], // Black Sea
      [18, 35], // Mediterranean
      [-85, 60], // Hudson Bay
      [-90, 25], // Gulf of Mexico
    ];
    for (const [lon, lat] of land)
      expect(isLand(lon, lat), `${lon},${lat}`).toBe(true);
    for (const [lon, lat] of water)
      expect(isLand(lon, lat), `${lon},${lat}`).toBe(false);
  });

  it("covers roughly the share of the globe that is land", () => {
    const dots = landDots(2);
    // About 10,300 evenly spaced points at 2°; land is a bit under a third.
    expect(dots.length).toBeGreaterThan(2400);
    expect(dots.length).toBeLessThan(3800);
  });

  it("maps longitude 0 to +Z and the north pole to +Y", () => {
    const [x, y, z] = lonLatToXYZ(0, 0, 2);
    expect([x, y, z].map((v) => +v.toFixed(6))).toEqual([0, 0, 2]);
    expect(lonLatToXYZ(0, 90)[1]).toBeCloseTo(1);
    expect(lonLatToXYZ(90, 0)[0]).toBeCloseTo(1);
  });
});
