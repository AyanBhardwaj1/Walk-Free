import { MAX_TOOL_ROUNDS } from "../../shared/assistant.js";
import { runTool, type ToolHost } from "./assistant-tools.js";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export interface ChatContext {
  area: string;
  localTime: string;
  weather: string;
  route?: string;
  canBuildAreas: boolean;
}
type Post = (
  url: string,
  body: unknown,
) => Promise<{ reply: string; toolCalls: ToolCall[] }>;

const KEEP_USER_TURNS = 6;
/** Stays well under the server's message limit. */
const MAX_MESSAGES = 60;
const TOOL_RESULT_CHARS = 11_000;

/** Drop the oldest whole turns so tool calls always keep their results. */
export function trimHistory(messages: ChatMessage[]) {
  const starts = messages.flatMap((m, i) => (m.role === "user" ? [i] : []));
  let from = Math.max(0, starts.length - KEEP_USER_TURNS);
  while (
    from < starts.length - 1 &&
    messages.length - starts[from] > MAX_MESSAGES
  )
    from++;
  return starts.length ? messages.slice(starts[from]) : messages;
}

/**
 * Sends the conversation, runs any tools the model asks for in the browser,
 * and repeats until the model answers in words.
 */
export async function converse(
  history: ChatMessage[],
  context: () => ChatContext,
  host: () => ToolHost,
  post: Post,
  onTool?: (name: string) => void,
): Promise<{ messages: ChatMessage[]; reply: string }> {
  let messages = trimHistory(history);
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const { reply, toolCalls } = await post("/api/agent/chat", {
      messages,
      context: context(),
    });
    if (!toolCalls?.length) {
      const text = reply?.trim() || "Sorry, I couldn't come up with an answer.";
      return {
        messages: [...messages, { role: "assistant", content: text }],
        reply: text,
      };
    }
    const results: ChatMessage[] = [];
    for (const call of toolCalls) {
      onTool?.(call.function.name);
      let result: unknown;
      try {
        // Read the host fresh: earlier tools may have built a new area.
        result = await runTool(
          host(),
          call.function.name,
          call.function.arguments,
        );
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : "The tool failed.",
        };
      }
      // Let React re-render after a new area so later tools see it.
      if (call.function.name === "build_area")
        await new Promise((resolve) => setTimeout(resolve, 250));
      results.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, TOOL_RESULT_CHARS),
      });
    }
    messages = [
      ...messages,
      { role: "assistant", content: reply || null, tool_calls: toolCalls },
      ...results,
    ];
  }
  throw new Error("The assistant took too many steps. Try a simpler question.");
}
