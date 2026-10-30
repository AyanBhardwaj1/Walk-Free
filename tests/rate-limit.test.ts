import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { rateLimiter } from "../server/rate-limit";

const from = (ip: string) =>
  ({
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
    ip: "10.0.0.1",
  }) as unknown as Request;

describe("public endpoint limits", () => {
  it("limits each client separately and resets after the window", () => {
    const allowed = rateLimiter(2, 1000);
    expect([1, 2, 3].map(() => allowed(from("1.1.1.1"), 0))).toEqual([
      true,
      true,
      false,
    ]);
    expect(allowed(from("2.2.2.2"), 0)).toBe(true);
    expect(allowed(from("1.1.1.1"), 1001)).toBe(true);
  });
});
