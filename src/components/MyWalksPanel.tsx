import { useRef } from "react";
import {
  Share2,
  Bell,
  CalendarPlus,
  Brain,
  Clock,
  Download,
  Footprints,
  Home,
  LocateFixed,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import type { PaceProfile } from "../lib/ml/pace-model";
import { POPULATION_SPEED } from "../lib/ml/pace-model";
import type { Place, Routine } from "../lib/ml/routines";
import { PERSONAS, type PersonaGuess, type PersonaId } from "../lib/ml/persona";
import { dayWord, type ReminderResult } from "../lib/leave-reminder";
import type { SunWeek } from "../lib/ml/exposure";

const clock = (t: number) =>
  new Date(t).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
/** "9:37 AM", or "9:37 AM tomorrow" / "Monday" when not today. */
const when = (t: number) => {
  const day = dayWord(t);
  return day ? `${clock(t)} ${day}` : clock(t);
};
const minuteClock = (m: number) => {
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return clock(d.getTime());
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const days = (ds: number[]) =>
  ds.length === 5 && ds.every((d) => d >= 1 && d <= 5)
    ? "weekdays"
    : ds.map((d) => DAYS[d]).join(", ");

export interface LeaveBy {
  routine: Routine;
  arriveBy: number;
  leaveAt: number;
  minutes: number;
  standardMinutes: number;
}

/** Roles a person can pick for themselves; "auto" learns it from walks. */
export const ROLES: { id: string; label: string; persona?: PersonaId }[] = [
  { id: "auto", label: "Let Walk-Free learn it from my walks" },
  { id: "ut-austin", label: "UT Austin student", persona: "campus-student" },
  {
    id: "uc-berkeley",
    label: "UC Berkeley student",
    persona: "campus-student",
  },
  {
    id: "campus",
    label: "Student at another campus",
    persona: "campus-student",
  },
  {
    id: "commuter",
    label: "City commuter (NYC and the like)",
    persona: "city-commuter",
  },
  { id: "night", label: "Mostly out after dark", persona: "night-owl" },
  {
    id: "explorer",
    label: "Exploring at weekends",
    persona: "weekend-explorer",
  },
];

/**
 * My walks: what Walk-Free has learned from walking with you, on this
 * device only. Your pace (a small neural network), your places and
 * routines, when to leave next, and what kind of walker you are.
 */
export default function MyWalksPanel({
  learning,
  onLearning,
  following,
  onFollow,
  walks,
  samples,
  pace,
  places,
  routines,
  leave,
  remind,
  leaveAdvice,
  reminder,
  onRemind,
  onCalendar,
  persona,
  role,
  onRole,
  shadeAboveC,
  sun,
  streak,
  onShareWeek,
  formatTemp,
  onSample,
  onExport,
  onImport,
  onDelete,
}: {
  learning: boolean;
  onLearning: (on: boolean) => void;
  following: boolean;
  onFollow: () => void;
  /** Real walks logged. */
  walks: number;
  /** Whether what's shown is learned from sample walks. */
  samples: boolean;
  pace: PaceProfile;
  places: Place[];
  routines: Routine[];
  leave: LeaveBy | null;
  /** Whether reminders to leave are on, and how the last one was set. */
  remind: boolean;
  /** How hot the next walk will be, and the shade route's gain. */
  leaveAdvice?: string | null;
  reminder: { result: ReminderResult; at: number } | null;
  onRemind: (on: boolean) => void;
  /** Saves the routine as a repeating calendar event with an alert. */
  onCalendar?: () => void;
  persona: PersonaGuess;
  role: string;
  onRole: (role: string) => void;
  shadeAboveC: number | null;
  /** Direct sun on this map's walks, this week against last. */
  sun?: SunWeek | null;
  /** Days in a row with a logged walk (real walks only). */
  streak?: { days: number; today: boolean };
  /** Shares (or downloads) the week as a "my week in the shade" image. */
  onShareWeek?: () => void;
  formatTemp: (c: number) => string;
  onSample: () => void;
  onExport: () => void;
  /** Merges walks from an exported file (another device). */
  onImport: (file: File) => void;
  onDelete: () => void;
}) {
  const importInput = useRef<HTMLInputElement>(null);
  const kmh = (mps: number) => `${(mps * 3.6).toFixed(1)} km/h`;
  const chosen = ROLES.find((r) => r.id === role);
  const personaId = chosen?.persona ?? persona.id;
  const p = PERSONAS[personaId];
  const better =
    pace.modelMae !== null && pace.baselineMae
      ? Math.round((1 - pace.modelMae / pace.baselineMae) * 100)
      : null;
  return (
    <section className="my-walks" aria-labelledby="my-walks-title">
      <div className="section-title" id="my-walks-title">
        <Footprints size={17} aria-hidden /> My walks
      </div>
      <p className="intro-small">
        Walk-Free can learn how you walk: your pace, your daily routes and when
        you should leave. It all stays on this device.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={learning}
          onChange={(e) => onLearning(e.target.checked)}
        />
        Learn from my walks on this device
      </label>
      {learning && !following && (
        <button className="secondary" onClick={onFollow}>
          <LocateFixed size={15} aria-hidden /> Follow me and start logging
        </button>
      )}
      {samples && (
        <p className="sample-note" role="note">
          <Sparkles size={13} aria-hidden /> Showing what it learns from three
          weeks of <strong>sample walks</strong> on this map. Your own walks
          replace them as soon as you log some.
        </p>
      )}
      {streak && streak.days >= 2 && (
        <p className="walk-streak" role="status">
          <Footprints size={14} aria-hidden />
          <span>
            <strong>{streak.days} days</strong> in a row with a walk
            {streak.today ? "." : ": walk today to keep it going."}
          </span>
        </p>
      )}
      {!walks && !samples && (
        <button className="text-button" onClick={onSample}>
          Try it with sample walks
        </button>
      )}

      <div className="walk-card">
        <div className="walk-card-head">
          <Brain size={15} aria-hidden /> Your pace
        </div>
        <p className="walk-big">
          {kmh(pace.walks ? pace.median : POPULATION_SPEED)}
          <small>
            {pace.walks
              ? ` typical, from ${pace.walks} ${pace.walks === 1 ? "walk" : "walks"}`
              : " (average walker, until you log walks)"}
          </small>
        </p>
        {pace.model ? (
          <p className="fine">
            A neural network trained on {pace.stretches} stretches of your walks
            predicts your speed from the heat, the hour and how far into a walk
            you are
            {better !== null && better > 0
              ? `: ${better}% closer to your real times than a fixed pace`
              : ""}
            . Route times use it.
          </p>
        ) : (
          <p className="fine">
            After 6 walks a small neural network learns how heat and the time of
            day change your speed.
          </p>
        )}
      </div>

      {leave && (
        <div className="walk-card leave-card">
          <div className="walk-card-head">
            <Clock size={15} aria-hidden /> Leave by{" "}
            <strong>{when(leave.leaveAt)}</strong>
          </div>
          <p>
            {leave.routine.from.label} → {leave.routine.to.label}, to arrive by{" "}
            {clock(leave.arriveBy)} as you usually do.
          </p>
          <p className="fine">
            About {Math.round(leave.minutes)} min at your pace (the standard
            estimate says {Math.round(leave.standardMinutes)}), plus a{" "}
            {p.buffer}-minute buffer.
          </p>
          {leaveAdvice && <p className="leave-advice">{leaveAdvice}</p>}
          {onCalendar && (
            <button className="text-button" onClick={onCalendar}>
              <CalendarPlus size={13} aria-hidden /> Add to my calendar
            </button>
          )}
          <label className="check walk-remind">
            <input
              type="checkbox"
              checked={remind}
              onChange={(e) => onRemind(e.target.checked)}
            />
            <Bell size={14} aria-hidden /> Remind me 5 minutes before
          </label>
          {remind && reminder && (
            <p className="fine" role="status">
              {reminder.result === "native"
                ? `You'll get a notification at ${when(reminder.at)}.`
                : reminder.result === "web"
                  ? `You'll get a notification at ${when(reminder.at)} while Walk-Free is open in this browser. The phone app reminds you even when it's closed.`
                  : reminder.result === "denied"
                    ? "Notifications are blocked for Walk-Free. Allow them in your browser or phone settings to get reminders."
                    : "This browser can't show reminders."}
            </p>
          )}
        </div>
      )}

      {sun && sun.walks > 0 && (
        <div className="walk-card">
          <div className="walk-card-head">
            <Sun size={15} aria-hidden /> Sun on your walks this week
          </div>
          <p>
            <strong>{Math.round(sun.sunMinutes)}</strong> of{" "}
            {Math.round(sun.minutes)} walking minutes in direct sun (
            {Math.round((sun.sunMinutes / sun.minutes) * 100)}%)
            {sun.previousShare !== null &&
              (() => {
                const now = sun.sunMinutes / sun.minutes;
                const diff = Math.round((now - sun.previousShare) * 100);
                return Math.abs(diff) < 3
                  ? ", about the same as the week before."
                  : diff < 0
                    ? `, ${-diff} points less than the week before.`
                    : `, ${diff} points more than the week before.`;
              })()}
            {sun.previousShare === null && "."}
          </p>
          {sun.avoided && sun.avoided.walks > 0 && (
            <p className="sun-avoided">
              {sun.avoided.minutes >= 1 ? (
                <>
                  About <strong>{Math.round(sun.avoided.minutes)} min</strong>{" "}
                  less sun than the quickest ways would have given you
                </>
              ) : sun.avoided.minutes <= -1 ? (
                <>
                  About {Math.round(-sun.avoided.minutes)} min more sun than the
                  quickest ways
                </>
              ) : (
                <>About the same sun as the quickest ways</>
              )}{" "}
              ({sun.avoided.walks} walk{sun.avoided.walks === 1 ? "" : "s"}{" "}
              compared).
            </p>
          )}
          {onShareWeek && (
            <button className="text-button share-week" onClick={onShareWeek}>
              <Share2 size={14} aria-hidden /> Share my week
            </button>
          )}
          <p className="fine">
            Replayed against this map&apos;s buildings and trees at the hour you
            walked.{" "}
            {sun.sunMinutes / sun.minutes > 0.4 &&
              "On hot days, the More shade route cuts this most."}
          </p>
        </div>
      )}

      {routines.length > 0 && (
        <div className="walk-card">
          <div className="walk-card-head">
            <Home size={15} aria-hidden /> Your routines
          </div>
          <ul className="routine-list">
            {routines.slice(0, 5).map((r) => (
              <li key={`${r.from.id}>${r.to.id}@${r.arrival}`}>
                <span>
                  {r.from.label} → {r.to.label}
                </span>
                <small>
                  {days(r.days)} · arrive ~{minuteClock(r.arrival)} ·{" "}
                  {Math.round(r.minutes)} min
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
      {places.length > 0 && routines.length === 0 && (
        <p className="fine">
          {places.length} places so far. Routines appear after a trip repeats
          three times at about the same hour.
        </p>
      )}

      <div className="walk-card">
        <div className="walk-card-head">
          <UserRound size={15} aria-hidden /> {p.label}
          {!chosen?.persona && persona.walks > 0 && (
            <small>
              {" "}
              · {Math.round(persona.scores[0].p * 100)}% sure from{" "}
              {persona.walks} {persona.walks === 1 ? "walk" : "walks"}
            </small>
          )}
        </div>
        <p className="fine">{p.blurb}</p>
        {shadeAboveC !== null && (
          <p className="fine">
            You tend to choose shade once it feels warmer than{" "}
            {formatTemp(shadeAboveC)}, so above that the shade route comes
            first.
          </p>
        )}
        <label className="field">
          <span className="field-label">I&apos;M A…</span>
          <select value={role} onChange={(e) => onRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="walk-actions">
        <button className="text-button" onClick={onExport} disabled={!walks}>
          <Download size={13} aria-hidden /> Export my walks
        </button>
        <button
          className="text-button"
          onClick={() => importInput.current?.click()}
        >
          <Upload size={13} aria-hidden /> Import walks
        </button>
        <input
          ref={importInput}
          type="file"
          hidden
          accept="application/json,.json"
          aria-label="Walks file to import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
        <button className="text-button" onClick={onDelete}>
          <Trash2 size={13} aria-hidden /> Delete everything learned
        </button>
      </div>
    </section>
  );
}
