/**
 * Signals that change whether, or when, to walk: air quality from Open-Meteo
 * (CAMS model, no key, CC BY 4.0) and official National Weather Service heat
 * and air-quality alerts (US only, public domain). Both are queried at a
 * coarse location (about 1 km), which is all either source resolves.
 */

export interface AirQuality {
  /** US EPA Air Quality Index, 0-500. */
  usAqi: number;
  pm25: number | null;
  ozone: number | null;
  /** 0 Good … 5 Hazardous. */
  level: number;
  category: string;
  time: string;
  /** Upcoming hourly AQI, for "air gets worse later" hints. */
  hours: { time: string; usAqi: number }[];
  attribution: string;
}
export interface WalkAlert {
  kind: "heat" | "air";
  event: string;
  headline: string;
  severity: string;
  /** When the hazard ends (or the message expires), ISO time. */
  ends: string | null;
  instruction?: string;
  sender: string;
  url?: string;
}
export interface Outlook {
  air: AirQuality | null;
  /** null when the alert service could not be reached (unknown, not "none"). */
  alerts: WalkAlert[] | null;
  fetchedAt?: string;
}

/** A coordinate rounded to about a kilometre, as sent to these services. */
export const coarse = (v: number) => (Math.round(v * 100) / 100 + 0).toFixed(2);

export function airQualityUrl(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: coarse(lat),
    longitude: coarse(lon),
    current: "us_aqi,pm2_5,ozone",
    hourly: "us_aqi",
    forecast_hours: "24",
    timezone: "GMT",
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`;
}

export function nwsAlertsUrl(lat: number, lon: number) {
  return `https://api.weather.gov/alerts/active?point=${coarse(lat)},${coarse(lon)}&status=actual`;
}

const AQI_LEVELS: [number, string][] = [
  [50, "Good"],
  [100, "Moderate"],
  [150, "Unhealthy for sensitive groups"],
  [200, "Unhealthy"],
  [300, "Very unhealthy"],
  [Infinity, "Hazardous"],
];
/** US EPA AQI category for a value. */
export function aqiCategory(aqi: number) {
  const level = AQI_LEVELS.findIndex(([max]) => Math.round(aqi) <= max);
  return { level, label: AQI_LEVELS[level][1] };
}

const finiteIn = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : null;
/** Open-Meteo's GMT times have no zone suffix. */
function gmt(v: unknown) {
  if (typeof v !== "string") return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

interface AirResponse {
  current?: {
    time?: unknown;
    us_aqi?: unknown;
    pm2_5?: unknown;
    ozone?: unknown;
  };
  hourly?: { time?: unknown; us_aqi?: unknown };
}
export function parseAirQuality(data: unknown): AirQuality | null {
  const d = (data ?? {}) as AirResponse;
  // Heavy smoke can push the model past the index's top; that is Hazardous.
  const aqi = (v: unknown) => {
    const n = finiteIn(v, 0, 5000);
    return n === null ? null : Math.min(500, n);
  };
  const usAqi = aqi(d.current?.us_aqi);
  const time = gmt(d.current?.time);
  if (usAqi === null || !time) return null;
  const times = Array.isArray(d.hourly?.time) ? d.hourly.time : [];
  const values = Array.isArray(d.hourly?.us_aqi) ? d.hourly.us_aqi : [];
  const hours = times.flatMap((t, i) => {
    const at = gmt(t),
      v = aqi(values[i]);
    return at && v !== null ? [{ time: at, usAqi: Math.round(v) }] : [];
  });
  const { level, label } = aqiCategory(usAqi);
  return {
    usAqi: Math.round(usAqi),
    pm25: finiteIn(d.current?.pm2_5, 0, 2000),
    ozone: finiteIn(d.current?.ozone, 0, 2000),
    level,
    category: label,
    time,
    hours,
    attribution: "Air quality: Open-Meteo.com (CAMS) · CC BY 4.0",
  };
}

const HEAT_EVENT = /\bheat\b/i;
const AIR_EVENT = /^air quality alert$/i;
/** Warnings first, then advisories and alerts in effect, then watches. */
const rank = (event: string) =>
  /warning/i.test(event) ? 0 : /watch/i.test(event) ? 2 : 1;
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Active heat and air-quality alerts from an NWS GeoJSON answer. */
export function parseWalkAlerts(data: unknown, now = new Date()) {
  const features = (data as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const alerts: WalkAlert[] = [];
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> })?.properties;
    if (!p) continue;
    const event = text(p.event, 80);
    const kind = HEAT_EVENT.test(event)
      ? "heat"
      : AIR_EVENT.test(event)
        ? "air"
        : null;
    if (!kind) continue;
    const ends = gmt(p.ends) ?? gmt(p.expires);
    if (ends && Date.parse(ends) <= now.getTime()) continue;
    const id = text(p["@id"], 300);
    alerts.push({
      kind,
      event,
      headline: text(p.headline, 200) || event,
      severity: text(p.severity, 20) || "Unknown",
      ends,
      ...(text(p.instruction, 400)
        ? { instruction: text(p.instruction, 400) }
        : {}),
      sender: text(p.senderName, 80) || "National Weather Service",
      ...(id.startsWith("https://api.weather.gov/") ? { url: id } : {}),
    });
  }
  return alerts.sort((a, b) => rank(a.event) - rank(b.event));
}

/** One sentence to show above the route when something calls for it. */
export function outlookAdvice(o: Pick<Outlook, "air" | "alerts">) {
  const heat = o.alerts?.find((a) => a.kind === "heat");
  if (heat)
    return `${heat.event} in effect from the National Weather Service: walk early or late, take the shadiest or indoor route, and carry water.${
      o.air && o.air.level >= 3
        ? ` Air quality is also ${o.air.category.toLowerCase()} (AQI ${o.air.usAqi}).`
        : ""
    }`;
  if (o.air && o.air.level >= 3)
    return `Air quality is ${o.air.category.toLowerCase()} (AQI ${o.air.usAqi}): keep walks short and prefer the indoor route.`;
  if (o.air && o.air.level === 2)
    return `Air quality is unhealthy for sensitive groups (AQI ${o.air.usAqi}): if you have asthma or heart or lung conditions, keep this walk short.`;
  const air = o.alerts?.find((a) => a.kind === "air");
  if (air)
    return `${air.event} in effect: keep walks short if you're sensitive to air pollution.`;
  return null;
}

/** The outlook without alerts that have ended since it was loaded. */
export function activeOutlook(o: Outlook | null, now = new Date()) {
  if (!o?.alerts) return o;
  return {
    ...o,
    alerts: o.alerts.filter(
      (a) => !a.ends || Date.parse(a.ends) > now.getTime(),
    ),
  };
}

/** An alert's end, in the area's time zone, such as "Wed, Jul 15, 3:00 AM". */
export function alertEnd(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Short situation fields for the assistant (bounded like its schema). */
export function outlookContext(o: Outlook | null, timeZone = "UTC") {
  if (!o) return {};
  return {
    ...(o.air
      ? {
          airQuality: `US AQI ${o.air.usAqi} (${o.air.category})`.slice(0, 120),
        }
      : {}),
    ...(o.alerts?.length
      ? {
          alerts: o.alerts
            .map(
              (a) =>
                `${a.event}${a.ends ? ` until ${alertEnd(a.ends, timeZone)}` : ""}`,
            )
            .join("; ")
            .slice(0, 400),
        }
      : {}),
  };
}
