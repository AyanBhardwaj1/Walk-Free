import { describe, expect, it } from "vitest";
import { heatBrief } from "../src/lib/heat-brief";
import type { PlaceHeat } from "../src/lib/heat";

const place = (name: string, feelsLikeC: number, shade: number, length = 400) =>
  ({
    id: name,
    name,
    kind: "street",
    length,
    edgeIds: [],
    samples: [],
    center: [0, 0],
    shade,
    feelsLikeC,
    sunFeelsC: feelsLikeC + 2,
    shadeFeelsC: feelsLikeC - 4,
  }) as unknown as PlaceHeat;

const input = {
  area: "UT Austin, TX",
  at: "Wed 3:00 PM",
  places: [
    place("Speedway", 41, 0.1),
    place("24th Street", 40, 0.2),
    place("Short Lane", 45, 0, 40),
    place("Guadalupe", 39, 0.3),
    place("Sparks Avenue", 35, 0.7),
    place("Whitis Avenue", 36, 0.6),
  ],
  trees: { mapped: 2221, canopy: 9641 },
  walks: { score: 21, sunMinutesSaved: 1.8, extraDistance: 0.07, walks: 24 },
  unit: "F" as const,
};

describe("campus heat brief", () => {
  const b = heatBrief(input);

  it("names the place and hour and says the numbers are modeled", () => {
    expect(b.title).toBe("Heat brief: UT Austin, TX at Wed 3:00 PM");
    expect(b.text).toMatch(/modeled estimates/i);
  });

  it("lists the hottest and shadiest streets of real length", () => {
    expect(b.text).toMatch(
      /Hottest walks:\n1\. Speedway: about 106°F, 10% shaded/,
    );
    expect(b.text).not.toContain("Short Lane");
    expect(b.text).toMatch(
      /Coolest walks:\n1\. Sparks Avenue: about 95°F, 70% shaded/,
    );
  });

  it("reports trees and how much shade routing helps", () => {
    expect(b.text).toContain("2,221 trees mapped in OpenStreetMap");
    expect(b.text).toContain(
      "9,641 more crowns from Meta and WRI's canopy map (DINOv3)",
    );
    expect(b.text).toContain(
      "the shade route avoids 21% of the sun on 24 sample walks (about 1.8 minutes less in the sun) for 7% more walking",
    );
  });

  it("works in °C and without the optional parts", () => {
    const c = heatBrief({
      ...input,
      unit: "C",
      trees: undefined,
      walks: undefined,
    });
    expect(c.text).toMatch(/Speedway: about 41°C/);
    expect(c.text).not.toMatch(/canopy map|shade route avoids/);
  });
});

describe("heat brief without canopy", () => {
  it("doesn't claim 0 extra crowns when the canopy map wasn't used", () => {
    const b = heatBrief({ ...input, trees: { mapped: 120, canopy: 0 } });
    expect(b.text).toContain("Trees: 120 trees mapped in OpenStreetMap.");
    expect(b.text).not.toMatch(/0 more crowns/);
  });
});
