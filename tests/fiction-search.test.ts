import { describe, expect, it } from "vitest";
import { matchFiction } from "../src/components/OmniSearch.js";
import {
  FICTION_CITIES,
  isDarkSky,
  skyAt,
} from "../src/lib/fiction-catalog.js";

describe("fictional cities in search", () => {
  it("finds a city by any word of its name", () => {
    expect(matchFiction("noir").map((c) => c.slug)).toEqual(["noir-harbor"]);
    expect(matchFiction("district").map((c) => c.slug)).toEqual([
      "neon-district",
    ]);
  });
  it("lists every city for 'fiction'", () => {
    expect(matchFiction("fictional")).toHaveLength(FICTION_CITIES.length);
  });
  it("stays quiet for one letter or no match", () => {
    expect(matchFiction("n")).toEqual([]);
    expect(matchFiction("austin")).toEqual([]);
  });
});

describe("sky contrast", () => {
  it("asks for light text over dark skies only", () => {
    expect(isDarkSky("#141821")).toBe(true);
    expect(isDarkSky("#5fa8e8")).toBe(false);
    expect(isDarkSky("#22315f")).toBe(true);
  });
});

describe("adaptive fictional skies", () => {
  const sunny = FICTION_CITIES.find((c) => c.slug === "skyline-prime")!;
  const noir = FICTION_CITIES.find((c) => c.slug === "noir-harbor")!;
  it("keeps the designed sky at midday", () => {
    const s = skyAt(sunny.ambient, 0.8);
    expect(s.sky).toEqual(sunny.ambient.sky);
    expect(s.nightness).toBe(0);
  });
  it("turns a day city's sky dark after sunset", () => {
    const s = skyAt(sunny.ambient, -0.3);
    expect(s.nightness).toBe(1);
    expect(isDarkSky(s.sky[0])).toBe(true);
    expect(isDarkSky(s.fog)).toBe(true);
  });
  it("warms the horizon at dusk", () => {
    const s = skyAt(sunny.ambient, 0.04);
    expect(s.sky[1]).not.toBe(sunny.ambient.sky[1]);
  });
  it("keeps night-life cities dark at night", () => {
    expect(skyAt(noir.ambient, -0.3).sky).toEqual(noir.ambient.sky);
  });
});
