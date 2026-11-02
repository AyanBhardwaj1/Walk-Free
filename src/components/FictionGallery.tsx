import { ArrowUpRight } from "lucide-react";
import AmbientBackdrop, { spread } from "./AmbientBackdrop";
import {
  FICTION_CITIES,
  isDarkSky,
  type FictionCity,
} from "../lib/fiction-catalog";

/** Each city's skyline: how many towers, how tall, and its signature. */
const PROFILE: Record<
  FictionCity["slug"],
  { count: number; low: number; high: number; spire?: number }
> = {
  "noir-harbor": { count: 22, low: 0.35, high: 0.92, spire: 0.42 },
  "skyline-prime": { count: 18, low: 0.3, high: 0.95, spire: 0.55 },
  "velocity-bay": { count: 26, low: 0.18, high: 0.48 },
  "aurora-realm": { count: 20, low: 0.12, high: 0.4, spire: 0.5 },
  "neon-district": { count: 28, low: 0.3, high: 0.8 },
  "dune-reach": { count: 32, low: 0.08, high: 0.22, spire: 0.62 },
  "verdant-canopy": { count: 18, low: 0.2, high: 0.48 },
};

/** One row of towers; a few of the tallest carry a mast. */
function towersFor(city: FictionCity, salt: number, scale: number) {
  const p = PROFILE[city.slug];
  const width = 100 / p.count;
  return Array.from({ length: p.count }, (_, i) => {
    const centre = Math.abs(i - p.count / 2) / (p.count / 2);
    const lift =
      scale === 1 &&
      p.spire !== undefined &&
      i === Math.floor(p.count * p.spire);
    const h = lift
      ? 0.98
      : (p.low + (p.high - p.low) * spread(i, salt) * (1 - centre * 0.45)) *
        scale;
    const w = width * (0.6 + spread(i, salt + 2) * 0.5);
    return {
      x: i * width + spread(i, salt + 1) * (width - w),
      w,
      h: h * 100,
      mast: lift || (h > p.high * 0.8 && spread(i, salt + 5) > 0.5),
    };
  });
}

/** A deterministic silhouette of the city against its own sky. */
function Skyline({ city }: { city: FictionCity }) {
  const salt = city.slug.length * 7 + city.slug.charCodeAt(0);
  const back = towersFor(city, salt + 40, 0.82);
  const front = towersFor(city, salt, 1);
  return (
    <svg
      className="fiction-skyline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g className="back">
        {back.map((t, i) => (
          <rect key={i} x={t.x} y={100 - t.h} width={t.w} height={t.h} />
        ))}
      </g>
      <g className="front">
        {front.map((t, i) => (
          <g key={i}>
            <rect x={t.x} y={100 - t.h} width={t.w} height={t.h} />
            {t.mast && (
              <rect
                x={t.x + t.w / 2 - 0.25}
                y={100 - t.h - 7}
                width={0.5}
                height={7}
              />
            )}
          </g>
        ))}
      </g>
      {city.ambient.night && (
        <g className="lights" fill={city.ambient.accent}>
          {front.flatMap((t, i) =>
            Array.from({ length: Math.round(t.h / 9) }, (_, j) =>
              spread(i * 31 + j, salt + 3) > 0.55 ? (
                <rect
                  key={`${i}-${j}`}
                  x={t.x + t.w * (0.2 + spread(j, i) * 0.5)}
                  y={100 - t.h + 4 + j * 8}
                  width={0.9}
                  height={1.6}
                />
              ) : null,
            ),
          )}
        </g>
      )}
    </svg>
  );
}

/** Postcards of the fictional cities, each in its own weather. */
export default function FictionGallery({
  base,
  start = 0,
  reveal = false,
}: {
  /** "/app" for signed-in people, "/demo" for guests. */
  base: string;
  /** First stagger step, to follow on from earlier content. */
  start?: number;
  /** Rise in on scroll (landing) rather than on mount (home). */
  reveal?: boolean;
}) {
  return (
    <ul className="fiction-gallery">
      {FICTION_CITIES.map((c, i) => (
        <li
          key={c.slug}
          className={`fiction-card ${reveal ? "reveal" : "home-rise"}`}
          style={{
            ["--d" as string]: start + i,
            transitionDelay: reveal ? `${i * 70}ms` : undefined,
            ["--sky-top" as string]: c.ambient.sky[0],
            ["--sky-bottom" as string]: c.ambient.sky[1],
            ["--fog" as string]: c.ambient.fog,
            ["--accent" as string]: c.ambient.accent,
          }}
        >
          <a
            href={`${base}?fiction=${c.slug}`}
            className={isDarkSky(c.ambient.sky[0]) ? "is-night" : ""}
          >
            <span className="fiction-sky" aria-hidden />
            <AmbientBackdrop
              ambient={c.ambient}
              layer="weather"
              density={0.4}
            />
            <Skyline city={c} />
            <span className="fiction-copy">
              <small>Fictional city</small>
              <strong>{c.name}</strong>
              <span>{c.tagline}</span>
              <em>
                Walk it <ArrowUpRight size={15} aria-hidden />
              </em>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
