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
      place({
        id: "q",
        name: 'The "Drag", Guadalupe',
        kind: "park",
        length: 120,
      }),
      place({ id: "r", name: "=HYPERLINK(1)" }),
    ],
    { area: "UT Austin, TX", at: "Wed 3:00 PM" },
  );
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n");
  const meta =
    ',"UT Austin, TX",Wed 3:00 PM,"Walk-Free model (estimate, not a measurement)"';

  it("starts with a byte-order mark so Excel reads accents", () => {
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("has a plain header and one row per place, saying where, when and that it's modeled", () => {
    expect(lines[0]).toBe(
      "name,kind,length_m,shaded_percent,feels_like_f,in_sun_f,in_shade_f,area,at,source",
    );
    expect(lines[1]).toBe("Speedway,street,812,23,106,109,98" + meta);
    expect(lines).toHaveLength(4);
  });

  it("quotes commas and quotes, and defuses spreadsheet formulas", () => {
    expect(lines[2]).toBe(
      '"The ""Drag"", Guadalupe",park,120,23,106,109,98' + meta,
    );
    expect(lines[3].startsWith("'=HYPERLINK(1)")).toBe(true);
  });

  it("keeps negative numbers as numbers", () => {
    const cold = streetHeatCsv(
      [place({ feelsLikeC: -20, sunFeelsC: -18, shadeFeelsC: -21 })],
      { area: "X", at: "Y" },
    );
    expect(cold).toContain(",-4,0,-6,");
  });
});
