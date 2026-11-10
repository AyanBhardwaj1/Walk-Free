import { HeartPulse } from "lucide-react";
import type { WalkAdvice as Advice } from "../lib/walk-advice";

/**
 * What the walk's heat means in practice: up to three steps (a shadier
 * route, a cool stop, water, warning signs), coloured by level, with the
 * NWS HeatRisk when it is higher than the walk's own heat stress.
 */
export default function WalkAdvice({ advice }: { advice: Advice | null }) {
  if (!advice) return null;
  return (
    <section
      className={`walk-advice level-${advice.level}`}
      aria-label="Heat check for this walk"
    >
      <p>
        <HeartPulse size={15} aria-hidden />
        <strong>Heat check</strong>
        {advice.note && <span>{advice.note}</span>}
      </p>
      {advice.tips.length > 0 && (
        <ul>
          {advice.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
