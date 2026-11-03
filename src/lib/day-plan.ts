import type {
  Environment,
  Point,
  RouteResult,
  World,
} from "../../shared/types.js";
import { destinationCatalog, type Destination } from "./destinations.js";
import { planRoutes } from "./routing.js";
import { atLocalHour, routeHeat, scenarioAt } from "./heat.js";
import { seededRng } from "./fiction-cities/kit.js";
import { matchDestinations } from "./assistant-tools.js";

/** Place names to use for each stop, when the area has real favourites. */
export type DayHints = Partial<Record<DayStop["role"], string>>;

/** One stop in a simulated day. */
export interface DayStop {
  role: "home" | "coffee" | "work" | "lunch" | "errand";
  id: string;
  label: string;
}
export interface DayLeg {
  from: DayStop;
  to: DayStop;
  /** Local hour the walk starts. */
  hour: number;
  dateTime: string;
  title: string;
  route: RouteResult;
  /** Quickest route at the same hour, for comparison. */
  quickest: RouteResult | null;
  feelsLikeC: number;
  quickFeelsLikeC: number | null;
  sunMinutes: number;
  quickSunMinutes: number | null;
}
export interface DayPlan {
  legs: DayLeg[];
  walkMinutes: number;
  sunMinutes: number;
  /** Minutes in the sun the quickest routes would have meant. */
  quickSunMinutes: number;
  hottest: DayLeg | null;
}

const SCHEDULE: {
  from: DayStop["role"];
  to: DayStop["role"];
  hour: number;
  title: string;
}[] = [
  { from: "home", to: "coffee", hour: 8, title: "Morning coffee" },
  { from: "coffee", to: "work", hour: 8.5, title: "To work" },
  { from: "work", to: "lunch", hour: 12.5, title: "Lunch outside" },
  { from: "lunch", to: "work", hour: 13.25, title: "Back to work" },
  { from: "work", to: "errand", hour: 17.5, title: "An errand" },
  { from: "errand", to: "home", hour: 18.25, title: "Home" },
];
const WORDS: Record<Exclude<DayStop["role"], "home">, RegExp> = {
  coffee:
    /caf[eé]|coffee|bakery|market|kiosk|union|bazaar|souk|deli|tea|bistro/i,
  work: /hall|tower|library|office|works|building|centre|center|institute|station|plaza|lab|exchange|clarion|precinct|museum/i,
  lunch: /park|garden|green|square|plaza|court|lawn|oasis|terrace|mall|quad/i,
  errand: /store|shop|market|post|gym|clinic|bank|station|museum|gallery/i,
};

/**
 * Stops for an ordinary day: work near the middle, home a walk away,
 * coffee between them, lunch in green space near work and one errand.
 * Deterministic for a world, so the same day replays the same way.
 */
export function pickStops(
  world: World,
  hints: DayHints = {},
): Record<DayStop["role"], DayStop> | null {
  const named = pickNamed(world, hints);
  if (named) return named;
  const point = new Map(world.graph.nodes.map((n) => [n.id, n.point]));
  const seen = new Set<string>();
  const places = destinationCatalog(world).filter((d) => {
    if (!point.has(d.id) || seen.has(d.label)) return false;
    if (!d.keys.some((k) => k.place)) return false;
    seen.add(d.label);
    return true;
  });
  if (places.length < 4) return null;
  const at = (d: Destination) => point.get(d.id)!;
  const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rng = seededRng(`day:${world.id}`);
  const stop = (role: DayStop["role"], d: Destination): DayStop => ({
    role,
    id: d.id,
    label: d.label,
  });
  const centre: Point = [0, 0];
  const byCentre = [...places].sort(
    (a, b) => dist(at(a), centre) - dist(at(b), centre),
  );
  const work =
    byCentre.slice(0, 25).find((d) => WORDS.work.test(d.label)) ?? byCentre[0];
  const reach = world.extent * 0.45;
  const home =
    [...places]
      .filter((d) => d !== work)
      .map((d) => ({ d, k: dist(at(d), at(work)) }))
      .filter(({ k }) => k > 250 && k < reach)
      .sort((a, b) => b.k - a.k)[0]?.d ?? places.find((d) => d !== work)!;
  const used = new Set([work.id, home.id]);
  const pick = (
    role: Exclude<DayStop["role"], "home" | "work">,
    score: (d: Destination) => number,
  ) => {
    const pool = places.filter((d) => !used.has(d.id));
    const ranked = pool
      .map((d) => ({
        d,
        s: score(d) - (WORDS[role].test(d.label) ? 400 : 0) + rng() * 40,
      }))
      .sort((a, b) => a.s - b.s);
    const chosen = ranked[0]?.d ?? pool[0] ?? work;
    used.add(chosen.id);
    return chosen;
  };
  const mid: Point = [
    (at(home)[0] + at(work)[0]) / 2,
    (at(home)[1] + at(work)[1]) / 2,
  ];
  const coffee = pick("coffee", (d) => dist(at(d), mid));
  const lunch = pick("lunch", (d) => Math.abs(dist(at(d), at(work)) - 250));
  const errand = pick("errand", (d) => Math.abs(dist(at(d), at(work)) - 500));
  return {
    home: stop("home", home),
    work: stop("work", work),
    coffee: stop("coffee", coffee),
    lunch: stop("lunch", lunch),
    errand: stop("errand", errand),
  };
}

/** The hinted stops, if every one of them is on this map. */
function pickNamed(world: World, hints: DayHints) {
  const roles: DayStop["role"][] = [
    "home",
    "coffee",
    "work",
    "lunch",
    "errand",
  ];
  if (!roles.every((r) => hints[r])) return null;
  const catalog = destinationCatalog(world);
  const out = {} as Record<DayStop["role"], DayStop>;
  for (const role of roles) {
    const d = matchDestinations(catalog, hints[role]!)[0];
    if (!d) return null;
    out[role] = { role, id: d.id, label: d.label };
  }
  return new Set(roles.map((r) => out[r].id)).size === roles.length
    ? out
    : null;
}

/** Plans each walk of the day at its own hour, in shade where it can. */
export function planDay(
  world: World,
  env: Environment,
  options: {
    avoidStairs?: boolean;
    sunAversion?: number;
    hints?: DayHints;
  } = {},
): DayPlan | null {
  const stops = pickStops(world, options.hints);
  if (!stops) return null;
  const legs: DayLeg[] = [];
  for (const s of SCHEDULE) {
    const from = stops[s.from],
      to = stops[s.to];
    if (from.id === to.id) continue;
    const dateTime = atLocalHour(env.dateTime, world.timezone, s.hour);
    // Hand-set weather follows the day: a 6 PM walk is cooler than 3 PM.
    const at: Environment = scenarioAt(env, dateTime, world.timezone);
    const plans = planRoutes(
      world,
      from.id,
      to.id,
      {
        avoidStairs: options.avoidStairs ?? false,
        allowHypothetical: false,
        maxDetour: 2,
        environment: at,
        sunAversion: options.sunAversion,
      },
      ["quickest", "shade"] as const,
    );
    const route = plans.shade ?? plans.quickest;
    if (!route) continue;
    const heat = routeHeat(route, at, world.origin);
    const quick = plans.quickest && routeHeat(plans.quickest, at, world.origin);
    legs.push({
      from,
      to,
      hour: s.hour,
      dateTime,
      title: s.title,
      route,
      quickest: plans.quickest,
      feelsLikeC: heat.feelsLikeC,
      quickFeelsLikeC: quick?.feelsLikeC ?? null,
      sunMinutes: heat.sunMinutes,
      quickSunMinutes: quick?.sunMinutes ?? null,
    });
  }
  if (!legs.length) return null;
  const sum = (f: (l: DayLeg) => number) =>
    legs.reduce((total, l) => total + f(l), 0);
  return {
    legs,
    walkMinutes: sum((l) => l.route.durationMinutes),
    sunMinutes: sum((l) => l.sunMinutes),
    quickSunMinutes: sum((l) => l.quickSunMinutes ?? l.sunMinutes),
    hottest: legs.reduce<DayLeg | null>(
      (h, l) => (!h || l.feelsLikeC > h.feelsLikeC ? l : h),
      null,
    ),
  };
}
