import { MapPin, ShieldCheck } from "lucide-react";
import { REACH_MINUTES, type RefugeCoverage } from "../lib/refuges";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Cool refuges within reach (Barcelona-style climate shelters): how much of
 * the walking network is within 5 and 10 minutes of an air-conditioned
 * building, a shade shelter or a shaded park, and the worst-served streets.
 */
export default function RefugeCard({
  coverage,
  slowPace,
  onSlowPace,
  shown,
  onToggle,
  onShow,
}: {
  coverage: RefugeCoverage | null;
  /** Minutes at an older walker's pace (3.28 km/h) rather than the usual. */
  slowPace?: boolean;
  onSlowPace?: (on: boolean) => void;
  shown: boolean;
  onToggle: (on: boolean) => void;
  onShow: (street: string) => void;
}) {
  const kinds = coverage
    ? {
        cool: coverage.refuges.filter((r) => r.kind === "cool-stop").length,
        shelter: coverage.refuges.filter((r) => r.kind === "shelter").length,
        park: coverage.refuges.filter((r) => r.kind === "shaded-park").length,
        indoors: coverage.refuges.filter((r) => r.kind === "indoors").length,
      }
    : null;
  return (
    <section className="refuge-card" aria-labelledby="refuge-title">
      <div className="section-title" id="refuge-title">
        <ShieldCheck size={17} aria-hidden /> Cool refuges within reach
      </div>
      {!coverage || !kinds ? (
        <p className="fine">
          No refuges known here at this hour: air-conditioned cool stops are
          listed for the six campuses in the daytime, and parks count when
          they&apos;re mostly shaded.
        </p>
      ) : (
        <>
          <p className="refuge-stats">
            <span>
              <strong>{pct(coverage.within[0])}</strong> of paths within{" "}
              {REACH_MINUTES[0]} min
            </span>
            <span>
              <strong>{pct(coverage.within[1])}</strong> within{" "}
              {REACH_MINUTES[1]} min
            </span>
          </p>
          <p className="fine">
            {[
              kinds.cool && `${kinds.cool} air-conditioned`,
              kinds.indoors &&
                `${kinds.indoors} open building${kinds.indoors > 1 ? "s" : ""} with a mapped inside`,
              kinds.shelter &&
                `${kinds.shelter} shade shelter${kinds.shelter > 1 ? "s" : ""}`,
              kinds.park &&
                `${kinds.park} shaded park${kinds.park > 1 ? "s" : ""}`,
            ]
              .filter(Boolean)
              .join(", ")}{" "}
            right now. Barcelona aims for a climate shelter within a 10-minute
            walk of everyone.
          </p>
          {onSlowPace && (
            <label className="check">
              <input
                type="checkbox"
                checked={!!slowPace}
                onChange={(e) => onSlowPace(e.target.checked)}
              />
              At an older walker&apos;s pace (3.3 km/h, as Barcelona&apos;s
              climate-shelter plan counts)
            </label>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={shown}
              onChange={(e) => onToggle(e.target.checked)}
            />
            Colour paths by walk to the nearest refuge
          </label>
          {coverage.gaps.length > 0 && (
            <>
              <div className="field-label section-label">
                WHERE A NEW REFUGE WOULD HELP
              </div>
              <ul className="refuge-gaps">
                {coverage.gaps.map((g) => (
                  <li key={g.street}>
                    <span>
                      {g.street} · <strong>{Math.round(g.minutes)} min</strong>{" "}
                      walk
                    </span>
                    <button
                      className="text-button"
                      onClick={() => onShow(g.street)}
                    >
                      <MapPin size={13} aria-hidden /> Show
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
