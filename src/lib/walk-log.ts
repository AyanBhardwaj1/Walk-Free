/**
 * Your walks, logged on this device only. While Walk-Free follows you (or
 * navigates), fixes are kept as a trace; pauses and gaps split the trace
 * into walks, which the pace, routine and profile models learn from.
 * Nothing here is sent to a server.
 */

export interface TracePoint {
  lat: number;
  lon: number;
  /** Milliseconds since the epoch. */
  t: number;
  /** Reported accuracy, metres. */
  acc: number;
}

/** Weather at the start of a walk, for the pace model. */
export interface WalkWeather {
  temperatureC: number;
  humidity: number;
  cloudCover: number;
  /** Feels-like in the shade, °C. */
  feelsLikeC: number;
}

export interface LoggedWalk {
  id: string;
  /** The area the walk was on (a campus slug or an area id). */
  area: string;
  points: TracePoint[];
  weather?: WalkWeather;
  /** The route option chosen, when the walk was navigated. */
  preference?: string;
  /** Made by "Try with sample walks"; never mixed with real ones. */
  sample?: boolean;
}

export interface WalkLog {
  version: 1;
  /** The person agreed to learning from their walks on this device. */
  learning: boolean;
  walks: LoggedWalk[];
  /** Fixes since the last finished walk. */
  open: TracePoint[];
  /** Area and weather of the open trace. */
  openArea?: string;
  openWeather?: WalkWeather;
  /** Route options chosen over the quickest, with the heat at the time. */
  choices?: { feelsLikeC: number; shade: boolean }[];
  /** A role the person picked ("auto" or absent: learned from walks). */
  role?: string;
  /** Remind the person when to leave for their next routine walk. */
  remind?: boolean;
}

export const emptyLog = (): WalkLog => ({
  version: 1,
  learning: false,
  walks: [],
  open: [],
});

/** Keep a fix only once it has moved this far, or this long has passed. */
const MIN_STEP_M = 6;
const MIN_STEP_MS = 20_000;
/** A gap this long ends a walk. */
const GAP_MS = 5 * 60_000;
/** Staying within this radius this long is a stop, not walking. */
const DWELL_M = 35;
const DWELL_MS = 3 * 60_000;
/** Walks shorter than this aren't worth learning from. */
const MIN_WALK_M = 120;
const MIN_WALK_MS = 90_000;
/** Fixes coarser than this are left out of the log. */
const MAX_ACCURACY_M = 60;
/** The log keeps at most this many walks, newest first out. */
export const MAX_WALKS = 400;
/** An imported walk keeps at most this many points (thinned evenly). */
export const MAX_IMPORT_POINTS = 2000;
/** Largest walks file read, bytes. */
export const MAX_IMPORT_BYTES = 5e6;

const R = 6_371_000;
/** Metres between two points (equirectangular; fine at walking scale). */
export function metres(a: { lat: number; lon: number }, b: typeof a) {
  const x =
    ((b.lon - a.lon) *
      Math.PI *
      R *
      Math.cos(((a.lat + b.lat) * Math.PI) / 360)) /
    180;
  const y = ((b.lat - a.lat) * Math.PI * R) / 180;
  return Math.hypot(x, y);
}

/**
 * A 3-point moving average: GPS wobble zigzags a trace and inflates its
 * length, so distances and speeds are measured on the smoothed trace.
 */
export function smoothTrace<T extends { lat: number; lon: number }>(
  pts: T[],
): T[] {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    return {
      ...p,
      lat: (pts[i - 1].lat + p.lat + pts[i + 1].lat) / 3,
      lon: (pts[i - 1].lon + p.lon + pts[i + 1].lon) / 3,
    };
  });
}

export function walkDistance(points: TracePoint[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += metres(points[i - 1], points[i]);
  return d;
}

export const walkDuration = (points: TracePoint[]) =>
  points.length > 1 ? points.at(-1)!.t - points[0].t : 0;

/**
 * Adds a fix to the open trace (thinned by distance and time), closing a
 * walk first if a long gap passed. Returns a new log.
 */
export function addFix(
  log: WalkLog,
  fix: TracePoint,
  area: string,
  weather?: WalkWeather,
): WalkLog {
  if (!log.learning || fix.acc > MAX_ACCURACY_M) return log;
  let next = log;
  const last = log.open.at(-1);
  if (last && (fix.t - last.t > GAP_MS || log.openArea !== area))
    next = closeOpen(next, fix.t, true);
  const tail = next.open.at(-1);
  if (tail && metres(tail, fix) < MIN_STEP_M && fix.t - tail.t < MIN_STEP_MS)
    return next;
  return {
    ...next,
    open: [...next.open, fix],
    openArea: area,
    openWeather: next.open.length ? next.openWeather : weather,
  };
}

/**
 * Splits the open trace into walks at stops (a dwell of 3+ minutes) and
 * keeps the real walks. With `force`, everything left closes too (the
 * person stopped following, or the trace is stale).
 */
export function closeOpen(
  log: WalkLog,
  now = Date.now(),
  force = false,
): WalkLog {
  if (!log.open.length) return log;
  const pieces = splitAtStops(log.open);
  // Unless forced, the last piece may still be in progress.
  const stale = now - log.open.at(-1)!.t > GAP_MS;
  const done = force || stale ? pieces : pieces.slice(0, -1);
  const keep = force || stale ? [] : (pieces.at(-1) ?? []);
  const walks = done
    .filter(
      (p) => walkDistance(p) >= MIN_WALK_M && walkDuration(p) >= MIN_WALK_MS,
    )
    .map((points): LoggedWalk => ({
      id: `walk-${points[0].t}`,
      area: log.openArea ?? "unknown",
      points,
      weather: log.openWeather,
    }));
  return {
    ...log,
    walks: [...log.walks, ...walks].slice(-MAX_WALKS),
    open: keep,
    openArea: keep.length ? log.openArea : undefined,
    openWeather: keep.length ? log.openWeather : undefined,
  };
}

/** Cuts a trace wherever the walker stayed put for a while. */
export function splitAtStops(points: TracePoint[]): TracePoint[][] {
  const pieces: TracePoint[][] = [];
  let current: TracePoint[] = [];
  let i = 0;
  while (i < points.length) {
    // Does a dwell start here?
    let j = i;
    while (j + 1 < points.length && metres(points[i], points[j + 1]) <= DWELL_M)
      j++;
    if (points[j].t - points[i].t >= DWELL_MS) {
      if (current.length) current.push(points[i]);
      if (current.length > 1) pieces.push(current);
      current = [points[j]];
      i = j + 1;
      continue;
    }
    current.push(points[i]);
    i++;
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

/* ------------------------------- storage -------------------------------- */

const key = (account: string) => `walk-free-walklog:${account}`;

export function loadLog(account: string): WalkLog {
  try {
    const raw = localStorage.getItem(key(account));
    const parsed = raw ? (JSON.parse(raw) as WalkLog) : null;
    return parsed?.version === 1 && Array.isArray(parsed.walks)
      ? parsed
      : emptyLog();
  } catch {
    return emptyLog();
  }
}

/** Saves the log; false when storage is full or blocked (the log then
 * lives for this visit only). */
export function saveLog(account: string, log: WalkLog) {
  try {
    localStorage.setItem(key(account), JSON.stringify(log));
    return true;
  } catch {
    return false;
  }
}

export function deleteLog(account: string) {
  try {
    localStorage.removeItem(key(account));
  } catch {
    /* Nothing to remove. */
  }
}

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Walks from an exported file ("Export my walks"), merged into the log:
 * every field checked, walks already here (same id) skipped, samples
 * never imported, and the newest MAX_WALKS kept. Nothing in the file is
 * trusted beyond these shapes.
 */
export function importWalks(
  log: WalkLog,
  data: unknown,
): { log: WalkLog; added: number; skipped: number; dropped: number } {
  if (!Array.isArray(data)) throw Error("That file isn't a list of walks.");
  // Sample walks never mix with real ones: an import replaces them.
  const own = log.walks.filter((w) => !w.sample);
  const have = new Set(own.map((w) => w.id));
  // Nothing from the future (a wrong clock, or a doctored file).
  const latest = Date.now() + 24 * 3600_000;
  const fresh: LoggedWalk[] = [];
  // Past twice the limit, the rest is counted as skipped, not read.
  let skipped = Math.max(0, data.length - MAX_WALKS * 2);
  for (const raw of data.slice(0, MAX_WALKS * 2)) {
    const w = raw as Partial<LoggedWalk> | null;
    const points = Array.isArray(w?.points)
      ? w!.points
          .filter(
            (p) =>
              p &&
              num(p.lat, -90, 90) &&
              num(p.lon, -180, 180) &&
              num(p.t, 0, latest) &&
              num(p.acc, 0, 10_000),
          )
          .map((p) => ({ lat: p.lat, lon: p.lon, t: p.t, acc: p.acc }))
      : [];
    const ok =
      w &&
      typeof w.id === "string" &&
      w.id.length <= 100 &&
      typeof w.area === "string" &&
      w.area.length <= 200 &&
      !w.sample &&
      points.length >= 2;
    if (!ok || have.has(w!.id!)) {
      skipped++;
      continue;
    }
    const weather =
      w!.weather &&
      num(w!.weather.temperatureC, -60, 70) &&
      num(w!.weather.humidity, 0, 100) &&
      num(w!.weather.cloudCover, 0, 100) &&
      num(w!.weather.feelsLikeC, -80, 90)
        ? {
            temperatureC: w!.weather.temperatureC,
            humidity: w!.weather.humidity,
            cloudCover: w!.weather.cloudCover,
            feelsLikeC: w!.weather.feelsLikeC,
          }
        : undefined;
    have.add(w!.id!);
    // Long traces are thinned to keep the log small enough to save.
    const sorted = points.sort((a, b) => a.t - b.t);
    const step = Math.ceil(sorted.length / MAX_IMPORT_POINTS);
    fresh.push({
      id: w!.id!,
      area: w!.area!,
      points:
        step > 1
          ? sorted.filter((_, i) => i % step === 0 || i === sorted.length - 1)
          : sorted,
      ...(weather ? { weather } : {}),
      ...(typeof w!.preference === "string" && w!.preference.length <= 30
        ? { preference: w!.preference }
        : {}),
    });
  }
  const walks = [...own, ...fresh]
    .sort((a, b) => a.points[0].t - b.points[0].t)
    .slice(-MAX_WALKS);
  // Counted after the limit: walks older than the newest 400 don't stay,
  // and own walks pushed out are reported too.
  const kept = new Set(walks.map((w) => w.id));
  const added = fresh.filter((w) => kept.has(w.id)).length;
  const dropped = own.filter((w) => !kept.has(w.id)).length;
  return {
    log: { ...log, walks },
    added,
    skipped: skipped + (fresh.length - added),
    dropped,
  };
}
