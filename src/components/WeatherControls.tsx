import { Flame, Snowflake, Sun, CloudSun, Droplets, Radio } from "lucide-react";
import type { Environment, World } from "../../shared/types";
import { atLocalHour, heatConditions, localHour, readHeat } from "../lib/heat";
import { formatTemp, inUnit, type TempUnit } from "../lib/units";

/** One-tap weather scenarios, from a heatwave to a cool day. */
export const WEATHER_PRESETS = [
  {
    id: "heatwave",
    label: "Heatwave",
    icon: Flame,
    temperatureC: 41,
    humidity: 22,
    cloudCover: 0,
    windMps: 1,
  },
  {
    id: "humid",
    label: "Hot & humid",
    icon: Droplets,
    temperatureC: 34,
    humidity: 70,
    cloudCover: 20,
    windMps: 2,
  },
  {
    id: "summer",
    label: "Summer day",
    icon: Sun,
    temperatureC: 31,
    humidity: 45,
    cloudCover: 15,
    windMps: 3,
  },
  {
    id: "mild",
    label: "Mild",
    icon: CloudSun,
    temperatureC: 22,
    humidity: 50,
    cloudCover: 35,
    windMps: 3,
  },
  {
    id: "cool",
    label: "Cool",
    icon: Snowflake,
    temperatureC: 11,
    humidity: 60,
    cloudCover: 55,
    windMps: 5,
  },
] as const;

/** A typical hot July afternoon, for seeing shade at its most useful. */
const JULY = { temperatureC: 36, humidity: 42, cloudCover: 5, windMps: 2 };
/** The same place on a typical July afternoon at 3 PM local time. */
export function julyAfternoon(previous: Environment, timeZone: string) {
  return {
    ...previous,
    ...JULY,
    dateTime: atLocalHour(
      `${new Date(previous.dateTime).getUTCFullYear()}-07-15T12:00:00Z`,
      timeZone,
      15,
    ),
    weatherMode: "scenario" as const,
  };
}

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Weather you can set by hand: presets, sliders in the person's units, the
 * date in the area's own time, and what that feels like in sun and shade.
 */
export default function WeatherControls({
  env,
  setEnv,
  world,
  unit,
  onLive,
  compact = false,
}: {
  env: Environment;
  setEnv: (update: (previous: Environment) => Environment) => void;
  world: Pick<World, "origin" | "timezone">;
  unit: TempUnit;
  /** Switch back to live weather for the area. */
  onLive?: () => void;
  /** Fewer controls, for the popover on the map. */
  compact?: boolean;
}) {
  const conditions = heatConditions(env, world.origin);
  const inSun = readHeat(conditions, 0).feelsLikeC;
  const inShade = readHeat(conditions, 1).feelsLikeC;
  const live = env.weatherMode === "forecast";
  const scenario = (changes: Partial<Environment>) =>
    setEnv((previous) => ({
      ...previous,
      ...changes,
      weatherMode: "scenario",
    }));
  const active = WEATHER_PRESETS.find(
    (p) =>
      !live &&
      p.temperatureC === env.temperatureC &&
      p.humidity === env.humidity &&
      p.cloudCover === env.cloudCover &&
      p.windMps === env.windMps,
  )?.id;
  const julyActive =
    !live &&
    localDate(env.dateTime, world.timezone).slice(5) === "07-15" &&
    env.temperatureC === JULY.temperatureC &&
    env.humidity === JULY.humidity;
  const minC = -10,
    maxC = 48;
  return (
    <div className={`weather-controls${compact ? " compact" : ""}`}>
      <div className="weather-feels" aria-live="polite">
        <div>
          <small>In full sun</small>
          <strong className="hot">{formatTemp(inSun, unit)}</strong>
        </div>
        <div>
          <small>In shade</small>
          <strong className="cool">{formatTemp(inShade, unit)}</strong>
        </div>
        <div>
          <small>Air</small>
          <strong>{formatTemp(env.temperatureC, unit)}</strong>
        </div>
      </div>
      <div className="weather-presets" role="group" aria-label="Weather">
        {onLive && (
          <button
            type="button"
            aria-pressed={live}
            onClick={onLive}
            title="Live weather for this area"
          >
            <Radio size={14} aria-hidden /> Live
          </button>
        )}
        <button
          type="button"
          aria-pressed={julyActive}
          title="Mid-July at 3 PM local time, a typical hot afternoon"
          onClick={() =>
            setEnv((previous) => julyAfternoon(previous, world.timezone))
          }
        >
          <Flame size={14} aria-hidden /> July afternoon
        </button>
        {WEATHER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={active === p.id}
            onClick={() =>
              scenario({
                temperatureC: p.temperatureC,
                humidity: p.humidity,
                cloudCover: p.cloudCover,
                windMps: p.windMps,
              })
            }
          >
            <p.icon size={14} aria-hidden /> {p.label}
          </button>
        ))}
      </div>
      <label className="weather-slider">
        <span>
          Air temperature <b>{formatTemp(env.temperatureC, unit)}</b>
        </span>
        <input
          type="range"
          min={minC}
          max={maxC}
          step={0.5}
          value={env.temperatureC}
          aria-valuetext={formatTemp(env.temperatureC, unit)}
          onChange={(e) => scenario({ temperatureC: +e.target.value })}
        />
        <span className="weather-scale" aria-hidden>
          <small>{Math.round(inUnit(minC, unit))}°</small>
          <small>{Math.round(inUnit(maxC, unit))}°</small>
        </span>
      </label>
      <label className="weather-slider">
        <span>
          Humidity <b>{env.humidity}%</b>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={env.humidity}
          onChange={(e) => scenario({ humidity: +e.target.value })}
        />
      </label>
      {!compact && (
        <>
          <label className="weather-slider">
            <span>
              Cloud cover <b>{env.cloudCover}%</b>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={env.cloudCover}
              onChange={(e) => scenario({ cloudCover: +e.target.value })}
            />
          </label>
          <label className="weather-slider">
            <span>
              Wind{" "}
              <b>
                {unit === "F"
                  ? `${Math.round(env.windMps * 2.237)} mph`
                  : `${env.windMps} m/s`}
              </b>
            </span>
            <input
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={env.windMps}
              onChange={(e) => scenario({ windMps: +e.target.value })}
            />
          </label>
          <label className="weather-slider">
            <span>Date (local time)</span>
            <input
              className="text-field"
              type="date"
              value={localDate(env.dateTime, world.timezone)}
              onChange={(e) => {
                const day = e.target.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
                setEnv((previous) => ({
                  ...previous,
                  dateTime: atLocalHour(
                    `${day}T12:00:00Z`,
                    world.timezone,
                    localHour(previous.dateTime, world.timezone),
                  ),
                  weatherMode: "scenario",
                }));
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
