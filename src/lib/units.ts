import { createContext, useContext } from "react";

/** How temperatures are shown. The heat model always works in °C. */
export type TempUnit = "F" | "C";

/** °F in the US (and a few places that use it), °C everywhere else. */
export function defaultUnit(locale: string | undefined): TempUnit {
  const region = (locale ?? "").split(/[-_]/)[1]?.toUpperCase();
  return !region || ["US", "LR", "MM", "BS", "BZ", "KY", "PW"].includes(region)
    ? "F"
    : "C";
}

const STORAGE_KEY = "walk-free-units";
export function loadUnit(): TempUnit {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "F" || saved === "C") return saved;
  } catch {
    /* Storage can be unavailable; fall back to the locale. */
  }
  return defaultUnit(
    typeof navigator !== "undefined" ? navigator.language : "",
  );
}
export function saveUnit(unit: TempUnit) {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    /* The choice still applies for this visit. */
  }
}

/** A temperature given in °C, in the chosen unit, as a number. */
export const inUnit = (c: number, unit: TempUnit) =>
  unit === "F" ? (c * 9) / 5 + 32 : c;
/** "106°F" or "41°C". */
export const formatTemp = (c: number, unit: TempUnit) =>
  `${Math.round(inUnit(c, unit))}°${unit}`;
/** A difference of `dc` degrees Celsius, in the chosen unit's degrees. */
export const tempDelta = (dc: number, unit: TempUnit) =>
  unit === "F" ? (dc * 9) / 5 : dc;

export const UnitContext = createContext<TempUnit>("F");
export const useUnit = () => useContext(UnitContext);
