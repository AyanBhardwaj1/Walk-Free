import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseWalkLink, walkLinkUrl } from "../src/lib/walk-links";
import {
  loadSavedWalks,
  removeSavedWalk,
  saveWalk,
} from "../src/lib/saved-walks";

describe("share links", () => {
  it("round-trips a walk on a shipped campus", () => {
    const url = walkLinkUrl("https://walk.example", {
      area: "ut-austin",
      from: "osm-node-1",
      to: "osm-node-2",
      pref: "shade",
      hour: 17.5,
    });
    expect(url).toBe(
      "https://walk.example/demo?area=ut-austin&from=osm-node-1&to=osm-node-2&pref=shade&t=17.5",
    );
    expect(parseWalkLink(new URL(url).search)).toEqual({
      area: "ut-austin",
      from: "osm-node-1",
      to: "osm-node-2",
      pref: "shade",
      hour: 17.5,
    });
  });

  it("carries any other area by its centre and size", () => {
    const url = walkLinkUrl("https://walk.example", {
      lat: 40.7128,
      lon: -74.006,
      radius: 800,
      pref: "quickest",
    });
    expect(parseWalkLink(new URL(url).search)).toEqual({
      lat: 40.7128,
      lon: -74.006,
      radius: 800,
      pref: "quickest",
    });
  });

  it("ignores anything malformed instead of trusting it", () => {
    expect(
      parseWalkLink(
        "?area=../etc&from=<script>&pref=teleport&t=99&lat=200&lon=0&radius=9",
      ),
    ).toEqual({});
  });
});

describe("saved walks", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  const walk = {
    worldId: "osm-30.28500--97.73410-1000",
    areaName: "UT Austin, TX",
    from: "a",
    to: "b",
    fromLabel: "Andrews",
    toLabel: "GDC",
    pref: "shade" as const,
  };

  it("keeps walks, newest first, without duplicates", () => {
    saveWalk(walk);
    saveWalk({ ...walk, to: "c", toLabel: "PCL" });
    saveWalk(walk);
    const saved = loadSavedWalks();
    expect(saved.map((w) => w.toLabel)).toEqual(["GDC", "PCL"]);
    removeSavedWalk(saved[0].id);
    expect(loadSavedWalks().map((w) => w.toLabel)).toEqual(["PCL"]);
  });

  it("drops malformed entries instead of crashing on them", () => {
    localStorage.setItem(
      "walk-free-saved-walks",
      JSON.stringify([
        { id: "x", from: "a" },
        { ...walk, id: "y", savedAt: "", pref: "teleport" },
        { ...walk, id: "z", savedAt: "" },
      ]),
    );
    expect(loadSavedWalks().map((w) => w.id)).toEqual(["z"]);
  });

  it("keeps at most twelve", () => {
    for (let i = 0; i < 20; i++) saveWalk({ ...walk, to: `n${i}` });
    expect(loadSavedWalks()).toHaveLength(12);
  });
});
