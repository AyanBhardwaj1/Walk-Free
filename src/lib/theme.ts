import { THEME_COLORS } from "../theme-colors.js";

/**
 * Switchable interface styles. Every colour in the stylesheet is a token
 * (`--c-<hex>`, falling back to the editorial value), and each style is a
 * transform of those colours, so a new style covers every surface at once.
 * The 3D scene and 2D map run their colours through `themeColor` too.
 */
export type ThemeName = "editorial" | "night" | "sunlight" | "blueprint";

export interface Theme {
  name: ThemeName;
  label: string;
  description: string;
  dark: boolean;
  /** Body and display font stacks; the editorial ones when absent. */
  fonts?: { body: string; display: string };
}

const MONO =
  'ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace';
const SANS = '"DM Sans", Arial, sans-serif';

export const THEMES: Theme[] = [
  {
    name: "editorial",
    label: "Editorial",
    description: "Ivory paper, park greens and a serif voice.",
    dark: false,
  },
  {
    name: "night",
    label: "Night",
    description: "Dim and calm for evening walks.",
    dark: true,
  },
  {
    name: "sunlight",
    label: "Sunlight",
    description: "Maximum contrast to read outdoors in bright sun.",
    dark: false,
    fonts: { body: SANS, display: SANS },
  },
  {
    name: "blueprint",
    label: "Blueprint",
    description: "A planner's drawing: navy paper and mono type.",
    dark: true,
    fonts: { body: MONO, display: MONO },
  },
];

type Hsl = [h: number, s: number, l: number];

function parse(hex: string): { hsl: Hsl; alpha: string; chroma: number } {
  const v = hex.replace("#", "");
  const full =
    v.length === 3
      ? [...v].map((c) => c + c).join("")
      : v.length === 4
        ? [...v].map((c) => c + c).join("")
        : v;
  const [r, g, b] = [0, 2, 4].map(
    (i) => parseInt(full.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d)
    h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  return {
    hsl: [(h * 60 + 360) % 360, s, l],
    alpha: full.slice(6, 8),
    chroma: d,
  };
}

function format([h, s, l]: Hsl, alpha: string) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}${alpha}`;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/**
 * Below this chroma (spread between the strongest and weakest channel) a
 * colour reads as a neutral: paper, ink, lines. Saturation can't decide
 * this, since near-white tints have high HSL saturation.
 */
const NEUTRAL_CHROMA = 0.1;
/** Inverted lightness, lifting mid-tones so secondary text stays readable. */
const invert = (l: number, floor: number, span: number) =>
  floor + span * (1 - l) ** 0.75;

const TRANSFORMS: Record<ThemeName, (c: Hsl, neutral: boolean) => Hsl> = {
  editorial: (c) => c,
  // Lightness inverted, so dark ink on light paper becomes light on dark.
  night: ([h, s, l], neutral) =>
    neutral
      ? [h, Math.min(s, 0.12), invert(l, 0.07, 0.86)]
      : [h, s * 0.85, clamp(1 - l * 0.92, 0.18, 0.78)],
  // Paper goes white; lines (light greys) go dark so fields keep their
  // edges; ink goes near-black and accents get stronger.
  sunlight: ([h, s, l], neutral) =>
    neutral
      ? l > 0.9
        ? [h, 0, 1]
        : l > 0.6
          ? [h, 0, 0.32]
          : [h, 0, l * 0.22]
      : l > 0.8
        ? [h, 0.55, 0.92]
        : [h, Math.max(s, 0.6), Math.min(l, 0.3) * 0.8],
  // Navy paper, pale blue lines, cyan accents.
  blueprint: ([, , l], neutral) =>
    neutral
      ? [213, 0.5, invert(l, 0.12, 0.8)]
      : [190, 0.65, clamp(1 - l * 0.85, 0.3, 0.8)],
};

/** A colour as the given style shows it. */
export function themeColor(hex: string, theme: ThemeName): string {
  if (theme === "editorial") return hex;
  const { hsl, alpha, chroma } = parse(hex);
  return format(TRANSFORMS[theme](hsl, chroma < NEUTRAL_CHROMA), alpha);
}

/** CSS that sets every colour token (and fonts) for a style. */
export function themeCss(theme: ThemeName): string {
  if (theme === "editorial") return "";
  const t = THEMES.find((x) => x.name === theme)!;
  const tokens = THEME_COLORS.map(
    (hex) => `--c-${hex.slice(1)}: ${themeColor(hex, theme)};`,
  );
  if (t.fonts)
    tokens.push(
      `--font-body: ${t.fonts.body};`,
      `--font-display: ${t.fonts.display};`,
    );
  return `:root {\n  ${tokens.join("\n  ")}\n}`;
}

/** Shows a style: tokens, dark-mode hints for the browser and the toolbar. */
export function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const t = THEMES.find((x) => x.name === theme)!;
  root.style.colorScheme = t.dark ? "dark" : "light";
  let style = document.getElementById("walk-free-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "walk-free-theme";
    document.head.appendChild(style);
  }
  style.textContent = themeCss(theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeColor("#f3f0e8", theme));
}

const STORAGE_KEY = "walk-free-theme";
export function loadTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.some((t) => t.name === saved)) return saved as ThemeName;
  } catch {
    /* Storage can be unavailable; fall back to the default. */
  }
  return "editorial";
}
export function saveTheme(theme: ThemeName) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* The choice still applies for this visit. */
  }
}

/** WCAG relative-luminance contrast ratio between two colours. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const v = hex.replace("#", "").slice(0, 6);
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(v.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
