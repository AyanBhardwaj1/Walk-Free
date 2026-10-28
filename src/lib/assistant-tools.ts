import { z } from "zod";
import type {
  Environment,
  RoutePreference,
  WeatherForecast,
  World,
} from "../../shared/types.js";
import type { Destination } from "./destinations.js";
import { compareRoutes, routePreferences } from "./routing.js";
import {
  atLocalHour,
  clockLabel,
  dailyProfile,
  placeHeat,
  routeHeat,
  toF,
  type PlaceHeat,
} from "./heat.js";

/** What the assistant may read and change in the running app. */
export interface ToolHost {
  world: World;
  env: Environment;
  forecast: WeatherForecast | null;
  catalog: Destination[];
  myLocationNodeId: string | null;
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
  proposeDesign(request: string): Promise<string>;
}

const hour = z.number().min(0).max(23.99);
const schemas = {
  find_places: z.object({ query: z.string().min(1).max(120) }),
  plan_route: z.object({
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
    preference: z.enum(["quickest", "shade", "scenic", "indoors"]).optional(),
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
  build_area: z.object({ place: z.string().min(1).max(120) }),
  propose_design: z.object({ request: z.string().min(1).max(1000) }),
};

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

/** Best catalog matches: every word first, then the most words in common. */
export function matchDestinations(catalog: Destination[], query: string) {
  const terms = words(query);
  if (!terms.length) return [];
  const label = query.toLowerCase().trim();
  return catalog
    .map((d) => {
      const hits = terms.filter((t) => d.search.includes(t)).length;
      const exact = d.label.toLowerCase() === label ? 2 : 0;
      const starts = d.label.toLowerCase().startsWith(label) ? 1 : 0;
      return { d, score: hits / terms.length + exact + starts };
    })
    .filter((m) => m.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.d.label.length - b.d.label.length)
    .map((m) => m.d);
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
  return h === undefined
    ? host.env
    : {
        ...host.env,
        dateTime: atLocalHour(host.env.dateTime, host.world.timezone, h),
      };
}

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
      const start = /my (current )?location|here|me$/i.test(args.from)
        ? host.myLocationNodeId
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
      return {
        from: name(start),
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
              feels_like_f: deg(heat.feelsLikeC),
            },
          ];
        }),
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
    case "set_time": {
      const env = envAt(host, a.hour);
      host.setDateTime(env.dateTime);
      return { now_showing: clockLabel(env.dateTime, host.world.timezone) };
    }
    case "build_area":
      return { result: await host.buildArea(a.place) };
    case "propose_design":
      return { result: await host.proposeDesign(a.request) };
  }
  return { error: `Unknown tool ${name}.` };
}
