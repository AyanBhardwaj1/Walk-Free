import { neon } from "@neondatabase/serverless";
import { requestJson, ServiceError } from "./network.js";

/**
 * One OpenAI-compatible chat endpoint for every assistant feature. OpenAI is
 * the default; pointing WALK_FREE_AI_BASE_URL and WALK_FREE_AI_MODEL at another
 * compatible provider (such as Meta's Model API) needs no code change.
 */
export interface AiConfig {
  baseUrl: string;
  key: string;
  model: string;
}
export function aiConfig(): AiConfig | null {
  const key =
    process.env.WALK_FREE_AI_API_KEY ||
    process.env.WALK_FREE_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!key) return null;
  return {
    key,
    baseUrl: (
      process.env.WALK_FREE_AI_BASE_URL || "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model:
      process.env.WALK_FREE_AI_MODEL ||
      process.env.WALK_FREE_OPENAI_MODEL ||
      "gpt-5-mini",
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
    timeoutMs: CALL_TIMEOUT_MS,
    maxBytes: 2_000_000,
    body: JSON.stringify({
      model: config.model,
      messages,
      max_completion_tokens: options.maxTokens ?? MAX_OUTPUT_TOKENS,
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
}
export function usageLimits(): UsageLimits {
  const read = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return {
    // Each question uses one to four model calls (tools need extra rounds).
    dailyPerUser: read("WALK_FREE_AI_DAILY_LIMIT", 80),
    monthlyTotal: read("WALK_FREE_AI_MONTHLY_LIMIT", 4000),
  };
}

export interface UsageStore {
  /** Records one call and returns the totals including it. */
  record(userId: string, day: string): Promise<{ day: number; month: number }>;
}

/** Durable counts in Postgres, shared by every serverless instance. */
export function postgresUsage(url: string): UsageStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  return {
    async record(userId, day) {
      ready ??= sql.query(
        "create table if not exists walk_free_ai_usage (user_id text not null, day date not null, calls integer not null default 0, primary key (user_id, day))",
      );
      await ready;
      const [row] = (await sql.query(
        "insert into walk_free_ai_usage (user_id, day, calls) values ($1, $2, 1) on conflict (user_id, day) do update set calls = walk_free_ai_usage.calls + 1 returning calls",
        [userId, day],
      )) as { calls: number }[];
      const [total] = (await sql.query(
        "select coalesce(sum(calls), 0)::int as calls from walk_free_ai_usage where day >= date_trunc('month', $1::date)",
        [day],
      )) as { calls: number }[];
      return { day: row.calls, month: total.calls };
    },
  };
}

/** Process memory, for local development only. */
export function memoryUsage(): UsageStore {
  const counts = new Map<string, number>();
  return {
    async record(userId, day) {
      const key = `${userId}:${day}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      let month = 0;
      for (const [k, v] of counts)
        if (k.split(":")[1].slice(0, 7) === day.slice(0, 7)) month += v;
      return { day: counts.get(key)!, month };
    },
  };
}

let store: UsageStore | null = null;
function usageStore(): UsageStore {
  if (store) return store;
  const url = process.env.WALK_FREE_DATABASE_URL || process.env.DATABASE_URL;
  if (url) return (store = postgresUsage(url));
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

/** Counts one model call against the user's daily and the site's monthly cap. */
export async function chargeAiCall(userId: string, now = new Date()) {
  const limits = usageLimits();
  const day = now.toISOString().slice(0, 10);
  let usage: { day: number; month: number };
  try {
    usage = await usageStore().record(userId, day);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "AI_LIMITS_UNAVAILABLE",
      "The assistant is paused because its usage limits could not be checked. Please try again later.",
      503,
    );
  }
  if (usage.month > limits.monthlyTotal)
    throw new ServiceError(
      "AI_MONTHLY_LIMIT",
      "The assistant has reached this month's usage limit. Routes and heat maps still work without it.",
      429,
    );
  if (usage.day > limits.dailyPerUser)
    throw new ServiceError(
      "AI_DAILY_LIMIT",
      "You've reached today's assistant limit. It resets at midnight UTC; routes and heat maps still work.",
      429,
    );
  return usage;
}

export function requireAi(): AiConfig {
  const config = aiConfig();
  if (!config)
    throw new ServiceError(
      "KEY_REQUIRED",
      "The assistant isn't configured yet. Set WALK_FREE_OPENAI_API_KEY on the server.",
      503,
    );
  return config;
}
