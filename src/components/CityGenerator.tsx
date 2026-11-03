import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, X } from "lucide-react";

export type GenRealism = "sketch" | "detailed" | "dense";

export const REALISM_CHOICES: {
  id: GenRealism;
  label: string;
  detail: string;
  credits: number;
}[] = [
  { id: "sketch", label: "Sketch", detail: "0.8 km · quick", credits: 1 },
  {
    id: "detailed",
    label: "Detailed",
    detail: "1.2 km · richer landmarks",
    credits: 2,
  },
  {
    id: "dense",
    label: "Dense",
    detail: "1.6 km · tall, intricate, slower",
    credits: 4,
  },
];

export const CITY_IDEAS = [
  "A rain-soaked gothic city from a 90s noir cartoon: art-deco towers, a chemical works on the docks, a manor across the bridge",
  "A gleaming art-deco city of heroes with a globe-topped newspaper tower and a domed hall",
  "A desert trading city with shaded souk lanes, wind towers and an oasis",
  "A neon cyberpunk downtown in endless drizzle",
  "A canal city in high summer, bridges and piazzas",
  "A snowy nordic harbour town under the northern lights",
];

const STAGES = [
  "Reading your idea…",
  "Planning districts and landmarks…",
  "Laying out streets…",
  "Raising buildings…",
  "Planting trees and lighting windows…",
];

/**
 * Describe any city (real, fictional or imagined) and get a whole walkable
 * 3D city built from it. More realism means a bigger, denser city and more
 * AI credits.
 */
export default function CityGenerator({
  open,
  onClose,
  onGenerate,
  aiNote,
  initialPrompt = "",
  free = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Plans and builds the city; resolves once it is on screen. */
  onGenerate: (prompt: string, realism: GenRealism) => Promise<void>;
  /** Who will plan it: the AI, or the offline designer and why. */
  aiNote: string;
  initialPrompt?: string;
  /** Built offline at no cost (guests): show no credit prices. */
  free?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [realism, setRealism] = useState<GenRealism>("detailed");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setStage((s) => Math.min(STAGES.length - 1, s + 1)),
      realism === "dense" ? 5000 : 3000,
    );
    return () => clearInterval(timer);
  }, [busy, realism]);
  async function submit() {
    const text = prompt.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setStage(0);
    setError("");
    try {
      await onGenerate(text, realism);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "The city couldn't be generated. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="city-gen"
      aria-labelledby="city-gen-title"
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header>
          <span className="city-gen-eyebrow">
            <Sparkles size={14} aria-hidden /> Generate a city
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <h2 id="city-gen-title">Describe a city. Walk it in a minute.</h2>
        <p className="city-gen-lede">
          Real, fictional or imagined: name a place, a film, a mood or a
          climate. Walk-Free plans districts, streets and landmarks, builds
          every building and tree, and drops you in the middle with routes, heat
          and weather you can change.
        </p>
        <label className="city-gen-field">
          <span>Your city</span>
          <textarea
            value={prompt}
            maxLength={600}
            rows={3}
            placeholder="A rain-soaked gothic city with art-deco towers…"
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
          />
        </label>
        <div className="city-gen-ideas" aria-label="Ideas">
          {CITY_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              disabled={busy}
              onClick={() => setPrompt(idea)}
            >
              {idea.split(":")[0].split(" with ")[0]}
            </button>
          ))}
        </div>
        <fieldset className="city-gen-realism" disabled={busy}>
          <legend>How realistic</legend>
          {REALISM_CHOICES.map((r) => (
            <label key={r.id} className={realism === r.id ? "on" : ""}>
              <input
                type="radio"
                name="realism"
                value={r.id}
                checked={realism === r.id}
                onChange={() => setRealism(r.id)}
              />
              <strong>{r.label}</strong>
              <small>{r.detail}</small>
              <small className="city-gen-credits">
                {free
                  ? "Free"
                  : `${r.credits} ${r.credits === 1 ? "credit" : "credits"}`}
              </small>
            </label>
          ))}
        </fieldset>
        <p className="city-gen-note">{aiNote}</p>
        {error && (
          <p className="city-gen-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="landing-button city-gen-go"
          type="submit"
          disabled={busy || prompt.trim().length < 3}
        >
          {busy ? (
            <span className="city-gen-busy" role="status">
              <span className="city-gen-spinner" aria-hidden />
              {STAGES[stage]}
            </span>
          ) : (
            <>
              <Wand2 size={17} aria-hidden /> Build my city
            </>
          )}
        </button>
      </form>
    </dialog>
  );
}
