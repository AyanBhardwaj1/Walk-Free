import { describe, expect, it } from "vitest";
import { streetHeatCsv } from "../src/lib/heat-csv";
import type { PlaceHeat } from "../src/lib/heat";

const place = (over: Partial<PlaceHeat>): PlaceHeat =>
  ({
    id: "p",
    name: "Speedway",
    kind: "street",
    length: 812.4,
    edgeIds: [],
    samples: [],
    center: [0, 0],
    shade: 0.234,
    feelsLikeC: 41.2,
    sunFeelsC: 43,
    shadeFeelsC: 36.4,
    ...over,
  }) as PlaceHeat;

describe("street heat CSV", () => {
  const csv = streetHeatCsv(
    [
      place({}),
      place({ id: "q", name: 'The "Drag", Guadalupe', kind: "park", length: 120 }),
      place({ id: "r", name: "=HYPERLINK(1)" }),
    ],
    { area: "UT Austin, TX", at: "Wed 3:00 PM" },
  );
  const lines = csv.trim().split("\r\n");

  it("starts with a comment naming the place, hour and that values are modeled", () => {
    expect(lines[0]).toBe(
      '"# Walk-Free modeled street heat for UT Austin, TX at Wed 3:00 PM (estimates, not measurements)"',
    );
  });

  it("has a header and one row per place, in °F and percent", () => {
    expect(lines[1]).toBe(
      "name,kind,length_m,shaded_percent,feels_like_f,in_sun_f,in_shade_f",
    );
    expect(lines[2]).toBe("Speedway,street,812,23,106,109,98");
    expect(lines).toHaveLength(5);
  });

  it("quotes commas and quotes, and defuses spreadsheet formulas", () => {
    expect(lines[3]).toBe('"The ""Drag"", Guadalupe",park,120,23,106,109,98');
    expect(lines[4].startsWith("'=HYPERLINK(1)")).toBe(true);
  });
});
