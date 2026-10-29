import { TreePine } from "lucide-react";
import { toF } from "../lib/heat";

type Summary = { shade: number; feelsLikeC: number } | null;
const pct = (x: number, fine = false) =>
  `${fine ? (x * 100).toFixed(1) : Math.round(x * 100)}%`;
const deg = (c: number) => `${Math.round(toF(c))}°F`;

function Row({ label, pair }: { label: string; pair: Summary[] }) {
  const [before, after] = pair;
  if (!before || !after) return null;
  const cooler = toF(before.feelsLikeC) - toF(after.feelsLikeC);
  // Small area-wide gains vanish when rounded, so show a decimal.
  const fine = Math.abs(after.shade - before.shade) < 0.01;
  return (
    <div className="impact-row">
      <small>{label}</small>
      <p>
        <strong>
          {pct(before.shade, fine)} → {pct(after.shade, fine)}
        </strong>{" "}
        shaded
      </p>
      <p>
        <strong>
          {deg(before.feelsLikeC)} → {deg(after.feelsLikeC)}
        </strong>{" "}
        feels like
        {cooler >= 0.05 && (
          <span className="impact-gain"> · {cooler.toFixed(1)}°F cooler</span>
        )}
      </p>
    </div>
  );
}

/** Before-and-after heat for the trees planted in this design session. */
export default function HeatImpact({
  impact,
  street,
  planted,
  time,
  onReset,
}: {
  impact: { street: Summary[]; area: Summary[] };
  street: string;
  planted: number;
  time: string;
  onReset: () => void;
}) {
  return (
    <div className="heat-impact" role="status" aria-live="polite">
      <div className="section-title">
        <TreePine size={17} /> Heat impact · {time}
      </div>
      <Row
        label={street === "this path" ? "This path" : street}
        pair={impact.street}
      />
      <Row label="Whole area (walking paths)" pair={impact.area} />
      <p className="fine">
        {planted} trees planted. Move the time of day to see how the shade
        shifts; estimates assume mature canopy.
      </p>
      <button className="text-button" onClick={onReset}>
        Compare from here
      </button>
    </div>
  );
}
