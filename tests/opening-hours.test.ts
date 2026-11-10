import { describe, expect, it } from "vitest";
import {
  hoursStatus,
  isOpen,
  localClock,
  parseOpeningHours,
} from "../src/lib/opening-hours";

const TZ = "America/Chicago";
// Friday 6 November 2026, local times in Austin (UTC-6).
const at = (day: number, hhmm: string) =>
  new Date(`2026-11-${String(day).padStart(2, "0")}T${hhmm}:00-06:00`);

describe("opening hours", () => {
  it("reads the local weekday and time", () => {
    expect(localClock(at(6, "15:30"), TZ)).toEqual({ day: 4, minute: 930 });
    expect(localClock(at(8, "00:05"), TZ)).toEqual({ day: 6, minute: 5 });
  });

  it("reads weekday hours, weekends and days off", () => {
    const w = parseOpeningHours("Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off")!;
    expect(w[0]).toEqual([[420, 1320]]);
    expect(w[5]).toEqual([[540, 1020]]);
    expect(w[6]).toEqual([]);
    expect(isOpen(w, at(6, "21:59"), TZ)).toBe(true);
    expect(isOpen(w, at(6, "22:00"), TZ)).toBe(false);
    expect(isOpen(w, at(8, "12:00"), TZ)).toBe(false); // Sunday
  });

  it("lets later rules replace earlier ones and wraps day ranges", () => {
    const w = parseOpeningHours("Mo-Su 08:00-20:00; We off")!;
    expect(w[2]).toEqual([]);
    expect(w[3]).toEqual([[480, 1200]]);
    const wrap = parseOpeningHours("Fr-Mo 10:00-14:00")!;
    expect(wrap.map((d) => d.length)).toEqual([1, 0, 0, 0, 1, 1, 1]);
  });

  it("handles split hours, 24/7 and hours past midnight", () => {
    const split = parseOpeningHours("Mo,We 08:00-12:00,13:00-17:00")!;
    expect(split[0]).toEqual([
      [480, 720],
      [780, 1020],
    ]);
    expect(parseOpeningHours("24/7")!.every((d) => d[0][1] === 1440)).toBe(
      true,
    );
    // Friday 18:00 to Saturday 02:00.
    const late = parseOpeningHours("Fr 18:00-02:00")!;
    expect(isOpen(late, at(7, "01:30"), TZ)).toBe(true);
    expect(isOpen(late, at(7, "02:30"), TZ)).toBe(false);
    // Every day when no days are named.
    expect(parseOpeningHours("06:00-23:00")!.every((d) => d.length === 1)).toBe(
      true,
    );
  });

  it("skips holiday rules but refuses what it can't read", () => {
    expect(parseOpeningHours("Mo-Fr 08:00-18:00; PH off")![0]).toEqual([
      [480, 1080],
    ]);
    for (const bad of [
      "",
      "Jan-Mar Mo-Fr 08:00-12:00",
      "sunrise-sunset",
      "Mo-Fr 08:00-18:00, Sa 10:00-14:00",
      "Xx 08:00-10:00",
      "Mo 25:00-26:00",
      '"by appointment"',
    ])
      expect(parseOpeningHours(bad)).toBeNull();
  });

  it("drops holidays from a rule but keeps its regular days", () => {
    // Sunday 8 November 2026, noon.
    const w = parseOpeningHours("Mo-Su 08:00-20:00; PH,Su off")!;
    expect(isOpen(w, at(8, "12:00"), TZ)).toBe(false);
    expect(isOpen(w, at(6, "12:00"), TZ)).toBe(true);
    expect(parseOpeningHours("Mo-Su 08:00-20:00; Su,PH off")![6]).toEqual([]);
    expect(parseOpeningHours("Mo-Fr 08:00-18:00; PH off")![0]).toEqual([
      [480, 1080],
    ]);
  });

  it("lets a later rule replace the night carried into its day", () => {
    const w = parseOpeningHours("Fr 18:00-02:00; Sa off")!;
    expect(isOpen(w, at(7, "01:00"), TZ)).toBe(false);
    expect(isOpen(w, at(6, "23:00"), TZ)).toBe(true);
    // Set by the same rule, the night carries on as written.
    expect(
      isOpen(parseOpeningHours("Fr,Sa 18:00-02:00")!, at(7, "01:00"), TZ),
    ).toBe(true);
  });

  it("reads hours running on past midnight as one stretch", () => {
    // Monday 9 November 2026.
    expect(
      hoursStatus("Mo-Su 10:00-24:00; Tu-Su 00:00-03:00", at(9, "11:00"), TZ)!
        .label,
    ).toBe("Open until 3 AM");
    expect(hoursStatus("Mo 08:00-10:00", at(9, "11:00"), TZ)!.label).toBe(
      "Closed · opens Mon 8 AM",
    );
    expect(hoursStatus("24/7", new Date("nonsense"), TZ)).toBeNull();
  });

  it("follows hours that run on for days, and names the closing day", () => {
    // Monday 9 November 2026, 7 PM.
    const mon = at(9, "19:00");
    expect(hoursStatus("Mo 18:00-24:00; Tu 00:00-24:00", mon, TZ)!.label).toBe(
      "Open until Wed 12 AM",
    );
    expect(
      hoursStatus("Mo 08:00-24:00; Tu-Su 00:00-24:00", mon, TZ)!.label,
    ).toBe("Open until Mon 12 AM");
    expect(hoursStatus("Mo-Su 00:00-24:00", mon, TZ)!.label).toBe(
      "Open 24 hours",
    );
    expect(hoursStatus("Mo 00:00-24:00", mon, TZ)!.label).toBe(
      "Open until 12 AM",
    );
    // Tonight's late hours keep no day name.
    expect(hoursStatus("Mo 18:00-02:00", mon, TZ)!.label).toBe(
      "Open until 2 AM",
    );
    // A start equal to its end is ambiguous: unknown.
    expect(parseOpeningHours("Mo 08:00-08:00")).toBeNull();
  });

  it("says when a building is open and when it opens next", () => {
    const hours = "Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off";
    expect(hoursStatus(hours, at(6, "15:00"), TZ)).toEqual({
      open: true,
      label: "Open until 10 PM",
    });
    expect(hoursStatus(hours, at(6, "05:00"), TZ)).toEqual({
      open: false,
      label: "Closed · opens 7 AM",
    });
    expect(hoursStatus(hours, at(6, "23:00"), TZ)!.label).toBe(
      "Closed · opens Sat 9 AM",
    );
    expect(hoursStatus(hours, at(8, "12:00"), TZ)!.label).toBe(
      "Closed · opens Mon 7 AM",
    );
    expect(hoursStatus("24/7", at(6, "03:00"), TZ)!.label).toBe(
      "Open 24 hours",
    );
    expect(hoursStatus("Mo-Fr 08:30-17:45", at(6, "09:00"), TZ)!.label).toBe(
      "Open until 5:45 PM",
    );
    expect(hoursStatus("Mo off", at(6, "09:00"), TZ)).toEqual({
      open: false,
      label: "Closed",
    });
    expect(hoursStatus("nonsense", at(6, "09:00"), TZ)).toBeNull();
  });
});
