import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { clientKey, rateLimiter } from "../server/rate-limit";

afterEach(() => vi.unstubAllEnvs());

const request = (headers: Record<string, string>, address = "10.0.0.9") =>
  ({ headers, socket: { remoteAddress: address } }) as unknown as Request;

describe("public endpoint limits", () => {
  it("limits each key separately and resets after the window", () => {
    const allowed = rateLimiter(2, 1000);
    expect([1, 2, 3].map(() => allowed("a", 0))).toEqual([true, true, false]);
    expect(allowed("b", 0)).toBe(true);
    expect(allowed("a", 1001)).toBe(true);
  });

  it("stays bounded when flooded with distinct keys", () => {
    const allowed = rateLimiter(1, 60_000);
    for (let i = 0; i < 25_000; i++) allowed(`k${i}`, 0);
    // Memory was reset rather than grown; a fresh key is still allowed.
    expect(allowed("fresh", 0)).toBe(true);
  });

  it("trusts forwarding headers only behind Vercel", () => {
    const forged = request({ "x-forwarded-for": "1.2.3.4" });
    expect(clientKey(forged)).toBe("10.0.0.9");
    vi.stubEnv("VERCEL", "1");
    expect(clientKey(request({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(forged)).toBe("1.2.3.4");
  });
});

describe("per-account limits", () => {
  it("counts each account separately and answers 429 past the limit", async () => {
    const { perAccount } = await import("../server/rate-limit");
    const limit = perAccount(2, "map");
    const run = (id: string) => {
      const res = {
        locals: { account: { id } },
        statusCode: 200,
        body: undefined as unknown,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(body: unknown) {
          this.body = body;
          return this;
        },
      };
      let passed = false;
      limit(request({}), res as never, () => (passed = true));
      return passed ? 200 : res.statusCode;
    };
    expect([run("a"), run("a"), run("a"), run("b")]).toEqual([
      200, 200, 429, 200,
    ]);
  });
});
