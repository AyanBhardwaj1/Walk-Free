import { describe, expect, it } from "vitest";
import { emptyLog, importWalks, MAX_WALKS } from "../src/lib/walk-log";

const walk = (id: string, start: number) => ({
  id,
  area: "ut-austin",
  points: [
    { lat: 30.28, lon: -97.74, t: start, acc: 5 },
    { lat: 30.281, lon: -97.74, t: start + 60_000, acc: 5 },
  ],
  weather: { temperatureC: 30, humidity: 40, cloudCover: 20, feelsLikeC: 31 },
});

describe("importing exported walks", () => {
  it("adds new walks in time order and skips ones already here", () => {
    const log = { ...emptyLog(), walks: [walk("a", 2000)] };
    const {
      log: next,
      added,
      skipped,
    } = importWalks(log, [walk("b", 1000), walk("a", 2000)]);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(next.walks.map((w) => w.id)).toEqual(["b", "a"]);
    expect(next.walks[0].weather?.cloudCover).toBe(20);
  });

  it("refuses anything that isn't a walk, and never imports samples", () => {
    const { added, skipped } = importWalks(emptyLog(), [
      { ...walk("s", 1), sample: true },
      { id: "x", area: "a", points: [{ lat: "1", lon: 2, t: 3, acc: 4 }] },
      {
        id: "y",
        area: "a",
        points: [
          { lat: 95, lon: 0, t: 0, acc: 1 },
          { lat: 0, lon: 0, t: 1, acc: 1 },
        ],
      },
      null,
      "walk",
    ]);
    expect(added).toBe(0);
    expect(skipped).toBe(5);
    expect(() => importWalks(emptyLog(), { walks: [] })).toThrow();
  });

  it("keeps the newest walks within the limit", () => {
    const many = Array.from({ length: MAX_WALKS + 10 }, (_, i) =>
      walk(`w${i}`, i * 1000),
    );
    const { log } = importWalks(emptyLog(), many);
    expect(log.walks).toHaveLength(MAX_WALKS);
    expect(log.walks.at(-1)!.id).toBe(`w${MAX_WALKS + 9}`);
  });

  it("drops samples, refuses future walks and thins long traces", () => {
    const sample = { ...walk("s", 500), sample: true };
    const future = walk("f", Date.now() + 3 * 24 * 3600_000);
    const long = {
      ...walk("long", 3000),
      points: Array.from({ length: 5000 }, (_, i) => ({
        lat: 30.28,
        lon: -97.74 + i * 1e-5,
        t: 3000 + i * 1000,
        acc: 5,
      })),
    };
    const { log, added, skipped } = importWalks(
      { ...emptyLog(), walks: [sample] },
      [future, long],
    );
    expect(log.walks.map((w) => w.id)).toEqual(["long"]);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(log.walks[0].points.length).toBeLessThanOrEqual(2001);
    expect(log.walks[0].points.at(-1)!.t).toBe(3000 + 4999 * 1000);
  });

  it("counts only walks that stay, and says when old ones made room", () => {
    const full = {
      ...emptyLog(),
      walks: Array.from({ length: MAX_WALKS }, (_, i) =>
        walk(`o${i}`, 1e6 + i * 1000),
      ),
    };
    // Older than everything here: none of them stay.
    const old = importWalks(full, [walk("old", 1)]);
    expect(old.added).toBe(0);
    expect(old.dropped).toBe(0);
    // Newer: it stays, and the oldest walk here makes room.
    const fresh = importWalks(full, [walk("new", 9e9)]);
    expect(fresh.added).toBe(1);
    expect(fresh.dropped).toBe(1);
  });
});
