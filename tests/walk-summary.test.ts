import { describe, expect, it } from "vitest";
import { walkSummary } from "../src/lib/ml/walk-summary";

const walk = (metresPerMin: number, minutes = 10) => ({
  id: "w",
  area: "a",
  points: Array.from({ length: minutes + 1 }, (_, i) => ({
    lat: 30,
    lon: -97 + (i * metresPerMin) / 96_350, // ~96.35 km per degree at 30°
    t: i * 60_000,
    acc: 5,
  })),
});

describe("the line about a walk just logged", () => {
  it("compares the pace with your usual", () => {
    expect(walkSummary(walk(80), 1.33, 3, "C")).toBe(
      "Walk logged: 0.80 km in 10 min, your usual pace, 3 of them in direct sun. Walk-Free learns from it.",
    );
    expect(walkSummary(walk(100), 1.33, null)).toMatch(
      /0\.62 mi in 10 min, quicker than usual\./,
    );
    expect(walkSummary(walk(60), 1.33, null)).toMatch(/slower than usual/);
  });

  it("doesn't compare a first walk with anything", () => {
    expect(walkSummary(walk(80), null, null)).toMatch(/your first logged walk/);
  });

  it("stays quiet about a walk too short to mean anything", () => {
    expect(walkSummary(walk(3), 1.33, null)).toBeNull();
  });

  it("says none rather than 0 when no minute was in the sun", () => {
    const walk = {
      id: "w",
      area: "a",
      points: [
        { lat: 30.285, lon: -97.742, t: 0, acc: 5 },
        { lat: 30.285, lon: -97.7412, t: 120_000, acc: 5 },
      ],
    };
    expect(walkSummary(walk, null, 0.2, "F")).toMatch(
      /, none of it in direct sun\. Walk-Free learns from it\.$/,
    );
  });
});
