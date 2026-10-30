import type { Request, RequestHandler } from "express";

/** Most clients tracked by one limiter before old windows are discarded. */
const MAX_TRACKED = 10_000;

/**
 * A fixed-window limit per key (client address, account or email), per
 * server instance. It keeps one visitor from draining shared quotas; it is
 * not a global quota across instances.
 */
export function rateLimiter(max: number, windowMs = 60_000) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key: string, now = Date.now()) => {
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      if (hits.size >= MAX_TRACKED) {
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
        // Still full of live windows: start over rather than grow unbounded.
        if (hits.size >= MAX_TRACKED) hits.clear();
      }
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    return entry.count <= max;
  };
}

/**
 * The caller's address. Vercel's edge sets X-Real-IP itself; elsewhere a
 * client could forge forwarding headers, so the socket address is used.
 */
export function clientKey(q: Request) {
  if (process.env.VERCEL) {
    const real = q.headers["x-real-ip"];
    const forwarded = q.headers["x-forwarded-for"];
    const ip =
      (typeof real === "string" && real) ||
      (typeof forwarded === "string" && forwarded.split(",")[0].trim());
    if (ip) return ip;
  }
  return q.socket?.remoteAddress ?? q.ip ?? "unknown";
}

/** Express middleware: at most `max` requests a minute per signed-in account. */
export function perAccount(max: number, what: string): RequestHandler {
  const allowed = rateLimiter(max);
  return (q, r, next) => {
    const id = (r.locals.account as { id?: string } | undefined)?.id;
    if (allowed(id ?? clientKey(q))) return next();
    r.status(429).json({
      error: `Too many ${what} requests. Wait a minute and try again.`,
      code: "RATE_LIMITED",
    });
  };
}

/**
 * Counts only failures (wrong password, wrong code) per key, so successful
 * use never locks anyone out and a stranger's guesses can't either when the
 * key includes the guesser's address.
 */
export function failureLimiter(max: number, windowMs: number) {
  const failures = new Map<string, { count: number; reset: number }>();
  return {
    blocked(key: string, now = Date.now()) {
      const entry = failures.get(key);
      return !!entry && entry.reset > now && entry.count >= max;
    },
    fail(key: string, now = Date.now()) {
      const entry = failures.get(key);
      if (!entry || entry.reset <= now) {
        if (failures.size >= MAX_TRACKED) failures.clear();
        failures.set(key, { count: 1, reset: now + windowMs });
      } else entry.count++;
    },
  };
}
