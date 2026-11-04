import { useEffect, useRef, useState } from "react";
import { PlayCircle } from "lucide-react";
import type { ToolHost } from "../lib/assistant-tools";
import { runToolDemo, type DemoTurn } from "../lib/tool-demo";
import { useUnit } from "../lib/units";

const TOOL_LABEL: Record<string, string> = {
  heat_ranking: "Ranking heat",
  place_heat: "Checking the street",
  plan_route: "Planning routes",
  best_time_to_leave: "Finding the coolest hour",
};

/**
 * For guests: a scripted run of the assistant's real tools on this map,
 * with replies written from their results. Clearly not a model's words.
 */
export default function AssistantDemo({
  host,
  area,
  start = 0,
}: {
  host: () => ToolHost;
  area: string;
  /** Raised (1, 2, …) to start the demo from outside, as the tour does. */
  start?: number;
}) {
  const unit = useUnit();
  const [turns, setTurns] = useState<DemoTurn[]>([]);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // A new area ends a demo that was running for the old one.
  useEffect(() => {
    abort.current?.abort();
    setTurns([]);
    setRunning(false);
  }, [area]);
  useEffect(() => () => abort.current?.abort(), []);
  // Keep the newest reply in view as the demo goes.
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // The log can run past the panel's fold; bring the newest reply in.
    el.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [turns]);
  const play = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTurns([]);
    setRunning(true);
    setFailed(false);
    try {
      await runToolDemo(
        host,
        (t) => setTurns((all) => [...all, t]),
        controller.signal,
        unit,
      );
    } catch (error) {
      // A new area or a replay cancels quietly; anything else is shown.
      if ((error as Error)?.name !== "AbortError") setFailed(true);
    } finally {
      if (abort.current === controller) setRunning(false);
    }
  };
  const playRef = useRef(play);
  playRef.current = play;
  // Only a raise after mounting starts it, not a value left from before
  // (the tab can close and reopen).
  const handled = useRef(start);
  useEffect(() => {
    if (start <= handled.current) return;
    handled.current = start;
    void playRef.current();
  }, [start]);
  return (
    <div className="assistant-demo">
      <button
        className="secondary"
        disabled={running}
        onClick={() => void play()}
      >
        <PlayCircle size={16} aria-hidden />
        {running
          ? "Running the demo…"
          : turns.length
            ? "Replay the demo"
            : "Watch what it does"}
      </button>
      {turns.length > 0 && (
        <div
          ref={log}
          className="chat-log"
          aria-live="polite"
          aria-label="Demo conversation"
          role="log"
          // Scrollable, so keyboard users can reach and scroll it.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          {turns.map((t, i) => (
            <div key={i}>
              <p className="chat-user">{t.ask}</p>
              <p className="chat-tool">{TOOL_LABEL[t.tool] ?? t.tool}</p>
              <p className="chat-reply">{t.reply}</p>
            </div>
          ))}
        </div>
      )}
      {failed && (
        <p className="chat-error" role="alert">
          The demo stopped with an error. Try it again.
        </p>
      )}
      <p className="fine">
        Scripted demo: it runs the assistant's real tools on this map and writes
        each reply from their numbers, without an AI model. The real assistant
        (Meta's Muse Spark) answers anything you ask.
      </p>
    </div>
  );
}
