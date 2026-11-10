import { describe, expect, it } from "vitest";
import { weekCardText } from "../src/lib/share-card";

describe("my week in the shade", () => {
  it("leads with the sun avoided when there is some", () => {
    const t = weekCardText({
      place: "UT Austin, TX",
      walks: 6,
      minutes: 82,
      sunMinutes: 28,
      avoided: { walks: 5, minutes: 11.6 },
    });
    expect(t.headline).toBe("12 min less sun");
    expect(t.sub).toBe("than the quickest ways, over 5 walks");
    expect(t.line).toBe("6 walks · 82 min · 66% in shade");
    expect(t.share).toBe(
      "My week in the shade around UT Austin, TX: 12 min less sun than the quickest ways, over 5 walks. Found with Walk-Free.",
    );
  });

  it("falls back to the shaded share, and never boasts about more sun", () => {
    const base = { place: "Midtown", walks: 1, minutes: 10, sunMinutes: 7 };
    for (const avoided of [undefined, null, { walks: 2, minutes: -4 }]) {
      const t = weekCardText({ ...base, avoided });
      expect(t.headline).toBe("30% in shade");
      expect(t.sub).toBe("of 10 walking minutes");
      expect(t.line).toBe("1 walk · 10 min · 30% in shade");
    }
    expect(weekCardText({ ...base, minutes: 0, sunMinutes: 0 }).headline).toBe(
      "0% in shade",
    );
  });

  it("adds a walking streak of two days or more", () => {
    const base = { place: "UT", walks: 5, minutes: 50, sunMinutes: 10 };
    expect(weekCardText({ ...base, streak: 4 }).line).toBe(
      "5 walks · 50 min · 80% in shade · 4 days in a row",
    );
    expect(weekCardText({ ...base, streak: 1 }).line).toBe(
      "5 walks · 50 min · 80% in shade",
    );
  });
});
