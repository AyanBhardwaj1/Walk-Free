import { z } from "zod";
import type {
  Environment,
  RoutePreference,
  WeatherForecast,
  World,
} from "../../shared/types.js";
import { rankDestinations, type Destination } from "./destinations.js";
import { searchVariants } from "../../shared/aliases.js";
import { compareRoutes, routePreferences } from "./routing.js";
import { openCoolStops } from "./cool-stops.js";
import { bestTimeToLeave } from "./best-time.js";
import { coolWalkability } from "./cool-walkability.js";
import { treePriorities } from "./tree-priority.js";
import { heatStress, UTCI_BANDS, utciBand, walkUtci } from "./heat-stress.js";
import { findRefuges, refugeCoverage } from "./refuges.js";
import { routeAdvice } from "./walk-advice.js";
import { sunDirection } from "./environment.js";
import { hoursStatus, parseOpeningHours } from "./opening-hours.js";
import { plantShadeRow, type PlantingResult } from "./planting.js";
import {
  atLocalHour,
  clockLabel,
  localHour,
  dailyProfile,
  placeHeat,
  routeHeat,
  areaHeat,
  edgeHeatMap,
  toF,
  weatherAt,
  scenarioAt,
  type PlaceHeat,
} from "./heat.js";

/** Route names as the heat check says them to the assistant. */
const ROUTE_NAMES = {
  quickest: "the quickest route",
  shade: "the shade route",
  scenic: "the scenic route",
  indoors: "the cool-stops route",
  stepfree: "the step-free route",
  night: "the lit route",
} as const;

/** What the assistant may read and change in the running app. */
export interface ToolHost {
  /** The map routes use; with a GPS fix, a path is split at the walker. */
  world: World;
  /** The saved scene, which edits change. Defaults to `world`. */
  scene?: World;
  env: Environment;
  forecast: WeatherForecast | null;
  catalog: Destination[];
  myLocationNodeId: string | null;
  /** Where the walk on the map starts now; "my location" uses it without a fix. */
  currentStartNodeId?: string | null;
  /** The current moment, for "hours still ahead" (tests pass a fixed one). */
  now?: () => string;
  /** The person's sun-aversion setting, so tool routes match the map's. */
  sunAversion?: number;
  showRoute(r: {
    start: string;
    end: string;
    preference: RoutePreference;
    avoidStairs: boolean;
    dateTime: string;
  }): void;
  setDateTime(iso: string): void;
  highlightPlace(id: string): void;
  buildArea(query: string): Promise<string>;
  generateCity(
    description: string,
    realism: "sketch" | "detailed" | "dense",
  ): Promise<string>;
  applyPlanting(result: PlantingResult, before: World): void;
  /** Sets (or, with null, clears) a mapped building's opening hours. */
  setBuildingHours?(buildingId: string, hours: string | null): void;
  proposeDesign(request: string): Promise<string>;
  /** What the walk log has taught (pace, routines, leave-by, profile). */
  walker?(): unknown;
}

const hour = z.number().min(0).max(23.99);
const schemas = {
  find_places: z.object({ query: z.string().min(1).max(120) }),
  plan_route: z.object({
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
    preference: z
      .enum(["quickest", "shade", "scenic", "indoors", "stepfree", "night"])
      .optional(),
    leave_at_hour: hour.optional(),
    avoid_stairs: z.boolean().optional(),
  }),
  heat_ranking: z.object({
    hour: hour.optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  place_heat: z.object({
    place: z.string().min(1).max(120),
    hour: hour.optional(),
  }),
  set_time: z.object({ hour }),
  compare_walks: z.object({ hour: hour.optional() }),
  best_time_to_leave: z.object({
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
    preference: z
      .enum(["quickest", "shade", "scenic", "indoors", "stepfree", "night"])
      .optional(),
  }),
  build_area: z.object({ place: z.string().min(1).max(120) }),
  cool_refuges: z.object({}),
  my_walks: z.object({}),
  plan_tree_planting: z.object({
    count: z.number().int().min(1).max(5).optional(),
  }),
  generate_city: z.object({
    description: z.string().min(3).max(600),
    realism: z.enum(["sketch", "detailed", "dense"]).optional(),
  }),
  propose_design: z.object({ request: z.string().min(1).max(1000) }),
  plant_shade_trees: z.object({ street: z.string().min(1).max(120) }),
  set_building_hours: z.object({
    building: z.string().min(1).max(120),
    hours: z.string().max(500),
  }),
};

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

/** Best catalog matches, with the same synonyms and aliases as search. */
export function matchDestinations(catalog: Destination[], query: string) {
  // Drop filler words people say aloud ("the library", "to GDC").
  const cleaned = query.replace(/\b(the|to|from|at|near)\b/gi, " ");
  const strict = rankDestinations(catalog, cleaned);
  if (strict.length) return strict;
  // Spoken or model-written names add words the map lacks ("PCL at UT
  // Austin", "Gregory Gym entrance"): keep the words the map knows.
  const known = words(cleaned).filter((w) =>
    searchVariants(w).some((v) => catalog.some((d) => d.search.includes(v))),
  );
  return known.length && known.length < words(cleaned).length
    ? rankDestinations(catalog, known.join(" "))
    : [];
}

function matchPlace(places: PlaceHeat[], query: string) {
  const terms = words(query);
  return places
    .map((p) => ({
      p,
      score:
        terms.filter((t) => p.name.toLowerCase().includes(t)).length /
        Math.max(1, terms.length),
    }))
    .filter((m) => m.score >= 0.5)
    .sort((a, b) => b.score - a.score)[0]?.p;
}

const deg = (c: number) => Math.round(toF(c));
const summary = (p: PlaceHeat) => ({
  name: p.name,
  kind: p.kind,
  feels_like_f: deg(p.feelsLikeC),
  in_sun_f: deg(p.sunFeelsC),
  in_shade_f: deg(p.shadeFeelsC),
  shaded_percent: Math.round(p.shade * 100),
});

function envAt(host: ToolHost, h?: number): Environment {
  if (h === undefined) return host.env;
  // The forecast for that hour, or hand-set weather following the day.
  return weatherAt(
    host.env,
    atLocalHour(host.env.dateTime, host.world.timezone, h),
    host.forecast,
    host.world.timezone,
  );
}

/** Tools the browser can run, with their argument schemas. */
export const TOOL_NAMES = Object.keys(schemas);
export const toolSchema = (name: string) =>
  Object.hasOwn(schemas, name)
    ? schemas[name as keyof typeof schemas]
    : undefined;

const walkComparisons = new WeakMap<
  World,
  Map<string, Awaited<ReturnType<typeof coolWalkability>>>
>();

/** Runs one tool call and returns a JSON-safe result for the model. */
export async function runTool(
  host: ToolHost,
  name: string,
  rawArgs: string,
): Promise<unknown> {
  if (!(name in schemas)) return { error: `Unknown tool ${name}.` };
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { error: "Arguments were not valid JSON." };
  }
  const parsed = schemas[name as keyof typeof schemas].safeParse(args);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const a = parsed.data as Record<string, never>;
  switch (name) {
    case "find_places": {
      const found = matchDestinations(host.catalog, a.query).slice(0, 8);
      const heat = placeHeat(host.world, host.env)
        .filter((p) =>
          words(a.query).some((t) => p.name.toLowerCase().includes(t)),
        )
        .slice(0, 5);
      return {
        walk_points: found.map((d) => ({ name: d.label, detail: d.detail })),
        streets_and_parks: heat.map((p) => p.name),
      };
    }
    case "plan_route": {
      const args = a as unknown as z.infer<typeof schemas.plan_route>;
      const mine = /my (current )?location|here|me$/i.test(args.from);
      // Without a location fix, "my location" means the walk's current start.
      const fromWalk =
        mine && !host.myLocationNodeId
          ? (host.currentStartNodeId ?? null)
          : null;
      const start = mine
        ? (host.myLocationNodeId ?? fromWalk)
        : matchDestinations(host.catalog, args.from)[0]?.id;
      const end = matchDestinations(host.catalog, args.to)[0]?.id;
      if (!start)
        return {
          error: /location|here/i.test(args.from)
            ? "Location is not available; ask the person to tap 'Use my location' or name a start."
            : `No start matching "${args.from}".`,
        };
      if (!end) return { error: `No destination matching "${args.to}".` };
      const env = envAt(host, args.leave_at_hour);
      const preference = args.preference ?? "shade";
      const avoidStairs = args.avoid_stairs ?? false;
      const options = compareRoutes(host.world, start, end, {
        avoidStairs,
        allowHypothetical: false,
        maxDetour: 1.8,
        environment: env,
        coolStops: openCoolStops(host.world, env),
        sunAversion: host.sunAversion,
      });
      if (!options.quickest)
        return { error: "Those places are not connected by mapped paths." };
      host.showRoute({
        start,
        end,
        preference,
        avoidStairs,
        dateTime: env.dateTime,
      });
      const name = (id: string) =>
        host.catalog.find((d) => d.id === id)?.label ?? id;
      const stress = heatStress(env, host.world.origin);
      // After dark, shade means nothing: no heat check (as in the app).
      const advice =
        stress && sunDirection(env, host.world.origin).altitude > 0
          ? routeAdvice(options, preference, stress, ROUTE_NAMES)
          : null;
      // Mapped interiors closed at this hour: routes walk around them.
      const closed = (host.world.indoor ?? []).flatMap((i) => {
        const status = hoursStatus(
          i.hours,
          new Date(env.dateTime),
          host.world.timezone,
        );
        return status && !status.open
          ? [{ building: i.buildingName, hours: status.label }]
          : [];
      });
      return {
        from: name(start),
        ...(fromWalk
          ? {
              note: "Location isn't available, so this starts from the walk's current start on the map; say so.",
            }
          : {}),
        to: name(end),
        leaving: clockLabel(env.dateTime, host.world.timezone),
        shown_on_map: preference,
        options: routePreferences.flatMap((p) => {
          const r = options[p];
          if (!r) return [];
          const heat = routeHeat(r, env, host.world.origin);
          return [
            {
              preference: p,
              minutes: Math.max(1, Math.round(r.durationMinutes)),
              meters: Math.round(r.distance),
              shaded_percent: Math.round(r.shadeFraction * 100),
              minutes_in_sun: Math.round(heat.sunMinutes),
              ...(r.coolStop
                ? { cool_stop: r.coolStop, cool_stop_hours: "not verified" }
                : {}),
              ...(r.waterStops
                ? { water_fountains_on_route: r.waterStops }
                : {}),
              ...(r.stepFreeGap
                ? {
                    step_free_gap_m: r.stepFreeGap,
                    step_free_note:
                      "No step-free path from the exact points: this walk starts and/or ends this many metres away (included in minutes and meters). Say so.",
                  }
                : {}),
              feels_like_f: deg(heat.feelsLikeC),
              ...(stress
                ? {
                    heat_stress_utci:
                      UTCI_BANDS[utciBand(walkUtci(stress, r.shadeFraction))]
                        .label,
                  }
                : {}),
            },
          ];
        }),
        ...(advice?.tips.length
          ? {
              heat_check: advice.tips,
              heat_check_note:
                "Steps for the walk shown on the map; pass them on briefly. Guidance, not medical advice.",
            }
          : {}),
        ...(closed.length
          ? {
              closed_buildings: closed,
              closed_note:
                "These mapped buildings are closed at this hour: routes go around them unless the walk starts or ends inside one.",
            }
          : {}),
      };
    }
    case "heat_ranking": {
      const env = envAt(host, a.hour);
      if (a.hour !== undefined) host.setDateTime(env.dateTime);
      const places = placeHeat(host.world, env);
      const limit = (a.limit as number | undefined) ?? 5;
      return {
        at: clockLabel(env.dateTime, host.world.timezone),
        hottest: places.slice(0, limit).map(summary),
        coolest: places.slice(-limit).reverse().map(summary),
      };
    }
    case "place_heat": {
      const env = envAt(host, a.hour);
      const place = matchPlace(placeHeat(host.world, env), a.place);
      if (!place) return { error: `No street or park matching "${a.place}".` };
      if (a.hour !== undefined) host.setDateTime(env.dateTime);
      host.highlightPlace(place.id);
      const profile = dailyProfile(
        host.world,
        env,
        place,
        env.weatherMode === "forecast" ? host.forecast : null,
      );
      const byHeat = [...profile].sort((x, y) => y.feelsLikeC - x.feelsLikeC);
      return {
        at: clockLabel(env.dateTime, host.world.timezone),
        ...summary(place),
        hottest_hour: byHeat[0] && {
          hour: byHeat[0].hour,
          feels_like_f: deg(byHeat[0].feelsLikeC),
        },
        coolest_daytime_hour: byHeat.at(-1) && {
          hour: byHeat.at(-1)!.hour,
          feels_like_f: deg(byHeat.at(-1)!.feelsLikeC),
        },
      };
    }
    case "best_time_to_leave": {
      const args = a as unknown as z.infer<typeof schemas.best_time_to_leave>;
      const mine = /my (current )?location|here|me$/i.test(args.from);
      // Without a location fix, "my location" means the walk's current start.
      const fromWalk =
        mine && !host.myLocationNodeId
          ? (host.currentStartNodeId ?? null)
          : null;
      const start = mine
        ? (host.myLocationNodeId ?? fromWalk)
        : matchDestinations(host.catalog, args.from)[0]?.id;
      const end = matchDestinations(host.catalog, args.to)[0]?.id;
      if (!start) return { error: `No start matching "${args.from}".` };
      if (!end) return { error: `No destination matching "${args.to}".` };
      const preference = args.preference ?? "shade";
      // Plan for the real day and time, not the hour the clock shows.
      const nowIso = host.now?.() ?? new Date().toISOString();
      // Now, with hand-set weather moved along the day's cycle to this hour.
      const planEnv = scenarioAt(host.env, nowIso, host.world.timezone);
      const options = compareRoutes(host.world, start, end, {
        avoidStairs: false,
        allowHypothetical: false,
        maxDetour: 1.8,
        environment: planEnv,
        coolStops: openCoolStops(host.world, planEnv),
        sunAversion: host.sunAversion,
      });
      const r = options[preference] ?? options.quickest;
      if (!r)
        return { error: "Those places are not connected by mapped paths." };
      const plan = bestTimeToLeave(
        host.world,
        planEnv,
        r,
        host.env.weatherMode === "forecast" ? host.forecast : null,
        nowIso,
      );
      host.showRoute({
        start,
        end,
        preference: r.preference,
        avoidStairs: false,
        dateTime: host.env.dateTime,
      });
      const at = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
      const tz = host.world.timezone;
      const hourNow = Math.floor(localHour(nowIso, tz));
      // "Now" only means something during today's walking hours.
      const nowCounts = plan.dayOffset === 0 && hourNow >= 6 && hourNow <= 20;
      return {
        ...(fromWalk
          ? {
              note: "Location isn't available, so this starts from the walk's current start on the map; say so.",
            }
          : {}),
        route: r.preference,
        minutes: Math.max(1, Math.round(r.durationMinutes)),
        weather:
          host.env.weatherMode === "forecast"
            ? "live forecast"
            : "the scenario on the Climate tab (not live)",
        day: plan.dayOffset ? "tomorrow" : "today",
        date: new Date(
          Date.parse(nowIso) + plan.dayOffset * 86_400_000,
        ).toLocaleDateString("en-US", {
          timeZone: tz,
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        best: {
          leave_at: at(plan.best.hour),
          feels_like_f: deg(plan.best.feelsLikeC),
          shaded_percent: Math.round(plan.best.shade * 100),
        },
        ...(nowCounts
          ? {
              now: {
                hour: at(plan.now.hour),
                feels_like_f: deg(plan.now.feelsLikeC),
              },
              cooler_than_now_f: plan.savingF,
            }
          : {}),
        by_hour: plan.hours.map((h) => ({
          leave_at: at(h.hour),
          feels_like_f: deg(h.feelsLikeC),
        })),
      };
    }
    case "compare_walks": {
      const env = envAt(host, a.hour as number | undefined);
      const scene = host.scene ?? host.world;
      // The same sample as the Data & Sources card, cached per map and hour.
      const key = `${scene.id}|${env.dateTime}|${host.sunAversion ?? ""}`;
      let r = walkComparisons.get(scene)?.get(key);
      if (r === undefined) {
        r = await coolWalkability(scene, env, {
          sunAversion: host.sunAversion,
        });
        if (!walkComparisons.has(scene)) walkComparisons.set(scene, new Map());
        walkComparisons.get(scene)!.set(key, r);
      }
      if (!r) return { error: "This map has no connected walks to compare." };
      if (r.quickShare >= 0.999)
        return {
          at: clockLabel(env.dateTime, host.world.timezone),
          note: "No sun on these walks at this hour (after dark or fully shaded), so there is nothing for shade routing to avoid. Try a daytime hour.",
        };
      return {
        at: clockLabel(env.dateTime, host.world.timezone),
        sample_walks: r.walks,
        sun_avoided_percent: r.score,
        shaded_percent_quickest: Math.round(r.quickShare * 100),
        shaded_percent_shade_route: Math.round(r.shadeShare * 100),
        sun_minutes_saved_per_walk: Math.round(r.sunMinutesSaved * 10) / 10,
        extra_distance_percent: Math.max(0, Math.round(r.extraDistance * 100)),
      };
    }
    case "set_time": {
      const env = envAt(host, a.hour);
      host.setDateTime(env.dateTime);
      return { now_showing: clockLabel(env.dateTime, host.world.timezone) };
    }
    case "build_area":
      return { result: await host.buildArea(a.place) };
    case "generate_city":
      return {
        result: await host.generateCity(a.description, a.realism ?? "detailed"),
      };
    case "set_building_hours": {
      const args = a as unknown as z.infer<typeof schemas.set_building_hours>;
      const scene = host.scene ?? host.world;
      // The building asked for: an exact name first, then the longest
      // name the request contains, then the one name containing it.
      const fold = (t: string) =>
        t
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      // Whole words only: "Art" isn't in "Smart Hall".
      const within = (outer: string, inner: string) =>
        ` ${outer} `.includes(` ${inner} `);
      const asked = searchVariants(args.building)
        .map(fold)
        .filter((v) => v.length >= 3);
      const all = scene.indoor ?? [];
      const named = (i: (typeof all)[number]) => fold(i.buildingName);
      const inRequest = all
        .filter((i) => asked.some((w) => within(w, named(i))))
        .sort((x, y) => named(y).length - named(x).length);
      const containing = all.filter((i) =>
        asked.some((w) => within(named(i), w)),
      );
      if (
        !all.some((i) => asked.includes(named(i))) &&
        !inRequest.length &&
        containing.length > 1
      )
        return {
          error: `"${args.building}" could be ${containing.map((i) => i.buildingName).join(" or ")}; ask which.`,
        };
      const inside =
        all.find((i) => asked.includes(named(i))) ??
        inRequest[0] ??
        containing[0];
      if (!inside)
        return {
          error: `No building with a mapped inside matches "${args.building}". Its floor plan has to be imported first (select the building in the Design studio).`,
        };
      const text = args.hours.trim();
      if (text && !parseOpeningHours(text))
        return {
          error: `Those hours ("${text}") aren't OpenStreetMap opening_hours syntax this app can read. Use day ranges and times like "Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off".`,
        };
      if (!host.setBuildingHours)
        return { error: "Hours can't be changed from here." };
      host.setBuildingHours(inside.buildingId, text || null);
      const status = hoursStatus(
        text,
        new Date(host.env.dateTime),
        host.world.timezone,
      );
      return {
        building: inside.buildingName,
        hours: text || "cleared (treated as open)",
        ...(status ? { at_the_time_shown: status.label } : {}),
        note: "Walks now go around it while it's closed, unless they start or end inside.",
      };
    }
    case "plant_shade_trees": {
      // Edit the saved scene, never the copy split at the walker's location.
      const scene = host.scene ?? host.world;
      const place = matchPlace(
        placeHeat(scene, host.env).filter((p) => p.kind === "street"),
        a.street,
      );
      if (!place) return { error: `No street or path matching "${a.street}".` };
      const result = plantShadeRow(scene, place.edgeIds[0]);
      if (!result)
        return { error: `${place.name} already has trees all along it.` };
      const ids = new Set(result.edgeIds);
      const before = areaHeat(scene, edgeHeatMap(scene, host.env), ids)!;
      const after = areaHeat(
        result.world,
        edgeHeatMap(result.world, host.env),
        ids,
      )!;
      host.applyPlanting(result, scene);
      return {
        street: result.street,
        trees_planted: result.planted,
        at: clockLabel(host.env.dateTime, host.world.timezone),
        shaded_percent: [
          Math.round(before.shade * 100),
          Math.round(after.shade * 100),
        ],
        feels_like_f: [deg(before.feelsLikeC), deg(after.feelsLikeC)],
        note: "Shown in the Design studio; the person can undo it.",
      };
    }
    case "plan_tree_planting": {
      const scene = host.scene ?? host.world;
      const plan = await treePriorities(scene, host.env, {
        top: a.count ?? 3,
      });
      if (!plan?.streets.length)
        return {
          error:
            "No sunny, well-walked street to plant at this hour (try an afternoon hour).",
        };
      host.highlightPlace(`street:${plan.streets[0].street}`);
      return {
        at: clockLabel(host.env.dateTime, host.world.timezone),
        walks_sampled: plan.walks,
        streets: plan.streets.map((s) => ({
          street: s.street,
          share_of_walks_percent: Math.round(s.walkShare * 100),
          shaded_percent_now: Math.round(s.shadeNow * 100),
          shaded_percent_with_trees: Math.round(s.shadeAfter * 100),
          trees: s.trees,
          sun_minutes_saved_per_100_walks: Math.round(s.sunMinutesSavedPer100),
        })),
        note: "The top street is highlighted on the map.",
      };
    }
    case "my_walks":
      return host.walker?.() ?? { learning_off: true };
    case "cool_refuges": {
      const coverage = refugeCoverage(
        host.world,
        findRefuges(host.world, host.env),
      );
      if (!coverage)
        return {
          error:
            "No cool refuges known here at this hour (cool stops are listed for the six campuses in the daytime).",
        };
      return {
        at: clockLabel(host.env.dateTime, host.world.timezone),
        refuges: coverage.refuges.map((r) => ({
          name: r.name,
          kind: r.kind,
        })),
        paths_within_5_min_percent: Math.round(coverage.within[0] * 100),
        paths_within_10_min_percent: Math.round(coverage.within[1] * 100),
        farthest_streets: coverage.gaps.map((g) => ({
          street: g.street,
          walk_minutes: Math.round(g.minutes),
        })),
        note: "Cool-stop opening hours are not verified.",
      };
    }
    case "propose_design":
      return { result: await host.proposeDesign(a.request) };
  }
  return { error: `Unknown tool ${name}.` };
}
