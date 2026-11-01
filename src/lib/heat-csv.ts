import { toF, type PlaceHeat } from "./heat.js";

/** A CSV cell: quoted when needed, with formula-like text defused. */
function cell(v: string | number) {
  let s = String(v);
  // Spreadsheets run text cells starting with these as formulas.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Every street and park's modeled heat at one hour, for planners to take
 * into a spreadsheet. The first line says what the numbers are.
 */
export function streetHeatCsv(
  places: PlaceHeat[],
  { area, at }: { area: string; at: string },
) {
  // Plain rows (no comment line) so spreadsheets, pandas and R read it as
  // is; each row says where, when and that it is a modeled estimate.
  const rows = [
    "name,kind,length_m,shaded_percent,feels_like_f,in_sun_f,in_shade_f,area,at,source",
    ...places.map((p) =>
      [
        p.name,
        p.kind,
        Math.round(p.length),
        Math.round(p.shade * 100),
        Math.round(toF(p.feelsLikeC)),
        Math.round(toF(p.sunFeelsC)),
        Math.round(toF(p.shadeFeelsC)),
        area,
        at,
        "Walk-Free model (estimate, not a measurement)",
      ]
        .map(cell)
        .join(","),
    ),
  ];
  // A byte-order mark so Excel reads accented names correctly.
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}
