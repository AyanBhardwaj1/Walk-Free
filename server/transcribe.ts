import { FormData } from "undici";
import { z } from "zod";
import { requestBytes, ServiceError } from "./network.js";
import { USER_AI_PROVIDERS, type AiConfig } from "./ai.js";
import { VOICE_LANGUAGE_CODES } from "../shared/voice-languages.js";

/** Muse Voice Transcribe, Meta's speech-to-text model on the Meta Model API. */
export const TRANSCRIBE_MODEL = () =>
  process.env.WALK_FREE_TRANSCRIBE_MODEL || "muse-voice-transcribe-1.0";

/** About 30 s of 16 kHz mono 16-bit WAV, base64-encoded, inside the 2 MB body limit. */
const MAX_AUDIO_BASE64 = 1_400_000;
export const transcribeSchema = z.object({
  audio: z
    .string()
    .max(MAX_AUDIO_BASE64)
    .regex(/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/),
  // Without a language it detects it, and follows a switch mid-sentence; a
  // hint makes names and short questions more accurate.
  language: z.enum(VOICE_LANGUAGE_CODES).optional(),
});

/** Transcription runs only on the Meta Model API; checked before any call. */
export function requireTranscribeProvider(config: AiConfig) {
  if (config.baseUrl !== USER_AI_PROVIDERS["meta-model"])
    throw new ServiceError(
      "AI_TRANSCRIBE_PROVIDER",
      "Voice questions need the site's Meta Model API key.",
      400,
    );
}

/** The model sometimes doubles end punctuation ("mismo??", "mismo?.?"). */
export function cleanTranscript(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([?!.,;:。？！]+)$/u, (end) =>
      /[?？]/u.test(end) ? end.match(/[?？]/u)![0] : end[0],
    );
}

/** Sends one recorded question (16 kHz mono WAV) to Muse Voice Transcribe. */
export async function transcribe(config: AiConfig, body: unknown) {
  const input = transcribeSchema.parse(body);
  requireTranscribeProvider(config);
  const wav = Buffer.from(
    input.audio.slice(input.audio.indexOf(",") + 1),
    "base64",
  );
  // RIFF....WAVE: anything else is refused before it costs a call.
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new ServiceError(
      "INVALID_REQUEST",
      "The recording couldn't be read. Please try again.",
      400,
    );
  const form = new FormData();
  form.append(
    "request",
    new Blob(
      [
        JSON.stringify({
          model: TRANSCRIBE_MODEL(),
          audioEncoding: "WAV",
          ...(input.language ? { language: input.language } : {}),
        }),
      ],
      { type: "application/json" },
    ),
  );
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "question.wav");
  const bytes = await requestBytes(`${config.baseUrl}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}` },
    body: form,
    timeoutMs: 30_000,
    maxBytes: 200_000,
    errorReason: config.own,
  }).catch((error: unknown) => {
    throw voiceFailure(config, error);
  });
  let parsed: { transcript?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new ServiceError(
      "UPSTREAM_UNAVAILABLE",
      "The voice service sent an unreadable answer. Please try again.",
      502,
    );
  }
  const text =
    typeof parsed.transcript === "string"
      ? cleanTranscript(parsed.transcript)
      : "";
  return { text, model: TRANSCRIBE_MODEL() };
}

/** Provider errors as guidance about the key, in the voice feature's words. */
function voiceFailure(config: AiConfig, error: unknown) {
  const status = Number(
    (error instanceof Error ? error.message : "").match(/HTTP (\d{3})/)?.[1],
  );
  const reason =
    config.own && error instanceof ServiceError && error.providerReason
      ? ` The provider said: “${error.providerReason}”`
      : "";
  if (status === 401 || (error as ServiceError)?.code === "NETWORK_BLOCKED")
    return new ServiceError(
      "AI_KEY_REJECTED",
      config.own
        ? `Meta rejected your key for voice questions. Check it in AI settings.${reason}`
        : "The site's AI key was rejected for voice questions. Please tell the site owner.",
      400,
    );
  if (status === 429)
    return new ServiceError(
      "AI_BUSY",
      `Voice transcription is busy or the account is out of credit. Try again in a moment, or type your question.${reason}`,
      429,
    );
  if (status)
    return new ServiceError(
      "AI_TRANSCRIBE_FAILED",
      `Meta's Muse Voice couldn't transcribe that (HTTP ${status}). Try again, or type your question.${reason}`,
      502,
    );
  return error;
}
