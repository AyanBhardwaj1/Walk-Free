import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  allowedOrigin,
  authPayload,
  authRouter,
  authenticate,
  browserCookie,
  readAccount,
} from "../server/auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("account boundary", () => {
  it("accepts only the configured production origin and explicitly local development origins", () => {
    vi.stubEnv("WALK_FREE_APP_URL", "https://walk.example");
    vi.stubEnv("VERCEL", "1");
    expect(allowedOrigin("https://walk.example")).toBe(true);
    for (const origin of [
      undefined,
      "https://walk.example.evil.test",
      "https://evil.test",
      "http://localhost:5173",
      "null",
    ])
      expect(allowedOrigin(origin)).toBe(false);
    vi.stubEnv("VERCEL", "");
    expect(allowedOrigin("http://localhost:5173")).toBe(true);
    expect(allowedOrigin("http://localhost:9999")).toBe(false);
  });

  it("validates credentials on the server and strips provider-specific options", () => {
    const parsed = authPayload("/sign-up/email", {
      name: " Walker ",
      email: "A@EXAMPLE.COM",
      password: "twelve-letters-plus",
      role: "admin",
      callbackURL: "https://evil.test",
    });
    expect(parsed?.success && parsed.data).toEqual({
      name: "Walker",
      email: "a@example.com",
      password: "twelve-letters-plus",
    });
    expect(
      authPayload("/sign-up/email", {
        name: "Walker",
        email: "a@example.com",
        password: "short",
      })?.success,
    ).toBe(false);
    expect(
      authPayload("/email-otp/verify-email", {
        email: "a@example.com",
        otp: "123456",
      })?.success,
    ).toBe(true);
    expect(
      authPayload("/email-otp/verify-email", {
        email: "a@example.com",
        otp: "../abc",
      })?.success,
    ).toBe(false);
  });

  it("scopes cookies to the app with HTTP-only and same-site protections while preserving expiry and secure flags", () => {
    const cookie = browserCookie(
      "__Secure-session=opaque; Domain=auth.example; Path=/auth; Secure; SameSite=None; HttpOnly; Max-Age=600; Partitioned",
    );
    expect(cookie).toBe(
      "__Secure-session=opaque; Secure; Max-Age=600; Path=/; HttpOnly; SameSite=Lax",
    );
    expect(browserCookie("session=; Domain=auth.example; Max-Age=0")).toContain(
      "Max-Age=0",
    );
  });

  it("rejects missing, expired, and malformed provider sessions without trusting cookie contents", async () => {
    vi.stubEnv("WALK_FREE_AUTH_URL", "https://auth.example/auth");
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    expect(await readAccount({ headers: {} } as never)).toBeNull();
    expect(mock).not.toHaveBeenCalled();
    for (const expiresAt of ["2000-01-01", "invalid"]) {
      mock.mockResolvedValueOnce(
        Response.json({ user: { id: "u1" }, session: { expiresAt } }),
      );
      expect(
        await readAccount({ headers: { cookie: "session=opaque" } } as never),
      ).toBeNull();
    }
    mock.mockResolvedValueOnce(
      Response.json({
        user: {
          id: "u1",
          name: "Walker",
          email: "a@example.com",
          emailVerified: false,
          internal: "omit",
        },
        session: { expiresAt: "2099-01-01", token: "secret" },
      }),
    );
    expect(
      await readAccount({ headers: { cookie: "session=opaque" } } as never),
    ).toEqual({
      id: "u1",
      name: "Walker",
      email: "a@example.com",
      emailVerified: false,
    });
    expect(mock.mock.calls[0][0]).toContain("disableCookieCache=true");
  });
});

describe("HTTP auth enforcement", () => {
  async function withServer(
    run: (base: string, realFetch: typeof fetch) => Promise<void>,
  ) {
    const realFetch = fetch;
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.get("/api/private", authenticate, (_q, r) => r.json({ ok: true }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", resolve));
    try {
      await run(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        realFetch,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  }

  it("blocks unauthenticated API access, cross-site login, and OAuth routes", async () => {
    await withServer(async (base, request) => {
      expect((await request(base + "/api/private")).status).toBe(401);
      const crossSite = await request(base + "/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(crossSite.status).toBe(403);
      const oauth = await request(base + "/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: '{"provider":"google"}',
      });
      expect(oauth.status).toBe(404);
    });
  });

  it("returns a safe login response and HTTP-only cookie without leaking the provider token", async () => {
    vi.stubEnv("WALK_FREE_AUTH_URL", "https://auth.example/auth");
    vi.stubEnv("VERCEL", "");
    await withServer(async (base, request) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            {
              token: "secret-token",
              user: { id: "user-1", emailVerified: true },
            },
            {
              headers: {
                "Set-Cookie":
                  "session=opaque; Secure; Domain=auth.example; Path=/auth",
              },
            },
          ),
        ),
      );
      const response = await request(base + "/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "a@example.com",
          password: "correct-password",
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        needsVerification: false,
      });
      expect(response.headers.get("set-cookie")).toBe(
        "session=opaque; Secure; Path=/; HttpOnly; SameSite=Lax",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
    });
  });

  it("limits reset emails per address before asking the provider", async () => {
    vi.stubEnv("WALK_FREE_AUTH_URL", "https://auth.example/auth");
    vi.stubEnv("VERCEL", "");
    await withServer(async (base, request) => {
      const provider = vi.fn(async () => Response.json({ ok: true }));
      vi.stubGlobal("fetch", provider);
      const reset = () =>
        request(base + "/api/auth/request-password-reset", {
          method: "POST",
          headers: {
            Origin: "http://localhost:5173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: "victim@example.com" }),
        });
      const statuses = [];
      for (let i = 0; i < 7; i++) statuses.push((await reset()).status);
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses.slice(5)).toEqual([429, 429]);
      expect(provider).toHaveBeenCalledTimes(5);
    });
  });

  it("fails closed on account provider outages", async () => {
    vi.stubEnv("WALK_FREE_AUTH_URL", "https://auth.example/auth");
    await withServer(async (base, request) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("private provider details")),
      );
      const response = await request(base + "/api/private", {
        headers: { Cookie: "session=invalid" },
      });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("private provider details");
    });
  });

  it("pins password-reset links to the allowed app origin and rejects weak reset passwords before contacting the provider", async () => {
    vi.stubEnv("WALK_FREE_AUTH_URL", "https://auth.example/auth");
    vi.stubEnv("VERCEL", "");
    await withServer(async (base, request) => {
      const provider = vi
        .fn()
        .mockResolvedValue(Response.json({ status: true }));
      vi.stubGlobal("fetch", provider);
      const response = await request(
        base + "/api/auth/request-password-reset",
        {
          method: "POST",
          headers: {
            Origin: "http://localhost:5173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "a@example.com",
            redirectTo: "https://evil.test",
          }),
        },
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(provider.mock.calls[0][1].body)).toEqual({
        email: "a@example.com",
        redirectTo: "http://localhost:5173/reset-password",
      });
      const invalid = await request(base + "/api/auth/reset-password", {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: "reset-token", newPassword: "short" }),
      });
      expect(invalid.status).toBe(400);
      expect(provider).toHaveBeenCalledTimes(1);
    });
  });
});
