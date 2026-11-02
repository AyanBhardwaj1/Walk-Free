import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Clock,
  FileText,
  Footprints,
  LogOut,
  Map as MapIcon,
  Sparkles,
  Sun,
  Trees,
} from "lucide-react";
import { Brand, HeroHeat, type Preview } from "./LandingPage";
import FictionGallery from "./FictionGallery";
import { PREBUILT_AREAS } from "../../shared/areas";
import { loadSavedWalks, type SavedWalk } from "../lib/saved-walks";
import type { Account } from "../lib/account";
import { lastPlace } from "../lib/last-place";
import { generatedCities } from "../lib/generated-cities";

interface CampusStat {
  slug: string;
  name: string;
  air_f: number;
  hottest: { name: string; feels_f: number };
  coolest: { name: string; feels_f: number; shaded_percent: number };
  shade_route?: { sun_avoided_percent: number; extra_distance_percent: number };
}

/** "Good morning" and friends, by the visitor's own clock. */
export function greeting(date: Date) {
  const h = date.getHours();
  return h < 5
    ? "Still up"
    : h < 12
      ? "Good morning"
      : h < 18
        ? "Good afternoon"
        : "Good evening";
}

const TOOLS = [
  {
    icon: Clock,
    title: "Best time to go",
    text: "See how every hour of the day would feel for your walk.",
    href: "/app",
  },
  {
    icon: Sparkles,
    title: "Ask Walk-Free",
    text: "Plan a walk in plain words, in your language.",
    href: "/app?tab=ask",
  },
  {
    icon: Trees,
    title: "Plant shade trees",
    text: "Line a street with trees and write a proposal from the result.",
    href: "/app",
  },
  {
    icon: FileText,
    title: "Heat brief",
    text: "A one-page summary of an area's hottest and coolest walks.",
    href: "/app?tab=data",
  },
];

/** The signed-in home: where to walk next, and everything one tap away. */
export default function HomeDashboard({
  user,
  onSignOut,
}: {
  user: Account;
  onSignOut: () => void;
}) {
  const [now] = useState(() => new Date());
  const [campuses, setCampuses] = useState<CampusStat[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [walks] = useState<SavedWalk[]>(() => loadSavedWalks().slice(0, 6));
  const [resume] = useState(lastPlace);
  const [mine] = useState(() => generatedCities().slice(0, 4));
  useEffect(() => {
    let live = true;
    fetch("/landing/campuses.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setCampuses(d.campuses))
      .catch(() => {
        /* The cards still show names without the numbers. */
      });
    fetch("/landing/speedway.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setPreview(d))
      .catch(() => {
        /* The hero reads fine without the live slice. */
      });
    return () => {
      live = false;
    };
  }, []);
  const stats = useMemo(
    () => new Map(campuses.map((c) => [c.slug, c])),
    [campuses],
  );
  const first = user.name?.split(" ")[0] || "there";
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <div className="public-site home-dash">
      <header className="public-header home-header">
        <Brand />
        <nav className="home-nav" aria-label="Main">
          <a href="/home" aria-current="page">
            Home
          </a>
          <a href="/app">Map</a>
          <a href="/app?tab=ask">Assistant</a>
        </nav>
        <button className="home-signout" onClick={onSignOut}>
          <LogOut size={15} aria-hidden /> Sign out
        </button>
      </header>
      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <HeroHeat preview={preview} />
          <div className="home-hero-lines" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ ["--i" as string]: i }} />
            ))}
          </div>
          <div className="home-hero-copy">
            <span className="landing-eyebrow light home-rise">{today}</span>
            <h1
              id="home-title"
              className="home-rise"
              style={{ ["--d" as string]: 1 }}
            >
              {greeting(now)}, {first}.
              <br />
              <em>Where are we walking today?</em>
            </h1>
            <div
              className="hero-actions home-rise"
              style={{ ["--d" as string]: 2 }}
            >
              {resume ? (
                <>
                  <a className="landing-button bright" href={resume.href}>
                    Back to {resume.name} <ArrowUpRight size={18} aria-hidden />
                  </a>
                  <a className="text-link light" href="/app">
                    Open the map <MapIcon size={15} aria-hidden />
                  </a>
                </>
              ) : (
                <a className="landing-button bright" href="/app">
                  Open the map <ArrowUpRight size={18} aria-hidden />
                </a>
              )}
              <a className="text-link light" href="/app?tab=ask">
                Ask the assistant <Sparkles size={15} aria-hidden />
              </a>
            </div>
          </div>
        </section>

        <section className="home-section" aria-labelledby="home-campuses">
          <div className="home-section-head">
            <h2 id="home-campuses">Ready instantly</h2>
            <p>Every building and path, with live weather and heat.</p>
          </div>
          <ul className="home-grid">
            {PREBUILT_AREAS.map((a, i) => {
              const s = stats.get(a.slug);
              return (
                <li
                  key={a.slug}
                  className={`home-card home-rise${a.kind === "city" ? " wide" : ""}`}
                  style={{ ["--d" as string]: 3 + i }}
                >
                  <a href={`/app?area=${a.slug}`}>
                    <span className="home-card-kicker">
                      <MapIcon size={14} aria-hidden />{" "}
                      {a.kind === "city" ? "City district" : "Campus"}
                    </span>
                    <strong>{a.name.replace(/, [A-Z]{2}$/, "")}</strong>
                    {s ? (
                      <span className="home-card-stat">
                        <Sun size={14} aria-hidden /> Hottest at 3 PM in July:{" "}
                        {s.hottest.name}, {s.hottest.feels_f}°F
                      </span>
                    ) : (
                      <span className="home-card-stat">
                        {a.kind === "city"
                          ? "Real streets and towers from OpenStreetMap, in 3D"
                          : "Open the 3D map"}
                      </span>
                    )}
                    {s?.shade_route && (
                      <span className="home-card-bar" aria-hidden>
                        <i
                          style={{
                            width: `${Math.min(100, s.shade_route.sun_avoided_percent * 3)}%`,
                          }}
                        />
                      </span>
                    )}
                    {s?.shade_route && (
                      <small>
                        The shade route avoids{" "}
                        {s.shade_route.sun_avoided_percent}% of the sun
                      </small>
                    )}
                    <ArrowUpRight
                      className="home-card-go"
                      size={18}
                      aria-hidden
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          className="home-section home-generate home-rise"
          aria-labelledby="home-generate"
          style={{ ["--d" as string]: 3 }}
        >
          <div className="home-generate-copy">
            <span className="landing-eyebrow light">
              <Sparkles size={13} aria-hidden /> New
            </span>
            <h2 id="home-generate">
              Describe any city.
              <br />
              <em>Walk it in a minute.</em>
            </h2>
            <p>
              A rain-soaked noir metropolis, a desert souk, your hometown in a
              heatwave. The AI plans the districts and landmarks, Walk-Free
              builds every street and drops you in the middle, with weather you
              control.
            </p>
            <a className="landing-button bright" href="/app?generate=">
              Generate a city <ArrowUpRight size={17} aria-hidden />
            </a>
          </div>
          {mine.length > 0 && (
            <ul className="home-generated" aria-label="Your generated cities">
              {mine.map((c) => (
                <li key={c.id}>
                  <a href={`/app?generated=${c.id}`}>
                    <strong>{c.spec.name}</strong>
                    <small>{c.spec.tagline}</small>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="home-section" aria-labelledby="home-fiction">
          <div className="home-section-head">
            <h2 id="home-fiction">Fictional cities</h2>
            <p>
              Seven invented cities, each with its own sky and weather. Walk
              them for fun, or to see how street shape changes the heat.
            </p>
          </div>
          <FictionGallery base="/app" start={4} />
        </section>

        <section className="home-section" aria-labelledby="home-walks">
          <div className="home-section-head">
            <h2 id="home-walks">Your saved walks</h2>
            <p>
              {walks.length
                ? "Open one to see how it feels right now."
                : "Save a walk from the map and it shows up here."}
            </p>
          </div>
          {walks.length > 0 ? (
            <ul className="home-walks">
              {walks.map((w, i) => (
                <li
                  key={w.id}
                  className="home-rise"
                  style={{ ["--d" as string]: 4 + i }}
                >
                  <Footprints size={16} aria-hidden />
                  <span>
                    <strong>
                      {w.fromLabel} → {w.toLabel}
                    </strong>
                    <small>{w.areaName}</small>
                  </span>
                  <a href="/app">Open</a>
                </li>
              ))}
            </ul>
          ) : (
            <a className="home-empty home-rise" href="/app">
              <Footprints size={18} aria-hidden />
              Plan your first walk
              <ArrowUpRight size={16} aria-hidden />
            </a>
          )}
        </section>

        <section className="home-section" aria-labelledby="home-tools">
          <div className="home-section-head">
            <h2 id="home-tools">Tools</h2>
          </div>
          <ul className="home-tools">
            {TOOLS.map((t, i) => (
              <li
                key={t.title}
                className="home-rise"
                style={{ ["--d" as string]: 5 + i }}
              >
                <a href={t.href}>
                  <t.icon size={20} aria-hidden />
                  <strong>{t.title}</strong>
                  <span>{t.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="public-footer">
        <p>Walk-Free · heat estimates are modeled, not measured.</p>
      </footer>
    </div>
  );
}
