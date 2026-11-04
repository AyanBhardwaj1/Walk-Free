import type { LocationFix } from "./walk-location.js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
const background = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);
export const nativeNavigation = Capacitor.isNativePlatform();
export async function startTracking(
  onLocation: (fix: LocationFix) => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (nativeNavigation) {
    if (Capacitor.getPlatform() === "android") {
      const p = await LocalNotifications.requestPermissions();
      if (p.display !== "granted")
        throw Error(
          "Notification permission is required for background navigation.",
        );
    }
    const id = await background.addWatcher(
      {
        backgroundTitle: "Walk-Free navigation",
        backgroundMessage:
          "Following your walk. Open Walk-Free and end the walk to stop tracking.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 12,
      },
      (location, error) => {
        if (error) {
          onError(
            error.code === "NOT_AUTHORIZED"
              ? locationError(1)
              : "Location is unavailable right now. Try again outdoors.",
          );
          return;
        }
        if (location)
          onLocation({
            lat: location.latitude,
            lon: location.longitude,
            accuracy: location.accuracy,
            timestamp: location.time ?? 0,
          });
      },
    );
    return () => {
      void background.removeWatcher({ id });
    };
  }
  if (!navigator.geolocation)
    throw Error("Location services are unavailable in this browser.");
  const id = navigator.geolocation.watchPosition(
    (p) => {
      onLocation({
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        accuracy: p.coords.accuracy,
        timestamp: p.timestamp,
      });
    },
    (e) => onError(locationError(e.code)),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
/**
 * Speaks text; `lang` (a BCP 47 tag) picks a matching voice when known.
 * Resolves when the voice finishes (or at once when there is none), and
 * never rejects.
 */
export function speak(text: string, lang?: string | null): Promise<void> {
  if (nativeNavigation)
    return TextToSpeech.speak({
      text,
      lang: lang ?? "en-US",
      rate: 1,
      volume: 1,
    }).catch(() =>
      // No voice for that language on this device: read it in English rather
      // than say nothing.
      lang && lang !== "en-US"
        ? TextToSpeech.speak({ text, lang: "en-US", rate: 1, volume: 1 }).catch(
            () => undefined,
          )
        : undefined,
    );
  if (!("speechSynthesis" in window)) return Promise.resolve();
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) utterance.lang = lang;
  return new Promise((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    // Some browsers never fire end without a voice: about 13 words a second
    // is a safe upper bound on reading time.
    setTimeout(resolve, 2000 + text.split(/\s+/).length * 450);
    speechSynthesis.speak(utterance);
  });
}
export function stopSpeech() {
  if (nativeNavigation) void TextToSpeech.stop();
  else if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/** Browser geolocation error codes as sentences people can act on. */
export function locationError(code: number) {
  return code === 1
    ? "Location permission is off. Allow location for this site in your browser settings to use your location."
    : code === 3
      ? "Finding your location took too long. Try again with a clearer view of the sky."
      : "Your location is unavailable right now. Try again in a moment.";
}
