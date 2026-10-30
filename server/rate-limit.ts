import type { Request } from "express";

/**
 * A small fixed-window limit per client address, per server instance. It
 * keeps one visitor from draining shared upstream quotas through the
 * public endpoints; it is not a global quota across instances.
 */
export function rateLimiter(max: number, windowMs = 60_000) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (q: Request, now = Date.now()) => {
    const forwarded = String(q.headers["x-forwarded-for"] ?? "").split(",")[0];
    const id = forwarded.trim() || q.ip || "unknown";
    let entry = hits.get(id);
    if (!entry || entry.reset <= now) {
      if (hits.size > 5000)
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      entry = { count: 0, reset: now + windowMs };
      hits.set(id, entry);
    }
    entry.count++;
    return entry.count <= max;
  };
}
