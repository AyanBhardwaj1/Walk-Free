// Precomputes real numbers and a small interactive map slice for the
// landing page from the shipped campus data. Run: npm run landing:data
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PREBUILT_AREAS } from "../shared/areas.js";
import type { Environment, World } from "../shared/types.js";
import {
  areaHeat,
  atLocalHour,
  edgeHeatMap,
  heatConditions,
  placeHeat,
  readHeat,
  toF,
} from "../src/lib/heat.js";
import { plantShadeRow } from "../src/lib/planting.js";
import { createShadeTester } from "../src/lib/environment.js";
import { edgeShadeFraction } from "../src/lib/heat.js";

// A clear, hot mid-July afternoon, the same scenario for every campus.
const JULY: Environment = {
  dateTime: "2026-07-15T12:00:00Z",
  temperatureC: 35,
  humidity: 40,
  windMps: 2,
  cloudCover: 5,
  weatherMode: "scenario",
};
const AFTERNOON_HOUR = 15;
// Typical July afternoon high and humidity near each campus (approximate
// climate normals), so each campus is shown in its own summer weather.
const SUMMER: Record<string, { highF: number; humidity: number }> = {
  "ut-austin": { highF: 97, humidity: 45 },
  "uc-berkeley": { highF: 72, humidity: 60 },
  umich: { highF: 83, humidity: 50 },
  ucla: { highF: 79, humidity: 55 },
  stanford: { highF: 82, humidity: 40 },
  asu: { highF: 106, humidity: 20 },
};
const summer = (slug: string): Environment => ({
  ...JULY,
  temperatureC: ((SUMMER[slug].highF - 32) * 5) / 9,
  humidity: SUMMER[slug].humidity,
});
const PREVIEW_HALF_M = 260;
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const load = (slug: string) =>
  JSON.parse(
    readFileSync(join("public", "areas", `${slug}.json`), "utf8"),
  ) as World;

const campuses = PREBUILT_AREAS.map((area) => {
  const world = load(area.slug);
  const env = {
    ...summer(area.slug),
    dateTime: atLocalHour(JULY.dateTime, world.timezone, AFTERNOON_HOUR),
  };
  const streets = placeHeat(world, env).filter(
    (p) => p.kind === "street" && p.length >= 150,
  );
  const hottest = streets[0];
  const coolest = streets.at(-1)!;
  const all = areaHeat(world, edgeHeatMap(world, env))!;
  return {
    slug: area.slug,
    name: area.name.replace(/, [A-Z]{2}$/, ""),
    air_f: SUMMER[area.slug].highF,
    buildings: world.objects.filter((o) => o.kind !== "tree").length,
    paths_km: round(
      world.graph.edges.reduce((s, e) => s + e.distance, 0) / 1000,
      0,
    ),
    shaded_percent: Math.round(all.shade * 100),
    hottest: {
      name: hottest.name,
      feels_f: Math.round(toF(hottest.feelsLikeC)),
      shaded_percent: Math.round(hottest.shade * 100),
    },
    coolest: {
      name: coolest.name,
      feels_f: Math.round(toF(coolest.feelsLikeC)),
      shaded_percent: Math.round(coolest.shade * 100),
    },
  };
});

// Interactive slice: the area around UT Austin's Speedway, with each path's
// shade through the day before and after a planted row of trees.
const ut = load("ut-austin");
const speedway = ut.graph.edges.filter((e) => e.name === "Speedway");
const mid = speedway[Math.floor(speedway.length / 2)].points[0];
const inside = (p: [number, number]) =>
  Math.abs(p[0] - mid[0]) <= PREVIEW_HALF_M &&
  Math.abs(p[1] - mid[1]) <= PREVIEW_HALF_M;
const planted = plantShadeRow(ut, speedway[0].id)!;
const edges = ut.graph.edges.filter((e) => e.points.every(inside));
function shadeByHour(world: World) {
  return HOURS.map((hour) => {
    const env = {
      ...summer("ut-austin"),
      dateTime: atLocalHour(JULY.dateTime, world.timezone, hour),
    };
    const tester = createShadeTester(world, env);
    return {
      hour,
      conditions: heatConditions(env, world.origin),
      shade: new Map(edges.map((e) => [e.id, edgeShadeFraction(e, tester)])),
    };
  });
}
const before = shadeByHour(ut);
const after = shadeByHour(planted.world);
const local = (p: [number, number]) => [
  round(p[0] - mid[0]),
  round(p[1] - mid[1]),
];
const preview = {
  name: "Speedway, UT Austin",
  half: PREVIEW_HALF_M,
  hours: HOURS,
  // Feels-like in shade and in full sun for each hour, in °F.
  shade_f: before.map((h) => round(toF(h.conditions.shadeFeelsC))),
  sun_f: before.map((h) => round(toF(readHeat(h.conditions, 0).feelsLikeC))),
  buildings: ut.objects
    .filter((o) => o.kind !== "tree" && inside(o.position))
    .map((o) =>
      (o.footprint ?? []).map(([x, z]) =>
        local([o.position[0] + x, o.position[1] + z]),
      ),
    )
    .filter((f) => f.length >= 3),
  trees: ut.objects
    .filter((o) => o.kind === "tree" && inside(o.position))
    .map((o) => local(o.position)),
  planted: planted.world.objects
    .slice(ut.objects.length)
    .filter((o) => inside(o.position))
    .map((o) => local(o.position)),
  paths: edges.map((e) => ({
    points: e.points.map(local),
    speedway: e.name === "Speedway",
    shade: before.map((h) => round(h.shade.get(e.id)!, 2)),
    shade_planted: after.map((h) => round(h.shade.get(e.id)!, 2)),
  })),
};
writeFileSync(
  join("public", "landing", "campuses.json"),
  JSON.stringify({
    scenario:
      "3 PM on a clear July afternoon at each campus's typical July high (approximate climate normals)",
    campuses,
  }),
);
writeFileSync(
  join("public", "landing", "speedway.json"),
  JSON.stringify(preview),
);
console.log(JSON.stringify(campuses, null, 1));
console.log(
  "preview paths",
  preview.paths.length,
  "buildings",
  preview.buildings.length,
);
