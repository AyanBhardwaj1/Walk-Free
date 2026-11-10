import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelLeaveReminder,
  reminderTime,
  remindToLeave,
} from "../src/lib/leave-reminder";

describe("reminders to leave", () => {
  afterEach(() => {
    cancelLeaveReminder();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("goes off five minutes before leaving, or now when that's passed", () => {
    const now = Date.UTC(2026, 10, 6, 14, 0);
    expect(reminderTime(now + 30 * 60_000, now)).toBe(now + 25 * 60_000);
    expect(reminderTime(now + 2 * 60_000, now)).toBe(now);
    expect(reminderTime(now - 60_000, now)).toBeNull();
  });

  it("shows one notification in the browser, replacing an earlier one", async () => {
    vi.useFakeTimers();
    const shown: string[] = [];
    class FakeNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      constructor(title: string) {
        shown.push(title);
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal("navigator", {});
    const now = Date.now();
    expect(await remindToLeave(now + 60_000, "First", "")).toBe("web");
    expect(await remindToLeave(now + 120_000, "Second", "")).toBe("web");
    await vi.advanceTimersByTimeAsync(130_000);
    expect(shown).toEqual(["Second"]);
  });

  it("still goes off on time after the computer sleeps", async () => {
    vi.useFakeTimers();
    const shown: string[] = [];
    class FakeNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      constructor(title: string) {
        shown.push(title);
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal("navigator", {});
    const now = Date.now();
    // Due in three days.
    await remindToLeave(now + 3 * 864e5, "Monday", "");
    // The machine sleeps: the clock jumps past the alert, timers don't run.
    vi.setSystemTime(now + 3 * 864e5 + 5_000);
    expect(shown).toEqual([]);
    // Awake again, within a minute the alert comes, once.
    await vi.advanceTimersByTimeAsync(61_000);
    expect(shown).toEqual(["Monday"]);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(shown).toEqual(["Monday"]);
  });

  it("leaves one timer when two sets race on the permission prompt", async () => {
    vi.useFakeTimers();
    const shown: string[] = [];
    let grant: (v: string) => void = () => {};
    class Slow {
      static permission = "default";
      static requestPermission = () => new Promise<string>((r) => (grant = r));
      constructor(title: string) {
        shown.push(title);
      }
    }
    vi.stubGlobal("Notification", Slow);
    vi.stubGlobal("navigator", {});
    const now = Date.now();
    const a = remindToLeave(now + 60_000, "First", "");
    const firstGrant = grant;
    const b = remindToLeave(now + 60_000, "Second", "");
    firstGrant("granted");
    grant("granted");
    await Promise.all([a, b]);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(shown).toEqual(["Second"]);
  });

  it("says when notifications are blocked", async () => {
    vi.stubGlobal(
      "Notification",
      class {
        static permission = "denied";
        static requestPermission = async () => "denied";
      },
    );
    expect(await remindToLeave(Date.now() + 60_000, "x", "")).toBe("denied");
  });
});
