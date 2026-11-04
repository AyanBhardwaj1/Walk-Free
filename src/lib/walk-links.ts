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
  /** The panel tab to open, such as "ask" for the assistant demo. */
  tab?: LinkTab;
  /** Streets to open with a row of shade trees planted, from a proposal. */
  plant?: string[];
}
/** At most this many planted streets travel in a link. */
export const MAX_LINK_PLANTINGS = 6;
export type LinkTab = "route" | "heat" | "ask" | "climate" | "data";
const TABS: LinkTab[] = ["route", "heat", "ask", "climate", "data"];

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
  for (const street of link.plant?.slice(0, MAX_LINK_PLANTINGS) ?? [])
    params.append("plant", street);
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
  const tab = q.get("tab") as LinkTab | null;
  if (tab && TABS.includes(tab)) link.tab = tab;
  const plant = q
    .getAll("plant")
    .map((s) => s.trim().slice(0, 80))
    .filter((s) => s && !/[<>]/.test(s))
    .slice(0, MAX_LINK_PLANTINGS);
  if (plant.length) link.plant = [...new Set(plant)];
  return link;
}
