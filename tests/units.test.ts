import { describe, expect, it } from "vitest";
import { defaultUnit, formatTemp, inUnit, tempDelta } from "../src/lib/units";

describe("temperature units", () => {
  it("defaults to °F in the US and °C elsewhere", () => {
    expect(defaultUnit("en-US")).toBe("F");
    expect(defaultUnit("en")).toBe("F");
    expect(defaultUnit("es-MX")).toBe("C");
    expect(defaultUnit("en-GB")).toBe("C");
    expect(defaultUnit("hi-IN")).toBe("C");
    // Language-only and script-tagged locales use their likely region.
    expect(defaultUnit("de")).toBe("C");
    expect(defaultUnit("hi")).toBe("C");
    expect(defaultUnit("en-Latn-US")).toBe("F");
    expect(defaultUnit("")).toBe("F");
  });

  it("formats temperatures given in °C", () => {
    expect(formatTemp(41.2, "F")).toBe("106°F");
    expect(formatTemp(41.2, "C")).toBe("41°C");
    expect(inUnit(0, "F")).toBe(32);
  });

  it("converts differences without the 32° offset", () => {
    expect(tempDelta(5, "F")).toBe(9);
    expect(tempDelta(5, "C")).toBe(5);
  });
});
