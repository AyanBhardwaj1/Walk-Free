import { useState } from "react";
import { TrainFront, ArrowUpRight } from "lucide-react";
interface Walk {
  distance: number;
  minutes: number;
  directions: { text: string; distance: number }[];
}
interface Journey {
  origin: string;
  destination: string;
  source: string;
  fetchedAt: string;
  notes: string[];
  options: {
    station: string;
    departure: string;
    arrival: string;
    destinationArrival: string;
    first: Walk;
    last: Walk;
    visibilityMeters: number | null;
    weather: string;
    tripId: string;
  }[];
}
export default function JourneyPanel() {
  const [departure, setDeparture] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Journey | null>(null);
  const [fog, setFog] = useState(true);
  async function plan() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        (import.meta.env.VITE_API_BASE_URL || "") +
          "/api/journey/berkeley?departure=" +
          encodeURIComponent(new Date(departure).toISOString()),
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setResult(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fogSignal = (s: string) =>
    /unavailable/i.test(s) ? null : Number(/fog|mist/i.test(s));
  const options = [...(result?.options || [])].sort((a, b) =>
    fog && a.visibilityMeters !== null && b.visibilityMeters !== null
      ? b.visibilityMeters - a.visibilityMeters
      : fog &&
          fogSignal(a.weather) !== null &&
          fogSignal(b.weather) !== null &&
          fogSignal(a.weather) !== fogSignal(b.weather)
        ? fogSignal(a.weather)! - fogSignal(b.weather)!
        : Date.parse(a.destinationArrival) - Date.parse(b.destinationArrival),
  );
  const time = (s: string) =>
    new Date(s).toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <section>
      <div className="section-title">
        <TrainFront size={18} /> Across the bay
      </div>
      <p className="intro">
        Berkeley to Chase Center. Two walks, a train, and a better view of the
        forecast.
      </p>
      <label>
        FROM
        <input
          readOnly
          value="UC Berkeley · Sather Gate"
          className="text-field"
        />
      </label>
      <label>
        TO
        <input
          readOnly
          value="Chase Center · San Francisco"
          className="text-field"
        />
      </label>
      <label>
        DEPARTURE · YOUR DEVICE TIME
        <input
          type="datetime-local"
          value={departure}
          onChange={(e) => setDeparture(e.target.value)}
          className="text-field"
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={fog}
          onChange={(e) => setFog(e.target.checked)}
        />
        Prefer better forecast visibility
      </label>
      <button className="primary" onClick={plan} disabled={busy}>
        {busy ? "Checking walks & trains…" : "Find a journey"}
        <ArrowUpRight size={16} />
      </button>
      {error && (
        <p className="inline-error" role="status">
          {error}
        </p>
      )}
      {options.map((o, i) => (
        <div className="journey-option" key={o.tripId + o.station}>
          <div className="eyebrow">
            OPTION {i + 1} · VIA {o.station.toUpperCase()}
          </div>
          <h3>Arrive {time(o.destinationArrival)}</h3>
          <p>Walk {Math.ceil(o.first.minutes)} min to Downtown Berkeley</p>
          <p>
            BART · {time(o.departure)} → {time(o.arrival)}
          </p>
          <p>Walk {Math.ceil(o.last.minutes)} min to Chase Center</p>
          <div className="forecast-visibility">
            {o.visibilityMeters === null
              ? "Visibility forecast unavailable"
              : `${(o.visibilityMeters / 1000).toFixed(1)} km forecast visibility`}
            <small>{o.weather}</small>
          </div>
          <details>
            <summary>Walking directions</summary>
            {[...o.first.directions, ...o.last.directions].map((d, j) => (
              <p key={j}>
                {d.text} · {Math.round(d.distance)} m
              </p>
            ))}
          </details>
        </div>
      ))}
      {result && (
        <>
          <p className="fine">
            {result.source} · checked{" "}
            {new Date(result.fetchedAt).toLocaleString()}
          </p>
          {result.notes.map((n) => (
            <p className="fine" key={n}>
              {n}
            </p>
          ))}
        </>
      )}
      <p className="fine">
        Compares scheduled direct BART journeys via Embarcadero and 16th St
        Mission when available. Fog estimates are regional; they cannot
        guarantee a fog-free walk. Transfers and live disruptions are not yet
        supported.
      </p>
    </section>
  );
}
