import type { Destination } from "./destinations.js";
import { runTool, type ToolHost } from "./assistant-tools.js";
import { coolStopNodes } from "./cool-stops.js";
import { formatTemp, type TempUnit } from "./units.js";

/* Results of the assistant's tools, as far as the demo reads them. */
interface Spot {
  name: string;
  feels_like_f: number;
  in_sun_f: number;
  in_shade_f: number;
  shaded_percent: number;
}
interface RouteOption {
  preference: string;
  minutes: number;
  shaded_percent: number;
  minutes_in_sun: number;
}
type Failed = { error?: string };

export interface DemoTurn {
  ask: string;
  tool: string;
  reply: string;
}

/** The building or park a catalog entry is about ("Path near PCL" → "PCL"). */
const placeName = (d: Destination) => d.label.replace(/^Path near /i, "");

/** Two named places 400-900 m apart on this map, the same every time. */
export function demoPair(host: ToolHost): [string, string] | null {
  const at = new Map(host.world.graph.nodes.map((n) => [n.id, n.point]));
  // On pre-built campuses, two well-known buildings (libraries, unions).
  const known = coolStopNodes(host.world);
  for (const a of known)
    for (const b of known) {
      const [p, q] = [at.get(a.nodeId), at.get(b.nodeId)];
      if (!p || !q || a.name === b.name) continue;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d >= 300 && d <= 1200) return [a.name, b.name];
    }
  const named = host.catalog
    .filter(
      (d) =>
        at.has(d.id) &&
        /^[A-Z]/.test(placeName(d)) &&
        d.keys.some((k) => k.place && k.primary),
    )
    .sort((a, b) => placeName(a).localeCompare(placeName(b)))
    .slice(0, 400);
  for (const a of named)
    for (const b of named) {
      const [p, q] = [at.get(a.id)!, at.get(b.id)!];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (placeName(a) !== placeName(b) && d >= 400 && d <= 900)
        return [placeName(a), placeName(b)];
    }
  return null;
}

/**
 * A scripted look at what the assistant does, for people without an AI
 * key: it runs the assistant's real tools on this map (the map changes as
 * it would), and writes each reply from the tool's own numbers. No model
 * is called, so nothing here is generated text.
 */
export async function runToolDemo(
  host: ToolHost,
  onTurn: (turn: DemoTurn) => void,
  signal?: AbortSignal,
  unit: TempUnit = "F",
) {
  // Tools report °F; show the person's unit.
  const t = (f: number) => formatTemp(((f - 32) * 5) / 9, unit);
  const step = async (ask: string, tool: string, args: object) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // A beat between steps so each change on the map can be seen.
    await new Promise((r) => setTimeout(r, 600));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return {
      ask,
      tool,
      result: await runTool(host, tool, JSON.stringify(args)),
    };
  };

  const ranking = await step(
    "Which streets are hottest at 3 PM?",
    "heat_ranking",
    { hour: 15, limit: 3 },
  );
  const r1 = ranking.result as Failed & {
    at?: string;
    hottest?: Spot[];
    coolest?: Spot[];
  };
  const hot = r1.hottest?.[0],
    cool = r1.coolest?.[0];
  onTurn({
    ...ranking,
    reply:
      hot && cool
        ? `At ${r1.at}, ${hot.name} is the hottest walk here, about ${t(hot.feels_like_f)} with ${hot.shaded_percent}% shade. ${cool.name} is the coolest at ${t(cool.feels_like_f)}.`
        : (r1.error ?? "This map has no streets to rank."),
  });

  if (hot) {
    const why = await step(`Why is ${hot.name} so hot?`, "place_heat", {
      place: hot.name,
      hour: 15,
    });
    const r2 = why.result as Failed & Partial<Spot>;
    onTurn({
      ...why,
      reply: r2.error
        ? r2.error
        : `${r2.shaded_percent ? `Only ${r2.shaded_percent}% of it is` : "None of it is"} shaded at 3 PM: in the sun it feels about ${t(r2.in_sun_f!)}, in shade ${t(r2.in_shade_f!)}. It's highlighted on the map.`,
    });
  }

  const pair = demoPair(host);
  if (pair) {
    const [a, b] = pair;
    const plan = await step(
      `Plan the coolest walk from ${a} to ${b} at 3 PM.`,
      "plan_route",
      { from: a, to: b, preference: "shade", leave_at_hour: 15 },
    );
    const r3 = plan.result as Failed & { options?: RouteOption[] };
    const shade = r3.options?.find((o) => o.preference === "shade");
    const quick = r3.options?.find((o) => o.preference === "quickest");
    const saved =
      shade && quick ? quick.minutes_in_sun - shade.minutes_in_sun : 0;
    onTurn({
      ...plan,
      reply:
        shade && quick
          ? `The shade route takes ${shade.minutes} min with ${shade.shaded_percent}% shade${
              saved > 0
                ? `, ${saved} fewer ${saved === 1 ? "minute" : "minutes"} in the sun than the quickest (${quick.minutes} min)`
                : `; the quickest (${quick.minutes} min) is already about as shaded`
            }. It's on the map.`
          : (r3.error ?? "Those places aren't connected by mapped paths."),
    });
    const when = await step(
      "When's the coolest time to make that walk?",
      "best_time_to_leave",
      { from: a, to: b },
    );
    const r4 = when.result as Failed & {
      day?: string;
      best?: { leave_at: string; feels_like_f: number };
      cooler_than_now_f?: number;
    };
    onTurn({
      ...when,
      reply: r4.best
        ? `Leave at ${r4.best.leave_at}${r4.day === "tomorrow" ? " tomorrow" : ""}: it should feel about ${t(r4.best.feels_like_f)}${
            r4.cooler_than_now_f
              ? `, ${Math.round(unit === "F" ? r4.cooler_than_now_f : (r4.cooler_than_now_f * 5) / 9)}° cooler than now`
              : ""
          }.`
        : (r4.error ?? "I couldn't work out a time for that walk."),
    });
  }
}
