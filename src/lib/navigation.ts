import type { LocationFix } from "./walk-location.js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { speechChunks } from "./speech-i18n.js";
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
    let located = false;
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
          // After the first fix, a moment without signal (a tunnel, a
          // building) isn't the end of the walk; only lost permission is.
          if (located && error.code !== "NOT_AUTHORIZED") return;
          onError(
            error.code === "NOT_AUTHORIZED"
              ? locationError(1)
              : "Location is unavailable right now. Try again outdoors.",
          );
          return;
        }
        if (location) {
          located = true;
          onLocation({
            lat: location.latitude,
            lon: location.longitude,
            accuracy: location.accuracy,
            timestamp: location.time ?? 0,
          });
        }
      },
    );
    return () => {
      void background.removeWatcher({ id });
    };
  }
  if (!navigator.geolocation)
    throw Error("Location services are unavailable in this browser.");
  // After the first fix, a passing "unavailable" or "timed out" (a Wi-Fi
  // scan that failed, a moment without GPS) shouldn't end the walk; the
  // watch carries on. A denied permission always does.
  let located = false;
  const id = navigator.geolocation.watchPosition(
    (p) => {
      located = true;
      onLocation({
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        accuracy: p.coords.accuracy,
        timestamp: p.timestamp,
      });
    },
    (e) => {
      if (located && e.code !== 1) return;
      onError(locationError(e.code));
    },
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
  // A newer speak() or stopSpeech() ends this one's remaining sentences
  // too, not just the one playing.
  const gen = ++speechGen;
  const language = lang ?? "en-US";
  // The most natural voice the system has for the language, a touch slower
  // than default, sentence by sentence so long replies flow and aren't cut.
  const voice = bestVoice(speechSynthesis.getVoices(), language);
  const chunks = speechChunks(text);
  return chunks.reduce<Promise<void>>(
    (before, chunk) =>
      before.then(
        () =>
          new Promise<void>((resolve) => {
            if (gen !== speechGen) return resolve();
            const utterance = new SpeechSynthesisUtterance(chunk);
            utterance.lang = voice?.lang ?? language;
            if (voice) utterance.voice = voice;
            utterance.rate = 0.96;
            // Some browsers never fire end without a voice: about 13 words
            // a second is a safe upper bound on reading time.
            const timer = setTimeout(
              resolve,
              2000 + chunk.split(/\s+/).length * 450,
            );
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            utterance.onend = done;
            utterance.onerror = done;
            speechSynthesis.speak(utterance);
          }),
      ),
    Promise.resolve(),
  );
}
/** Bumped by each web speak() and stopSpeech(), so older speech stops. */
let speechGen = 0;
/**
 * The most natural-sounding installed voice for a language: the browser
 * otherwise often picks a robotic default. Neural and online voices
 * (Edge's "Natural", Chrome's "Google", Apple's "Premium"/"Enhanced")
 * win; an exact region match breaks ties.
 */
export function bestVoice(
  voices: Pick<SpeechSynthesisVoice, "lang" | "name" | "localService">[],
  lang: string,
) {
  const want = lang.toLowerCase().replace("_", "-");
  const base = want.split("-")[0];
  let best: (typeof voices)[number] | undefined;
  let bestScore = -1;
  for (const v of voices) {
    const tag = v.lang.toLowerCase().replace("_", "-");
    if (tag.split("-")[0] !== base) continue;
    const score =
      (/natural|neural|premium|enhanced|siri/i.test(v.name) ? 4 : 0) +
      (/google/i.test(v.name) ? 3 : 0) +
      (v.localService ? 0 : 1) +
      (tag === want ? 2 : 0) -
      (/compact|eloquence|novelty|bells|whisper|zarvox|bad news/i.test(v.name)
        ? 5
        : 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best as SpeechSynthesisVoice | undefined;
}
export function stopSpeech() {
  speechGen++;
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
