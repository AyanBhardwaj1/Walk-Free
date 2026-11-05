import { speak, stopSpeech } from "./navigation.js";
import { speechLang } from "./speech-lang.js";
import { encodeWav } from "./voice-recorder.js";
import type { VoiceReply, VoiceRequest } from "./voice-worker.js";

/**
 * The open-source Piper voice used for each reply language. Languages
 * without one (Hindi, Japanese, Korean…) use the device's own voice.
 */
export const NATURAL_VOICES: Record<string, string> = {
  en: "en_US-hfc_female-medium",
  es: "es_MX-ald-medium",
  fr: "fr_FR-siwis-medium",
  de: "de_DE-thorsten-medium",
  pt: "pt_BR-faber-medium",
  zh: "zh_CN-huayan-medium",
  ar: "ar_JO-kareem-medium",
  it: "it_IT-riccardo-x_low",
  pl: "pl_PL-gosia-medium",
  tr: "tr_TR-fettah-medium",
  vi: "vi_VN-vais1000-medium",
  ru: "ru_RU-irina-medium",
};

/** "81°F" reads as "81 degrees Fahrenheit" in the reply's language. */
const DEGREES: Record<string, string> = {
  en: "degrees",
  es: "grados",
  fr: "degrés",
  de: "Grad",
  pt: "graus",
  it: "gradi",
};
export function speakable(text: string, lang: string) {
  const word = DEGREES[lang];
  const spoken = text.replace(/\*\*|__|`/g, "");
  if (!word) return spoken;
  return spoken
    .replace(/(\d)\s*°\s*F\b/g, `$1 ${word} Fahrenheit`)
    .replace(/(\d)\s*°\s*C\b/g, `$1 ${word} Celsius`);
}

export type VoiceStatus =
  | { state: "idle" }
  | { state: "downloading"; language: string; percent: number }
  | { state: "ready"; voices: string[] }
  | { state: "unavailable" };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (wav: Blob | null) => void>();
const ready = new Set<string>();
const preparing = new Set<string>();
let status: VoiceStatus = { state: "idle" };
const listeners = new Set<(s: VoiceStatus) => void>();
let player: HTMLAudioElement | null = null;
let playing: (() => void) | null = null;

function setStatus(next: VoiceStatus) {
  status = next;
  listeners.forEach((l) => l(status));
}
export function onVoiceStatus(listener: (s: VoiceStatus) => void) {
  listeners.add(listener);
  listener(status);
  return () => void listeners.delete(listener);
}

/** Piper needs WebAssembly, workers and the origin private file system. */
export const naturalVoiceSupported = () =>
  typeof Worker !== "undefined" &&
  typeof WebAssembly !== "undefined" &&
  typeof navigator !== "undefined" &&
  Boolean(navigator.storage?.getDirectory);

function languageName(voice: string) {
  const code = Object.keys(NATURAL_VOICES).find(
    (k) => NATURAL_VOICES[k] === voice,
  );
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(code ?? "") ??
      "the voice"
    );
  } catch {
    return "the voice";
  }
}

function voiceWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./voice-worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }: MessageEvent<VoiceReply>) => {
    if (data.type === "audio") {
      pending.get(data.id)?.(data.wav);
      pending.delete(data.id);
    } else if (data.type === "error") {
      if (data.id !== undefined) {
        pending.get(data.id)?.(null);
        pending.delete(data.id);
      }
      if (data.voice) {
        preparing.delete(data.voice);
        setStatus(
          ready.size
            ? { state: "ready", voices: [...ready] }
            : { state: "unavailable" },
        );
      }
    } else if (data.type === "progress") {
      setStatus({
        state: "downloading",
        language: languageName(data.voice),
        percent: Math.round((data.loaded / data.total) * 100),
      });
    } else if (data.type === "ready") {
      preparing.delete(data.voice);
      ready.add(data.voice);
      setStatus({ state: "ready", voices: [...ready] });
    } else if (data.type === "stored") {
      // Downloaded on an earlier visit: load them now so the first reply
      // can use them.
      for (const voice of data.voices)
        if (Object.values(NATURAL_VOICES).includes(voice)) prepare(voice);
    }
  };
  worker.onerror = () => {
    worker = null;
    setStatus({ state: "unavailable" });
  };
  const request: VoiceRequest = { type: "stored" };
  worker.postMessage(request);
  return worker;
}

function prepare(voice: string) {
  if (ready.has(voice) || preparing.has(voice)) return;
  preparing.add(voice);
  const request: VoiceRequest = { type: "prepare", voice };
  voiceWorker().postMessage(request);
}

/** Starts the worker and loads voices downloaded on earlier visits. */
export function warmUpNaturalVoice() {
  if (naturalVoiceSupported()) voiceWorker();
}

function synthesize(voice: string, text: string) {
  return new Promise<Blob | null>((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    const request: VoiceRequest = { type: "speak", id, voice, text };
    voiceWorker().postMessage(request);
  });
}

function audio() {
  player ??= new Audio();
  return player;
}

/**
 * Call inside a tap or click: phones only let a page play sound it started
 * from a gesture, so this plays a moment of silence to unlock playback for
 * the spoken reply that arrives later.
 */
export function unlockAudio() {
  try {
    const a = audio();
    if (a.src) return;
    a.src = URL.createObjectURL(
      new Blob([encodeWav(new Float32Array(1600))], { type: "audio/wav" }),
    );
    void a.play().catch(() => undefined);
    if ("speechSynthesis" in window)
      speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  } catch {
    // No audio on this device: replies stay on screen.
  }
}

function play(wav: Blob) {
  return new Promise<void>((resolve) => {
    const a = audio();
    const url = URL.createObjectURL(wav);
    const done = () => {
      URL.revokeObjectURL(url);
      a.onended = a.onerror = null;
      playing = null;
      resolve();
    };
    playing = () => {
      a.pause();
      done();
    };
    a.onended = done;
    a.onerror = done;
    a.src = url;
    a.play().catch(done);
  });
}

let speaking = 0;
/** Stops any reply being read. */
export function stopReply() {
  speaking++;
  playing?.();
  stopSpeech();
}

/**
 * Reads a reply aloud in its own language: with the open-source Piper voice
 * once it has downloaded, and with the device's voice meanwhile (the
 * download starts in the background on first use).
 */
export async function speakReply(text: string) {
  stopReply();
  const turn = speaking;
  const tag = speechLang(text) ?? "en-US";
  const lang = tag.split("-")[0];
  const voice = naturalVoiceSupported() ? NATURAL_VOICES[lang] : undefined;
  if (voice && ready.has(voice)) {
    const wav = await synthesize(voice, speakable(text, lang));
    if (turn !== speaking) return;
    if (wav) return play(wav);
  } else if (voice) prepare(voice);
  if (turn === speaking) return speak(text, tag);
}
