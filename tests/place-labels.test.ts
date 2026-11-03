import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { World } from "../shared/types";
import { PREBUILT_AREAS } from "../shared/areas";
import { placeLabels } from "../src/lib/place-labels";

const load = (slug: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../public/areas/${slug}.json`, import.meta.url),
      "utf8",
    ),
  ) as World;

describe("place labels", () => {
  it("finds every labelled place in the shipped areas", () => {
    for (const area of PREBUILT_AREAS.filter((a) => a.labels)) {
      const found = placeLabels(load(area.slug), area.labels);
      expect(found.map((l) => l.text)).toEqual(
        area.labels!.map((l) => l.label ?? l.name),
      );
    }
  });
  it("sits a building's label over its tallest part", () => {
    const midtown = PREBUILT_AREAS.find((a) => a.slug === "midtown-manhattan")!;
    const esb = placeLabels(load(midtown.slug), midtown.labels).find(
      (l) => l.text === "Empire State Building",
    )!;
    expect(esb.height).toBeGreaterThan(300);
  });
  it("skips names that aren't in the data", () => {
    const world = load("ut-austin");
    expect(placeLabels(world, [{ name: "Nowhere Hall" }])).toEqual([]);
  });
});
