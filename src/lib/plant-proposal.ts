import { formatTemp, tempDelta, type TempUnit } from "./units.js";

type Summary = { shade: number; feelsLikeC: number } | null;
export interface ProposalInput {
  area: string;
  /** The planted street's name, or "this path" when it has none. */
  street: string;
  planted: number;
  /** The moment the numbers describe, ISO. */
  date: string;
  timeZone: string;
  /** Whether the sun is up at that moment (explains an unchanged result). */
  sunUp: boolean;
  /** Whether the map used Meta/WRI canopy, so the credit is only given then. */
  canopy: boolean;
  /** Temperature unit for the letter; °F unless given. */
  unit?: TempUnit;
  impact: { street: readonly Summary[]; area: readonly Summary[] };
}

const pct = (x: number, fine: boolean) =>
  `${fine ? (x * 100).toFixed(1) : Math.round(x * 100)}%`;

function change(
  label: string,
  [before, after]: readonly Summary[],
  unit: TempUnit,
) {
  const deg = (c: number) => formatTemp(c, unit);
  if (!before || !after) return null;
  const fine = Math.abs(after.shade - before.shade) < 0.01;
  const cooler = tempDelta(before.feelsLikeC - after.feelsLikeC, unit);
  return `- ${label}: shade ${pct(before.shade, fine)} → ${pct(after.shade, fine)}; feels like ${deg(before.feelsLikeC)} → ${deg(after.feelsLikeC)}${cooler >= 0.05 ? ` (about ${cooler.toFixed(1)}°${unit} cooler)` : ""}.`;
}

/**
 * A one-page, plain-text proposal for the trees planted in a design
 * session, to send to a campus planner or city council. Built only from
 * the modeled numbers the person saw, so nothing in it is invented.
 */
export function plantingProposal(p: ProposalInput) {
  const named = p.street !== "this path";
  const where = named ? `${p.street}, ${p.area}` : `a path at ${p.area}`;
  const title = `Shade trees for ${where}`;
  const at = new Date(p.date);
  const time = at.toLocaleTimeString("en-US", {
    timeZone: p.timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const day = at.toLocaleDateString("en-US", {
    timeZone: p.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const [before, after] = p.impact.street;
  const unchanged =
    !!before && !!after && Math.abs(after.shade - before.shade) < 0.001;
  const lines = [
    title,
    "",
    `Proposal: plant ${p.planted} ${p.planted === 1 ? "tree" : "trees"}, about 10 m apart on both sides of ${named ? p.street : "this path"}, to shade the people who walk it.`,
    "",
    `What the trees would change, at ${time} on ${day}:`,
    change(named ? p.street : "This path", p.impact.street, p.unit ?? "F"),
    change("Whole area (walking paths)", p.impact.area, p.unit ?? "F"),
    unchanged
      ? p.sunUp
        ? "(These spots are already in shade at this hour; try another hour to see where the new trees help.)"
        : "(The sun is down at this hour, so shade doesn't change; the same trees matter most on summer afternoons.)"
      : null,
    "",
    "Why it matters: extreme heat is the deadliest weather hazard in the US, and walkers in full sun feel far hotter than the air temperature. Street trees are one of the few changes that cool a walk all day, every summer.",
    "",
    "How these numbers were made: Walk-Free traces sunlight against mapped buildings and tree crowns for the chosen hour and combines it with the weather to estimate how hot each path feels. They are modeled estimates, not measurements, and assume the new trees have reached mature canopy (about 10 m wide, 12 m tall).",
    "",
    `Data: OpenStreetMap contributors;${p.canopy ? " Meta and World Resources Institute 1 m canopy height map (built with DINOv3, CC BY 4.0);" : ""} Open-Meteo and the National Weather Service.`,
    "Made with Walk-Free · https://walk-free.vercel.app",
  ].filter((l): l is string => l !== null);
  return { title, text: lines.join("\n") };
}
