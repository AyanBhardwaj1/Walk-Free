import type { RoutePreference, RouteResult } from "../../shared/types";
import { routePreferences } from "../lib/routing";

const labels: Record<RoutePreference, string> = {
  quickest: "Quickest",
  shade: "More shade",
  scenic: "Scenic",
  indoors: "Stay inside",
};
export default function RouteChoices({
  choices,
  selected,
  onSelect,
}: {
  choices: Record<RoutePreference, RouteResult | null>;
  selected: RoutePreference;
  onSelect: (preference: RoutePreference) => void;
}) {
  const quick = choices.quickest;
  return (
    <div
      className="preferences route-choices"
      role="group"
      aria-label="Compare walking routes"
    >
      {routePreferences.map((preference) => {
        const route = choices[preference];
        const same =
          preference !== "quickest" &&
          route &&
          quick &&
          route.edges.length === quick.edges.length &&
          route.edges.every(
            (e, i) =>
              e.id === quick.edges[i].id && e.from === quick.edges[i].from,
          );
        return (
          <button
            key={preference}
            className={selected === preference ? "selected" : ""}
            aria-pressed={selected === preference}
            onClick={() => onSelect(preference)}
            disabled={!route}
          >
            <strong>{labels[preference]}</strong>
            {route ? (
              <>
                <span className="choice-time">
                  {Math.max(1, Math.round(route.durationMinutes))} min{" "}
                  <small>· {(route.distance / 1000).toFixed(2)} km</small>
                </span>
                <span>
                  {Math.round(route.shadeFraction * 100)}% modeled shade
                </span>
                <span>{Math.round(route.indoorFraction * 100)}% indoors</span>
                {same && <small>Same path as quickest</small>}
                {route.warnings.length > 0 && (
                  <small>Detour budget applied</small>
                )}
                {route.hypothetical && (
                  <small className="planning-badge">Hypothetical passage</small>
                )}
              </>
            ) : (
              <span>No connected route</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
