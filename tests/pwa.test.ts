import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("installable app", () => {
  it("has a manifest with an app name, start page and PNG icons that exist", () => {
    const m = JSON.parse(read("public/manifest.webmanifest"));
    expect(m).toMatchObject({
      short_name: "Walk-Free",
      start_url: "/demo",
      display: "standalone",
    });
    for (const size of ["192x192", "512x512"])
      expect(
        m.icons.some(
          (i: { sizes: string; type: string }) =>
            i.sizes === size && i.type === "image/png",
        ),
      ).toBe(true);
    for (const icon of m.icons)
      expect(existsSync(new URL(`../public${icon.src}`, import.meta.url))).toBe(
        true,
      );
  });

  it("has a link preview image that exists", () => {
    const html = read("index.html");
    expect(html).toContain(
      'property="og:image" content="https://walk-free.vercel.app/og.png"',
    );
    expect(existsSync(new URL("../public/og.png", import.meta.url))).toBe(true);
  });

  it("describes the app for search engines with valid structured data", () => {
    const html = read("index.html");
    expect(html).toContain(
      'rel="canonical" href="https://walk-free.vercel.app/"',
    );
    const json = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )![1];
    expect(JSON.parse(json)).toMatchObject({
      "@type": "WebApplication",
      name: "Walk-Free",
    });
  });

  it("links the manifest and icons from the page", () => {
    const html = read("index.html");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('rel="icon"');
  });

  describe("service worker", () => {
    const self: Record<string, unknown> = { addEventListener() {} };
    runInNewContext(read("public/sw.js"), {
      self,
      caches: {},
      fetch() {},
      URL,
    });
    const strategy = self.walkFreeStrategy as (
      u: string,
      mode: string,
      origin: string,
    ) => string;
    const o = "https://walk-free.vercel.app";

    it("never caches the API, sign-in or other sites", () => {
      expect(strategy(`${o}/api/weather?lat=1&lon=2`, "cors", o)).toBe(
        "network",
      );
      expect(strategy(`${o}/api/auth/get-session`, "cors", o)).toBe("network");
      expect(strategy(`${o}/api/canopy?x=1`, "cors", o)).toBe("network");
      expect(
        strategy("https://api.open-meteo.com/v1/forecast", "cors", o),
      ).toBe("network");
    });

    it("serves pages network-first and hashed assets from cache", () => {
      expect(strategy(`${o}/demo?area=ut-austin`, "navigate", o)).toBe("page");
      expect(strategy(`${o}/assets/App-abc12345.js`, "no-cors", o)).toBe(
        "cache-first",
      );
    });

    it("keeps campuses for offline use, refreshing them in the background", () => {
      expect(strategy(`${o}/areas/ut-austin.json`, "cors", o)).toBe(
        "stale-while-revalidate",
      );
    });

    it("leaves anything else to the network", () => {
      expect(strategy(`${o}/sw.js`, "no-cors", o)).toBe("network");
      expect(strategy(`${o}/robots.txt`, "no-cors", o)).toBe("network");
    });
  });

  it("serves the worker uncached so updates arrive", () => {
    const headers = JSON.parse(read("vercel.json")).headers as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    const sw = headers.find((h) => h.source === "/sw.js");
    expect(sw?.headers.find((h) => h.key === "Cache-Control")?.value).toMatch(
      /no-cache/,
    );
  });
});
