import type { RouteResult } from "../../shared/types";

/** A stretch counts as shaded at half shade or more (as in sun-ahead). */
const SHADED = 0.5;
const SUN = [215, 119, 45],
  SHADE = [47, 101, 119];
const mix = (k: number) =>
  `rgb(${SUN.map((c, i) => Math.round(c + (SHADE[i] - c) * k)).join(" ")})`;

/** The sun and shade along a route, start to finish, by length. */
export function routeProfile(
  route: Pick<RouteResult, "edges">,
  shadeOf: (edgeId: string) => number | undefined,
) {
  const total = route.edges.reduce((s, e) => s + e.distance, 0) || 1;
  let at = 0,
    run = 0,
    longestSun = 0,
    shaded = 0;
  const stops: { from: number; to: number; shade: number }[] = [];
  for (const e of route.edges) {
    const shade = shadeOf(e.id) ?? 0.5;
    stops.push({ from: at / total, to: (at + e.distance) / total, shade });
    at += e.distance;
    shaded += e.distance * shade;
    if (shade < SHADED) {
      run += e.distance;
      longestSun = Math.max(longestSun, run);
    } else run = 0;
  }
  return {
    stops,
    /** Share of the distance in shade, 0–1. */
    shade: shaded / total,
    /** The longest unbroken stretch in the sun, metres. */
    longestSunM: Math.round(longestSun),
  };
}

/**
 * Where along the walk the sun is: a strip from start to finish coloured by
 * shade, like an elevation profile for heat.
 */
export default function RouteProfile({
  route,
  shadeOf,
}: {
  route: RouteResult;
  shadeOf: (edgeId: string) => number | undefined;
}) {
  const p = routeProfile(route, shadeOf);
  const gradient = p.stops
    .map(
      (s) =>
        `${mix(s.shade)} ${(s.from * 100).toFixed(2)}% ${(s.to * 100).toFixed(2)}%`,
    )
    .join(", ");
  return (
    <figure className="route-profile">
      <figcaption>
        <span>Sun along the way</span>
        <small>
          {Math.round(p.shade * 100)}% in shade
          {p.longestSunM >= 20 &&
            ` · longest sunny stretch ${Math.round(p.longestSunM / 10) * 10} m`}
        </small>
      </figcaption>
      <div
        className="route-profile-strip"
        role="img"
        aria-label={`From start to finish, ${Math.round(p.shade * 100)}% of the walk is in shade; the longest sunny stretch is about ${Math.round(p.longestSunM / 10) * 10} metres.`}
        style={{ background: `linear-gradient(90deg, ${gradient})` }}
      />
      <div className="route-profile-ends" aria-hidden>
        <span>Start</span>
        <span>Finish</span>
      </div>
    </figure>
  );
}
