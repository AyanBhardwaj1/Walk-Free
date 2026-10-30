/**
 * A person's own AI key, kept only in this browser and sent with assistant
 * requests. Walk-Free's server uses it for that request and never stores it.
 */
export type AiProvider =
  "openai" | "meta" | "fireworks" | "baseten" | "openrouter" | "together";
export interface OwnAiKey {
  provider: AiProvider;
  model: string;
  key: string;
}
export const AI_PROVIDERS: {
  value: AiProvider;
  label: string;
  model: string;
  /** Where a person creates a key for this provider. */
  keysUrl: string;
}[] = [
  {
    value: "openai",
    label: "OpenAI",
    model: "gpt-5-mini",
    keysUrl: "https://platform.openai.com/api-keys",
  },
  {
    value: "meta",
    label: "Meta Llama API",
    model: "Llama-4-Maverick-17B-128E-Instruct-FP8",
    keysUrl: "https://llama.developer.meta.com/",
  },
  {
    value: "fireworks",
    label: "Fireworks",
    model: "accounts/fireworks/models/llama4-maverick-instruct-basic",
    keysUrl: "https://fireworks.ai/account/api-keys",
  },
  {
    value: "baseten",
    label: "Baseten",
    model: "meta-models/muse-spark-open-1026",
    keysUrl: "https://app.baseten.co/settings/api_keys",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    model: "meta-llama/llama-4-maverick",
    keysUrl: "https://openrouter.ai/keys",
  },
  {
    value: "together",
    label: "Together AI",
    model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    keysUrl: "https://api.together.ai/settings/api-keys",
  },
];

/** The provider a pasted key clearly belongs to, from its prefix. */
export function providerFromKey(key: string): AiProvider | null {
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("LLM|")) return "meta";
  if (key.startsWith("fw_")) return "fireworks";
  if (/^sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}$/.test(key))
    return "openai";
  return null;
}

const storageKey = (accountId: string) => `walk-free-ai-key:${accountId}`;

export function loadOwnKey(accountId: string): OwnAiKey | null {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    const parsed = raw ? (JSON.parse(raw) as OwnAiKey) : null;
    return parsed?.key && parsed.model && parsed.provider ? parsed : null;
  } catch {
    return null;
  }
}
export function saveOwnKey(accountId: string, value: OwnAiKey | null) {
  try {
    if (value)
      localStorage.setItem(storageKey(accountId), JSON.stringify(value));
    else localStorage.removeItem(storageKey(accountId));
  } catch {
    /* Storage can be unavailable in private windows; the key stays in memory. */
  }
}
export function ownKeyHeaders(value: OwnAiKey | null): Record<string, string> {
  return value
    ? {
        "X-Walk-Free-AI-Key": value.key,
        "X-Walk-Free-AI-Provider": value.provider,
        "X-Walk-Free-AI-Model": value.model,
      }
    : {};
}
