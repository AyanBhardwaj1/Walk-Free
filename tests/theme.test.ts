import { describe, expect, it } from "vitest";
import { contrast, themeColor, themeCss, THEMES } from "../src/lib/theme";
import { THEME_COLORS } from "../src/theme-colors";

// Real pairs from style.css: [text, background, what].
const PAIRS: [string, string, string][] = [
  ["#313b30", "#f5f3ec", "body text on the page"],
  ["#313b30", "#fffdf6", "body text on panels"],
  ["#fffdf6", "#3f5938", "primary button label"],
  ["#5d6853", "#fffdf6", "secondary text on panels"],
];

describe("interface styles", () => {
  it("leaves the editorial style exactly as designed", () => {
    for (const hex of THEME_COLORS)
      expect(themeColor(hex, "editorial")).toBe(hex);
    expect(themeCss("editorial")).toBe("");
  });

  it("keeps text readable (WCAG AA) in every style", () => {
    for (const { name } of THEMES)
      for (const [fg, bg, what] of PAIRS) {
        const ratio = contrast(themeColor(fg, name), themeColor(bg, name));
        expect(ratio, `${name}: ${what}`).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("makes Sunlight strong enough for bright outdoor glare (AAA)", () => {
    for (const [fg, bg, what] of PAIRS) {
      const ratio = contrast(
        themeColor(fg, "sunlight"),
        themeColor(bg, "sunlight"),
      );
      expect(ratio, what).toBeGreaterThanOrEqual(7);
    }
  });

  it("darkens the page in the dark styles and keeps alpha", () => {
    for (const name of ["night", "blueprint"] as const) {
      expect(contrast(themeColor("#f5f3ec", name), "#000000")).toBeLessThan(2);
      expect(themeColor("#24382026", name)).toMatch(/^#[0-9a-f]{6}26$/);
    }
  });

  it("writes a token for every colour, plus fonts where a style has its own", () => {
    const css = themeCss("blueprint");
    for (const hex of THEME_COLORS)
      expect(css).toContain(`--c-${hex.slice(1)}:`);
    expect(css).toContain("--font-body:");
    expect(themeCss("night")).not.toContain("--font-body:");
  });
});

describe("Sunlight keeps edges visible", () => {
  it("turns light grey borders dark rather than white", () => {
    for (const border of ["#dcded3", "#d5d8cb", "#dedfd0"])
      expect(
        contrast(
          themeColor(border, "sunlight"),
          themeColor("#fffdf6", "sunlight"),
        ),
      ).toBeGreaterThanOrEqual(3);
  });
});
