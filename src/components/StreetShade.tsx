import { useMemo, useState } from "react";
import { Compass, Sun } from "lucide-react";
import {
  canyonDay,
  shadeShare,
  shadeSpans,
  type Canyon,
  type Strip,
} from "../lib/photo3d/canyon";

const POINTS = [
  ["N", 0],
  ["NE", 45],
  ["E", 90],
  ["SE", 135],
  ["S", 180],
  ["SW", 225],
  ["W", 270],
  ["NW", 315],
] as const;
const STRIPS: [Strip, string][] = [
  ["left", "Left sidewalk"],
  ["middle", "Middle of the street"],
  ["right", "Right sidewalk"],
];
/** The timeline runs at least from 6 AM to 9 PM, wider for long days. */
const FROM_H = 6,
  TO_H = 21;

type OrientationWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

/**
 * The way the back camera points, degrees from north, from an absolute
 * device orientation: the camera looks along the device's −z axis, turned
 * by alpha (about z), beta (x) and gamma (y). When the phone is held
 * upright (portrait or landscape) that axis is level; lying flat, it points
 * down, and the top edge's heading stands in.
 */
export function cameraHeading(o: {
  absolute: boolean;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}): number | null {
  if (!o.absolute || o.alpha === null) return null;
  const r = Math.PI / 180;
  const a = o.alpha * r,
    b = (o.beta ?? 0) * r,
    g = (o.gamma ?? 0) * r;
  const east =
    -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
  const north =
    -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
  if (Math.hypot(east, north) > 0.5)
    return ((((Math.atan2(east, north) * 180) / Math.PI) % 360) + 360) % 360;
  return (360 - o.alpha) % 360;
}

/** Hours and minutes of a time in a time zone, as decimal hours. */
function hourIn(t: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(t));
  const get = (k: string) =>
    Number(parts.find((p) => p.type === k)?.value ?? 0);
  return get("hour") + get("minute") / 60;
}

/**
 * When each side of the photographed street is in shade today: the photo
 * gives the street's width and its fronts' heights, the compass (or the
 * photo's EXIF) the way it runs, and the sun's path does the rest.
 */
export default function StreetShade({
  canyon,
  exif,
  origin,
  placeName,
  timeZone,
}: {
  /** The street's cross-section from the photo; bearing set here. */
  canyon: Omit<Canyon, "bearing">;
  exif: {
    lat?: number;
    lon?: number;
    direction?: number;
    magnetic?: boolean;
    date?: string;
  };
  /** Where the map is, used when the photo has no GPS position. */
  origin: { lat: number; lon: number };
  placeName: string;
  timeZone: string;
}) {
  const [bearing, setBearing] = useState<number | null>(exif.direction ?? null);
  const [compassError, setCompassError] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );
  const [date, setDate] = useState(exif.date ?? today);
  // The photo's own GPS, when it's near this map (the clocks shown are
  // the map's): a phone with no fix may write 0, 0, and a trip photo from
  // elsewhere would be timed in the wrong zone.
  const gpsNear =
    exif.lat !== undefined &&
    exif.lon !== undefined &&
    !(exif.lat === 0 && exif.lon === 0) &&
    Math.hypot(
      (exif.lat - origin.lat) * 111,
      (exif.lon - origin.lon) * 111 * Math.cos((origin.lat * Math.PI) / 180),
    ) < 50;
  const gpsFar = exif.lat !== undefined && !gpsNear;
  const lat = gpsNear ? exif.lat! : origin.lat,
    lon = gpsNear ? exif.lon! : origin.lon;
  const day = useMemo(() => {
    if (bearing === null) return [];
    // Midday on that date, where the street is: SunCalc finds that day's
    // sunrise and sunset around it.
    return canyonDay(
      { ...canyon, bearing },
      new Date(`${date}T12:00:00Z`),
      lat,
      lon,
    );
  }, [canyon, bearing, date, lat, lon]);
  const clock = (t: number) =>
    new Date(t).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });

  async function readCompass() {
    setCompassError("");
    const D = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (D.requestPermission && (await D.requestPermission()) !== "granted")
        throw Error("denied");
    } catch {
      setCompassError("Compass access was refused.");
      return;
    }
    const once = (e: Event) => {
      const o = e as OrientationWithCompass;
      // iOS gives a compass heading; others give alpha (counter-clockwise
      // from north when absolute).
      const heading = o.webkitCompassHeading ?? cameraHeading(o);
      if (heading === null || heading === undefined) return;
      setBearing(Math.round(heading));
      window.removeEventListener("deviceorientationabsolute", once);
      window.removeEventListener("deviceorientation", once);
    };
    window.addEventListener("deviceorientationabsolute", once);
    window.addEventListener("deviceorientation", once);
    setTimeout(() => {
      window.removeEventListener("deviceorientationabsolute", once);
      window.removeEventListener("deviceorientation", once);
      setBearing((b) => {
        if (b === null)
          setCompassError(
            "No compass reading. On a laptop, pick the direction instead.",
          );
        return b;
      });
    }, 3000);
  }

  const fromH = day.length
    ? Math.min(FROM_H, Math.floor(hourIn(day[0].time, timeZone)))
    : FROM_H;
  const toH = day.length
    ? Math.max(TO_H, Math.ceil(hourIn(day.at(-1)!.time, timeZone)))
    : TO_H;
  const span = toH - fromH;
  const x = (t: number) =>
    Math.max(0, Math.min(1, (hourIn(t, timeZone) - fromH) / span)) * 100;
  const step = day.length > 1 ? day[1].time - day[0].time : 600_000;

  return (
    <section className="street-shade" aria-labelledby="street-shade-title">
      <h3 id="street-shade-title">
        <Sun size={16} aria-hidden /> Shade along this street
      </h3>
      <p className="fine">
        {exif.direction !== undefined
          ? "The photo says which way it faced. "
          : "Which way were you facing when you took it? "}
        {exif.direction !== undefined &&
          exif.magnetic &&
          "(It recorded magnetic north, a few degrees off in some places.) "}
        {gpsNear
          ? "It was taken where its GPS says."
          : gpsFar
            ? `Its GPS is far from ${placeName}, so it's timed for ${placeName}.`
            : `Timed for ${placeName}.`}
      </p>
      <div className="compass-row" role="group" aria-label="Facing">
        {POINTS.map(([label, deg]) => (
          <button
            key={label}
            className="chip"
            aria-pressed={bearing !== null && Math.round(bearing) === deg}
            onClick={() => setBearing(deg)}
          >
            {label}
          </button>
        ))}
        {"DeviceOrientationEvent" in globalThis && (
          <button className="chip" onClick={() => void readCompass()}>
            <Compass size={13} aria-hidden /> Use my compass
          </button>
        )}
        <label className="street-shade-date">
          Day
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>
      {compassError && <p className="fine">{compassError}</p>}
      {bearing === null ? (
        <p className="fine">Pick a direction to see the day&apos;s shade.</p>
      ) : !day.length ? (
        <p className="fine">The sun doesn&apos;t rise here on that day.</p>
      ) : (
        <>
          <div
            className="shade-timeline"
            role="img"
            aria-label={`Facing ${Math.round(bearing)}°: when each side is in shade`}
          >
            {STRIPS.map(([strip, label]) => (
              <div key={strip} className="shade-row">
                <span>{label}</span>
                <div className="shade-track">
                  {day.map((s) => (
                    <i
                      key={s.time}
                      className={s.shaded[strip] ? "is-shade" : "is-sun"}
                      style={{
                        left: `${x(s.time)}%`,
                        width: `${x(s.time + step) - x(s.time) + 0.2}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="shade-axis" aria-hidden>
              {[3, 6, 9, 12, 15, 18, 21, 24]
                .filter((h) => h >= fromH && h <= toH)
                .map((h) => (
                  <span
                    key={h}
                    style={{ left: `${((h - fromH) / span) * 100}%` }}
                  >
                    {h === 12
                      ? "noon"
                      : h === 24
                        ? "midnight"
                        : h < 12
                          ? `${h} AM`
                          : `${h - 12} PM`}
                  </span>
                ))}
            </div>
          </div>
          {(() => {
            // Right now, when it's today and the sun is up: which side.
            const now = Date.now();
            if (date !== today || now < day[0].time || now > day.at(-1)!.time)
              return null;
            const at = day.reduce((a, b) =>
              Math.abs(b.time - now) < Math.abs(a.time - now) ? b : a,
            );
            const l = at.shaded.left,
              r = at.shaded.right;
            return (
              <p className="shade-now" role="status">
                Right now:{" "}
                {l && r
                  ? "both sidewalks are in shade."
                  : l
                    ? "walk on the left sidewalk, it's in shade."
                    : r
                      ? "walk on the right sidewalk, it's in shade."
                      : "both sidewalks are in sun."}
              </p>
            );
          })()}
          <ul className="shade-summary">
            {STRIPS.filter(([s]) => s !== "middle").map(([strip, label]) => {
              const spans = shadeSpans(day, strip, Math.round(step / 60_000));
              const share = Math.round(shadeShare(day, strip) * 100);
              return (
                <li key={strip}>
                  <strong>{label}</strong>: in shade {share}% of daylight
                  {spans.length > 0 &&
                    `, ${spans
                      .slice(0, 3)
                      .map(([a, b]) =>
                        a === day[0].time && b === day.at(-1)!.time
                          ? "all day"
                          : a === day[0].time
                            ? `until ${clock(b)}`
                            : b === day.at(-1)!.time
                              ? `from ${clock(a)}`
                              : `${clock(a)}–${clock(b)}`,
                      )
                      .join(", ")}`}
                  .
                </li>
              );
            })}
          </ul>
          <p className="fine">
            From the street&apos;s rebuilt width and front heights, facing{" "}
            {Math.round(bearing)}°. Trees and awnings add shade this
            doesn&apos;t count.
          </p>
        </>
      )}
    </section>
  );
}
