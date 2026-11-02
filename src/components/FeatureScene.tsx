import {
  AlertTriangle,
  Footprints,
  Moon,
  Snowflake,
  Sparkles,
  Sun,
  Trees,
  Accessibility,
} from "lucide-react";

/**
 * Small drawn scenes for the landing page's feature tour. They echo the
 * app's own UI; every number shown is labelled as an example.
 */
export type SceneTone =
  "heat" | "routes" | "ask" | "trees" | "alert" | "generate" | "street";

/** A city rising from a sentence: the prompt, then its skyline. */
function GenerateScene() {
  const towers = [
    [4, 38],
    [11, 62],
    [17, 48],
    [23, 86, 1],
    [30, 54],
    [36, 70],
    [43, 96, 2],
    [50, 58],
    [56, 74],
    [62, 44],
    [68, 82, 1],
    [75, 52],
    [81, 66],
    [88, 40],
    [94, 56],
  ] as const;
  return (
    <div className="scene scene-generate">
      <p className="scene-prompt">
        <Sparkles size={13} aria-hidden /> “A rain-soaked gothic city from a 90s
        noir cartoon”
      </p>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
        {towers.map(([x, h, top], i) => (
          <g key={i} className="scene-tower" style={{ ["--i" as string]: i }}>
            <rect x={x} y={60 - h * 0.55} width={5} height={h * 0.55} />
            {top === 1 && (
              <polygon
                points={`${x},${60 - h * 0.55} ${x + 2.5},${60 - h * 0.55 - 8} ${x + 5},${60 - h * 0.55}`}
              />
            )}
            {top === 2 && <circle cx={x + 2.5} cy={60 - h * 0.55 - 3} r={3} />}
          </g>
        ))}
      </svg>
      <p className="scene-built">Ravenmoor · 930 buildings · built in 0.2 s</p>
    </div>
  );
}

/** Eye level between the buildings, with the day's walks below. */
function StreetScene() {
  const day = [
    ["8:00", "Coffee"],
    ["12:30", "Lunch outside"],
    ["5:30", "Library"],
    ["6:15", "Home"],
  ];
  return (
    <div className="scene scene-street">
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden>
        <polygon className="street-ground" points="0,62 100,62 56,30 44,30" />
        <polygon className="street-left" points="0,0 40,24 40,32 0,56" />
        <polygon className="street-right" points="100,0 60,24 60,32 100,56" />
        <polygon className="street-shade" points="44,30 56,30 70,46 30,46" />
        <circle className="street-walker" cx={50} cy={50} r={2.2} />
      </svg>
      <ol className="scene-day">
        {day.map(([t, what], i) => (
          <li key={t} style={{ ["--i" as string]: i }}>
            <b>{t}</b> {what}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Street colours from cool (shade) to hot (sun), as in the app. */
const RAMP = ["#4f8a9c", "#6f9b5f", "#d9b142", "#d7772d", "#b13a2b"];

/** A small street grid; each segment has a heat level from 0 to 4. */
const STREETS: [number, number, number, number, number][] = [
  [40, 60, 220, 60, 3],
  [220, 60, 400, 60, 4],
  [400, 60, 560, 60, 2],
  [40, 170, 220, 170, 1],
  [220, 170, 400, 170, 4],
  [400, 170, 560, 170, 3],
  [40, 280, 220, 280, 0],
  [220, 280, 400, 280, 2],
  [400, 280, 560, 280, 1],
  [120, 20, 120, 330, 1],
  [300, 20, 300, 120, 3],
  [300, 120, 300, 330, 4],
  [480, 20, 480, 330, 0],
];

function HeatScene() {
  return (
    <div className="scene scene-heat">
      <svg viewBox="0 0 600 350" aria-hidden>
        {[
          [60, 85, 40, 60],
          [150, 85, 120, 60],
          [330, 85, 120, 60],
          [60, 195, 40, 60],
          [150, 195, 120, 60],
          [330, 195, 120, 60],
          [510, 85, 40, 60],
          [510, 195, 40, 60],
        ].map(([x, y, w, h], i) => (
          <rect
            key={i}
            className="scene-block"
            x={x}
            y={y}
            width={w}
            height={h}
            rx={4}
          />
        ))}
        {STREETS.map(([x1, y1, x2, y2, level], i) => (
          <line
            key={i}
            className="scene-street"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={RAMP[level]}
            style={{ ["--i" as string]: i }}
          />
        ))}
        <circle className="scene-tap" cx={300} cy={225} r={9} />
      </svg>
      <div className="scene-card scene-tap-card">
        <small>Speedway at 3 PM · example</small>
        <div className="scene-bars">
          <span>
            Sun <b style={{ width: "92%" }} />
          </span>
          <span>
            Shade <b className="cool" style={{ width: "62%" }} />
          </span>
        </div>
        <svg className="scene-spark" viewBox="0 0 120 30" aria-hidden>
          <path d="M0 26 C20 25 30 20 45 12 S70 2 80 4 100 18 120 24" />
        </svg>
        <small>Peaks mid-afternoon</small>
      </div>
    </div>
  );
}

function RoutesScene() {
  const chips = [
    { icon: Footprints, label: "Quickest" },
    { icon: Sun, label: "More shade" },
    { icon: Trees, label: "Scenic" },
    { icon: Snowflake, label: "Cool stops" },
    { icon: Accessibility, label: "Step-free" },
    { icon: Moon, label: "Lit at night" },
  ];
  return (
    <div className="scene scene-routes">
      <svg viewBox="0 0 600 260" aria-hidden>
        <path
          className="scene-route quick"
          pathLength={1}
          d="M70 200 L250 200 L250 70 L530 70"
        />
        <path
          className="scene-route shade"
          pathLength={1}
          d="M70 200 C140 200 150 150 200 140 S300 160 330 120 400 110 440 95 520 80 530 70"
        />
        <circle className="scene-pin start" cx={70} cy={200} r={10} />
        <circle className="scene-pin end" cx={530} cy={70} r={10} />
      </svg>
      <div className="feature-chips">
        {chips.map((c, i) => (
          <span key={c.label} style={{ ["--i" as string]: i }}>
            <c.icon size={14} aria-hidden /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function AskScene() {
  return (
    <div className="scene scene-ask">
      <p className="scene-bubble me">
        Shadiest way from Andrews Hall to GDC at 3?
      </p>
      <p className="scene-tools">
        <Sparkles size={13} aria-hidden /> plan_route · best_time_to_leave
      </p>
      <p className="scene-bubble">
        The shade route is a minute longer and keeps you under buildings and
        trees most of the way. It&apos;s on the map now.
      </p>
      <span className="scene-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function TreesScene() {
  return (
    <div className="scene scene-trees">
      <svg viewBox="0 0 600 300" aria-hidden>
        <rect className="scene-road" x={30} y={128} width={540} height={44} />
        <line className="scene-road-line" x1={40} y1={150} x2={560} y2={150} />
        {Array.from({ length: 9 }, (_, i) => (
          <g
            key={i}
            className="scene-tree"
            style={{ ["--i" as string]: i }}
            transform={`translate(${70 + i * 58} ${i % 2 ? 196 : 104})`}
          >
            <circle className="shadow" cx={10} cy={12} r={24} />
            <circle className="crown" r={20} />
          </g>
        ))}
      </svg>
      <div className="scene-card scene-delta">
        <small>Shade on this street · example</small>
        <div className="scene-bars">
          <span>
            Before <b className="hot" style={{ width: "22%" }} />
          </span>
          <span>
            After <b className="cool grow" style={{ width: "68%" }} />
          </span>
        </div>
      </div>
    </div>
  );
}

function AlertScene() {
  const week = [1, 2, 3, 3, 4, 2, 1];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const colours = ["#6f9b5f", "#d9b142", "#d7772d", "#b13a2b", "#8e2a6b"];
  return (
    <div className="scene scene-alert">
      <div className="scene-card scene-warning">
        <AlertTriangle size={18} aria-hidden />
        <span>
          <strong>Heat advisory</strong>
          <small>National Weather Service · example</small>
        </span>
      </div>
      <ol className="scene-week">
        {week.map((level, i) => (
          <li key={days[i]} style={{ ["--i" as string]: i }}>
            <b style={{ background: colours[level] }} />
            <small>{days[i]}</small>
          </li>
        ))}
      </ol>
      <p className="scene-note">Shade in 80 m · next stretch 3 °F cooler</p>
    </div>
  );
}

export default function FeatureScene({ tone }: { tone: SceneTone }) {
  switch (tone) {
    case "heat":
      return <HeatScene />;
    case "routes":
      return <RoutesScene />;
    case "ask":
      return <AskScene />;
    case "trees":
      return <TreesScene />;
    case "generate":
      return <GenerateScene />;
    case "street":
      return <StreetScene />;
    case "alert":
      return <AlertScene />;
  }
}
