import { useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

export interface TourStep {
  title: string;
  text: string;
  /** The button that shows it, and what it does. */
  action: string;
  run: () => void | Promise<void>;
}

/**
 * A short guided tour: each step explains one thing and does it for you,
 * so a first visit sees the whole product in about a minute.
 */
export default function DemoTour({
  steps,
  onClose,
  left,
}: {
  steps: TourStep[];
  onClose: () => void;
  /** Keep clear of the panel. */
  left: number;
}) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const step = steps[i];
  async function run() {
    setBusy(true);
    try {
      await step.run();
      setDone((d) => new Set(d).add(i));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="demo-tour"
      style={{ left: left + 16 }}
      aria-label="Guided tour"
    >
      <header>
        <span>
          Tour · {i + 1} of {steps.length}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="End the tour"
          onClick={onClose}
        >
          <X size={16} />
        </button>
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
          disabled={busy}
          onClick={() => void run()}
        >
          {busy
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
            onClick={() => setI(i - 1)}
          >
            <ArrowLeft size={16} />
          </button>
          {i < steps.length - 1 ? (
            <button
              type="button"
              className="icon-button"
              aria-label="Next step"
              onClick={() => setI(i + 1)}
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
