import type {
  Environment,
  RoutePreference,
  RouteResult,
  World,
} from "../../shared/types";
import { routePreferences } from "../lib/routing";
import { routeHeat } from "../lib/heat";
import { sunDirection } from "../lib/environment";
import { inUnit, tempDelta, useUnit } from "../lib/units";

export const routeLabels: Record<RoutePreference, string> = {
  quickest: "Quickest",
  shade: "More shade",
  scenic: "Scenic",
  indoors: "Cool stops",
  stepfree: "Step-free",
  night: "Lit at night",
};
/** How much of the route has lighting mapped, and how much of that is lit. */
const lighting = (route: RouteResult) => {
  let mapped = 0,
    lit = 0;
  for (const e of route.edges) {
    if (e.lit === undefined) continue;
    mapped += e.distance;
    if (e.lit) lit += e.distance;
  }
  return { mapped: mapped / route.distance, lit: lit / route.distance };
};
/** Where a step-free walk had to start or end a little away from the pins. */
function stepFreeGapText(gap: { start: number; end: number }) {
  const parts = [
    gap.start >= 5 && `starts ${gap.start} m from your start`,
    gap.end >= 5 && `ends ${gap.end} m from your destination`,
  ].filter(Boolean);
  return parts.length
    ? `No step-free way from the exact points: ${parts.join(", ")}`
    : "Avoids mapped stairs and steep slopes";
}
/** Below this, say the route favours busier streets instead of a lit share. */
const WELL_MAPPED = 0.5;
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
  const unit = useUnit();
  const quick = choices.quickest;
  const quickHeat = quick && routeHeat(quick, environment, origin);
  // After dark, shade and sun minutes mean nothing; lighting matters.
  const dark = sunDirection(environment, origin).altitude <= 0;
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
            ? Math.round(
                tempDelta(quickHeat.feelsLikeC - heat.feelsLikeC, unit),
              )
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
            <strong>{routeLabels[preference]}</strong>
            {route ? (
              <>
                <span className="choice-time">
                  {Math.max(1, Math.round(route.durationMinutes))} min{" "}
                  <small>· {(route.distance / 1000).toFixed(2)} km</small>
                </span>
                <span className="route-heat">
                  ~{Math.round(inUnit(heat!.feelsLikeC, unit))}°{unit} feels
                  like
                  {preference !== "quickest" && cooler > 0 && (
                    <> · {cooler}° cooler</>
                  )}
                </span>
                {dark ? (
                  <span>
                    After dark
                    {preference !== "night" &&
                      lighting(route).mapped >= WELL_MAPPED &&
                      ` · ${Math.round(lighting(route).lit * 100)}% lit`}
                  </span>
                ) : (
                  <>
                    <span>
                      {Math.round(route.shadeFraction * 100)}% shade ·{" "}
                      {Math.round(heat!.sunMinutes)} min in sun
                    </span>
                    <span className="sun-bar" aria-hidden>
                      <i
                        style={{
                          transform: `scaleX(${Math.min(1, Math.max(0, route.shadeFraction))})`,
                        }}
                      />
                    </span>
                  </>
                )}
                {preference === "indoors" &&
                  (route.coolStop ? (
                    <span className="route-extra">
                      Cool off in {route.coolStop} · check hours
                    </span>
                  ) : (
                    <small>No open cool stop on the way</small>
                  ))}
                {preference === "night" &&
                  (() => {
                    const l = lighting(route);
                    return (
                      <span className="route-extra">
                        {l.mapped >= WELL_MAPPED
                          ? `${Math.round(l.lit * 100)}% on lit streets`
                          : `Favours busier streets · lighting mapped on ${Math.round(l.mapped * 100)}%`}
                      </span>
                    );
                  })()}
                {preference === "stepfree" && (
                  <span className="route-extra">
                    {route.stepFreeGap
                      ? stepFreeGapText(route.stepFreeGap)
                      : "Avoids mapped stairs and steep slopes"}
                  </span>
                )}
                {!!route.waterStops && (
                  <span className="route-extra water">
                    {route.waterStops} water{" "}
                    {route.waterStops === 1 ? "fountain" : "fountains"} on the
                    way
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
