import { useEffect, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import type { Environment, World } from "../../shared/types";
import { coolWalkability, type CoolWalkability } from "../lib/cool-walkability";

/**
 * How much shade routing helps in this area at the hour shown, from a fixed
 * sample of walks. Computed on request; a new area or hour clears it.
 */
export default function CoolWalkCard({
  world,
  env,
  sunAversion,
  timeLabel,
}: {
  world: World;
  env: Environment;
  sunAversion: number;
  timeLabel: string;
}) {
  const [result, setResult] = useState<CoolWalkability | null | "none">(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    abort.current?.abort();
    setResult(null);
    setWorking(false);
    setFailed(false);
  }, [world, env.dateTime, sunAversion]);
  useEffect(() => () => abort.current?.abort(), []);
  const run = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setWorking(true);
    setFailed(false);
    try {
      const r = await coolWalkability(world, env, {
        sunAversion,
        signal: controller.signal,
      });
      setResult(r ?? "none");
    } catch (error) {
      // A newer area or hour cancels quietly; anything else is reported.
      if ((error as Error)?.name !== "AbortError") setFailed(true);
    } finally {
      if (abort.current === controller) setWorking(false);
    }
  };
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="coolwalk" aria-labelledby="coolwalk-title">
      <div className="section-title" id="coolwalk-title">
        <Gauge size={17} aria-hidden /> How much shade routing helps here
      </div>
      {result && result !== "none" && result.quickShare >= 0.999 ? (
        <p role="status">
          No sun on these walks at {timeLabel}. Move the time to a sunny hour to
          compare.
        </p>
      ) : result && result !== "none" ? (
        <div role="status">
          <p className="coolwalk-score">
            <strong>{result.score}%</strong> of the sun on typical walks can be
            avoided at {timeLabel}.
          </p>
          <ul>
            <li>
              Shade: {pct(result.quickShare)} on the quickest way,{" "}
              {pct(result.shadeShare)} on the shade route
            </li>
            <li>
              About {result.sunMinutesSaved.toFixed(1)} fewer minutes in the sun
              per walk, for {pct(Math.max(0, result.extraDistance))} more
              distance
            </li>
          </ul>
          <p className="fine">
            {result.walks} sample walks between points 250 m to 1 km apart, with
            your sun-aversion setting. Modeled estimates.
          </p>
        </div>
      ) : result === "none" ? (
        <p role="status">This map has no connected walks to compare.</p>
      ) : (
        <>
          <p className="fine">
            Compares the quickest and the shadiest way for a fixed set of walks
            across this area, at the hour shown.
          </p>
          {failed && (
            <p className="chat-error" role="alert">
              The comparison stopped with an error. Try again.
            </p>
          )}
          <button
            className="secondary"
            disabled={working || !world.graph.edges.length}
            onClick={() => void run()}
          >
            {working ? "Comparing walks…" : "Compare walks"}
          </button>
        </>
      )}
    </section>
  );
}
