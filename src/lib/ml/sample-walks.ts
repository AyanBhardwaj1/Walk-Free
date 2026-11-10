import type { World } from "../../../shared/types.js";
import { toLatLon } from "../geo.js";
import { planRoutes } from "../routing.js";
import { pickStops } from "../day-plan.js";
import { seeded } from "./mlp.js";
import type { LoggedWalk, TracePoint } from "../walk-log.js";

/**
 * Three weeks of believable sample walks on this map, for trying the
 * learning features before you've walked with Walk-Free: home to a morning
 * class, class to lunch, lunch to an afternoon class, and back home, on
 * weekdays, along real paths. The sample walker slows in the heat and is
 * brisker in the morning, so the pace model has something to find. Every
 * sample walk is marked as one and is never mixed with real walks.
 */
export function sampleWalks(
  world: World,
  now = Date.now(),
  hints?: Parameters<typeof pickStops>[1],
): LoggedWalk[] {
  const stops = pickStops(world, hints);
  if (!stops) return [];
  const rand = seeded(1729);
  const noise = () => (rand() - 0.5) * 8; // ±4 m GPS wobble
  const legs: [string, string, number][] = [
    // [from, to, arrival minute of the day]
    [stops.home.id, stops.work.id, 9 * 60 + 50],
    [stops.work.id, stops.lunch.id, 12 * 60 + 10],
    [stops.lunch.id, stops.errand.id, 13 * 60 + 50],
    [stops.errand.id, stops.home.id, 17 * 60 + 30],
  ];
  const routes = new Map<string, [number, number][]>();
  for (const [a, b] of legs) {
    const key = `${a}>${b}`;
    if (routes.has(key)) continue;
    const r = planRoutes(
      world,
      a,
      b,
      {
        avoidStairs: false,
        allowHypothetical: false,
        maxDetour: 1.8,
        environment: {
          dateTime: new Date(now).toISOString(),
          temperatureC: 30,
          humidity: 45,
          windMps: 2,
          cloudCover: 10,
          weatherMode: "scenario",
        },
      },
      ["quickest"] as const,
    ).quickest;
    if (r && r.points.length > 1) routes.set(key, r.points);
  }
  const walks: LoggedWalk[] = [];
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  for (let back = 21; back >= 1; back--) {
    const day = new Date(midnight);
    day.setDate(day.getDate() - back);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    for (const [a, b, arrive] of legs) {
      const path = routes.get(`${a}>${b}`);
      if (!path) continue;
      const hour = arrive / 60;
      // Feels-like through the day: cool morning, hot mid-afternoon.
      const feels =
        24 + 11 * Math.max(0, Math.sin(((hour - 9) / 12) * Math.PI));
      // The sample walker: 1.3 m/s, slower in heat, brisker before 11.
      const speed =
        (1.3 - 0.018 * Math.max(0, feels - 26) + (hour < 11 ? 0.08 : 0)) *
        (0.95 + rand() * 0.1);
      const length = path
        .slice(1)
        .reduce(
          (s, p, i) => s + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]),
          0,
        );
      // Arrive a few minutes either side of the usual time.
      const end = day.getTime() + (arrive + (rand() - 0.5) * 12) * 60_000;
      const start = end - (length / speed) * 1000;
      const points: TracePoint[] = [];
      let walked = 0;
      for (let i = 0; i < path.length; i++) {
        if (i) {
          walked += Math.hypot(
            path[i][0] - path[i - 1][0],
            path[i][1] - path[i - 1][1],
          );
        }
        const at = toLatLon(
          [path[i][0] + noise(), path[i][1] + noise()],
          world.origin,
        );
        points.push({
          ...at,
          t: Math.round(start + (walked / speed) * 1000),
          acc: 6,
        });
      }
      walks.push({
        id: `sample-${day.getTime()}-${a}-${b}`,
        area: world.id,
        points,
        weather: {
          temperatureC: feels - 2,
          humidity: 45,
          cloudCover: 10,
          feelsLikeC: feels,
        },
        sample: true,
      });
    }
  }
  return walks;
}
