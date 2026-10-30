import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Vercel runs the API as native ESM without a bundler, so every relative
// import reachable from api/ must name its emitted .js file.
const serverDirs = ["api", "server", "shared", "src/lib"];

describe("serverless deployment", () => {
  it("uses explicit .js extensions for relative imports in server code", () => {
    const missing = serverDirs.flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith(".ts"))
        .flatMap((file) => {
          const path = join(dir, file);
          return [
            ...readFileSync(path, "utf8").matchAll(
              /from\s+"(\.{1,2}\/[^"]+)"/g,
            ),
          ]
            .map((match) => match[1])
            .filter((specifier) => !specifier.endsWith(".js"))
            .map((specifier) => `${path}: ${specifier}`);
        }),
    );
    expect(missing).toEqual([]);
  });
});

describe("security headers", () => {
  it("sends a content security policy that blocks injected scripts and framing", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const all = config.headers.find((h) => h.source === "/(.*)")!.headers;
    const csp = all.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
