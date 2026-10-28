import type {
  Environment,
  RoutePreference,
  RouteResult,
  World,
} from "../../shared/types";
import { routePreferences } from "../lib/routing";
import { routeHeat, toF } from "../lib/heat";

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
  environment,
  origin,
}: {
  choices: Record<RoutePreference, RouteResult | null>;
  selected: RoutePreference;
  onSelect: (preference: RoutePreference) => void;
  environment: Environment;
  origin: World["origin"];
}) {
  const quick = choices.quickest;
  const quickHeat = quick && routeHeat(quick, environment, origin);
  return (
    <div
      className="preferences route-choices"
      role="group"
      aria-label="Compare walking routes"
    >
      {routePreferences.map((preference) => {
        const route = choices[preference];
        const heat = route && routeHeat(route, environment, origin);
        const cooler =
          heat && quickHeat
            ? Math.round(toF(quickHeat.feelsLikeC) - toF(heat.feelsLikeC))
            : 0;
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
                <span className="route-heat">
                  ~{Math.round(toF(heat!.feelsLikeC))}°F feels like
                  {preference !== "quickest" && cooler > 0 && (
                    <> · {cooler}° cooler</>
                  )}
                </span>
                <span>
                  {Math.round(route.shadeFraction * 100)}% shade ·{" "}
                  {Math.round(heat!.sunMinutes)} min in sun
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
