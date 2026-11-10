import { useEffect, useRef, useState } from "react";
import { CalendarClock, Pause, Play, Sun } from "lucide-react";
import type { DayLeg, DayPlan, DayStop } from "../lib/day-plan";
import { placeName } from "../lib/destinations";
import { formatTemp, useUnit } from "../lib/units";

const clock = (hour: number) => {
  const h = Math.floor(hour),
    m = Math.round((hour % 1) * 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const place = (stop: DayStop) => placeName(stop);
const STEP_MS = 2600;

/**
 * A simulated day here: six ordinary walks from morning coffee to home,
 * each planned in shade at its own hour. Play steps through them on the map.
 */
export default function DayInLife({
  plan,
  busy,
  onPlan,
  onShow,
  autoPlay = false,
}: {
  plan: DayPlan | null;
  /** Play a newly made plan straight away (the guided tour). */
  autoPlay?: boolean;
  busy: boolean;
  /** Plan (or re-plan) the day for the current area and weather. */
  onPlan: () => void;
  /** Put a leg on the map: its endpoints, route and hour. */
  onShow: (leg: DayLeg) => void;
}) {
  const unit = useUnit();
  const [active, setActive] = useState<number | null>(null);
  // Mounting with a plan already made (the tour switches tab and plans in
  // one go) still plays when asked.
  const [playing, setPlaying] = useState(() => !!plan && autoPlay);
  const show = useRef(onShow);
  show.current = onShow;
  // A new plan starts from the top, not where the last one stopped.
  const [planned, setPlanned] = useState(plan);
  if (planned !== plan) {
    setPlanned(plan);
    setActive(null);
    setPlaying(!!plan && autoPlay);
  }
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (playing)
      root.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [playing]);
  useEffect(() => {
    if (!playing || !plan) return;
    let i = active === null || active >= plan.legs.length ? 0 : active;
    if (!plan.legs[i]) return;
    show.current(plan.legs[i]);
    setActive(i);
    const timer = setInterval(() => {
      i += 1;
      if (!plan.legs[i]) {
        setPlaying(false);
        return;
      }
      show.current(plan.legs[i]);
      setActive(i);
    }, STEP_MS);
    return () => clearInterval(timer);
    // Restart only when play is pressed or the plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, plan]);
  if (!plan)
    return (
      <div className="day-life empty">
        <div className="section-title">
          <CalendarClock size={17} aria-hidden /> A day in the life
        </div>
        <p>
          Live an ordinary day here: coffee, work, lunch outside, an errand and
          home, each walk planned in shade at its own hour.
        </p>
        <button className="secondary" onClick={onPlan} disabled={busy}>
          {busy ? "Planning the day…" : "Plan a day here"}
        </button>
      </div>
    );
  const saved = Math.max(0, plan.quickSunMinutes - plan.sunMinutes);
  return (
    <div className="day-life" ref={root}>
      <div className="section-title">
        <CalendarClock size={17} aria-hidden /> A day in the life
      </div>
      <p className="day-summary">
        <strong>{Math.round(plan.walkMinutes)} min</strong> of walking ·{" "}
        <strong>{Math.round(plan.sunMinutes)} min</strong> in the sun
        {saved >= 1 && (
          <>
            {" "}
            · <strong>{Math.round(saved)} min</strong> less than the quickest
            routes
          </>
        )}
      </p>
      <ol className="day-legs">
        {plan.legs.map((leg, i) => (
          <li key={i} className={active === i ? "on" : ""}>
            <button
              type="button"
              aria-current={active === i ? "step" : undefined}
              onClick={() => {
                setPlaying(false);
                setActive(i);
                onShow(leg);
              }}
            >
              <span className="day-time">{clock(leg.hour)}</span>
              <span className="day-what">
                <strong>{leg.title}</strong>
                <small>
                  {place(leg.from)} → {place(leg.to)}
                </small>
              </span>
              <span className="day-heat">
                {formatTemp(leg.feelsLikeC, unit)}
                <small>
                  <Sun size={11} aria-hidden /> {Math.round(leg.sunMinutes)} min
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="day-actions">
        <button
          className="secondary"
          onClick={() => {
            if (!playing && active !== null && active >= plan.legs.length - 1)
              setActive(null);
            setPlaying(!playing);
          }}
        >
          {playing ? (
            <>
              <Pause size={15} aria-hidden /> Pause the day
            </>
          ) : (
            <>
              <Play size={15} aria-hidden /> Play the day&apos;s walks
            </>
          )}
        </button>
        <button className="text-button" onClick={onPlan} disabled={busy}>
          Re-plan for this weather
        </button>
      </div>
      {plan.hottest && (
        <p className="fine">
          Hottest walk: {plan.hottest.title.toLowerCase()} at{" "}
          {clock(plan.hottest.hour)}, about{" "}
          {formatTemp(plan.hottest.feelsLikeC, unit)}. Estimates from the
          modeled shade and your weather.
        </p>
      )}
    </div>
  );
}
