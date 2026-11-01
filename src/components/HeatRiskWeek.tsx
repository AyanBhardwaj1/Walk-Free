import { ThermometerSun } from "lucide-react";
import { HEAT_RISK_LEVELS, type HeatRisk } from "../../shared/outlook";

/**
 * The NWS HeatRisk outlook for this week as a strip of days, coloured by
 * the NWS scale. Shows nothing outside the US or when unavailable.
 */
export default function HeatRiskWeek({
  risk,
  timeZone,
}: {
  risk: HeatRisk | null | undefined;
  timeZone: string;
}) {
  if (!risk?.days.length) return null;
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { timeZone, weekday: "short" });
  return (
    <section className="heatrisk-week" aria-labelledby="heatrisk-title">
      <div className="section-title" id="heatrisk-title">
        <ThermometerSun size={17} aria-hidden /> Heat risk this week
      </div>
      <ol>
        {risk.days.map((d) => (
          <li
            key={d.day}
            aria-label={`${day(d.date)}: HeatRisk ${d.level}, ${d.label}`}
            title={`${d.level} · ${d.label}`}
          >
            <span
              className="heatrisk-swatch"
              style={{ background: HEAT_RISK_LEVELS[d.level].color }}
              aria-hidden
            />
            <strong aria-hidden>{day(d.date)}</strong>
            <small aria-hidden>{d.level}</small>
          </li>
        ))}
      </ol>
      <p className="fine">
        National Weather Service HeatRisk (experimental): 0 little to none, 1
        minor, 2 moderate, 3 major, 4 extreme. It accounts for how unusual the
        heat is and for warm nights.
      </p>
    </section>
  );
}
