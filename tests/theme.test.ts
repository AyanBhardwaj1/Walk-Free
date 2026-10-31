import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contrast, themeColor, themeCss, THEMES } from "../src/lib/theme";
import { THEME_COLORS } from "../src/theme-colors";

// Real text-on-fill pairs from style.css: [text, fill, what].
const PAIRS: [string, string, string][] = [
  ["#313b30", "#f5f3ec", "body text on the page"],
  ["#313b30", "#fffdf6", "body text on panels"],
  ["#fffdf6", "#3f5938", "primary button label"],
  ["#5d6853", "#fffdf6", "secondary text on panels"],
  ["#4c663e", "#e7ecdc", "the selected route card"],
];
const ratio = (fg: string, bg: string, name: (typeof THEMES)[number]["name"]) =>
  contrast(themeColor(fg, name, "fg"), themeColor(bg, name, "bg"));

describe("interface styles", () => {
  it("leaves the editorial style exactly as designed", () => {
    for (const token of THEME_COLORS) {
      const hex = `#${token.split("-")[1]}`;
      expect(themeColor(hex, "editorial", "fg")).toBe(hex);
    }
    expect(themeCss("editorial")).toBe("");
  });

  it("keeps text readable (WCAG AA) in every style", () => {
    for (const { name } of THEMES)
      for (const [fg, bg, what] of PAIRS)
        expect(ratio(fg, bg, name), `${name}: ${what}`).toBeGreaterThanOrEqual(
          4.5,
        );
  });

  it("makes Sunlight strong enough for bright outdoor glare (AAA)", () => {
    for (const [fg, bg, what] of PAIRS)
      expect(ratio(fg, bg, "sunlight"), what).toBeGreaterThanOrEqual(7);
  });

  it("darkens the page in the dark styles and keeps shadows dark", () => {
    for (const name of ["night", "blueprint"] as const) {
      expect(
        contrast(themeColor("#f5f3ec", name, "bg"), "#000000"),
      ).toBeLessThan(2);
      const shadow = themeColor("#24382026", name, "shadow");
      expect(shadow).toMatch(/^#[0-9a-f]{6}26$/);
      expect(contrast(shadow, "#000000")).toBeLessThan(1.5);
    }
  });

  it("writes a token for every colour role, plus fonts where a style has its own", () => {
    const css = themeCss("blueprint");
    for (const token of THEME_COLORS) expect(css).toContain(`--c-${token}:`);
    expect(css).toContain("--font-body:");
    expect(themeCss("night")).not.toContain("--font-body:");
  });

  it("uses only tokens the theme engine knows", () => {
    const used = new Set(
      [
        ...readFileSync("src/style.css", "utf8").matchAll(
          /var\(--c-([\w-]+),/g,
        ),
      ].map((m) => m[1]),
    );
    expect([...used].filter((t) => !THEME_COLORS.includes(t))).toEqual([]);
  });
});

describe("Sunlight keeps edges visible", () => {
  it("draws light grey borders dark, while light fills stay light", () => {
    for (const border of ["#dcded3", "#d5d8cb", "#dedfd0"]) {
      expect(
        contrast(themeColor(border, "sunlight", "line"), "#ffffff"),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(themeColor(border, "sunlight", "bg"), "#ffffff"),
      ).toBeLessThan(1.2);
    }
  });
});
