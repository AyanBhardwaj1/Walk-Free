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
}[] = [
  { value: "openai", label: "OpenAI", model: "gpt-5-mini" },
  {
    value: "meta",
    label: "Meta Llama API",
    model: "Llama-4-Maverick-17B-128E-Instruct-FP8",
  },
  {
    value: "fireworks",
    label: "Fireworks",
    model: "accounts/fireworks/models/llama4-maverick-instruct-basic",
  },
  {
    value: "baseten",
    label: "Baseten",
    model: "meta-models/muse-spark-open-1026",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    model: "meta-llama/llama-4-maverick",
  },
  {
    value: "together",
    label: "Together AI",
    model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
  },
];

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
