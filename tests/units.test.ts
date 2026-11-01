import { describe, expect, it, vi } from "vitest";
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

describe("remembering the unit", () => {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };

  it("keeps the choice on the device and reads it back", async () => {
    vi.stubGlobal("localStorage", fakeStorage);
    const { loadUnit, saveUnit } = await import("../src/lib/units");
    saveUnit("C");
    expect(loadUnit()).toBe("C");
    saveUnit("F");
    expect(loadUnit()).toBe("F");
    vi.unstubAllGlobals();
  });

  it("ignores a stored value it doesn't know and falls back to the locale", async () => {
    store.set("walk-free-units", "K");
    vi.stubGlobal("localStorage", fakeStorage);
    vi.stubGlobal("navigator", { language: "de-DE" });
    const { loadUnit } = await import("../src/lib/units");
    expect(loadUnit()).toBe("C");
    vi.unstubAllGlobals();
  });

  it("still works when storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    vi.stubGlobal("navigator", { language: "en-US" });
    const { loadUnit, saveUnit } = await import("../src/lib/units");
    expect(loadUnit()).toBe("F");
    expect(() => saveUnit("C")).not.toThrow();
    vi.unstubAllGlobals();
  });
});
