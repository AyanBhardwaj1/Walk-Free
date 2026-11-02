import { beforeEach, describe, expect, it } from "vitest";
import { lastPlace, rememberPlace } from "../src/lib/last-place.js";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as Storage;
});

describe("last place", () => {
  it("round-trips an app link", () => {
    rememberPlace({ name: "Noir Harbor", href: "/app?fiction=noir-harbor" });
    expect(lastPlace()).toEqual({
      name: "Noir Harbor",
      href: "/app?fiction=noir-harbor",
    });
  });
  it("refuses links outside the app", () => {
    store.set(
      "walk-free-last-place",
      JSON.stringify({ name: "x", href: "javascript:alert(1)" }),
    );
    expect(lastPlace()).toBeNull();
    store.set(
      "walk-free-last-place",
      JSON.stringify({ name: "x", href: "//evil.example/app?x=1" }),
    );
    expect(lastPlace()).toBeNull();
  });
  it("survives junk", () => {
    store.set("walk-free-last-place", "{not json");
    expect(lastPlace()).toBeNull();
  });
});
