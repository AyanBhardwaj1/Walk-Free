import type { LocationFix } from "./walk-location";
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
          onError(error.message);
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
    (e) => onError(e.message),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
export function speak(text: string) {
  if (nativeNavigation)
    void TextToSpeech.speak({ text, lang: "en-US", rate: 1, volume: 1 });
  else if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}
export function stopSpeech() {
  if (nativeNavigation) void TextToSpeech.stop();
  else if ("speechSynthesis" in window) speechSynthesis.cancel();
}
