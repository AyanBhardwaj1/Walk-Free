/**
 * Opening hours in OpenStreetMap's `opening_hours` syntax (which IMDF's
 * `hours` also uses), for the common forms buildings carry:
 *
 *   24/7 · Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off
 *   Mo,We,Fr 08:00-12:00,13:00-17:00 · 18:00-02:00 (past midnight)
 *
 * Later rules replace earlier ones for the days they name, as in OSM.
 * Holidays (PH, SH) are dropped from day selectors. Anything else this doesn't
 * understand (months, sunrise, week
 * numbers, comments) makes the whole value unknown (null): guessing at
 * hours would send people to locked doors.
 */

/** Minute ranges per weekday, Monday first; an end past 1440 runs into
 * the next day. */
export type Week = [number, number][][];

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME = /^(\d{1,2}):(\d{2})$/;

function minutes(t: string) {
  const m = TIME.exec(t);
  if (!m) return null;
  const h = Number(m[1]),
    min = Number(m[2]);
  if (min > 59 || h > 48) return null;
  return h * 60 + min;
}

function parseDays(text: string): number[] | null {
  const days = new Set<number>();
  for (const part of text.split(",")) {
    const [a, b] = part.split("-");
    const i = DAYS.indexOf(a),
      j = b === undefined ? i : DAYS.indexOf(b);
    if (i < 0 || j < 0) return null;
    // Ranges may wrap the week: Fr-Mo.
    for (let k = i; ; k = (k + 1) % 7) {
      days.add(k);
      if (k === j) break;
    }
  }
  return [...days];
}

function parseTimes(text: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of text.split(",")) {
    const [a, b] = part.split("-");
    const s = minutes(a ?? ""),
      e = minutes(b ?? "");
    // 08:00-08:00 is ambiguous (closed, or 24 hours): unknown.
    if (s === null || e === null || s >= 1440 || s === e) return null;
    // 18:00-02:00 means into the next morning.
    const end = e <= s ? e + 1440 : e;
    if (end - s > 1440) return null;
    out.push([s, end]);
  }
  return out;
}

export function parseOpeningHours(
  text: string | null | undefined,
): Week | null {
  const value = (text ?? "").trim();
  if (!value || value.length > 500) return null;
  const week: Week = DAYS.map(() => []);
  let any = false;
  for (const raw of value.split(";")) {
    const rule = raw.trim().replace(/\s+/g, " ");
    if (!rule) continue;
    if (rule === "24/7") {
      week.forEach((_, i) => (week[i] = [[0, 1440]]));
      any = true;
      continue;
    }
    const [first, ...rest] = rule.split(" ");
    let days: number[] | null = [0, 1, 2, 3, 4, 5, 6];
    let spec = rule;
    if (/^(?:[A-Z][a-z]|PH|SH)/.test(first)) {
      // Public and school holidays are unknowable here: those parts of the
      // day selector are dropped (the building keeps its usual hours on
      // holidays), and a rule for holidays alone is skipped.
      const regular = first.split(",").filter((d) => d !== "PH" && d !== "SH");
      if (!regular.length) continue;
      days = parseDays(regular.join(","));
      spec = rest.join(" ");
    }
    if (!days) return null;
    let ranges: [number, number][] | null;
    if (spec === "off" || spec === "closed") ranges = [];
    else if (spec === "") ranges = [[0, 1440]];
    else ranges = parseTimes(spec.replace(/\s/g, ""));
    if (!ranges) return null;
    for (const d of days) {
      week[d] = ranges;
      // A later rule for a day replaces all of it, including hours that
      // ran on into it from the night before (unless this rule set those).
      const before = (d + 6) % 7;
      if (!days.includes(before))
        week[before] = week[before].map(([a, e]) => [a, Math.min(e, 1440)]);
    }
    any = true;
  }
  return any ? week : null;
}

/** Weekday (Monday 0) and minute of the day at `date` in `timeZone`. */
export function localClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = DAY_NAMES.indexOf(get("weekday"));
  return {
    day: day < 0 ? 0 : day,
    minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

/** The range open at this weekday and minute, carried over from the day
 * before when it runs past midnight. */
function rangeAt(week: Week, day: number, minute: number) {
  const today = week[day].find(([s, e]) => minute >= s && minute < e);
  if (today) return { day, range: today };
  const before = (day + 6) % 7;
  const carried = week[before].find(
    ([s, e]) => e > 1440 && minute + 1440 >= s && minute + 1440 < e,
  );
  return carried ? { day: before, range: carried } : null;
}

export function isOpen(week: Week, date: Date, timeZone: string) {
  if (Number.isNaN(date.getTime())) return false;
  const { day, minute } = localClock(date, timeZone);
  return rangeAt(week, day, minute) !== null;
}

const clock = (m: number) => {
  const h = Math.floor((m % 1440) / 60),
    min = m % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${suffix}`;
};

/**
 * "Open until 10 PM", "Open 24 hours", "Closed · opens 7 AM" or
 * "Closed · opens Mon 7 AM"; null when the hours are unknown.
 */
export function hoursStatus(
  text: string | null | undefined,
  date: Date,
  timeZone: string,
): { open: boolean; label: string } | null {
  const week = parseOpeningHours(text);
  if (!week || Number.isNaN(date.getTime())) return null;
  const { day, minute } = localClock(date, timeZone);
  const now = rangeAt(week, day, minute);
  if (now) {
    const [, end] = now.range;
    // Open to midnight and on from midnight the next day(s): one stretch,
    // followed until it closes (a whole week of it is "24 hours").
    let d = now.day,
      until = end,
      joined = 0;
    while (until >= 1440 && joined < 7) {
      const next = week[(d + 1) % 7].find(([s]) => s === 0);
      if (!next) break;
      d = (d + 1) % 7;
      until = next[1];
      joined++;
    }
    if (joined === 7) return { open: true, label: "Open 24 hours" };
    // The day it closes, counted from today (a stretch carried over from
    // last night started a day back): named unless it's today, or early
    // tomorrow morning at the end of tonight's hours.
    const ahead = joined + Math.floor(until / 1440) - (now.day === day ? 0 : 1);
    const closes = (day + ahead) % 7;
    const named = ahead > 1 || (ahead === 1 && until % 1440 > 360);
    return {
      open: true,
      label: `Open until ${named ? `${DAY_NAMES[closes]} ` : ""}${clock(until)}`,
    };
  }
  // Up to a week ahead: the same weekday next week counts too.
  for (let ahead = 0; ahead <= 7; ahead++) {
    const d = (day + ahead) % 7;
    const next = week[d]
      .filter(([s]) => ahead > 0 || s > minute)
      .sort((a, b) => a[0] - b[0])[0];
    if (next)
      return {
        open: false,
        label: `Closed · opens ${ahead === 0 ? "" : `${DAY_NAMES[d]} `}${clock(next[0])}`,
      };
  }
  return { open: false, label: "Closed" };
}
