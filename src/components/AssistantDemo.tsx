import { useEffect, useRef, useState } from "react";
import { PlayCircle } from "lucide-react";
import type { ToolHost } from "../lib/assistant-tools";
import { runToolDemo, type DemoTurn } from "../lib/tool-demo";

const TOOL_LABEL: Record<string, string> = {
  heat_ranking: "Ranking heat",
  place_heat: "Checking the street",
  plan_route: "Planning routes",
};

/**
 * For guests: a scripted run of the assistant's real tools on this map,
 * with replies written from their results. Clearly not a model's words.
 */
export default function AssistantDemo({
  host,
  area,
}: {
  host: () => ToolHost;
  area: string;
}) {
  const [turns, setTurns] = useState<DemoTurn[]>([]);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // A new area ends a demo that was running for the old one.
  useEffect(() => {
    abort.current?.abort();
    setTurns([]);
    setRunning(false);
  }, [area]);
  useEffect(() => () => abort.current?.abort(), []);
  const play = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTurns([]);
    setRunning(true);
    try {
      await runToolDemo(
        host(),
        (t) => setTurns((all) => [...all, t]),
        controller.signal,
      );
    } catch {
      /* Stopped by a new area or a replay. */
    } finally {
      if (abort.current === controller) setRunning(false);
    }
  };
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
        <div className="chat-log" aria-live="polite">
          {turns.map((t, i) => (
            <div key={i}>
              <p className="chat-user">{t.ask}</p>
              <p className="chat-tool">{TOOL_LABEL[t.tool] ?? t.tool}</p>
              <p className="chat-reply">{t.reply}</p>
            </div>
          ))}
        </div>
      )}
      <p className="fine">
        Scripted demo: it runs the assistant's real tools on this map and
        writes each reply from their numbers, without an AI model. The real
        assistant (Meta's Muse Spark) answers anything you ask.
      </p>
    </div>
  );
}
