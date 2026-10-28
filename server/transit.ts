import { unzipSync, strFromU8 } from "fflate";
import { requestBytes, ServiceError } from "./network.js";
import { getWorld, getWeather, localPoint } from "./data.js";
import { route } from "../src/lib/routing.js";
import type { World, Point, Environment } from "../shared/types.js";
type Row = Record<string, string>;
export function csv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quote = !quote;
    } else if (c === "," && !quote) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !quote) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const header = rows.shift() || [];
  return rows
    .filter((r) => r.length === header.length)
    .map((r) =>
      Object.fromEntries(
        header.map((h, i) => [h.replace(/^\uFEFF/, ""), r[i]]),
      ),
    );
}
export function seconds(t: string) {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
export function serviceActive(
  id: string,
  date: string,
  calendar: Row[],
  exceptions: Row[],
) {
  const exception = exceptions.find(
    (r) => r.service_id === id && r.date === date,
  );
  if (exception) return exception.exception_type === "1";
  const day = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][
    new Date(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`,
    ).getUTCDay()
  ];
  return calendar.some(
    (r) =>
      r.service_id === id &&
      r.start_date <= date &&
      r.end_date >= date &&
      r[day] === "1",
  );
}
let feed: { at: number; files: Record<string, Row[]> } | undefined;
async function getFeed() {
  if (feed && Date.now() - feed.at < 3600000) return feed.files;
  const zip = await requestBytes(
    "https://www.bart.gov/dev/schedules/google_transit.zip",
    {
      maxBytes: 32e6,
      timeoutMs: 60000,
      headers: { Accept: "application/zip" },
    },
  );
  const files = unzipSync(zip, {
    filter: (f) =>
      [
        "stops.txt",
        "trips.txt",
        "stop_times.txt",
        "calendar.txt",
        "calendar_dates.txt",
        "routes.txt",
      ].includes(f.name) && f.originalSize < 100e6,
  });
  const parsed: Record<string, Row[]> = {};
  for (const [name, bytes] of Object.entries(files))
    parsed[name] = csv(strFromU8(bytes));
  if (!parsed["stops.txt"] || !parsed["stop_times.txt"] || !parsed["trips.txt"])
    throw new ServiceError(
      "NO_TRANSIT_DATA",
      "BART returned an incomplete schedule.",
    );
  feed = { at: Date.now(), files: parsed };
  return parsed;
}
function nearestNode(w: World, p: Point) {
  const n = [...w.graph.nodes].sort(
    (a, b) =>
      Math.hypot(a.point[0] - p[0], a.point[1] - p[1]) -
      Math.hypot(b.point[0] - p[0], b.point[1] - p[1]),
  )[0];
  if (!n || Math.hypot(n.point[0] - p[0], n.point[1] - p[1]) > 200)
    throw new ServiceError(
      "NO_WALKING_CONNECTION",
      "An endpoint could not be connected to the mapped pedestrian network.",
    );
  return n.id;
}
async function walk(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  name: string,
  date: string,
) {
  const origin = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  const radius = Math.min(
    3500,
    Math.ceil(Math.hypot(...localPoint(a.lat, a.lon, b)) / 2 + 350),
  );
  const w = await getWorld(origin.lat, origin.lon, name, radius);
  const e: Environment = {
    dateTime: date,
    temperatureC: 20,
    humidity: 50,
    windMps: 2,
    cloudCover: 50,
    weatherMode: "scenario",
  };
  const result = route(
    w,
    nearestNode(w, localPoint(a.lat, a.lon, w.origin)),
    nearestNode(w, localPoint(b.lat, b.lon, w.origin)),
    {
      preference: "quickest",
      avoidStairs: false,
      allowHypothetical: false,
      maxDetour: 1,
      environment: e,
    },
  );
  if (!result)
    throw new ServiceError(
      "NO_WALKING_CONNECTION",
      "No connected walking route was found for this station.",
    );
  return {
    distance: result.distance,
    minutes: result.durationMinutes,
    points: result.points.map((p) => ({
      lat: w.origin.lat - p[1] / 111195,
      lon:
        w.origin.lon +
        p[0] / (111195 * Math.cos((w.origin.lat * Math.PI) / 180)),
    })),
    directions: result.directions.map((d) => ({
      text: d.text,
      distance: d.distance,
    })),
  };
}
export async function berkeleyJourney(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()))
    throw new ServiceError(
      "INVALID_INPUT",
      "Choose a valid departure time.",
      400,
    );
  const f = await getFeed();
  const stops = f["stops.txt"];
  const from = stops.find((s) => /downtown berkeley/i.test(s.stop_name));
  if (!from)
    throw new ServiceError(
      "NO_TRANSIT_DATA",
      "Downtown Berkeley station is absent from this schedule.",
    );
  const origin = { lat: 37.8697, lon: -122.2595 };
  const destination = { lat: 37.768, lon: -122.3877 };
  const first = await walk(
    origin,
    { lat: +from.stop_lat, lon: +from.stop_lon },
    "Berkeley walking leg",
    iso,
  );
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (k: string) => p.find((x) => x.type === k)?.value || "";
  const day = get("year") + get("month") + get("day");
  const now = +get("hour") * 3600 + +get("minute") * 60 + +get("second");
  const ready = now + first.minutes * 60 + 300;
  const services = new Set(
    f["trips.txt"]
      .filter((t) =>
        serviceActive(
          t.service_id,
          day,
          f["calendar.txt"] || [],
          f["calendar_dates.txt"] || [],
        ),
      )
      .map((t) => t.trip_id),
  );
  const sourceIds = new Set(
    stops
      .filter(
        (s) =>
          s.stop_id === from.stop_id ||
          s.parent_station === from.stop_id ||
          s.stop_name === from.stop_name,
      )
      .map((s) => s.stop_id),
  );
  const departures = f["stop_times.txt"].filter(
    (t) =>
      sourceIds.has(t.stop_id) &&
      services.has(t.trip_id) &&
      seconds(t.departure_time) >= ready &&
      seconds(t.departure_time) < ready + 14400,
  );
  const candidates = [];
  for (const pattern of [/embarcadero/i, /16th.*mission/i]) {
    const target = stops.find((s) => pattern.test(s.stop_name));
    if (!target) continue;
    const ids = new Set(
      stops
        .filter(
          (s) =>
            s.stop_id === target.stop_id ||
            s.parent_station === target.stop_id ||
            s.stop_name === target.stop_name,
        )
        .map((s) => s.stop_id),
    );
    let selected: { a: Row; b: Row } | undefined;
    for (const a of departures) {
      const b = f["stop_times.txt"].find(
        (t) =>
          t.trip_id === a.trip_id &&
          ids.has(t.stop_id) &&
          +t.stop_sequence > +a.stop_sequence,
      );
      if (
        b &&
        (!selected ||
          seconds(b.arrival_time) < seconds(selected.b.arrival_time))
      )
        selected = { a, b };
    }
    if (!selected) continue;
    const arrival = new Date(
      date.getTime() + (seconds(selected.b.arrival_time) - now) * 1000,
    );
    const last = await walk(
      { lat: +target.stop_lat, lon: +target.stop_lon },
      destination,
      "San Francisco walking leg",
      arrival.toISOString(),
    );
    const forecast = await getWeather(+target.stop_lat, +target.stop_lon).catch(
      () => null,
    );
    const hour = forecast?.hours.find(
      (h) => Math.abs(Date.parse(h.time) - arrival.getTime()) < 3600000,
    );
    candidates.push({
      station: target.stop_name,
      departure: new Date(
        date.getTime() + (seconds(selected.a.departure_time) - now) * 1000,
      ).toISOString(),
      arrival: arrival.toISOString(),
      destinationArrival: new Date(
        arrival.getTime() + last.minutes * 60000,
      ).toISOString(),
      first,
      last,
      visibilityMeters:
        (hour as unknown as { visibilityMeters?: number })?.visibilityMeters ??
        null,
      weather: hour?.description ?? "Forecast unavailable",
      tripId: selected.a.trip_id,
    });
  }
  if (!candidates.length)
    throw new ServiceError(
      "NO_SCHEDULED_SERVICE",
      "No direct BART train was found in the next four hours. Transfer itineraries are not supported yet.",
    );
  return {
    origin: "UC Berkeley · Sather Gate",
    destination: "Chase Center",
    serviceDate: day,
    source: "BART official static GTFS schedule · not live departures",
    fetchedAt: new Date(feed!.at).toISOString(),
    options: candidates.sort(
      (a, b) =>
        Date.parse(a.destinationArrival) - Date.parse(b.destinationArrival),
    ),
    notes: [
      "Walking legs use OpenStreetMap. Five minutes are allowed to enter the BART station.",
      "Forecast visibility is area-scale, not a street-by-street fog measurement. Unknown visibility is not clear weather.",
      "These are scheduled direct trains. Disruptions, elevator status, station access and transfers are not verified.",
    ],
  };
}
