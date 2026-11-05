/// <reference lib="webworker" />
/**
 * Speaks replies with Piper, an open-source neural voice, entirely in the
 * browser. Runs in a worker so generating speech never stalls the 3D map.
 * Voices download once from Hugging Face and are kept in the origin's
 * private file system.
 */
import { stored, TtsSession } from "@mintplex-labs/piper-tts-web";

/** Piper's runtime, served by this site (see vite.config.ts). */
const WASM_PATHS = {
  onnxWasm: "/tts/",
  piperData: "/tts/piper_phonemize.data",
  piperWasm: "/tts/piper_phonemize.wasm",
};

export type VoiceRequest =
  | { type: "speak"; id: number; voice: string; text: string }
  | { type: "prepare"; voice: string }
  | { type: "stored" };
export type VoiceReply =
  | { type: "audio"; id: number; wav: Blob }
  | { type: "error"; id?: number; voice?: string; message: string }
  | { type: "progress"; voice: string; loaded: number; total: number }
  | { type: "ready"; voice: string }
  | { type: "stored"; voices: string[] };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (reply: VoiceReply) => scope.postMessage(reply);

// The package keeps one shared session with one voice; each language here
// gets its own, so switching languages never reads Spanish with an English
// model.
const sessions = new Map<string, Promise<TtsSession>>();
function session(voice: string) {
  let ready = sessions.get(voice);
  if (!ready) {
    TtsSession._instance = null;
    ready = TtsSession.create({
      voiceId: voice,
      wasmPaths: WASM_PATHS,
      progress: (p) => {
        if (p.url.endsWith(".onnx") && p.total)
          post({ type: "progress", voice, loaded: p.loaded, total: p.total });
      },
    });
    sessions.set(voice, ready);
    ready.then(
      () => post({ type: "ready", voice }),
      (e: unknown) => {
        sessions.delete(voice);
        post({ type: "error", voice, message: String(e) });
      },
    );
  }
  return ready;
}

scope.onmessage = async ({ data }: MessageEvent<VoiceRequest>) => {
  if (data.type === "stored") {
    post({ type: "stored", voices: await stored().catch(() => []) });
    return;
  }
  if (data.type === "prepare") {
    void session(data.voice).catch(() => undefined);
    return;
  }
  try {
    const wav = await (await session(data.voice)).predict(data.text);
    post({ type: "audio", id: data.id, wav });
  } catch (e) {
    post({ type: "error", id: data.id, message: String(e) });
  }
};
