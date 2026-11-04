import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";
import { speak, stopSpeech } from "../lib/navigation";

export interface TourStep {
  title: string;
  text: string;
  /** The button that shows it, and what it does. */
  action: string;
  run: () => void | Promise<void>;
  /** In "play all", how long to stay on this step after running it, ms. */
  dwell?: number;
}
/** How long "play all" stays on a step by default, ms. */
const DWELL_MS = 8000;

/**
 * A short guided tour: each step explains one thing and does it for you,
 * so a first visit sees the whole product in about a minute.
 */
export default function DemoTour({
  steps,
  onClose,
  left,
  waiting = false,
  low = false,
  autoPlay = false,
}: {
  steps: TourStep[];
  onClose: () => void;
  /** Keep clear of the panel. */
  left: number;
  /** The area is still loading: actions wait for it. */
  waiting?: boolean;
  /** Sit low on phones, clear of the horizon, during a street walk. */
  low?: boolean;
  /** Start playing every step on its own (?tour=auto). */
  autoPlay?: boolean;
}) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<number>>(() => new Set());
  // "Play all": each step runs, is read aloud, then the tour moves on.
  const [playing, setPlaying] = useState(autoPlay);
  const step = steps[i];
  async function run(index = i) {
    setBusy(true);
    try {
      await steps[index].run();
      setDone((d) => new Set(d).add(index));
    } finally {
      setBusy(false);
    }
  }
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!playing || waiting) return;
    let cancelled = false;
    let timer = 0;
    void (async () => {
      // Move on once the step has had its time and the voice has finished,
      // so narration is never cut off mid-sentence.
      const spoken = speak(`${steps[i].title}. ${steps[i].text}`);
      await runRef.current(i);
      if (cancelled) return;
      const dwell = new Promise((r) => {
        timer = window.setTimeout(r, steps[i].dwell ?? DWELL_MS);
      });
      await Promise.all([dwell, spoken]);
      if (cancelled) return;
      if (i < steps.length - 1) setI(i + 1);
      else setPlaying(false);
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // The steps list is rebuilt on every render of the app; the step index
    // decides when to run, and its title and text are read when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, waiting, i, steps.length]);
  // Ending or pausing the tour stops the voice too.
  useEffect(() => {
    if (!playing) stopSpeech();
  }, [playing]);
  useEffect(() => () => stopSpeech(), []);
  const stopPlaying = () => setPlaying(false);
  return (
    <section
      className={`demo-tour${low ? " is-low" : ""}`}
      style={{ left: left + 16 }}
      aria-label="Guided tour"
    >
      <header>
        <span>
          Tour · {i + 1} of {steps.length}
        </span>
        <span className="demo-tour-head-actions">
          <button
            type="button"
            className="demo-tour-play"
            aria-pressed={playing}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? (
              <>
                <Pause size={13} aria-hidden /> Pause
              </>
            ) : (
              <>
                <Play size={13} aria-hidden /> Play all
              </>
            )}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="End the tour"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </span>
      </header>
      <div className="demo-tour-progress" aria-hidden>
        {steps.map((_, k) => (
          <i key={k} className={k <= i ? "on" : ""} />
        ))}
      </div>
      <h3 key={`t${i}`}>{step.title}</h3>
      <p key={`p${i}`}>{step.text}</p>
      <div className="demo-tour-actions">
        <button
          type="button"
          className="demo-tour-go"
          disabled={busy || waiting}
          onClick={() => {
            stopPlaying();
            void run();
          }}
        >
          {waiting
            ? "Loading the map…"
            : busy
              ? "Working…"
              : done.has(i)
                ? `${step.action} again`
                : step.action}
        </button>
        <span>
          <button
            type="button"
            className="icon-button"
            aria-label="Previous step"
            disabled={i === 0}
            onClick={() => {
              stopPlaying();
              setI(i - 1);
            }}
          >
            <ArrowLeft size={16} />
          </button>
          {i < steps.length - 1 ? (
            <button
              type="button"
              className="icon-button"
              aria-label="Next step"
              onClick={() => {
                stopPlaying();
                setI(i + 1);
              }}
            >
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="text-button" onClick={onClose}>
              Done
            </button>
          )}
        </span>
      </div>
    </section>
  );
}
