/** Muse Voice Transcribe takes mono 16-bit WAV at 16 kHz. */
export const VOICE_RATE = 16_000;
/** Recordings stop here, inside the server's request size limit. */
export const MAX_RECORDING_MS = 25_000;
/** A pause this long after speech ends the question. */
const SILENCE_MS = 1_600;
/** Nothing said this long after starting: give up. */
const NO_SPEECH_MS = 7_000;
/** Loudness (RMS) treated as speech rather than room noise. */
const SPEECH_RMS = 0.015;

/** Averages samples down to `to` Hz (16 kHz from the usual 44.1 or 48 kHz). */
export function downsample(samples: Float32Array, from: number, to: number) {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

/** 16-bit PCM WAV bytes for mono samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, rate = VOICE_RATE) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => {
    const v = Math.max(-1, Math.min(1, s));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  });
  return new Uint8Array(view.buffer);
}

/** A WAV as the data URL the server accepts. */
export function wavDataUrl(wav: Uint8Array) {
  let binary = "";
  for (let i = 0; i < wav.length; i += 0x8000)
    binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export const canRecord = () =>
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof AudioContext !== "undefined";

export interface Recording {
  /** Resolves with the WAV once speech ends, `stop` is called or time runs out; null if nothing was said. */
  done: Promise<Uint8Array | null>;
  /** Ends the recording now and keeps what was said. */
  stop: () => void;
  /** Ends it and throws the audio away. */
  cancel: () => void;
}

/**
 * Records one spoken question from the microphone. It ends by itself after
 * a pause, so people can just talk; rejects if the microphone is refused.
 */
export async function recordQuestion(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const context = new AudioContext();
  await context.resume();
  const source = context.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but, unlike AudioWorklet, needs no extra
  // module file and works in every browser that records, iOS Safari included.
  const node = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const started = performance.now();
  let lastSpeech = 0;
  let finished = false;
  let finish: (keep: boolean) => void = () => {};
  const done = new Promise<Uint8Array | null>((resolve) => {
    finish = (keep) => {
      if (finished) return;
      finished = true;
      node.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void context.close();
      if (!keep || !lastSpeech) return resolve(null);
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) {
        all.set(c, at);
        at += c.length;
      }
      resolve(encodeWav(downsample(all, context.sampleRate, VOICE_RATE)));
    };
  });
  node.onaudioprocess = (e) => {
    if (finished) return;
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (const s of input) sum += s * s;
    const now = performance.now();
    if (Math.sqrt(sum / input.length) > SPEECH_RMS) lastSpeech = now;
    if (
      now - started > MAX_RECORDING_MS ||
      (lastSpeech && now - lastSpeech > SILENCE_MS) ||
      (!lastSpeech && now - started > NO_SPEECH_MS)
    )
      finish(true);
  };
  source.connect(node);
  // Some browsers only run the processor while it is connected to an output.
  node.connect(context.destination);
  return { done, stop: () => finish(true), cancel: () => finish(false) };
}
