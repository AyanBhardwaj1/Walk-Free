import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { outlookAdvice, type Outlook } from "../../shared/outlook";

/**
 * Official heat and air-quality alerts and unhealthy air, in one notice.
 * Shows nothing on an ordinary day.
 */
export default function OutlookNotice({
  outlook,
  timeZone,
}: {
  outlook: Outlook | null;
  timeZone: string;
}) {
  const advice = outlook && outlookAdvice(outlook);
  if (!outlook || !advice) return null;
  const until = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <section className="outlook-notice" role="status" aria-live="polite">
      <AlertTriangle size={17} aria-hidden />
      <div>
        <p>{advice}</p>
        {outlook.alerts?.slice(0, 2).map((a) => (
          <small key={`${a.event}-${a.ends}`}>
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.event}
                <ArrowUpRight size={12} aria-hidden />
              </a>
            ) : (
              a.event
            )}
            {a.ends ? ` until ${until(a.ends)}` : ""} · {a.sender}
          </small>
        ))}
      </div>
    </section>
  );
}
