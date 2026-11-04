import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { FormData } from "undici";
import { ServiceError } from "../shared/errors";
import {
  downsample,
  encodeWav,
  wavDataUrl,
  VOICE_RATE,
} from "../src/lib/voice-recorder";
import { VOICE_LANGUAGES } from "../shared/voice-languages";
import { SYSTEM_PROMPT } from "../server/agent";

const requestBytes = vi.fn();
vi.mock("../server/network.js", async (original) => ({
  ...(await original<typeof import("../server/network")>()),
  requestBytes: (...args: unknown[]) => requestBytes(...args),
}));
const { transcribeQuestion } = await import("../server/agent");
const { cleanTranscript } = await import("../server/transcribe");

afterEach(() => {
  requestBytes.mockReset();
  vi.unstubAllEnvs();
});

async function post(body: unknown, headers: Record<string, string> = {}) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.post("/api/voice/transcribe", transcribeQuestion);
  app.use(
    (
      e: unknown,
      _q: express.Request,
      r: express.Response,
      _n: express.NextFunction,
    ) => {
      r.status(e instanceof ServiceError ? e.status : 400).json({
        error: e instanceof Error ? e.message : "error",
        code: e instanceof ServiceError ? e.code : undefined,
      });
    },
  );
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/voice/transcribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}
const audio = wavDataUrl(encodeWav(new Float32Array(1600).fill(0.1)));
const siteKey = () => {
  vi.stubEnv("WALK_FREE_AI_API_KEY", "meta-site-key-123");
  vi.stubEnv("WALK_FREE_AI_BASE_URL", "https://api.meta.ai/v1");
};
const transcript = (text: string) =>
  new TextEncoder().encode(
    JSON.stringify({ sessionId: "s", transcript: text, turns: [] }),
  );

describe("recording a question", () => {
  it("writes a 16 kHz mono 16-bit WAV", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]));
    const view = new DataView(wav.buffer);
    const text = (at: number) =>
      String.fromCharCode(...wav.subarray(at, at + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual([
      "RIFF",
      "WAVE",
      "fmt ",
      "data",
    ]);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(VOICE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(wav.length).toBe(44 + 8);
    // Out-of-range samples are clipped, not wrapped.
    expect(view.getInt16(44 + 2 * 2, true)).toBe(-0x8000);
    expect(view.getInt16(44 + 3 * 2, true)).toBe(0x7fff);
  });

  it("averages 48 kHz down to 16 kHz", () => {
    const out = downsample(
      new Float32Array([0, 0.3, 0.6, 1, 1, 1]),
      48_000,
      16_000,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(1);
  });

  it("offers every language Muse Voice Transcribe supports, once each", () => {
    const codes = VOICE_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(25);
    expect(codes).toEqual(expect.arrayContaining(["es", "hi", "zh", "ar"]));
  });
});

describe("Muse Voice Transcribe", () => {
  it("sends the WAV and language hint to Meta and tidies the punctuation", async () => {
    siteKey();
    requestBytes.mockResolvedValue(
      transcript("¿Cuál es la ruta con más sombra ahora mismo?.?"),
    );
    const result = await post({ audio, language: "es" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      text: "¿Cuál es la ruta con más sombra ahora mismo?",
      model: "muse-voice-transcribe-1.0",
    });
    const [url, options] = requestBytes.mock.calls[0];
    expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(options.headers.Authorization).toBe("Bearer meta-site-key-123");
    const form = options.body as FormData;
    expect(JSON.parse(await (form.get("request") as Blob).text())).toEqual({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      language: "es",
    });
    const sent = new Uint8Array(
      await (form.get("audio") as Blob).arrayBuffer(),
    );
    expect(String.fromCharCode(...sent.subarray(0, 4))).toBe("RIFF");
  });

  it("lets the model detect the language when none is chosen", async () => {
    siteKey();
    requestBytes.mockResolvedValue(transcript("सबसे ठंडा रास्ता कौन सा है?,"));
    const result = await post({ audio });
    expect(result.body.text).toBe("सबसे ठंडा रास्ता कौन सा है?");
    const form = requestBytes.mock.calls[0][1].body as FormData;
    expect(
      JSON.parse(await (form.get("request") as Blob).text()),
    ).not.toHaveProperty("language");
  });

  it("uses a person's own Meta key, but the site's for another provider's key", async () => {
    siteKey();
    requestBytes.mockResolvedValue(transcript("hello"));
    await post(
      { audio },
      {
        "x-walk-free-ai-key": "meta-user-own-key-123",
        "x-walk-free-ai-provider": "meta-model",
        "x-walk-free-ai-model": "muse-spark-1.3",
      },
    );
    await post(
      { audio },
      {
        "x-walk-free-ai-key": "sk-user-own-key-123",
        "x-walk-free-ai-provider": "openai",
        "x-walk-free-ai-model": "gpt-5-mini",
      },
    );
    expect(requestBytes.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer meta-user-own-key-123",
    );
    expect(requestBytes.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer meta-site-key-123",
    );
  });

  it("says voice needs the Meta Model API when the site uses another provider", async () => {
    vi.stubEnv("WALK_FREE_AI_API_KEY", "sk-site-key-123");
    vi.stubEnv("WALK_FREE_AI_BASE_URL", "https://api.openai.com/v1");
    const result = await post({ audio });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AI_TRANSCRIBE_PROVIDER");
    expect(result.body.error).toMatch(/Meta Model API/);
    expect(requestBytes).not.toHaveBeenCalled();
  });

  it("refuses anything that isn't a WAV before calling Meta", async () => {
    siteKey();
    for (const bad of [
      "data:audio/webm;base64,AAAA",
      "data:audio/wav;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ])
      expect((await post({ audio: bad })).status).toBe(400);
    expect((await post({ audio, language: "xx" })).status).toBe(400);
    expect(requestBytes).not.toHaveBeenCalled();
  });

  it("turns a rejected or busy key into guidance", async () => {
    siteKey();
    requestBytes.mockRejectedValueOnce(
      new ServiceError(
        "UPSTREAM_UNAVAILABLE",
        "The data provider returned HTTP 401. Please try again later.",
        502,
      ),
    );
    const rejected = await post({ audio });
    expect(rejected.body.code).toBe("AI_KEY_REJECTED");
    requestBytes.mockRejectedValueOnce(
      new ServiceError(
        "UPSTREAM_UNAVAILABLE",
        "The data provider returned HTTP 429. Please try again later.",
        502,
      ),
    );
    const busy = await post({ audio });
    expect(busy.status).toBe(429);
    expect(busy.body.error).toMatch(/type your question/);
  });

  it("keeps a question's own end mark and drops the doubled ones", () => {
    expect(cleanTranscript("  Where is the  library?? ")).toBe(
      "Where is the library?",
    );
    expect(cleanTranscript("Quel est le chemin le plus ombragé.")).toBe(
      "Quel est le chemin le plus ombragé.",
    );
    expect(cleanTranscript("最凉快的路线是哪条？。")).toBe(
      "最凉快的路线是哪条？",
    );
  });
});

describe("questions in other languages", () => {
  it("tells the model to search the map in its language and answer in theirs", () => {
    expect(SYSTEM_PROMPT).toMatch(/"la biblioteca" → "library"/);
    expect(SYSTEM_PROMPT).toMatch(/misheard/);
  });
});
