import { describe, expect, it } from "vitest";
import { leaveEvent } from "../src/lib/ml/calendar";
import type { Routine } from "../src/lib/ml/routines";

const place = (id: string, label: string, home = false) => ({
  id,
  lat: 30.28,
  lon: -97.74,
  visits: 10,
  dayEnds: 0,
  label,
  home,
});
const routine: Routine = {
  from: place("h", "Home", true),
  to: place("t", "UT Tower, the Main Building; south side"),
  days: [1, 2, 3, 4, 5],
  arrival: 9 * 60 + 49,
  minutes: 7,
  metres: 560,
  times: 15,
};

describe("a leave-by calendar event", () => {
  const ics = leaveEvent(
    routine,
    new Date(2026, 10, 9, 9, 37).getTime(),
    7.4,
    Date.UTC(2026, 10, 6, 18, 0),
  );
  const lines = ics.replace(/\r\n /g, "").split("\r\n");

  it("repeats on the routine's weekdays at the leave-by time", () => {
    expect(lines).toContain("DTSTART:20261109T093700");
    expect(lines).toContain("DTEND:20261109T094400");
    expect(lines).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(lines).toContain("DTSTAMP:20261106T180000Z");
  });

  it("alerts five minutes before, with text escaped for iCalendar", () => {
    expect(lines).toContain("TRIGGER:-PT5M");
    expect(lines).toContain(
      String.raw`SUMMARY:Leave for UT Tower\, the Main Building\; south side`,
    );
  });

  it("is a well-formed calendar with folded lines and CRLF endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const raw of ics.split("\r\n"))
      expect(raw.length).toBeLessThanOrEqual(75);
  });

  it("moves the days back for a walk that leaves before midnight", () => {
    const late = { ...routine, days: [2, 3, 4], arrival: 10 };
    // Leave Monday 23:52 to arrive Tuesday 00:10.
    const ics = leaveEvent(
      late,
      new Date(2026, 10, 9, 23, 52).getTime(),
      18,
      0,
      5,
      new Date(2026, 10, 10, 0, 10).getTime(),
    );
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE");
  });

  it("folds long non-ASCII lines by bytes, never inside a character", () => {
    const tokyo = {
      ...routine,
      to: {
        ...routine.to,
        label: "東京大学 本郷キャンパス 総合図書館 安田講堂 🏛️",
      },
    };
    const ics = leaveEvent(tokyo, new Date(2026, 10, 9, 9, 0).getTime(), 10);
    const enc = new TextEncoder();
    for (const raw of ics.split("\r\n"))
      expect(enc.encode(raw).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("安田講堂 🏛️");
  });
});
