import { describe, expect, it } from "vitest";
import { plantingProposal } from "../src/lib/plant-proposal";

const input = {
  area: "UT Austin",
  street: "West 24th Street",
  planted: 38,
  date: "2026-07-14T20:00:00Z",
  timeZone: "America/Chicago",
  sunUp: true,
  canopy: true,
  impact: {
    street: [
      { shade: 0.22, feelsLikeC: 41.2 },
      { shade: 0.61, feelsLikeC: 36.4 },
    ],
    area: [
      { shade: 0.4, feelsLikeC: 38.0 },
      { shade: 0.404, feelsLikeC: 37.95 },
    ],
  },
} as const;

describe("plant-here proposal", () => {
  const p = plantingProposal(input);

  it("has a title naming the street and place", () => {
    expect(p.title).toBe("Shade trees for West 24th Street, UT Austin");
  });

  it("states the modeled change in plain numbers", () => {
    expect(p.text).toContain("38 trees");
    expect(p.text).toContain("22% → 61%");
    expect(p.text).toMatch(/106°F → 98°F/);
    expect(p.text).toMatch(/about 8\.6°F cooler/);
  });

  it("keeps small area-wide changes visible with a decimal", () => {
    expect(p.text).toContain("40.0% → 40.4%");
  });

  it("says when the numbers apply and that they are estimates", () => {
    expect(p.text).toContain("3:00 PM on Tue, Jul 14");
    expect(p.text).toMatch(/modeled estimates/i);
    expect(p.text).toMatch(/mature canopy/);
  });

  it("writes temperatures in °C when asked", () => {
    const c = plantingProposal({ ...input, unit: "C" }).text;
    expect(c).toMatch(/41°C → 36°C/);
    expect(c).toMatch(/about 4\.8°C cooler/);
  });

  it("credits the canopy map only when it was used", () => {
    expect(plantingProposal({ ...input, canopy: false }).text).not.toMatch(
      /DINOv3/,
    );
  });

  it("credits its data sources", () => {
    expect(p.text).toMatch(/OpenStreetMap/);
    expect(p.text).toMatch(/DINOv3/);
    expect(p.text).toMatch(/walk-free\.vercel\.app/);
  });

  it("works for an unnamed path and without area numbers", () => {
    const q = plantingProposal({
      ...input,
      street: "this path",
      impact: { street: input.impact.street, area: [null, null] },
    });
    expect(q.title).toBe("Shade trees for a path at UT Austin");
    expect(q.text).not.toContain("Whole area");
  });
});

describe("proposal wording", () => {
  it("counts one tree as a tree, and explains an unchanged hour", () => {
    const q = plantingProposal({
      ...input,
      planted: 1,
      impact: {
        street: [
          { shade: 1, feelsLikeC: 31 },
          { shade: 1, feelsLikeC: 31 },
        ],
        area: [null, null],
      },
    });
    expect(q.text).toContain("plant 1 tree,");
    expect(q.text).toMatch(/already in shade at this hour/);
    expect(
      plantingProposal({
        ...input,
        sunUp: false,
        planted: 1,
        impact: {
          street: [
            { shade: 1, feelsLikeC: 31 },
            { shade: 1, feelsLikeC: 31 },
          ],
          area: [null, null],
        },
      }).text,
    ).toMatch(/sun is down/);
  });
});
