import type { Routine } from "./routines.js";

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Text safe inside an iCalendar value. */
const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/[,;]/g, (c) => `\\${c}`);

/** Local date-time as iCalendar "floating" time: 20261106T093700. */
function floating(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

/** Lines folded at 75 octets (UTF-8), as RFC 5545 asks, never splitting
 * a character. */
function fold(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "",
    size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // 75 octets on the first line; continuation lines start with a space.
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.map((l, i) => (i ? " " + l : l)).join("\r\n");
}

/**
 * A calendar event that repeats on a routine's days at its leave-by time,
 * with an alert a few minutes before: the phone's own calendar then says
 * when to set off, even with Walk-Free closed. Times are local (floating),
 * so the event follows the person's clock.
 */
export function leaveEvent(
  routine: Routine,
  /** The next leave-by, epoch ms (sets the first day and the time). */
  leaveAt: number,
  /** Walking minutes, for the event's length. */
  minutes: number,
  stamp = Date.now(),
  alertMinutes = 5,
  /** The arrival it's for (a late walk can leave the day before). */
  arriveBy = leaveAt,
) {
  const end = leaveAt + Math.max(5, Math.round(minutes)) * 60_000;
  // Routine days are arrival days; the event is on leaving days.
  const shift =
    (new Date(arriveBy).getDay() - new Date(leaveAt).getDay() + 7) % 7;
  const days = [...new Set(routine.days.map((d) => (d - shift + 7) % 7))]
    .sort()
    .map((d) => DAYS[d]);
  const title = `Leave for ${routine.to.label}`;
  const body = `Walk from ${routine.from.label} to ${routine.to.label}: about ${Math.round(minutes)} min at your pace. From Walk-Free.`;
  const uid = `walk-free-${routine.from.id}-${routine.to.id}-${routine.arrival}@walk-free`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Walk-Free//Leave-by//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${esc(uid)}`,
    `DTSTAMP:${new Date(stamp).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
    `DTSTART:${floating(leaveAt)}`,
    `DTEND:${floating(end)}`,
    ...(days.length ? [`RRULE:FREQ=WEEKLY;BYDAY=${days.join(",")}`] : []),
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(body)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(title)}`,
    `TRIGGER:-PT${Math.max(0, Math.round(alertMinutes))}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
