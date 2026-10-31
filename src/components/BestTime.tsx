import { Clock } from "lucide-react";
import type { BestTime as Plan } from "../lib/best-time";
import { heatLevel, HEAT_LEVELS, toF } from "../lib/heat";

const clock = (hour: number) =>
  hour === 12 ? "noon" : `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;

/**
 * How the chosen route feels for each hour you could set off today, with
 * the coolest hour called out. Tapping an hour moves the time there.
 */
export default function BestTime({
  plan,
  onPick,
}: {
  plan: Plan | null;
  /** Moves the time to this hour, on the day shown or the next one. */
  onPick: (hour: number, dayOffset: 0 | 1) => void;
}) {
  if (!plan) return null;
  const temps = plan.hours.map((h) => toF(h.feelsLikeC));
  const [low, high] = [Math.min(...temps), Math.max(...temps)];
  const tomorrow = plan.dayOffset === 1;
  const later =
    !tomorrow && plan.best.hour !== plan.now.hour && plan.savingF >= 2;
  return (
    <section className="best-time" aria-labelledby="best-time-title">
      <div className="section-title" id="best-time-title">
        <Clock size={17} aria-hidden /> Best time to go
        {tomorrow ? " tomorrow" : ""}
      </div>
      <p className="best-time-summary">
        {tomorrow ? (
          <>
            Leave at <strong>{clock(plan.best.hour)}</strong> tomorrow: about{" "}
            {Math.round(toF(plan.best.feelsLikeC))}°F, the coolest walk of the
            day.
          </>
        ) : later ? (
          <>
            Leave at <strong>{clock(plan.best.hour)}</strong>: about{" "}
            {Math.round(toF(plan.best.feelsLikeC))}°F, {plan.savingF}° cooler
            than now.
          </>
        ) : (
          <>Now is as cool as this walk gets today.</>
        )}
      </p>
      <div
        className="best-time-bars"
        role="group"
        aria-label="Feels-like by hour"
      >
        {plan.hours.map((h) => {
          const f = toF(h.feelsLikeC);
          const height = high > low ? 18 + ((f - low) / (high - low)) * 42 : 30;
          return (
            <button
              key={h.hour}
              className={h.hour === plan.best.hour ? "best" : ""}
              aria-label={`Leave at ${clock(h.hour)}${tomorrow ? " tomorrow" : ""}: about ${Math.round(f)}°F, ${Math.round(h.shade * 100)}% shade${h.hour === plan.best.hour ? ", the coolest time still ahead" : ""}`}
              title={`${clock(h.hour)} · ${Math.round(f)}°F`}
              onClick={() => onPick(h.hour, plan.dayOffset)}
            >
              <i
                style={{
                  height,
                  background: HEAT_LEVELS[heatLevel(h.feelsLikeC)].color,
                }}
              />
              <small>{h.hour % 3 === 0 ? clock(h.hour) : ""}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
