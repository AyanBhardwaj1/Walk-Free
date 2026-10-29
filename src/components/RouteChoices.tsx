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
  indoors: "Cool stops",
  stepfree: "Step-free",
  night: "Lit at night",
};
const litShare = (route: RouteResult) => {
  const mapped = route.edges.filter((e) => e.lit !== undefined);
  if (!mapped.length) return null;
  return (
    route.edges.reduce((s, e) => s + (e.lit ? e.distance : 0), 0) /
    route.distance
  );
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
                {preference === "indoors" &&
                  (route.coolStop ? (
                    <span className="route-extra">
                      Cool off in {route.coolStop} · check hours
                    </span>
                  ) : (
                    <small>No open cool stop on the way</small>
                  ))}
                {preference === "night" &&
                  (litShare(route) === null ? (
                    <small>Street lighting isn't mapped here</small>
                  ) : (
                    <span className="route-extra">
                      {Math.round(litShare(route)! * 100)}% on lit streets
                    </span>
                  ))}
                {preference === "stepfree" && (
                  <span className="route-extra">
                    Avoids mapped stairs and steep slopes
                  </span>
                )}
                {same && <small>Same path as quickest</small>}
                {route.warnings.length > 0 && (
                  <small>Detour budget applied</small>
                )}
                {route.hypothetical && (
                  <small className="planning-badge">Hypothetical passage</small>
                )}
              </>
            ) : (
              <span>
                {preference === "stepfree"
                  ? "No step-free route found"
                  : "No connected route"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
