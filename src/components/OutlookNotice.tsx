import { AlertTriangle, ArrowUpRight } from "lucide-react";
import {
  activeOutlook,
  alertEnd,
  coarse,
  outlookAdvice,
  type Outlook,
} from "../../shared/outlook";

/**
 * Official heat and air-quality alerts and unhealthy air, in one notice.
 * Shows nothing on an ordinary day.
 */
export default function OutlookNotice({
  outlook: loaded,
  timeZone,
  origin,
}: {
  outlook: Outlook | null;
  timeZone: string;
  origin: { lat: number; lon: number };
}) {
  // Alerts that ended since the last refresh no longer show.
  const outlook = activeOutlook(loaded);
  const advice = outlook && outlookAdvice(outlook);
  if (!outlook || !advice) return null;
  // The forecast office's page for this spot, with the alert's full text.
  const details = `https://forecast.weather.gov/MapClick.php?lat=${coarse(origin.lat)}&lon=${coarse(origin.lon)}`;
  return (
    <section className="outlook-notice" role="status" aria-live="polite">
      <AlertTriangle size={17} aria-hidden />
      <div>
        <p>{advice}</p>
        {outlook.alerts?.slice(0, 2).map((a, i) => (
          <small key={i}>
            <a href={details} target="_blank" rel="noreferrer">
              {a.event}
              <ArrowUpRight size={12} aria-hidden />
            </a>
            {a.ends ? ` until ${alertEnd(a.ends, timeZone)}` : ""} · {a.sender}
          </small>
        ))}
      </div>
    </section>
  );
}
