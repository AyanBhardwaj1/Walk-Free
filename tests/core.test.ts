import { describe, it, expect } from "vitest";
import { route } from "../src/lib/routing";
import { createStudyWorld } from "../src/lib/study";
import { sunDirection, isShaded } from "../src/lib/environment";
import {
  parseHeight,
  parseOsmWorld,
  parseWind,
  gridValueAt,
} from "../server/data";
import { proposalSchema } from "../server/agent";
const environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 30,
  humidity: 50,
  windMps: 3,
  cloudCover: 0,
  weatherMode: "scenario" as const,
};
const options = {
  preference: "quickest" as const,
  avoidStairs: false,
  allowHypothetical: false,
  maxDetour: 2,
  environment,
};
describe("pedestrian routing", () => {
  it("finds a connected walk with metrics", () => {
    const w = createStudyWorld();
    const r = route(w, "market-gate", "observatory", options);
    expect(r?.distance).toBeGreaterThan(400);
    expect(r?.points[0]).toEqual(
      w.graph.nodes.find((n) => n.id === "market-gate")!.point,
    );
    expect(r?.hypothetical).toBe(false);
  });
  it("never invents a connection", () => {
    const w = createStudyWorld();
    w.graph.edges = [];
    expect(route(w, "market-gate", "observatory", options)).toBeNull();
  });
  it("excludes hypothetical interior links by default", () => {
    const w = createStudyWorld();
    w.graph.edges = w.graph.edges.filter((e) => e.indoor === "hypothetical");
    expect(route(w, "gallery-south", "gallery-north", options)).toBeNull();
    expect(
      route(w, "gallery-south", "gallery-north", {
        ...options,
        allowHypothetical: true,
      })?.hypothetical,
    ).toBe(true);
  });
});
describe("environment", () => {
  it("places the equatorial equinox midday sun overhead", () => {
    const s = sunDirection(
      { ...environment, dateTime: "2026-03-20T12:00:00Z" },
      { lat: 0, lon: 0 },
    );
    expect(s.y).toBeGreaterThan(0.99);
  });
  it("models nighttime without direct sun", () => {
    const w = createStudyWorld();
    expect(
      isShaded([0, 0], w, { ...environment, dateTime: "2026-07-15T06:00:00Z" }),
    ).toBe(true);
  });
});
describe("source data", () => {
  it("converts feet and rejects malformed heights", () => {
    expect(parseHeight("100 ft")).toBeCloseTo(30.48);
    expect(parseHeight("tall")).toBeNull();
  });
  it("converts forecast wind and bounded time intervals", () => {
    expect(parseWind("10 mph")).toBeCloseTo(4.4704);
    expect(
      gridValueAt(
        { values: [{ validTime: "2026-01-01T00:00:00Z/PT1H", value: 80 }] },
        "2026-01-01T01:00:00Z",
      ),
    ).toBeNull();
  });
  it("rejects missing map data instead of fabricating a city", () => {
    expect(() =>
      parseOsmWorld({ elements: [] }, { lat: 30, lon: -97 }, "Empty"),
    ).toThrow();
  });
});
it("rejects unbounded assistant geometry", () => {
  expect(
    proposalSchema.safeParse({
      summary: "Invalid",
      objects: [
        {
          id: "a",
          kind: "tree",
          name: "Tree",
          position: [0, 0],
          width: -1,
          depth: 10,
          height: 10,
          rotation: 0,
        },
      ],
    }).success,
  ).toBe(false);
});
import { csv, seconds, serviceActive } from "../server/transit";
describe("BART schedule parsing", () => {
  it("preserves commas and escaped quotes", () => {
    expect(csv('id,name\n1,"Mission, SF"\n2,"The ""Bay"""\n')[0].name).toBe(
      "Mission, SF",
    );
  });
  it("supports GTFS service beyond midnight", () => {
    expect(seconds("25:10:00")).toBe(90600);
  });
  it("applies service removal exceptions before weekday calendar", () => {
    expect(
      serviceActive(
        "weekday",
        "20261027",
        [
          {
            service_id: "weekday",
            start_date: "20260101",
            end_date: "20261231",
            tuesday: "1",
          },
        ],
        [{ service_id: "weekday", date: "20261027", exception_type: "2" }],
      ),
    ).toBe(false);
  });
});
import { searchCities, cities } from "../server/cities";
import { worldSchema } from "../shared/schema";
import { heatIndexC } from "../src/lib/environment";
it("finds campuses and keeps city IDs unique", () => {
  expect(searchCities("Berkeley").some((c) => c.name === "UC Berkeley")).toBe(
    true,
  );
  expect(new Set(cities.map((c) => c.id)).size).toBe(cities.length);
});
it("validates saved scenes and rejects invalid coordinates", () => {
  const w = createStudyWorld();
  expect(worldSchema.safeParse(w).success).toBe(true);
  w.origin.lat = 999;
  expect(worldSchema.safeParse(w).success).toBe(false);
});
it("restricts the heat index to hot, humid conditions", () => {
  expect(heatIndexC(15, 50)).toBeNull();
  expect(heatIndexC(32.22, 70)).toBeGreaterThan(40);
});
import { addPlanningPassage } from "../src/lib/planning";
it("keeps user-created indoor connections explicitly hypothetical", () => {
  const w = createStudyWorld();
  const planned = addPlanningPassage(w, [-180, 180], [180, -180]);
  expect(planned.graph.edges.at(-1)?.indoor).toBe("hypothetical");
  expect(w.graph.edges.length).toBe(planned.graph.edges.length - 1);
});
import { applyDesignProposal } from "../src/lib/proposals";
it("previews AI replacements without mutating the original scene", () => {
  const w = createStudyWorld(),
    o = w.objects[0];
  const preview = applyDesignProposal(w, {
    summary: "Taller",
    objects: [{ ...o, height: 80 }],
  });
  expect(preview.objects.find((x) => x.id === o.id)?.height).toBe(80);
  expect(w.objects[0].height).not.toBe(80);
  expect(preview.objects.length).toBe(w.objects.length);
});
