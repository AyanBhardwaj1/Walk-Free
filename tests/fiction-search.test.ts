import { describe, expect, it } from "vitest";
import { matchFiction } from "../src/components/OmniSearch.js";
import { FICTION_CITIES, isDarkSky } from "../src/lib/fiction-catalog.js";

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
