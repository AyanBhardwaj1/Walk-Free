import { Activity } from "lucide-react";
import {
  UTCI_BANDS,
  utciBand,
  walkUtci,
  type HeatStress,
} from "../lib/heat-stress";
import { formatTemp, useUnit } from "../lib/units";

/**
 * Heat stress as the Universal Thermal Climate Index (UTCI), the standard
 * outdoor index that counts sun, wind and humidity: for a walk with this
 * shaded share, or for shade against full sun.
 */
export default function HeatStressLine({
  stress,
  shadeFraction,
  compareShade,
}: {
  stress: HeatStress | null;
  /** The walk's shaded share; omit to compare shade with full sun. */
  shadeFraction?: number;
  /** Another walk's shaded share (the quickest), to compare with. */
  compareShade?: number;
}) {
  const unit = useUnit();
  if (!stress) return null;
  const label = (c: number) => UTCI_BANDS[utciBand(c)].short;
  if (shadeFraction === undefined) {
    return (
      <p className="heat-stress">
        <Activity size={14} aria-hidden />
        <span>
          Heat stress (UTCI): shade{" "}
          <strong>
            {formatTemp(stress.shadeC, unit)} {label(stress.shadeC)}
          </strong>{" "}
          · full sun{" "}
          <strong>
            {formatTemp(stress.sunC, unit)} {label(stress.sunC)}
          </strong>
          <small className="heat-stress-note">
            The standard outdoor heat-stress index: unlike feels-like below, it
            also weighs the sun&apos;s radiant heat and the wind.
          </small>
        </span>
      </p>
    );
  }
  const walk = walkUtci(stress, shadeFraction);
  const other =
    compareShade !== undefined ? walkUtci(stress, compareShade) : null;
  const band = utciBand(walk);
  const otherBand = other === null ? band : utciBand(other);
  return (
    <p className={`heat-stress band-${band}`}>
      <Activity size={14} aria-hidden />
      <span>
        Heat stress on this walk: <strong>{UTCI_BANDS[band].label}</strong>{" "}
        {`(UTCI ${formatTemp(walk, unit)})`}
        {otherBand > band && (
          <>
            ; the quickest walk is{" "}
            <strong>{UTCI_BANDS[otherBand].short}</strong>
          </>
        )}
      </span>
    </p>
  );
}
