import { useState } from "react";
import { FileText, TreePine } from "lucide-react";
import { formatTemp, tempDelta, useUnit, type TempUnit } from "../lib/units";
import { plantingProposal } from "../lib/plant-proposal";
import ProposalDialog from "./ProposalDialog";

type Summary = { shade: number; feelsLikeC: number } | null;
const pct = (x: number, fine = false) =>
  `${fine ? (x * 100).toFixed(1) : Math.round(x * 100)}%`;

function Row({ label, pair }: { label: string; pair: Summary[] }) {
  const unit: TempUnit = useUnit();
  const deg = (c: number) => formatTemp(c, unit);
  const [before, after] = pair;
  if (!before || !after) return null;
  const cooler = tempDelta(before.feelsLikeC - after.feelsLikeC, unit);
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
          <span className="impact-gain">
            {" "}
            · {cooler.toFixed(1)}°{unit} cooler
          </span>
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
  area,
  date,
  timeZone,
  sunUp,
  canopy,
}: {
  impact: { street: Summary[]; area: Summary[] };
  street: string;
  planted: number;
  time: string;
  onReset: () => void;
  /** For the written proposal: the place, moment and its time zone. */
  area: string;
  date: string;
  timeZone: string;
  sunUp: boolean;
  canopy: boolean;
}) {
  const unit = useUnit();
  const [proposal, setProposal] = useState<{
    title: string;
    text: string;
  } | null>(null);
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
        {planted} {planted === 1 ? "tree" : "trees"} planted. Move the time of
        day to see how the shade shifts; estimates assume mature canopy.
      </p>
      <div className="impact-actions">
        <button
          className="secondary"
          onClick={() =>
            setProposal(
              plantingProposal({
                area,
                street,
                planted,
                date,
                timeZone,
                sunUp,
                canopy,
                unit,
                impact,
              }),
            )
          }
        >
          <FileText size={15} aria-hidden /> Write a proposal
        </button>
        <button className="text-button" onClick={onReset}>
          Compare from here
        </button>
      </div>
      <ProposalDialog proposal={proposal} onClose={() => setProposal(null)} />
    </div>
  );
}
