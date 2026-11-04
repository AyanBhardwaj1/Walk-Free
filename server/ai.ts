import { neon } from "@neondatabase/serverless";
import { requestBytes, requestJson, ServiceError } from "./network.js";

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
/** One retry, only for failures that came back fast enough to afford it. */
const RETRY_DELAY_MS = 600;
const RETRY_BUDGET_MS = 15_000;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/** A dropped connection or a gateway error: worth one more try. */
function transient(error: unknown) {
  if (!(error instanceof ServiceError) || error.code !== "UPSTREAM_UNAVAILABLE")
    return false;
  const status = Number(error.message.match(/HTTP (\d{3})/)?.[1]);
  return !status || TRANSIENT_STATUSES.has(status);
}
/** A retry is skipped when less than this would be left for it. */
const MIN_RETRY_TIME_MS = 5_000;
/**
 * Runs `call` with the whole time budget, then (for a transient failure that
 * came back quickly) once more with only the time that is left, so both
 * attempts together never outlast the budget.
 */
async function withRetry<T>(
  call: (timeoutMs: number) => Promise<T>,
  budgetMs: number,
): Promise<T> {
  const started = Date.now();
  try {
    return await call(budgetMs);
  } catch (error) {
    const elapsed = Date.now() - started;
    const left = budgetMs - elapsed - RETRY_DELAY_MS;
    if (
      !transient(error) ||
      elapsed > RETRY_BUDGET_MS ||
      left < MIN_RETRY_TIME_MS
    )
      throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return call(left);
  }
}

type ChatOptions = {
  tools?: ToolSpec[];
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
};
export async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
) {
  try {
    return await chatCompletionOnce(config, messages, options);
  } catch (error) {
    // Not every model takes JSON mode; the callers parse JSON out of plain
    // text too, so ask once more without it.
    if (options.json && (error as ServiceError)?.code === "AI_MODEL")
      return chatCompletionOnce(config, messages, { ...options, json: false });
    throw error;
  }
}
async function chatCompletionOnce(
  config: AiConfig,
  messages: ChatMessage[],
  options: ChatOptions,
) {
  const openAi = config.baseUrl.includes("api.openai.com");
  const result = await withRetry(
    (timeoutMs) =>
      requestJson<{
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
        timeoutMs,
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
      }),
    options.timeoutMs ?? CALL_TIMEOUT_MS,
  ).catch((error: unknown) => {
    if (
      error instanceof ServiceError &&
      error.code === "TIMEOUT" &&
      config.model === DEEP_MODEL()
    )
      throw new ServiceError(
        "AI_DEEP_TIMEOUT",
        "Muse Wonder needed more time than this request allows. Ask again with Think deeper off.",
        504,
      );
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
/** Counters that only meter (per-visitor caps), never the site's month. */
const METER_PREFIX = "meter:";
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
/**
 * Guests (no account) may try the shared assistant on the demo: a few model
 * calls per visitor a day, and a small daily pool for all guests together,
 * inside the site's monthly cap. WALK_FREE_GUEST_AI=off turns it off.
 */
export function guestLimits() {
  const read = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  };
  return {
    enabled: (process.env.WALK_FREE_GUEST_AI ?? "on") !== "off",
    perVisitor: read("WALK_FREE_GUEST_AI_PER_VISITOR", 12),
    perDay: read("WALK_FREE_GUEST_AI_DAILY", 400),
  };
}
/** Counts one guest model call against the visitor's and the guests' caps. */
export async function chargeGuestCall(visitor: string, now = new Date()) {
  const guest = guestLimits();
  if (!guest.enabled)
    throw new ServiceError(
      "LOGIN_REQUIRED",
      "Create a free account to ask the assistant.",
      401,
    );
  // A cap of 0 means no guest questions (the shared store can't enforce 0).
  if (guest.perVisitor === 0 || guest.perDay === 0)
    throw new ServiceError(
      "AI_GUEST_LIMIT",
      "Guest questions are paused. Create a free account to ask the assistant.",
      429,
    );
  const day = now.toISOString().slice(0, 10);
  const limits = usageLimits();
  let mine: UsageResult, all: UsageResult;
  try {
    mine = await usageStore(false).record(
      `${METER_PREFIX}guest:${visitor}`,
      day,
      {
        ...limits,
        dailyPerUser: guest.perVisitor,
        monthlyTotal: Number.MAX_SAFE_INTEGER,
      },
    );
    if (mine === "daily")
      throw new ServiceError(
        "AI_GUEST_LIMIT",
        "That's today's free questions. Create a free account to keep asking.",
        429,
      );
    all = await usageStore(false).record("guest", day, {
      ...limits,
      dailyPerUser: guest.perDay,
    });
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "AI_LIMITS_UNAVAILABLE",
      "The assistant is paused because its usage limits could not be checked. Please try again later.",
      503,
    );
  }
  if (all === "monthly")
    throw new ServiceError(
      "AI_MONTHLY_LIMIT",
      "The assistant has reached this month's limit. Please try again next month.",
      429,
    );
  if (all === "daily")
    throw new ServiceError(
      "AI_GUEST_LIMIT",
      "Today's free guest questions are used up. Create a free account to keep asking.",
      429,
    );
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
        "select coalesce(sum(calls), 0)::int as calls from walk_free_ai_usage where day >= date_trunc('month', $1::date) and user_id not like 'own:%' and user_id not like 'meter:%'",
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
          !k.startsWith(METER_PREFIX) &&
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

/**
 * Muse Wonder, Meta's frontier reasoning model, for questions that need more
 * thought. Only the Meta Model API serves it.
 */
export const DEEP_MODEL = () =>
  process.env.WALK_FREE_DEEP_MODEL || "muse-wonder-1.0";
/** Model calls a deeper (Muse Wonder) answer is charged as. */
export const DEEP_CREDITS = 2;
/** The same provider and key, asking Muse Wonder instead. */
export function deepConfig(config: AiConfig): AiConfig {
  if (config.baseUrl !== USER_AI_PROVIDERS["meta-model"])
    throw new ServiceError(
      "AI_DEEP_PROVIDER",
      config.own
        ? "Thinking deeper uses Meta's Muse Wonder: choose Meta Model API in AI settings."
        : "Thinking deeper needs the site's Meta Model API key.",
      400,
    );
  return { ...config, model: DEEP_MODEL() };
}

/** Muse Image, Meta's image model, for edits on the Meta Model API. */
export const IMAGE_MODEL = () =>
  process.env.WALK_FREE_IMAGE_MODEL || "muse-image-1.0";
/** The whole render, call and download, fits Vercel's 60 s function limit. */
const IMAGE_BUDGET_MS = 52_000;
/** The reply goes back as JSON, under Vercel's 4.5 MB response limit. */
const IMAGE_MAX_BYTES = 3_200_000;
/** Muse Image runs only on the Meta Model API; checked before any charge. */
export function requireImageProvider(config: AiConfig) {
  if (config.baseUrl !== USER_AI_PROVIDERS["meta-model"])
    throw new ServiceError(
      "AI_IMAGE_PROVIDER",
      config.own
        ? "Rendering photos uses Meta's Muse Image: choose Meta Model API in AI settings."
        : "Rendering photos needs the site's Meta Model API key.",
      400,
    );
}
/**
 * Edits an image with Muse Image (POST /images/edits, JSON body with the
 * input as a data URI, as in Meta's Model API reference). Returns a data URL
 * of the result. Only the Meta Model API serves Muse Image.
 */
export async function imageEdit(
  config: AiConfig,
  prompt: string,
  imageDataUrl: string,
): Promise<string> {
  requireImageProvider(config);
  const deadline = Date.now() + IMAGE_BUDGET_MS;
  const result = await requestJson<{
    data?: { b64_json?: string; url?: string }[];
  }>(`${config.baseUrl}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    timeoutMs: IMAGE_BUDGET_MS - 6_000,
    // Base64 is a third larger than the picture it carries.
    maxBytes: Math.ceil(IMAGE_MAX_BYTES * 1.4),
    errorReason: config.own,
    body: JSON.stringify({
      model: IMAGE_MODEL(),
      prompt,
      images: [{ image_url: imageDataUrl }],
      n: 1,
    }),
  }).catch((error: unknown) => {
    const status = Number(
      (error instanceof Error ? error.message : "").match(/HTTP (\d{3})/)?.[1],
    );
    const reason =
      config.own && error instanceof ServiceError && error.providerReason
        ? ` The provider said: “${error.providerReason}”`
        : "";
    if (status === 401 || status === 403)
      throw new ServiceError(
        "AI_KEY_REJECTED",
        config.own
          ? `Meta rejected your key for Muse Image. Check it in AI settings.${reason}`
          : "The site's AI key was rejected for Muse Image. Please tell the site owner.",
        400,
      );
    if (status === 429)
      throw new ServiceError(
        "AI_BUSY",
        `Muse Image is busy or the account is out of credit. Try again in a moment.${reason}`,
        429,
      );
    if (status)
      throw new ServiceError(
        "AI_IMAGE_FAILED",
        `Muse Image couldn't render this view (HTTP ${status}).${reason}`,
        502,
      );
    throw error;
  });
  const out = result.data?.[0];
  if (out?.b64_json) return `data:image/png;base64,${out.b64_json}`;
  if (out?.url && /^https:\/\//.test(out.url)) {
    // The page only shows images it holds (data: URLs), so fetch it here.
    const bytes = await requestBytes(out.url, {
      timeoutMs: Math.max(3_000, deadline - Date.now()),
      maxBytes: IMAGE_MAX_BYTES,
    });
    return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  }
  throw new ServiceError(
    "AI_IMAGE_FAILED",
    "Muse Image returned no picture. Try again.",
    502,
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
