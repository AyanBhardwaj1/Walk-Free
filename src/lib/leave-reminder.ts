import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * A reminder to leave for a routine walk. In the iOS and Android apps it's
 * a scheduled local notification, delivered even when the app is closed;
 * on the web it shows while Walk-Free is open in a tab (browsers have no
 * way yet to schedule one for later).
 */
export type ReminderResult = "native" | "web" | "denied" | "unsupported";

const NATIVE_ID = 4207;
const TAG = "walk-free-leave";
let timer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every set and cancel: a set that finishes after a newer one
 * (waiting on the permission prompt) leaves no timer behind. */
let generation = 0;

async function show(title: string, body: string) {
  const options = { body, icon: "/icon-192.png", tag: TAG };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Fall through to a page notification.
  }
  new Notification(title, options);
}

/** Cancels any reminder set before. */
export function cancelLeaveReminder() {
  generation++;
  if (timer) clearTimeout(timer);
  timer = null;
  if (Capacitor.isNativePlatform())
    void LocalNotifications.cancel({
      notifications: [{ id: NATIVE_ID }],
    }).catch(() => {});
}

/** Sets the one reminder (replacing any other) for `at`, epoch ms. */
export async function remindToLeave(
  at: number,
  title: string,
  body: string,
): Promise<ReminderResult> {
  cancelLeaveReminder();
  const mine = generation;
  if (Capacitor.isNativePlatform()) {
    const p = await LocalNotifications.requestPermissions();
    if (p.display !== "granted") return "denied";
    if (mine !== generation) return "native"; // cancelled or replaced meanwhile
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NATIVE_ID,
          title,
          body,
          schedule: { at: new Date(at), allowWhileIdle: true },
        },
      ],
    });
    return "native";
  }
  if (typeof Notification === "undefined") return "unsupported";
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return "denied";
  if (mine !== generation) return "web"; // a newer reminder took over
  if (timer) clearTimeout(timer);
  // Checked against the clock at least once a minute rather than one long
  // wait: timers pause while a laptop sleeps, and the alert should still
  // come when it wakes, not hours late.
  const check = () => {
    if (mine !== generation) return;
    const left = at - Date.now();
    if (left <= 0) {
      timer = null;
      void show(title, body);
      return;
    }
    timer = setTimeout(check, Math.min(left, 60_000));
  };
  check();
  return "web";
}

/** When to remind: a few minutes before leaving, or now if that's passed. */
export function reminderTime(leaveAt: number, now = Date.now(), lead = 5) {
  if (leaveAt <= now) return null;
  return Math.max(now, leaveAt - lead * 60_000);
}

/**
 * Which day a time falls on, from now, as words: "" today, "tomorrow",
 * a weekday name within the week ("Monday"), or "next Monday" a week on.
 */
export function dayWord(t: number, now = Date.now()) {
  const day = (x: number) => {
    const d = new Date(x);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;
  };
  const ahead = Math.round(day(t) - day(now));
  if (ahead <= 0) return "";
  if (ahead === 1) return "tomorrow";
  const name = new Date(t).toLocaleDateString("en-US", { weekday: "long" });
  return ahead < 7 ? name : `next ${name}`;
}

/** A time of day on this device's clock, as "9:37 AM". */
export const clockTime = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
