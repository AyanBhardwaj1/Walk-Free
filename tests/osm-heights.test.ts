import { describe, expect, it } from "vitest";
import { typicalHeight } from "../shared/osm.js";

describe("typical building heights", () => {
  it("scales by building type", () => {
    expect(typicalHeight("shed")).toBe(3);
    expect(typicalHeight("house")).toBeLessThan(typicalHeight("apartments"));
    expect(typicalHeight("cathedral")).toBeGreaterThan(typicalHeight("church"));
  });
  it("keeps 10 m for unknown or generic buildings", () => {
    expect(typicalHeight("yes")).toBe(10);
    expect(typicalHeight(undefined)).toBe(10);
  });
});
