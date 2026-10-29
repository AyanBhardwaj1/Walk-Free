import { ZodError } from "zod";
import { ServiceError } from "../../shared/errors.js";

const OFFLINE = "You seem to be offline. Check your connection and try again.";
const GENERIC = "Something went wrong. Please try again.";

/**
 * A sentence a person can act on, never a stack trace, JSON parse error or
 * validation dump. Messages written for people (ServiceError, API errors)
 * pass through unchanged.
 */
export function friendlyError(error: unknown, fallback = GENERIC): string {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof ZodError)
    return "Some of the data didn't look right, so it wasn't used. Please try again or choose another area.";
  if (error instanceof SyntaxError)
    return "The service sent an unexpected response. Please try again in a moment.";
  if (error instanceof DOMException && /Abort|Timeout/.test(error.name))
    return "That took too long. Please try again.";
  if (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  )
    return OFFLINE;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return looksHuman(message) ? message : fallback;
}

/** Plain sentences pass; code-like text (JSON, stacks, HTTP dumps) does not. */
function looksHuman(message: string) {
  return (
    message.length > 0 &&
    message.length <= 240 &&
    /^[A-Z“"']/.test(message) &&
    !/[{}[\]<>]|\bat \w+ \(|Unexpected token|undefined|null|NaN|ECONN|ERR_|HTTP \d{3}/.test(
      message,
    )
  );
}
