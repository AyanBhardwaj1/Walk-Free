import { useEffect, useRef, useState } from "react";
import { Footprints, MapPin, Sprout, TreePine } from "lucide-react";
import type { Environment, World } from "../../shared/types";
import { treePriorities, type TreePlan } from "../lib/tree-priority";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * "Where should the next trees go?": ranks the streets where a row of trees
 * would keep the most walkers out of the sun, from a sample of typical walks
 * across the area, and plants them on request.
 */
export default function TreePlanner({
  world,
  env,
  onPlant,
  onShow,
  preset = null,
}: {
  world: World;
  env: Environment;
  /** Plants a row along the street with this path; returns trees planted. */
  onPlant: (edgeId: string, street: string) => number;
  onShow: (street: string) => void;
  /** A plan made elsewhere (the tour), with the streets it already planted. */
  preset?: { plan: TreePlan; planted: string[] } | null;
}) {
  const [plan, setPlan] = useState<TreePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [planted, setPlanted] = useState<Set<string>>(() => new Set());
  const abort = useRef<AbortController | null>(null);
  // Live inputs, read when a plan starts.
  const inputs = useRef({ world, env });
  inputs.current = { world, env };
  // A new area needs a new plan; edits to this one (planting) keep it.
  useEffect(() => {
    abort.current?.abort();
    setPlan(null);
    setPlanted(new Set());
    setNote("");
    setBusy(false);
  }, [world.id]);
  useEffect(() => () => abort.current?.abort(), []);
  const run = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setNote("");
    try {
      const { world: w, env: e } = inputs.current;
      const result = await treePriorities(w, e, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPlan(result);
      setPlanted(new Set());
      if (!result?.streets.length)
        setNote(
          "No sunny, well-walked street here to plant: try an afternoon hour or a bigger area.",
        );
      else onShow(result.streets[0].street);
    } catch (error) {
      if ((error as Error)?.name !== "AbortError")
        setNote("Couldn't work out a plan for this area.");
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };
  useEffect(() => {
    if (!preset) return;
    abort.current?.abort();
    setBusy(false);
    setNote("");
    setPlan(preset.plan);
    setPlanted(new Set(preset.planted));
  }, [preset]);
  const plant = (street: string, edgeId: string) => {
    if (onPlant(edgeId, street) > 0) setPlanted((s) => new Set(s).add(street));
  };
  return (
    <section className="tree-planner" aria-labelledby="tree-planner-title">
      <div className="section-title" id="tree-planner-title">
        <Sprout size={17} aria-hidden /> Where should the next trees go?
      </div>
      <p className="intro-small">
        Samples typical walks across the area, finds the sunny streets most of
        them share, and tests a row of trees on each. A tree on an unshaded,
        busy street cools walkers up to twice as much as one on a street that
        already has shade.
      </p>
      <button
        className="secondary"
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
      >
        <Footprints size={15} aria-hidden />
        {busy
          ? "Walking the area…"
          : plan
            ? "Plan again for this hour"
            : "Find where trees help the most walkers"}
      </button>
      {note && (
        <p className="fine" role="status">
          {note}
        </p>
      )}
      {plan && plan.streets.length > 0 && (
        <>
          <ol className="tree-plan">
            {plan.streets.map((s, i) => {
              const best = plan.streets[0].sunMinutesSavedPer100 || 1;
              const done = planted.has(s.street);
              return (
                <li key={s.street}>
                  <div className="tree-plan-head">
                    <span className="tree-plan-rank">{i + 1}</span>
                    <strong>{s.street}</strong>
                  </div>
                  <div
                    className="tree-plan-bar"
                    aria-hidden
                    style={{
                      width: `${Math.max(8, (100 * s.sunMinutesSavedPer100) / best)}%`,
                    }}
                  />
                  <p>
                    On {pct(s.walkShare)} of walks · walked stretch{" "}
                    {pct(s.shadeNow)} → <strong>{pct(s.shadeAfter)}</strong>{" "}
                    shaded with {s.trees} trees
                  </p>
                  <p className="fine">
                    {Math.round(s.sunMinutesSavedPer100)} fewer minutes in full
                    sun per 100 walks across the area
                  </p>
                  <div className="tree-plan-actions">
                    <button
                      className="text-button"
                      onClick={() => onShow(s.street)}
                    >
                      <MapPin size={13} aria-hidden /> Show
                    </button>
                    <button
                      className="text-button"
                      disabled={done}
                      onClick={() => plant(s.street, s.edgeIds[0])}
                    >
                      <TreePine size={13} aria-hidden />{" "}
                      {done ? "Planted" : "Plant this street"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="fine">
            From {plan.walks} typical walks (quickest routes between paths 250 m
            to 1 km apart) at this hour. Trees are modeled at mature size.
          </p>
        </>
      )}
    </section>
  );
}
