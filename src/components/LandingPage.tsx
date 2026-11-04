import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  KeyRound,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Route,
  Sparkles,
  Footprints,
  Thermometer,
  Trees,
  Languages,
  Boxes,
  Image as ImageIcon,
  AlertTriangle,
} from "lucide-react";
import FictionGallery from "./FictionGallery";
import FeatureScene from "./FeatureScene";

export function Brand() {
  return (
    <a className="brand" href="/">
      <span className="brand-icon">
        w<span>f</span>
      </span>
      walk-free
    </a>
  );
}

/* ---------- data precomputed from the real campus maps ---------- */

interface CampusStat {
  slug: string;
  name: string;
  air_f: number;
  buildings: number;
  paths_km: number;
  shaded_percent: number;
  /** Trees from OpenStreetMap, and crowns added from Meta/WRI's canopy map. */
  mapped_trees?: number;
  canopy_trees?: number;
  hottest: { name: string; feels_f: number; shaded_percent: number };
  coolest: { name: string; feels_f: number; shaded_percent: number };
  /** Sample walks: share of the sun the shade route avoids, and its cost. */
  shade_route?: {
    walks: number;
    sun_avoided_percent: number;
    sun_minutes_saved: number;
    extra_distance_percent: number;
  };
}
export interface Preview {
  name: string;
  half: number;
  hours: number[];
  shade_f: number[];
  sun_f: number[];
  buildings: [number, number][][];
  trees: [number, number][];
  planted: [number, number][];
  paths: {
    points: [number, number][];
    speedway: boolean;
    shade: number[];
    shade_planted: number[];
  }[];
}

function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d))
      .catch(() => {
        /* The page still reads well without the live numbers. */
      });
    return () => {
      live = false;
    };
  }, [url]);
  return data;
}

/**
 * Counts up to a number the first time it scrolls into view (an ease-out
 * over about a second); shows the final value at once under reduced motion
 * or without IntersectionObserver.
 */
function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      typeof IntersectionObserver === "undefined" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    setShown(0);
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / 1100);
        setShown(Math.round(value * (1 - Math.pow(1 - k, 4))));
        if (k < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <span ref={ref} className="count-up">
      {shown.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

/**
 * The hero's heat map leans a few degrees toward the pointer: mouse and
 * trackpad only, and never for people who ask for less motion.
 */
function useHeroTilt(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      !matchMedia("(hover: hover) and (pointer: fine)").matches ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty(
          "--tilt-x",
          ((e.clientX - r.left) / r.width - 0.5).toFixed(3),
        );
        el.style.setProperty(
          "--tilt-y",
          ((e.clientY - r.top) / r.height - 0.5).toFixed(3),
        );
      });
    };
    const leave = () => {
      el.style.setProperty("--tilt-x", "0");
      el.style.setProperty("--tilt-y", "0");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [ref]);
}

/** Adds .in to elements with .reveal as they scroll into view. */
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

const RAMP = ["#4f8a9c", "#6f9b5f", "#d9b142", "#d7772d", "#b13a2b"];
function heatColor(shade: number) {
  const t = (1 - shade) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const mix = (a: string, b: string, k: number) => {
    const pa = parseInt(a.slice(1), 16),
      pb = parseInt(b.slice(1), 16);
    const c = (s: number) =>
      Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  };
  return mix(RAMP[i], RAMP[i + 1], t - i);
}
const clock = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

/**
 * Draws the preview slice on a canvas: one repaint per change instead of
 * thousands of animated SVG elements, so the page stays smooth on phones.
 */
function SliceCanvas({
  preview,
  hourIndex,
  planted = false,
  theme,
  label,
}: {
  preview: Preview;
  hourIndex: number;
  planted?: boolean;
  theme: "dark" | "light";
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const size = c.clientWidth * Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = size;
    const g = c.getContext("2d");
    if (!g) return;
    const scale = size / (preview.half * 2);
    const at = (p: [number, number]) =>
      [(p[0] + preview.half) * scale, (p[1] + preview.half) * scale] as const;
    g.clearRect(0, 0, size, size);
    if (theme === "light") {
      g.fillStyle = "#ece9dc";
      g.fillRect(0, 0, size, size);
    }
    g.fillStyle = theme === "dark" ? "#2c4232" : "#d6cfbd";
    for (const b of preview.buildings) {
      g.beginPath();
      b.forEach((p, i) => (i ? g.lineTo(...at(p)) : g.moveTo(...at(p))));
      g.closePath();
      g.fill();
    }
    const dot = (p: [number, number], r: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(...at(p), r * scale, 0, Math.PI * 2);
      g.fill();
    };
    if (theme === "light") {
      for (const t of preview.trees) dot(t, 4, "#6f9b5fbb");
      if (planted) for (const t of preview.planted) dot(t, 5, "#3f7a3a");
    }
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const p of preview.paths) {
      g.strokeStyle = heatColor(
        planted ? p.shade_planted[hourIndex] : p.shade[hourIndex],
      );
      g.lineWidth = (p.speedway ? 6.5 : 3) * scale;
      g.beginPath();
      p.points.forEach((q, i) => (i ? g.lineTo(...at(q)) : g.moveTo(...at(q))));
      g.stroke();
    }
  }, [preview, hourIndex, planted, theme]);
  return (
    <canvas
      ref={canvas}
      className="slice-canvas"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Real UT Austin paths that warm and cool through a July day. */
export function HeroHeat({ preview }: { preview: Preview | null }) {
  const [hourIndex, setHourIndex] = useState(9);
  useEffect(() => {
    if (!preview || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const timer = setInterval(
      () => setHourIndex((i) => (i + 1) % preview.hours.length),
      1400,
    );
    return () => clearInterval(timer);
  }, [preview]);
  if (!preview) return <div className="hero-heat placeholder" />;
  return (
    <div className="hero-heat" aria-hidden="true">
      <div className="hero-tilt">
        <SliceCanvas preview={preview} hourIndex={hourIndex} theme="dark" />
      </div>
      <span className="hero-clock">
        {clock(preview.hours[hourIndex])} · {preview.name}
      </span>
    </div>
  );
}

/** Drag the time, plant trees: the same model the app uses, precomputed. */
function HeatPreview({ preview }: { preview: Preview | null }) {
  const [hourIndex, setHourIndex] = useState(9);
  const [planted, setPlanted] = useState(false);
  const stats = useMemo(() => {
    if (!preview) return null;
    const street = preview.paths.filter((p) => p.speedway);
    const shade = (key: "shade" | "shade_planted") =>
      street.reduce((s, p) => s + p[key][hourIndex], 0) /
      Math.max(1, street.length);
    const feels = (sh: number) =>
      preview.shade_f[hourIndex] +
      (1 - sh) * (preview.sun_f[hourIndex] - preview.shade_f[hourIndex]);
    const before = shade("shade"),
      after = shade("shade_planted");
    return {
      before,
      after,
      feelsBefore: feels(before),
      feelsAfter: feels(after),
    };
  }, [preview, hourIndex]);
  if (!preview || !stats)
    return <div className="preview-card placeholder">Loading the map…</div>;
  const shade = planted ? stats.after : stats.before;
  const feels = planted ? stats.feelsAfter : stats.feelsBefore;
  return (
    <div className="preview-card">
      <div className="preview-map">
        <SliceCanvas
          preview={preview}
          hourIndex={hourIndex}
          planted={planted}
          theme="light"
          label={`Map of ${preview.name} coloured by modeled heat at ${clock(preview.hours[hourIndex])}`}
        />
      </div>
      <div className="preview-controls">
        <span className="landing-eyebrow">
          TRY IT · REAL UT AUSTIN MAP DATA
        </span>
        <div className="preview-readout">
          <strong>{Math.round(feels)}°F</strong>
          <span>
            Speedway feels like, {Math.round(shade * 100)}% shaded at{" "}
            {clock(preview.hours[hourIndex])}
          </span>
        </div>
        <label className="preview-slider">
          Time of day · {clock(preview.hours[hourIndex])}
          <input
            type="range"
            min={0}
            max={preview.hours.length - 1}
            value={hourIndex}
            onChange={(e) => setHourIndex(+e.target.value)}
          />
          <span className="preview-ticks">
            <span>6 AM</span>
            <span>Noon</span>
            <span>8 PM</span>
          </span>
        </label>
        <button
          className={`preview-plant${planted ? " on" : ""}`}
          aria-pressed={planted}
          onClick={() => setPlanted(!planted)}
        >
          <Trees size={17} />
          {planted
            ? "Remove the planted trees"
            : `Plant ${preview.planted.length} shade trees on Speedway`}
        </button>
        {planted && (
          <p className="preview-gain">
            {Math.round(stats.before * 100)}% → {Math.round(stats.after * 100)}%
            shaded · about{" "}
            {Math.max(0, Math.round(stats.feelsBefore - stats.feelsAfter))}°F
            cooler to walk
          </p>
        )}
        <p className="preview-note">
          A typical July day in Austin (97°F high). Feels-like values are
          estimates from the heat index and modeled shade of mapped buildings
          and trees.
        </p>
      </div>
    </div>
  );
}

/** How Meta's models and data power Walk-Free. */
/** Walks in a semester: four a weekday for fifteen weeks. */
export const SEMESTER_WALKS = 4 * 5 * 15;
/** Minutes of sun saved per walk, as hours over a semester (to the half). */
export const semesterHours = (minutesPerWalk: number) =>
  Math.round(((minutesPerWalk * SEMESTER_WALKS) / 60) * 2) / 2;

const META_PARTS = [
  {
    icon: Sparkles,
    title: "Muse Spark plans the walk",
    text: "The assistant is built for Meta's Model API and Muse Spark is its first choice. It calls Walk-Free's own tools to plan routes, move the clock, rank hot streets and plant trees, then answers in a sentence.",
  },
  {
    icon: Trees,
    title: "DINOv3 finds the trees",
    text: "Meta and WRI's 1 m canopy height map, built with DINOv3, fills in the trees nobody mapped: about 10,900 extra crowns at UC Berkeley alone.",
  },
  {
    icon: Boxes,
    title: "Open Muse models, any host",
    text: "Bring a key for Muse Spark Open on Fireworks or Together, or Llama 4 on DeepInfra, Baseten or OpenRouter. Your key is saved only in your browser and sent just with your own requests.",
  },
  {
    icon: ImageIcon,
    title: "Muse Image shows the plan",
    text: "Plant trees on a hot street and Muse Image turns the 3D view into a photo of the greener street, ready for a proposal to the city.",
  },
  {
    icon: Languages,
    title: "Speaks your language",
    text: "Ask in Spanish, Hindi or Mandarin and the assistant answers in kind, with the same map and numbers.",
  },
];

const STEPS = [
  {
    icon: MapPin,
    title: "Open your campus",
    text: "Search a building, a street or a city. Six campuses open instantly; anywhere in the US builds from OpenStreetMap.",
  },
  {
    icon: Thermometer,
    title: "See the heat",
    text: "Every path is coloured from shaded to full sun for the hour you choose, with live weather.",
  },
  {
    icon: Route,
    title: "Choose your way",
    text: "Compare quickest, shadiest, scenic, step-free, lit-at-night and cool-stop routes side by side.",
  },
  {
    icon: Navigation,
    title: "Walk it",
    text: "A calm 2D walking view follows you, tells you the next turn and how hot the next block is.",
  },
];

const FEATURES = [
  {
    icon: Thermometer,
    title: "A heat map you can touch",
    text: "Tap any street to see how it feels in sun and shade, when it peaks, and compare it with another place.",
    tone: "heat",
  },
  {
    icon: Sparkles,
    title: "Describe any city. Walk it a minute later.",
    text: "A rain-soaked noir metropolis, a desert souk, your hometown in a heatwave. Meta's Muse Spark plans the districts and landmarks, Walk-Free builds every street and drops you in the middle, with weather you control.",
    tone: "generate",
  },
  {
    icon: Footprints,
    title: "Live a day there, at street level",
    text: "Coffee, class, lunch outside, home: each walk planned in shade at its own hour. Then drop to eye level and walk it under the trees, with people out on the streets around you.",
    tone: "street",
  },
  {
    icon: Route,
    title: "Routes for how you move",
    text: "Step-free never uses mapped stairs or steep slopes. Night routes favour lit, busier streets. Cool stops pass through libraries and unions.",
    tone: "routes",
  },
  {
    icon: MessageCircle,
    title: "Ask it anything about the walk",
    text: "“Shadiest way from Andrews Hall to GDC at 3?” The assistant plans it on the map, explains the trade-off and can answer out loud.",
    tone: "ask",
  },
  {
    icon: Trees,
    title: "Plant trees, watch the heat drop",
    text: "Line a street with trees in the design studio and see shade and feels-like change for that street and the whole campus. Then turn it into a one-page proposal for your campus or city, or download every street's heat as a spreadsheet.",
    tone: "trees",
  },
  {
    icon: AlertTriangle,
    title: "Knows when the day turns dangerous",
    text: "Live air quality, National Weather Service heat alerts and the week's HeatRisk change the advice, and the walking view tells you how far it is to the next shade.",
    tone: "alert",
  },
] as const;

const CHAT = [
  {
    who: "you",
    text: "Shadiest way from Andrews Hall to GDC if I leave at 3?",
  },
  { who: "tool", text: "Planned a route · Ranked hot and cool places" },
  {
    who: "bot",
    text: "The shaded route takes about the same time as the quickest one and keeps more of the walk under buildings and trees. I've put it on the map, along with how hot each stretch feels at 3.",
  },
  { who: "you", text: "Plant trees along Speedway." },
  { who: "tool", text: "Planted shade trees" },
  {
    who: "bot",
    text: "Done. Speedway's shade rises and it feels several degrees cooler at 3 PM. You can see the before and after in the Design studio, or undo it.",
  },
];

function ChatDemo() {
  const [shown, setShown] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || timer) return;
      timer = setInterval(
        () =>
          setShown((n) => {
            if (n >= CHAT.length) clearInterval(timer);
            return Math.min(CHAT.length, n + 1);
          }),
        900,
      );
    });
    io.observe(el);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="chat-demo" ref={root}>
      <div className="chat-demo-head">
        <Sparkles size={16} /> Ask Walk-Free
        <small>Example conversation</small>
      </div>
      {CHAT.slice(0, shown).map((m, i) => (
        <p key={i} className={`chat-demo-${m.who}`}>
          {m.text}
        </p>
      ))}
      {shown < CHAT.length && <span className="chat-demo-typing" />}
    </div>
  );
}

const FAQ = [
  {
    q: "How accurate are the temperatures?",
    a: "They are estimates, not thermometer readings. Walk-Free combines live weather and measured sunlight (Open-Meteo, with NWS as backup) with a heat index and models where buildings and trees cast shade at that minute. Awnings and arcades aren't counted, so real shade can be higher.",
  },
  {
    q: "Where does the tree shade come from?",
    a: "Trees mapped in OpenStreetMap, plus Meta and the World Resources Institute's 1-metre global canopy height map, which fills in the many trees nobody has mapped. At UC Berkeley that's 216 mapped trees and about 10,900 more crowns from the canopy map.",
  },
  {
    q: "Which places work?",
    a: "UT Austin, UC Berkeley, Michigan, UCLA, Stanford and Arizona State open instantly with their full campus maps. Any other area up to 3 km across builds from OpenStreetMap; if a place isn't on our map, Walk-Free hands off to Google Maps.",
  },
  {
    q: "Do I need an account?",
    a: "No. The demo lets you open a campus, see the heat and plan routes without signing up. An account saves your scenes and unlocks the assistant.",
  },
  {
    q: "Can I use my own AI key?",
    a: "Yes. Add a Meta Model API (Muse Spark), OpenAI, DeepInfra, Fireworks, Baseten, OpenRouter, Together or legacy Meta Llama API key in the assistant's settings. It stays in your browser and is used only for your requests; it's never saved on our servers.",
  },
  {
    q: "What happens to my location?",
    a: "Location is used in your browser only while you walk and is never stored as a history on our servers.",
  },
  {
    q: "Are cool stops and night routes guaranteed?",
    a: "No. Building hours and access aren't verified, and street lighting is often missing from OpenStreetMap. The app says so on each route, and you should always use your own judgement.",
  },
];

export default function LandingPage({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  const preview = useJson<Preview>("/landing/speedway.json");
  const campusData = useJson<{ scenario: string; campuses: CampusStat[] }>(
    "/landing/campuses.json",
  );
  const campuses = campusData?.campuses ?? [];
  const ut = campuses.find((c) => c.slug === "ut-austin");
  useReveal();
  const hero = useRef<HTMLElement>(null);
  useHeroTilt(hero);
  // Guests start on UT Austin with the guided tour open.
  const start = signedIn ? "/home" : "/demo?area=ut-austin&tour=1";
  const totals = {
    buildings: campuses.reduce((s, c) => s + c.buildings, 0),
    km: campuses.reduce((s, c) => s + c.paths_km, 0),
  };
  return (
    <div className="public-site landing-v2">
      <header className="public-header landing-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#preview">See the heat</a>
          <a href="#built-with-meta">Meta AI</a>
          <a href="#how-it-works">How it works</a>
          <a href="#campuses">Campuses</a>
          <a href="#fictional-cities">Fictional cities</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="public-header-actions">
          <a className="quiet-link" href={signedIn ? "/app" : "/login"}>
            {signedIn ? "My workspace" : "Log in"}
          </a>
          <a className="landing-button small" href={start}>
            {signedIn ? "Open the map" : "Try it free"}{" "}
            <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <main className="landing-main">
        <section className="cine-hero" ref={hero}>
          <HeroHeat preview={preview} />
          <div className="cine-hero-copy">
            <div className="landing-eyebrow light">
              <span /> HEAT-AWARE WALKING FOR CAMPUSES AND CITIES
            </div>
            <h1>
              The cooler way across campus
              <br />
              <em>is already there.</em>
            </h1>
            <p>
              Walk-Free maps where the sun hits and where the shade falls, hour
              by hour, and finds the walk that keeps you cool, with step-free,
              night and cool-stop routes when you need them.
            </p>
            <div className="hero-actions">
              <a className="landing-button bright" href={start}>
                {signedIn ? "Go to your home" : "Try the demo, no sign-up"}{" "}
                <ArrowUpRight size={19} />
              </a>
              <a className="text-link light" href="#preview">
                See it work <ArrowDown size={16} />
              </a>
            </div>
            <p className="hero-meta">
              <Sparkles size={14} aria-hidden /> Built on Meta's Muse Spark,
              Muse Image and the DINOv3 canopy map
            </p>
            {ut && (
              <p className="cine-stat">
                At 3 PM in July, {ut.hottest.name} feels like{" "}
                <strong>{ut.hottest.feels_f}°F</strong> in full sun. Walk-Free
                shows you the shade.
              </p>
            )}
          </div>
        </section>

        <section
          className="number-band reveal"
          aria-label="Walk-Free by the numbers"
        >
          <div>
            <strong>6</strong>
            <span>campuses ready instantly</span>
          </div>
          <div>
            <strong>
              {totals.buildings ? (
                <CountUp value={totals.buildings} />
              ) : (
                "10,000+"
              )}
            </strong>
            <span>buildings mapped</span>
          </div>
          <div>
            <strong>
              {totals.km ? (
                <CountUp value={totals.km} suffix=" km" />
              ) : (
                "900+ km"
              )}
            </strong>
            <span>of walkable paths</span>
          </div>
          <div>
            <strong>
              {ut?.shade_route
                ? `${semesterHours(ut.shade_route.sun_minutes_saved)} h`
                : "6"}
            </strong>
            <span>
              {ut?.shade_route
                ? "less in full sun per semester at UT Austin"
                : "ways to choose a route"}
            </span>
          </div>
        </section>

        <section className="landing-how landing-meta" id="built-with-meta">
          <div className="section-intro reveal">
            <span className="landing-eyebrow" translate="no">
              BUILT WITH META AI
            </span>
            <h2>
              Meta's models and maps,
              <br />
              <em>pointed at the heat.</em>
            </h2>
            <p>
              Muse Spark doesn't just chat: it plans routes, moves the clock,
              ranks hot streets and plants trees on the live map, in your own
              language. DINOv3's canopy map finds the trees OpenStreetMap is
              missing, and Muse Image turns a planted street into a photo.
            </p>
            <a
              className="landing-button meta-demo"
              href="/demo?area=ut-austin&tab=ask"
            >
              Ask Muse Spark on the map, no sign-up <ArrowUpRight size={16} />
            </a>
          </div>
          <ol className="step-cards">
            {META_PARTS.map((s, i) => (
              <li
                className="reveal"
                key={s.title}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <s.icon size={24} aria-hidden />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          {campusData?.campuses.some((c) => c.canopy_trees) && (
            <p className="meta-trees reveal">
              Across the six campuses:{" "}
              <strong>
                {campusData.campuses
                  .reduce((n, c) => n + (c.mapped_trees ?? 0), 0)
                  .toLocaleString("en-US")}
              </strong>{" "}
              trees mapped in OpenStreetMap, and{" "}
              <strong>
                {campusData.campuses
                  .reduce((n, c) => n + (c.canopy_trees ?? 0), 0)
                  .toLocaleString("en-US")}
              </strong>{" "}
              more tree crowns found by Meta's DINOv3 canopy map.
            </p>
          )}
        </section>

        <section className="landing-preview reveal" id="preview">
          <div className="section-intro">
            <span className="landing-eyebrow">SEE THE HEAT</span>
            <h2>
              Same street, different hour.
              <br />
              <em>Very different walk.</em>
            </h2>
            <p>
              This is the real map around UT Austin's Speedway. Drag through the
              day and watch shade move, then plant a row of trees and see how
              much cooler the street gets.
            </p>
          </div>
          <HeatPreview preview={preview} />
        </section>

        <section className="landing-how" id="how-it-works">
          <div className="section-intro reveal">
            <span className="landing-eyebrow">HOW IT WORKS</span>
            <h2>
              From “where's GDC?”
              <br />
              <em>to a cooler walk there.</em>
            </h2>
          </div>
          <ol className="step-cards">
            {STEPS.map((s, i) => (
              <li
                className="reveal"
                key={s.title}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <span className="step-number">0{i + 1}</span>
                <s.icon size={24} aria-hidden />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="feature-tour">
          {FEATURES.map((f, i) => (
            <div
              className={`feature-row reveal ${i % 2 ? "flip" : ""}`}
              key={f.title}
            >
              <div
                className={`feature-visual tone-${f.tone}`}
                aria-hidden="true"
              >
                <FeatureScene tone={f.tone} />
              </div>
              <div className="feature-copy">
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="campus-gallery" id="campuses">
          <div className="section-intro reveal">
            <span className="landing-eyebrow">CAMPUSES</span>
            <h2>
              Six campuses,
              <br />
              <em>every building and path.</em>
            </h2>
            {campusData && (
              <p className="fine-note">
                {campusData.scenario}. A semester is four walks a weekday for 15
                weeks. Model estimates.
              </p>
            )}
          </div>
          <div className="campus-cards">
            {campuses.map((c, i) => (
              <a
                className="campus-card reveal"
                key={c.slug}
                href={`/demo?area=${c.slug}`}
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <div className="campus-card-head">
                  <h3>{c.name}</h3>
                  <span>{c.air_f}°F July high</span>
                </div>
                <dl>
                  <div className="hot">
                    <dt>Hottest walk at 3 PM</dt>
                    <dd>
                      {c.hottest.name} · <strong>{c.hottest.feels_f}°F</strong>
                    </dd>
                  </div>
                  <div className="cool">
                    <dt>Shadiest street</dt>
                    <dd>
                      {c.coolest.name} · <strong>{c.coolest.feels_f}°F</strong>,{" "}
                      {c.coolest.shaded_percent}% shade
                    </dd>
                  </div>
                  {c.shade_route && (
                    <div className="cool">
                      <dt>Shade route on typical walks</dt>
                      <dd>
                        avoids{" "}
                        <strong>{c.shade_route.sun_avoided_percent}%</strong> of
                        the sun for {c.shade_route.extra_distance_percent}% more
                        walking: about{" "}
                        <strong>
                          {semesterHours(c.shade_route.sun_minutes_saved)} hours
                        </strong>{" "}
                        less in full sun over a semester
                      </dd>
                    </div>
                  )}
                </dl>
                <p>
                  {c.buildings.toLocaleString()} buildings · {c.paths_km} km of
                  paths
                </p>
                <span className="campus-open">
                  Open {c.name} <ArrowUpRight size={15} />
                </span>
              </a>
            ))}
          </div>
          <a className="campus-more reveal" href="/demo?area=midtown-manhattan">
            Also ready: <strong>Midtown Manhattan</strong>, from Times Square to
            the Chrysler Building <ArrowUpRight size={15} aria-hidden />
          </a>
        </section>

        <section className="fiction-section" id="fictional-cities">
          <div className="section-intro reveal">
            <span className="landing-eyebrow">FICTIONAL CITIES</span>
            <h2>
              Seven invented cities,
              <br />
              <em>each with its own weather.</em>
            </h2>
            <p className="fine-note">
              Rain-dark harbor towers, a golden citadel under the aurora, a
              garden city under a forest canopy. In the desert city of Dune
              Reach at 3 PM, the open boulevard bakes while the shade route
              through the old quarter's lanes stays almost entirely shaded.
            </p>
          </div>
          <FictionGallery base={signedIn ? "/app" : "/demo"} reveal />
          <a
            className="fiction-generate reveal"
            href={signedIn ? "/app?generate=" : "/demo?generate="}
          >
            <Sparkles size={16} aria-hidden /> Or describe any city, real or
            imagined, and walk it in a minute{" "}
            <ArrowUpRight size={15} aria-hidden />
          </a>
        </section>

        <section className="landing-ask reveal" id="assistant">
          <div className="section-intro">
            <span className="landing-eyebrow">ASK WALK-FREE</span>
            <h2>
              Plans the walk,
              <br />
              <em>not just a reply.</em>
            </h2>
            <p>
              The assistant uses the same map, weather and heat model you see.
              It plans routes, moves the time, highlights streets and plants
              trees, then explains in a sentence or two, out loud if you like.
            </p>
            <p className="ask-key">
              <KeyRound size={16} /> Try a few questions free in the demo, or
              bring your own key for the Meta Model API or an open Muse host. It
              stays in your browser.
            </p>
          </div>
          <ChatDemo />
        </section>

        <section className="landing-faq" id="faq">
          <div className="section-intro reveal">
            <span className="landing-eyebrow">QUESTIONS</span>
            <h2>
              Honest answers,
              <br />
              <em>including the limits.</em>
            </h2>
          </div>
          <div className="faq-list">
            {FAQ.map((f) => (
              <details className="reveal" key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cine-end">
          <MapIcon size={30} strokeWidth={1.3} />
          <h2>
            Your next walk
            <br />
            <em>can be cooler.</em>
          </h2>
          <div className="hero-actions">
            <a className="landing-button bright" href={start}>
              {signedIn ? "Open the map" : "Try the demo"}{" "}
              <ArrowUpRight size={18} />
            </a>
            {!signedIn && (
              <a className="text-link light" href="/signup">
                Create a free account
              </a>
            )}
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <Brand />
        <p>Explore thoughtfully. Walk freely.</p>
        <a href="/privacy">Privacy & data</a>
        <span>
          Map data © OpenStreetMap contributors · Weather by Open-Meteo.com
        </span>
      </footer>
    </div>
  );
}
