import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { destinationCatalog, rankDestinations } from "../src/lib/destinations";
import type { World } from "../shared/types";

const catalogs = new Map<string, ReturnType<typeof destinationCatalog>>();
function search(area: string, query: string) {
  if (!catalogs.has(area)) {
    const world = JSON.parse(
      readFileSync(`public/areas/${area}.json`, "utf8"),
    ) as World;
    catalogs.set(area, destinationCatalog(world));
  }
  return rankDestinations(catalogs.get(area)!, query).map((d) => d.label);
}

describe("search on real campus maps", () => {
  it("puts the building ahead of repeated stretches of a same-named street", () => {
    expect(search("ut-austin", "jester")[0]).toMatch(/Jester Center/);
    expect(search("ucla", "royce").slice(0, 2).join(" ")).toMatch(/Royce Hall/);
    expect(search("uc-berkeley", "sproul").slice(0, 3).join(" ")).toMatch(
      /Sproul Hall/,
    );
    expect(search("uc-berkeley", "campanile").slice(0, 3).join(" ")).toMatch(
      /Sather Tower/,
    );
  });

  it("ranks things named for the query above places merely beside them", () => {
    for (const [query, street] of [
      ["durant", /Durant Avenue/],
      ["bancroft", /Bancroft Way/],
      ["college", /College Avenue/],
    ] as const) {
      const top = search("uc-berkeley", query).slice(0, 6);
      // Durant Hall is a fair answer for "durant"; Wolf House beside it isn't.
      for (const label of top) expect(label.toLowerCase()).toContain(query);
      expect(top.join(" ")).toMatch(street);
    }
  });

  it("lists each street once", () => {
    const top = search("ut-austin", "jester").slice(0, 5);
    expect(new Set(top).size).toBe(top.length);
  });

  it("finds buildings by their campus codes first", () => {
    expect(search("ut-austin", "JES")[0]).toMatch(/Jester/);
    expect(search("ut-austin", "GRE")[0]).toMatch(/Gregory/);
    expect(search("ut-austin", "AND")[0]).toMatch(/Andrews/);
    expect(search("asu", "MU")[0]).toMatch(/Memorial Union/);
  });

  it("ignores accents, tolerates a typo and splits codes from numbers", () => {
    expect(search("ut-austin", "perry castaneda library")[0]).toMatch(
      /Perry-Castañeda/,
    );
    expect(search("ut-austin", "jestr")[0]).toMatch(/Jester/);
    expect(search("asu", "ISTB4")[0]).toMatch(/ISTB\)? 4/);
  });

  it("finds named parks and squares", () => {
    expect(search("umich", "diag").join(" ")).toMatch(/Diag/);
  });
});
