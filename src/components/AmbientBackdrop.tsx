import { useMemo } from "react";
import "../ambient.css";

/** How a fictional city's sky looks and moves. */
export interface Ambient {
  /** Sky gradient, top then horizon. */
  sky: [string, string];
  /** Haze colour where far streets fade out. */
  fog: string;
  /** Light colour for windows, sparks and aurora. */
  accent: string;
  particles: "rain" | "sun" | "sparks" | "aurora" | "mist";
  /** A city that lives after dark. */
  night: boolean;
  /** 0 by day to 1 after sunset, when the sky follows the clock. */
  nightness?: number;
}

/** Deterministic pseudo-random spread, so renders don't shuffle. */
export function spread(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const COUNTS: Record<Ambient["particles"], number> = {
  rain: 70,
  sun: 18,
  sparks: 14,
  aurora: 4,
  mist: 5,
};

/**
 * The sky behind a fictional city plus a light layer of weather over it.
 * Purely decorative: it never takes pointer events and stays still for
 * people who ask for less motion.
 */
export default function AmbientBackdrop({
  ambient,
  layer,
  density = 1,
}: {
  ambient: Ambient;
  /** "sky" sits behind the 3D scene, "weather" floats above it. */
  layer: "sky" | "weather";
  /** Share of the full particle count, for small previews. */
  density?: number;
}) {
  const kind = ambient.particles;
  const bits = useMemo(
    () =>
      Array.from({ length: Math.ceil(COUNTS[kind] * density) }, (_, i) => ({
        x: spread(i, 1) * 100,
        y: spread(i, 2) * 100,
        d: spread(i, 3),
        s: spread(i, 4),
      })),
    [kind, density],
  );
  const style = {
    ["--sky-top" as string]: ambient.sky[0],
    ["--sky-bottom" as string]: ambient.sky[1],
    ["--fog" as string]: ambient.fog,
    ["--accent" as string]: ambient.accent,
    ["--night" as string]: (
      ambient.nightness ?? (ambient.night ? 1 : 0)
    ).toFixed(2),
  };
  if (layer === "sky")
    return (
      <div
        className={`ambient-sky ambient-${kind}`}
        style={style}
        aria-hidden
      />
    );
  return (
    <div
      className={`ambient-weather ambient-${kind}`}
      style={style}
      aria-hidden
    >
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: `${b.x}%`,
            top:
              kind === "aurora" || kind === "mist"
                ? `${b.y * 0.5}%`
                : undefined,
            ["--d" as string]: b.d.toFixed(3),
            ["--s" as string]: b.s.toFixed(3),
          }}
        />
      ))}
    </div>
  );
}
