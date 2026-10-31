import { neon } from "@neondatabase/serverless";
import { requestJson, ServiceError } from "./network.js";

/**
 * One OpenAI-compatible chat endpoint for every assistant feature. OpenAI is
 * the default; pointing WALK_FREE_AI_BASE_URL at another compatible provider
 * (such as Meta's Model API, https://api.meta.ai/v1, which then defaults to
 * Muse Spark) needs no code change.
 */
export interface AiConfig {
  baseUrl: string;
  key: string;
  model: string;
  /** True when the person supplied their own key. */
  own?: boolean;
}
export function aiConfig(): AiConfig | null {
  const key =
    process.env.WALK_FREE_AI_API_KEY ||
    process.env.WALK_FREE_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!key) return null;
  const baseUrl = (
    process.env.WALK_FREE_AI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  return {
    key,
    baseUrl,
    model:
      process.env.WALK_FREE_AI_MODEL ||
      process.env.WALK_FREE_OPENAI_MODEL ||
      (baseUrl === USER_AI_PROVIDERS["meta-model"]
        ? "muse-spark-1.3"
        : "gpt-5-mini"),
  };
}

/**
 * Providers a person may use with their own key. A fixed list keeps the
 * server from being pointed at arbitrary (or internal) addresses.
 */
export const USER_AI_PROVIDERS = {
  /** Meta Model API: Muse Spark and the other Muse models. */
  "meta-model": "https://api.meta.ai/v1",
  openai: "https://api.openai.com/v1",
  /** Meta's earlier Llama API, which Meta is winding down. */
  meta: "https://api.llama.com/compat/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  fireworks: "https://api.fireworks.ai/inference/v1",
  baseten: "https://inference.baseten.co/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
} as const;
export type UserAiProvider = keyof typeof USER_AI_PROVIDERS;
const KEY_PATTERN = /^[\x21-\x7e]{8,400}$/;
const MODEL_PATTERN = /^[\w.\-/:@]{1,120}$/;

/**
 * A person's own key from request headers, used for this request only:
 * never stored or logged. Returns null when no key was sent.
 */
export function userAiConfig(
  headers: Record<string, unknown>,
): AiConfig | null {
  const key = headers["x-walk-free-ai-key"];
  if (typeof key !== "string" || !key) return null;
  const provider = String(headers["x-walk-free-ai-provider"] ?? "openai");
  const model = String(headers["x-walk-free-ai-model"] ?? "");
  if (!Object.hasOwn(USER_AI_PROVIDERS, provider))
    throw new ServiceError(
      "AI_PROVIDER",
      "That AI provider isn't supported.",
      400,
    );
  if (!KEY_PATTERN.test(key) || !MODEL_PATTERN.test(model))
    throw new ServiceError(
      "AI_KEY_FORMAT",
      "Check your AI key and model name in AI settings.",
      400,
    );
  return {
    key,
    model,
    baseUrl: USER_AI_PROVIDERS[provider as UserAiProvider],
    own: true,
  };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const MAX_OUTPUT_TOKENS = 1800;
const CALL_TIMEOUT_MS = 50_000;

export async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  options: {
    tools?: ToolSpec[];
    json?: boolean;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
) {
  const openAi = config.baseUrl.includes("api.openai.com");
  const result = await requestJson<{
    choices?: {
      message?: { content?: string | null; tool_calls?: ToolCall[] };
      finish_reason?: string;
    }[];
  }>(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    timeoutMs: options.timeoutMs ?? CALL_TIMEOUT_MS,
    maxBytes: 2_000_000,
    // A person's own provider explains a rejected key or model; the shared
    // key's reasons stay on the server (they can echo part of the key).
    errorReason: config.own,
    body: JSON.stringify({
      model: config.model,
      messages,
      // OpenAI's reasoning models require the newer name; other compatible
      // providers all accept the original one.
      [openAi ? "max_completion_tokens" : "max_tokens"]:
        options.maxTokens ?? MAX_OUTPUT_TOKENS,
      ...(options.tools?.length
        ? { tools: options.tools, tool_choice: "auto" }
        : {}),
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
      // Reasoning models answer much faster with low effort, which suits
      // short walking questions.
      ...(openAi && /^(gpt-5|o\d)/.test(config.model)
        ? { reasoning_effort: "low" }
        : {}),
    }),
  }).catch((error: unknown) => {
    // Turn provider HTTP errors into guidance about the key or model.
    const status = Number(
      (error instanceof Error ? error.message : "").match(/HTTP (\d{3})/)?.[1],
    );
    const reason =
      config.own && error instanceof ServiceError && error.providerReason
        ? ` The provider said: “${error.providerReason}”`
        : "";
    if (
      status === 401 ||
      status === 403 ||
      (error as ServiceError)?.code === "NETWORK_BLOCKED"
    )
      throw new ServiceError(
        "AI_KEY_REJECTED",
        config.own
          ? `The AI provider rejected your key. Check it in AI settings.${reason}`
          : "The assistant's AI key was rejected. Please tell the site owner.",
        400,
      );
    if (status === 404 || status === 400)
      throw new ServiceError(
        "AI_MODEL",
        config.own
          ? `The AI provider didn't accept that request. Check the model name in AI settings.${reason}`
          : "The assistant's AI model is unavailable right now.",
        400,
      );
    if (status === 429)
      throw new ServiceError(
        "AI_BUSY",
        `The AI provider is rate-limiting requests or your account is out of credit. Wait a moment and try again.${reason}`,
        429,
      );
    if (config.own && error instanceof ServiceError && status)
      throw new ServiceError(
        "AI_PROVIDER_ERROR",
        `Your AI provider returned an error (HTTP ${status}). Try again in a moment.${reason}`,
        502,
      );
    throw error;
  });
  const message = result.choices?.[0]?.message;
  if (!message)
    throw new ServiceError(
      "AI_EMPTY",
      "The assistant returned no answer. Please try again.",
    );
  return {
    content: message.content ?? "",
    toolCalls: message.tool_calls ?? [],
  };
}

/* ----------------------------- usage limits ----------------------------- */

export interface UsageLimits {
  dailyPerUser: number;
  monthlyTotal: number;
  ownKeyDaily: number;
}
const OWN_PREFIX = "own:";
export function usageLimits(): UsageLimits {
  const read = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return {
    // Each question uses one to four model calls (tools need extra rounds).
    dailyPerUser: read("WALK_FREE_AI_DAILY_LIMIT", 80),
    monthlyTotal: read("WALK_FREE_AI_MONTHLY_LIMIT", 4000),
    // Own-key calls cost the site only server time, so allow many more.
    ownKeyDaily: read("WALK_FREE_AI_OWN_KEY_DAILY_LIMIT", 500),
  };
}

export type UsageResult = "ok" | "daily" | "monthly";
export interface UsageStore {
  /**
   * Counts one call if both limits allow it. A refused call is never
   * counted, so retrying past a limit cannot use up the site's budget.
   */
  record(
    userId: string,
    day: string,
    limits: UsageLimits,
  ): Promise<UsageResult>;
}

/** Durable counts in Postgres, shared by every serverless instance. */
export function postgresUsage(url: string): UsageStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  return {
    async record(userId, day, limits) {
      ready ??= sql
        .query(
          "create table if not exists walk_free_ai_usage (user_id text not null, day date not null, calls integer not null default 0, primary key (user_id, day))",
        )
        .catch((error) => {
          // Retry setup on the next call instead of caching the failure.
          ready = null;
          throw error;
        });
      await ready;
      const [total] = (await sql.query(
        "select coalesce(sum(calls), 0)::int as calls from walk_free_ai_usage where day >= date_trunc('month', $1::date) and user_id not like 'own:%'",
        [day],
      )) as { calls: number }[];
      if (total.calls >= limits.monthlyTotal) return "monthly";
      // Atomic: concurrent requests cannot push one user past the daily cap.
      const rows = (await sql.query(
        "insert into walk_free_ai_usage (user_id, day, calls) values ($1, $2, 1) on conflict (user_id, day) do update set calls = walk_free_ai_usage.calls + 1 where walk_free_ai_usage.calls < $3 returning calls",
        [userId, day, limits.dailyPerUser],
      )) as { calls: number }[];
      return rows.length ? "ok" : "daily";
    },
  };
}

/** Process memory, for local development only. */
export function memoryUsage(): UsageStore {
  const counts = new Map<string, number>();
  return {
    async record(userId, day, limits) {
      let month = 0;
      for (const [k, v] of counts)
        if (
          !k.startsWith(OWN_PREFIX) &&
          k.slice(k.lastIndexOf(":") + 1, k.lastIndexOf(":") + 8) ===
            day.slice(0, 7)
        )
          month += v;
      if (month >= limits.monthlyTotal) return "monthly";
      const key = `${userId}:${day}`;
      const today = counts.get(key) ?? 0;
      if (today >= limits.dailyPerUser) return "daily";
      counts.set(key, today + 1);
      return "ok";
    },
  };
}

let store: UsageStore | null = null;
/** Per-instance counts for own-key calls when no database is configured. */
let ownKeyFallback: UsageStore | null = null;
function usageStore(own = false): UsageStore {
  if (store) return store;
  const url = process.env.WALK_FREE_DATABASE_URL || process.env.DATABASE_URL;
  if (url) return (store = postgresUsage(url));
  // A person's own key spends their money, not the site's, so a
  // best-effort cap per server instance is enough without the database.
  if (own) return (ownKeyFallback ??= memoryUsage());
  // Serverless instances do not share memory, so hosted AI needs the database.
  if (process.env.VERCEL)
    throw new ServiceError(
      "AI_LIMITS_NOT_CONFIGURED",
      "The assistant needs its usage database before it can run on this site. Set WALK_FREE_DATABASE_URL on the server.",
      503,
    );
  return (store = memoryUsage());
}
export function setUsageStore(next: UsageStore | null) {
  store = next;
}

/**
 * Counts one model call against the user's daily and the site's monthly cap.
 * Calls with a person's own key count separately (`own:` ids, excluded from
 * the site's monthly total) under a generous daily limit, so they can't tie
 * up the server without bound.
 */
export async function chargeAiCall(
  userId: string,
  now = new Date(),
  own = false,
) {
  const day = now.toISOString().slice(0, 10);
  const limits = usageLimits();
  let result: UsageResult;
  try {
    result = await usageStore(own).record(
      own ? `${OWN_PREFIX}${userId}` : userId,
      day,
      own
        ? {
            dailyPerUser: limits.ownKeyDaily,
            monthlyTotal: Number.MAX_SAFE_INTEGER,
            ownKeyDaily: limits.ownKeyDaily,
          }
        : limits,
    );
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "AI_LIMITS_UNAVAILABLE",
      "The assistant is paused because its usage limits could not be checked. Please try again later.",
      503,
    );
  }
  if (result === "monthly")
    throw new ServiceError(
      "AI_MONTHLY_LIMIT",
      "The assistant has reached this month's usage limit. Routes and heat maps still work without it.",
      429,
    );
  if (result === "daily")
    throw new ServiceError(
      "AI_DAILY_LIMIT",
      own
        ? "You've reached today's limit for assistant requests. It resets at midnight UTC."
        : "You've reached today's assistant limit. It resets at midnight UTC; routes and heat maps still work.",
      429,
    );
}

export function requireAi(): AiConfig {
  const config = aiConfig();
  if (!config)
    throw new ServiceError(
      "KEY_REQUIRED",
      "The assistant isn't configured yet. Set WALK_FREE_AI_API_KEY (and WALK_FREE_AI_BASE_URL for a provider other than OpenAI) on the server.",
      503,
    );
  return config;
}
