import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

/** The guide's steps: what a first-time walker needs, in order of use. */
export const GUIDE_STEPS = [
  {
    title: "Find your walk",
    text: "Search for a building, street or city, or tap Start on map and End on map. The demo opens on a real campus walk.",
  },
  {
    title: "Pick the cooler route",
    text: "Each card shows minutes in the sun and how hot it feels. The heat check below says what to do: a shadier swap, water, or when to take a break.",
  },
  {
    title: "Walk it",
    text: "Start walking for turn-by-turn directions from your location, spoken in your language or felt as a buzz at each turn.",
  },
  {
    title: "Make it yours",
    text: "Under Accessibility and voice, set the app up for blind, low-vision, deaf or wheelchair use, or heat sensitivity. Map look switches between cinematic, heat-focused and bare-bones maps.",
  },
  {
    title: "Learn your routine",
    text: "My walks learns your pace and daily trips on this device, then tells you when to leave, how much sun you avoided and your walking streak.",
  },
] as const;

const SEEN_KEY = "walk-free-guide-seen";

/** Whether this browser has already seen (or dismissed) the guide. */
export function guideSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * A five-step guide for first-time visitors: a small card over the map,
 * not a blocking dialog, so the app stays usable behind it. Closing it
 * (or finishing) remembers that it was seen.
 */
export default function FirstRunGuide({
  onClose,
  onTour,
}: {
  onClose: () => void;
  /** Opens the one-minute guided tour, where there is one. */
  onTour?: () => void;
}) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const last = step === GUIDE_STEPS.length - 1;
  const box = useRef<HTMLElement>(null);
  // Where focus was before the guide took it, to give it back on close.
  const before = useRef<Element | null>(null);
  if (before.current === null && typeof document !== "undefined")
    before.current = document.activeElement;
  useEffect(() => heading.current?.focus(), [step]);
  // Escape closes it while focus is inside it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && box.current?.contains(document.activeElement))
        close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* Private windows can refuse storage; it closes all the same. */
    }
    const back = before.current;
    onClose();
    if (
      back instanceof HTMLElement &&
      back.isConnected &&
      back !== document.body
    )
      back.focus();
  };
  const s = GUIDE_STEPS[step];
  return (
    <section
      className="first-run"
      role="dialog"
      aria-modal="false"
      aria-labelledby="first-run-title"
      ref={box}
    >
      <div className="first-run-head">
        <small>
          How it works · {step + 1} of {GUIDE_STEPS.length}
        </small>
        <button
          type="button"
          className="icon-button"
          aria-label="Close the guide"
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      <h2 id="first-run-title" ref={heading} tabIndex={-1}>
        {s.title}
      </h2>
      <p>{s.text}</p>
      <div className="first-run-dots" aria-hidden>
        {GUIDE_STEPS.map((g, i) => (
          <span key={g.title} className={i === step ? "on" : ""} />
        ))}
      </div>
      <div className="first-run-actions">
        {step > 0 && (
          <button
            type="button"
            className="secondary"
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft size={15} aria-hidden /> Back
          </button>
        )}
        {last ? (
          <>
            {onTour && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  close();
                  onTour();
                }}
              >
                Take the 1-minute tour
              </button>
            )}
            <button type="button" className="primary" onClick={close}>
              Start exploring
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => setStep(step + 1)}
          >
            Next <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}
