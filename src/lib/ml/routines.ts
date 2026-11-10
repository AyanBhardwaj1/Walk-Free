import {
  metres,
  smoothTrace,
  walkDistance,
  type LoggedWalk,
} from "../walk-log.js";

/**
 * Your places and routines, found in your own walks: where walks start and
 * end are clustered into places (home is where days begin and end), and
 * walks repeated between the same places at about the same time of day
 * become routines, which say when you'll probably leave next.
 */

export interface Place {
  id: string;
  lat: number;
  lon: number;
  visits: number;
  /** How often days start (first walk) or end (last walk) here. */
  dayEnds: number;
  label: string;
  home: boolean;
}

/** Walk ends within this distance are the same place. */
const PLACE_RADIUS_M = 90;
/** A repeated trip arrives within this many minutes of its usual time. */
const SAME_TIME_MIN = 45;

type Labeler = (lat: number, lon: number) => string | null;

const localDay = (t: number) => new Date(t).toDateString();
const minuteOfDay = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};

/** Greedy clustering of walk ends into places. */
export function findPlaces(walks: LoggedWalk[], label?: Labeler): Place[] {
  const places: (Place & { sumLat: number; sumLon: number })[] = [];
  const firstOfDay = new Set<string>(),
    lastOfDay = new Map<string, string>();
  const sorted = [...walks].sort((a, b) => a.points[0].t - b.points[0].t);
  const assign = (p: { lat: number; lon: number }) => {
    let best = places.find((c) => metres(c, p) <= PLACE_RADIUS_M);
    if (!best) {
      best = {
        id: `place-${places.length + 1}`,
        lat: p.lat,
        lon: p.lon,
        sumLat: 0,
        sumLon: 0,
        visits: 0,
        dayEnds: 0,
        label: "",
        home: false,
      };
      places.push(best);
    }
    best.visits++;
    best.sumLat += p.lat;
    best.sumLon += p.lon;
    best.lat = best.sumLat / best.visits;
    best.lon = best.sumLon / best.visits;
    return best;
  };
  for (const w of sorted) {
    const from = assign(w.points[0]);
    const to = assign(w.points.at(-1)!);
    const day = localDay(w.points[0].t);
    if (!firstOfDay.has(day)) {
      firstOfDay.add(day);
      from.dayEnds++;
    }
    lastOfDay.set(day, to.id);
  }
  for (const id of lastOfDay.values()) {
    const p = places.find((c) => c.id === id);
    if (p) p.dayEnds++;
  }
  const home = [...places].sort((a, b) => b.dayEnds - a.dayEnds)[0];
  if (home && home.dayEnds >= 3) home.home = true;
  return places
    .map(({ sumLat: _a, sumLon: _b, ...p }, i) => ({
      ...p,
      label:
        (p.home ? "Home" : "") || label?.(p.lat, p.lon) || `Place ${i + 1}`,
    }))
    .sort((a, b) => b.visits - a.visits);
}

export interface Routine {
  from: Place;
  to: Place;
  /** Weekdays it happens on (0 = Sunday). */
  days: number[];
  /** Usual arrival, minutes after midnight (local time). */
  arrival: number;
  /** Usual walk time, minutes, and distance walked, metres. */
  minutes: number;
  metres: number;
  times: number;
}

/** Repeated walks between the same places at about the same time. */
export function findRoutines(walks: LoggedWalk[], places: Place[]): Routine[] {
  const placeOf = (p: { lat: number; lon: number }) =>
    places.reduce<Place | null>(
      (best, c) =>
        metres(c, p) <= PLACE_RADIUS_M &&
        (!best || metres(c, p) < metres(best, p))
          ? c
          : best,
      null,
    );
  const groups = new Map<
    string,
    {
      from: Place;
      to: Place;
      trips: { day: number; arrive: number; mins: number; m: number }[];
    }
  >();
  for (const w of walks) {
    const from = placeOf(w.points[0]),
      to = placeOf(w.points.at(-1)!);
    if (!from || !to || from.id === to.id) continue;
    const key = `${from.id}>${to.id}`;
    const g = groups.get(key) ?? { from, to, trips: [] };
    const end = w.points.at(-1)!.t;
    g.trips.push({
      day: new Date(end).getDay(),
      arrive: minuteOfDay(end),
      mins: (end - w.points[0].t) / 60_000,
      m: walkDistance(smoothTrace(w.points)),
    });
    groups.set(key, g);
  }
  const routines: Routine[] = [];
  for (const g of groups.values()) {
    // Cluster arrival times; each cluster of 3+ trips is a routine.
    const sorted = [...g.trips].sort((a, b) => a.arrive - b.arrive);
    let cluster: typeof sorted = [];
    const flush = () => {
      if (cluster.length >= 3) {
        const arr = cluster.map((c) => c.arrive).sort((a, b) => a - b);
        const mins = cluster.map((c) => c.mins).sort((a, b) => a - b);
        const ms = cluster.map((c) => c.m).sort((a, b) => a - b);
        routines.push({
          from: g.from,
          to: g.to,
          days: [...new Set(cluster.map((c) => c.day))].sort(),
          arrival: arr[Math.floor(arr.length / 2)],
          minutes: mins[Math.floor(mins.length / 2)],
          metres: ms[Math.floor(ms.length / 2)],
          times: cluster.length,
        });
      }
      cluster = [];
    };
    for (const trip of sorted) {
      if (cluster.length && trip.arrive - cluster[0].arrive > SAME_TIME_MIN)
        flush();
      cluster.push(trip);
    }
    flush();
  }
  return routines.sort((a, b) => b.times - a.times);
}

export interface NextTrip {
  routine: Routine;
  /** When you'll want to arrive, ms since the epoch. */
  arriveBy: number;
}

/** One trip of a routine on one day, as a key (to step past it). */
export const tripKey = (r: Routine, arriveBy: number) =>
  `${r.from.id}>${r.to.id}@${arriveBy}`;

/**
 * The next time one of your routines comes round, within a week: after
 * Friday's last class, a weekday routine's next trip is Monday's.
 */
export function nextTrip(
  routines: Routine[],
  now = Date.now(),
  /** Trips (by tripKey) already ruled out, e.g. too late to leave for. */
  skip: ReadonlySet<string> = new Set(),
): NextTrip | null {
  let best: NextTrip | null = null;
  for (const r of routines)
    for (let ahead = 0; ahead <= 7; ahead++) {
      const day = new Date(now);
      day.setDate(day.getDate() + ahead);
      if (!r.days.includes(day.getDay())) continue;
      day.setHours(Math.floor(r.arrival / 60), r.arrival % 60, 0, 0);
      const t = day.getTime();
      // Still time to make it (the walk plus a few minutes to get ready).
      if (t - now < (r.minutes + 3) * 60_000 || skip.has(tripKey(r, t)))
        continue;
      if (!best || t < best.arriveBy) best = { routine: r, arriveBy: t };
    }
  return best;
}

/** When to set off to arrive on time, given a safe-side walk time. */
export function leaveBy(arriveBy: number, safeMinutes: number) {
  return arriveBy - Math.ceil(safeMinutes + 1) * 60_000;
}

/**
 * Minutes for a routine walk: the model's estimate, pulled toward how long
 * this exact trip has actually taken you (the more often, the harder).
 */
export function routineMinutes(routine: Routine, modelMinutes: number) {
  const k = 3;
  return (
    (routine.times * routine.minutes + k * modelMinutes) / (routine.times + k)
  );
}
