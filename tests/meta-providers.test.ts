import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiConfig,
  requireAi,
  userAiConfig,
  USER_AI_PROVIDERS,
} from "../server/ai";
import { AI_PROVIDERS, providerFromKey } from "../src/lib/ai-key";

afterEach(() => vi.unstubAllEnvs());

const own = (provider: string, model = "muse-spark-1.3") => ({
  "x-walk-free-ai-key": "user-own-key-1234567890",
  "x-walk-free-ai-provider": provider,
  "x-walk-free-ai-model": model,
});

describe("Meta model providers", () => {
  it("sends a Meta Model API key only to api.meta.ai", () => {
    expect(userAiConfig(own("meta-model"))).toEqual({
      key: "user-own-key-1234567890",
      model: "muse-spark-1.3",
      baseUrl: "https://api.meta.ai/v1",
      own: true,
    });
  });

  it("keeps the Llama API preset, which still answers", () => {
    expect(userAiConfig(own("meta", "Llama-4-Maverick"))?.baseUrl).toBe(
      "https://api.llama.com/compat/v1",
    );
  });

  it("offers DeepInfra for Meta's open Muse models", () => {
    expect(
      userAiConfig(own("deepinfra", "meta-models/Muse-Glimmer-30B"))?.baseUrl,
    ).toBe("https://api.deepinfra.com/v1/openai");
  });

  it("lists the Meta Model API first and only providers the server allows", () => {
    expect(AI_PROVIDERS[0]).toMatchObject({
      value: "meta-model",
      model: "muse-spark-1.3",
    });
    for (const p of AI_PROVIDERS) {
      expect(Object.hasOwn(USER_AI_PROVIDERS, p.value)).toBe(true);
      expect(p.keysUrl).toMatch(/^https:\/\//);
    }
    expect(new Set(AI_PROVIDERS.map((p) => p.value)).size).toBe(
      AI_PROVIDERS.length,
    );
  });

  it("presets Meta's Muse models on the hosts that serve them", () => {
    const model = (v: string) => AI_PROVIDERS.find((p) => p.value === v)?.model;
    expect(model("fireworks")).toBe(
      "accounts/fireworks/models/muse-spark-open",
    );
    expect(model("baseten")).toBe("meta-models/muse-spark-open");
    expect(model("together")).toBe("meta-models/Muse-Glimmer-30B");
    expect(model("deepinfra")).toBe("meta-models/Muse-Glimmer-30B");
  });

  it("rejects provider names outside the allow-list", () => {
    for (const provider of [
      "Meta-Model",
      "META",
      "__proto__",
      "constructor",
      "meta-model ",
    ])
      expect(() => userAiConfig(own(provider))).toThrow(/isn't supported/);
  });

  it("has a preset for every provider the server allows", () => {
    for (const value of Object.keys(USER_AI_PROVIDERS))
      expect(AI_PROVIDERS.some((p) => p.value === value)).toBe(true);
  });

  it("still recognises Llama API keys by their prefix", () => {
    expect(providerFromKey("LLM|123|abc")).toBe("meta");
  });
});

describe("shared assistant on Meta", () => {
  it("defaults to Muse Spark when pointed at the Meta Model API", () => {
    vi.stubEnv("WALK_FREE_AI_API_KEY", "meta-site-key");
    vi.stubEnv("WALK_FREE_AI_BASE_URL", "https://api.meta.ai/v1");
    vi.stubEnv("WALK_FREE_AI_MODEL", "");
    vi.stubEnv("WALK_FREE_OPENAI_MODEL", "");
    expect(aiConfig()).toEqual({
      key: "meta-site-key",
      baseUrl: "https://api.meta.ai/v1",
      model: "muse-spark-1.3",
    });
  });

  it("keeps OpenAI's default model for OpenAI", () => {
    vi.stubEnv("WALK_FREE_AI_API_KEY", "sk-site");
    vi.stubEnv("WALK_FREE_AI_BASE_URL", "");
    vi.stubEnv("WALK_FREE_AI_MODEL", "");
    vi.stubEnv("WALK_FREE_OPENAI_MODEL", "");
    expect(aiConfig()?.model).toBe("gpt-5-mini");
  });

  it("names the general key variable when the assistant is not set up", () => {
    vi.stubEnv("WALK_FREE_AI_API_KEY", "");
    vi.stubEnv("WALK_FREE_OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => requireAi()).toThrow(/WALK_FREE_AI_API_KEY/);
  });
});
