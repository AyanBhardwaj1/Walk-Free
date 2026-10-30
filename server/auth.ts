import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { clientKey, rateLimiter } from "./rate-limit.js";

export type Account = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};
type AuthSession = { user: Account; session: { expiresAt: string } };
const allowedPosts = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/request-password-reset",
  "/reset-password",
  "/email-otp/verify-email",
  "/email-otp/send-verification-otp",
]);
const email = z.string().trim().toLowerCase().email().max(254);

/** Requests that send an email or try a password, limited per address. */
const SENSITIVE_POSTS = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/email-otp/send-verification-otp",
  "/email-otp/verify-email",
]);
const QUARTER_HOUR = 15 * 60_000;
const perClient = rateLimiter(30);
const perEmail = rateLimiter(5, QUARTER_HOUR);
const perClientSensitive = rateLimiter(20, QUARTER_HOUR);
const newPassword = z.string().min(12).max(128);
const payloads: Record<string, z.ZodTypeAny> = {
  "/sign-up/email": z.object({
    email,
    password: newPassword,
    name: z.string().trim().min(1).max(80),
  }),
  "/sign-in/email": z.object({ email, password: z.string().min(1).max(128) }),
  "/sign-out": z.object({}),
  "/request-password-reset": z.object({ email }),
  "/reset-password": z.object({
    token: z.string().min(1).max(2048),
    newPassword,
  }),
  "/email-otp/verify-email": z.object({
    email,
    otp: z.string().regex(/^\d{6}$/),
  }),
  "/email-otp/send-verification-otp": z.object({
    email,
    type: z.literal("email-verification"),
  }),
};
export function authPayload(path: string, input: unknown) {
  return payloads[path]?.safeParse(input);
}

export function allowedOrigin(origin: string | undefined) {
  if (!origin) return false;
  const configured = process.env.WALK_FREE_APP_URL?.replace(/\/$/, "");
  if (configured && origin === configured) return true;
  return (
    !process.env.VERCEL &&
    [
      "http://localhost:5173",
      "http://localhost:8787",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8787",
    ].includes(origin)
  );
}

function authUrl() {
  const base = process.env.WALK_FREE_AUTH_URL;
  if (!base) throw new Error("Account service is not configured yet.");
  const url = new URL(base);
  if (url.protocol !== "https:")
    throw new Error("Account service requires HTTPS.");
  return base.replace(/\/$/, "");
}

function authHeaders(q: Request): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(q.headers.cookie ? { Cookie: q.headers.cookie } : {}),
    ...(q.headers.origin && allowedOrigin(q.headers.origin)
      ? { Origin: q.headers.origin }
      : {}),
  };
}

export async function readAccount(q: Request): Promise<Account | null> {
  if (!q.headers.cookie) return null;
  const response = await fetch(
    `${authUrl()}/get-session?disableCookieCache=true`,
    {
      headers: authHeaders(q),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(
      "Account service is temporarily unavailable. Please try again.",
    );
  const data = (await response.json()) as AuthSession | null;
  if (
    !data?.user?.id ||
    !data.session ||
    !(Date.parse(data.session.expiresAt) > Date.now())
  )
    return null;
  const { id, name, email, emailVerified } = data.user;
  return { id, name, email, emailVerified };
}

export const authenticate: RequestHandler = async (q, r, next) => {
  r.setHeader("Cache-Control", "no-store");
  try {
    if (q.method !== "GET" && !allowedOrigin(q.headers.origin)) {
      r.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
    const account = await readAccount(q);
    if (!account) {
      r.status(401).json({
        error: "Please log in to continue.",
        code: "LOGIN_REQUIRED",
      });
      return;
    }
    r.locals.account = account;
    next();
  } catch {
    r.status(503).json({
      error: "Account service is temporarily unavailable. Please try again.",
    });
  }
};

export function browserCookie(value: string) {
  // Bind managed-auth cookies to this app's host, keep them HTTP-only, and
  // prevent cross-site submission. Never expose a session token to JS.
  const parts = value.split(";").map((part) => part.trim());
  return [
    parts[0],
    ...parts
      .slice(1)
      .filter(
        (part) =>
          !/^(domain|path|samesite|httponly|partitioned)(=|$)/i.test(part),
      ),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

export const authRouter = Router();
authRouter.use((_q, r, next) => {
  r.setHeader("Cache-Control", "no-store");
  next();
});
authRouter.get("/session", async (q, r) => {
  try {
    r.json({ user: await readAccount(q) });
  } catch {
    r.status(503).json({
      error: "Account service is temporarily unavailable. Please try again.",
    });
  }
});
authRouter.post("/{*path}", async (q, r) => {
  if (!allowedPosts.has(q.path)) {
    r.status(404).json({ error: "Unknown account operation." });
    return;
  }
  if (!allowedOrigin(q.headers.origin)) {
    r.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  if (!q.is("application/json")) {
    r.status(415).json({ error: "Expected JSON." });
    return;
  }
  const parsed = authPayload(q.path, q.body);
  if (!parsed?.success) {
    r.status(400).json({
      error:
        "Check the form fields. New passwords need 12–128 characters; verification codes need 6 digits.",
    });
    return;
  }
  // Stops one client flooding someone's inbox or guessing passwords; the
  // provider sees only this server's address, so limit here.
  const target = (parsed.data as { email?: unknown }).email;
  const client = clientKey(q);
  const allowed =
    perClient(client) &&
    (!SENSITIVE_POSTS.has(q.path) ||
      (perClientSensitive(client) &&
        (typeof target !== "string" || perEmail(`${q.path} ${target}`))));
  if (!allowed) {
    r.status(429).json({
      error: "Too many attempts. Wait 15 minutes and try again.",
      code: "RATE_LIMITED",
    });
    return;
  }
  try {
    const body = { ...(parsed.data as Record<string, unknown>) };
    // Reset links always return to this application, never an arbitrary URL.
    if (q.path === "/request-password-reset")
      body.redirectTo = `${q.headers.origin}/reset-password`;
    if (q.path === "/sign-up/email" || q.path === "/sign-in/email")
      delete body.callbackURL;
    const response = await fetch(`${authUrl()}${q.path}`, {
      method: "POST",
      headers: authHeaders(q),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    const data = (await response.json()) as Record<string, unknown>;
    const cookies = response.headers.getSetCookie().map(browserCookie);
    if (cookies.length) r.setHeader("Set-Cookie", cookies);
    if (!response.ok) {
      r.status(response.status).json({
        error:
          typeof data.message === "string"
            ? data.message
            : "Unable to complete account request.",
        code: data.code,
      });
      return;
    }
    // Explicit safe response: provider tokens never reach browser storage.
    r.json({
      ok: true,
      needsVerification: Boolean(
        data.user && !(data.user as Account).emailVerified,
      ),
    });
  } catch {
    r.status(503).json({
      error: "Account service is temporarily unavailable. Please try again.",
    });
  }
});
