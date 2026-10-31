import { PREBUILT_AREAS } from "../../shared/areas.js";
import type { RoutePreference } from "../../shared/types.js";

const PREFERENCES: RoutePreference[] = [
  "quickest",
  "shade",
  "scenic",
  "indoors",
  "stepfree",
  "night",
];

/** A walk someone can open from a link: where, between which points, when. */
export interface WalkLink {
  /** A shipped campus, or any other area by its centre and half-width. */
  area?: string;
  lat?: number;
  lon?: number;
  radius?: number;
  from?: string;
  to?: string;
  pref?: RoutePreference;
  /** Local hour of day, 0 to 23.75. */
  hour?: number;
}

/** A link to the guest demo, so anyone can open it without an account. */
export function walkLinkUrl(origin: string, link: WalkLink) {
  const params = new URLSearchParams();
  if (link.area) params.set("area", link.area);
  else if (link.lat !== undefined && link.lon !== undefined) {
    params.set("lat", link.lat.toFixed(5));
    params.set("lon", link.lon.toFixed(5));
    if (link.radius) params.set("radius", String(Math.round(link.radius)));
  }
  if (link.from) params.set("from", link.from);
  if (link.to) params.set("to", link.to);
  if (link.pref) params.set("pref", link.pref);
  if (link.hour !== undefined) params.set("t", String(link.hour));
  return `${origin}/demo?${params}`;
}

/** Path point ids as the map makes them (OSM nodes and similar). */
const NODE_ID = /^[\w:.-]{1,100}$/;

/** The parts of a link that are well formed; anything else is dropped. */
export function parseWalkLink(search: string): WalkLink {
  const q = new URLSearchParams(search);
  const link: WalkLink = {};
  const area = q.get("area");
  if (area && PREBUILT_AREAS.some((a) => a.slug === area)) link.area = area;
  const lat = Number(q.get("lat")),
    lon = Number(q.get("lon")),
    radius = Number(q.get("radius") ?? 800);
  if (
    !link.area &&
    q.has("lat") &&
    q.has("lon") &&
    Math.abs(lat) <= 85 &&
    Math.abs(lon) <= 180 &&
    radius >= 200 &&
    radius <= 1500
  )
    Object.assign(link, { lat, lon, radius });
  for (const key of ["from", "to"] as const) {
    const id = q.get(key);
    if (id && NODE_ID.test(id)) link[key] = id;
  }
  const pref = q.get("pref") as RoutePreference | null;
  if (pref && PREFERENCES.includes(pref)) link.pref = pref;
  const hour = Number(q.get("t"));
  if (q.has("t") && hour >= 0 && hour <= 23.75) link.hour = hour;
  return link;
}
