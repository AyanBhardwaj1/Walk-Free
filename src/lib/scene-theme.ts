import { themeColor, type ThemeName } from "./theme.js";

/**
 * The style the 3D scene and 2D map draw in. Sunlight keeps the editorial
 * scene: it is already light and legible, and its high-contrast transform
 * suits text and lines, not shaded buildings.
 */
let current: ThemeName = "editorial";
export function setSceneTheme(theme: ThemeName) {
  current = theme === "sunlight" ? "editorial" : theme;
}
/** The scene's style, for memo and effect dependencies. */
export const sceneTheme = () => current;
/** A scene colour in the current style. */
export const sc = (hex: string) => themeColor(hex, current);
