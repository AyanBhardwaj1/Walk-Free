import { describe, expect, it } from "vitest";
import { walkAdvice } from "../src/lib/walk-advice";

const quick = { name: "Quickest", minutes: 14, sunMinutes: 6 };
const shade = { name: "More shade", minutes: 15, sunMinutes: 3 };
const long = { name: "Scenic", minutes: 25, sunMinutes: 0 };

describe("walk heat advice", () => {
  it("says nothing when there is no heat stress", () => {
    expect(walkAdvice({ utciC: 22, walk: quick })).toBeNull();
    expect(walkAdvice({ utciC: NaN, walk: quick })).toBeNull();
  });

  it("names the shadier route when it saves real sun for little walking", () => {
    const a = walkAdvice({
      utciC: 34,
      walk: quick,
      options: [quick, shade, long],
    })!;
    expect(a.level).toBe(2);
    // The heat-stress line already names the band: no note.
    expect(a.note).toBeNull();
    // The scenic walk has no sun but is 11 minutes longer: not suggested.
    expect(a.tips[0]).toBe(
      "Take More shade: 3 min in the sun instead of 6, for 1 more minute of walking.",
    );
    expect(a.tips).toContain(
      "Carry water and walk a little slower than usual.",
    );
  });

  it("doesn't suggest the route already chosen or one that saves little", () => {
    const a = walkAdvice({
      utciC: 34,
      walk: shade,
      options: [quick, shade, { ...long, minutes: 16, sunMinutes: 2 }],
    })!;
    expect(a.tips.some((t) => t.startsWith("Take"))).toBe(false);
  });

  it("adds the warning signs only in very strong heat", () => {
    const strong = walkAdvice({ utciC: 35, walk: quick })!;
    expect(strong.tips.join(" ")).not.toMatch(/dizzy/);
    const veryStrong = walkAdvice({ utciC: 40, walk: quick })!;
    expect(veryStrong.level).toBe(3);
    expect(veryStrong.tips.join(" ")).toMatch(/dizzy, sick or confused/);
    expect(veryStrong.tips.length).toBeLessThanOrEqual(3);
  });

  it("lets a high NWS HeatRisk raise the level and says so", () => {
    const a = walkAdvice({ utciC: 28, walk: quick, heatRisk: 3 })!;
    expect(a.level).toBe(3);
    expect(a.note).toBe("NWS HeatRisk for the day: major (3 of 4).");
    // A milder HeatRisk than the walk's own heat stress changes nothing.
    expect(walkAdvice({ utciC: 34, walk: quick, heatRisk: 1 })!.level).toBe(2);
  });

  it("mentions a cool stop the route passes, with a check on hours", () => {
    const a = walkAdvice({
      utciC: 34,
      walk: { name: "Cool stops", minutes: 15, sunMinutes: 3 },
      coolStop: "Union Building",
    })!;
    expect(a.tips[0]).toMatch(/^Cool off midway in Union Building/);
    expect(a.tips[0]).toMatch(/check it's open/);
  });

  it("keeps mild heat to one gentle tip, and stays quiet with nothing to add", () => {
    const mild = walkAdvice({ utciC: 28, walk: quick })!;
    expect(mild.level).toBe(1);
    expect(mild.tips).toEqual(["Keep to the shaded side where you can."]);
    const shaded = walkAdvice({
      utciC: 28,
      walk: { name: "Quickest", minutes: 5, sunMinutes: 0.2 },
    });
    expect(shaded).toBeNull();
  });

  it("speaks up one level sooner for a walker sensitive to heat", () => {
    const walk = { name: "Quickest", minutes: 12, sunMinutes: 1 };
    // Moderate heat stress: nothing to add for most walkers...
    expect(walkAdvice({ utciC: 28, walk })).toBeNull();
    // ...but water for someone more sensitive, and at strong heat stress,
    // the warning signs.
    const moderate = walkAdvice({ utciC: 28, walk, sensitive: true })!;
    expect(moderate.level).toBe(2);
    expect(moderate.tips).toEqual([
      "Carry water and walk a little slower than usual.",
    ]);
    const strong = walkAdvice({ utciC: 34, walk, sensitive: true })!;
    expect(strong.tips.join(" ")).toMatch(/dizzy/);
    // No heat stress stays no heat stress.
    expect(walkAdvice({ utciC: 22, walk, sensitive: true })).toBeNull();
    expect(walkAdvice({ utciC: 50, walk, sensitive: true })!.level).toBe(4);
  });

  it("never takes the shade tip away from a sensitive walker", () => {
    const short = { name: "Quickest", minutes: 8, sunMinutes: 8 };
    expect(walkAdvice({ utciC: 28, walk: short })!.tips).toEqual([
      "Keep to the shaded side where you can.",
    ]);
    expect(
      walkAdvice({ utciC: 28, walk: short, sensitive: true })!.tips,
    ).toEqual(["Keep to the shaded side where you can."]);
  });

  it("points out drinking fountains on the way when water matters", () => {
    const walk = { name: "Quickest", minutes: 14, sunMinutes: 1 };
    expect(walkAdvice({ utciC: 34, walk, water: 2 })!.tips).toContain(
      "Carry water and walk a little slower than usual; there are 2 drinking fountains on the way.",
    );
    expect(walkAdvice({ utciC: 34, walk, water: 1 })!.tips).toContain(
      "Carry water and walk a little slower than usual; there is a drinking fountain on the way.",
    );
  });

  it("never drops the warning signs in very strong heat", () => {
    const a = walkAdvice({
      utciC: 45,
      walk: { name: "Quickest", minutes: 14, sunMinutes: 9 },
      options: [{ name: "More shade", minutes: 15, sunMinutes: 2 }],
      coolStop: "Union Building",
      water: 2,
    })!;
    expect(a.tips).toHaveLength(3);
    expect(a.tips[2]).toMatch(/dizzy, sick or confused/);
    expect(a.tips[0]).toMatch(/^Take More shade/);
  });
});
