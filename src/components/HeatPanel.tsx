import { Thermometer, Trees, X } from "lucide-react";
import {
  HEAT_LEVELS,
  HEAT_RAMP,
  relativeHeatColor,
  toF,
  type HeatReading,
  type PlaceHeat,
} from "../lib/heat";

export type ProfileHour = HeatReading & { hour: number };

const degrees = (c: number) => `${Math.round(toF(c))}°F`;
const percent = (x: number) => `${Math.round(x * 100)}%`;
export const clock = (hour: number) => {
  const h = Math.floor(hour) % 24;
  return `${h % 12 || 12}${h < 12 ? " AM" : " PM"}`;
};

export function HeatBadge({ reading }: { reading: HeatReading }) {
  const level = HEAT_LEVELS[reading.level];
  return (
    <span className="heat-badge" style={{ background: level.color }}>
      {level.label}
    </span>
  );
}

/** The map's colour scale: fully shaded to full sun at this moment. */
export function HeatLegend({ range }: { range: HeatReading | null }) {
  const contrast = range && range.sunFeelsC - range.shadeFeelsC >= 1;
  if (!range || !contrast)
    return (
      <p className="heat-hint">
        The sun is down or hidden, so shade makes little difference right now.
        Move the time of day to see where it gets hot.
      </p>
    );
  return (
    <div className="heat-scale">
      <span
        className="heat-scale-bar"
        style={{
          background: `linear-gradient(90deg, ${HEAT_RAMP.join(", ")})`,
        }}
      />
      <div>
        <span>Shaded · {degrees(range.shadeFeelsC)}</span>
        <span>Full sun · {degrees(range.sunFeelsC)}</span>
      </div>
    </div>
  );
}

/** Bars for each hour of the day; click one to move the sun there. */
function DayProfile({
  profile,
  currentHour,
  onHour,
}: {
  profile: ProfileHour[];
  currentHour: number;
  onHour: (hour: number) => void;
}) {
  const temps = profile.map((p) => toF(p.feelsLikeC));
  const low = Math.min(...temps) - 4,
    high = Math.max(...temps) + 1;
  const peak = profile[temps.indexOf(Math.max(...temps))];
  return (
    <div className="day-profile">
      <div
        className="day-profile-bars"
        role="group"
        aria-label="Feels-like temperature by hour"
      >
        {profile.map((p, i) => (
          <button
            key={p.hour}
            className={Math.floor(currentHour) === p.hour ? "now" : ""}
            style={{
              height: `${12 + ((temps[i] - low) / Math.max(1, high - low)) * 88}%`,
              background: HEAT_LEVELS[p.level].color,
            }}
            title={`${clock(p.hour)}: ${degrees(p.feelsLikeC)}, ${percent(p.shade)} shade`}
            aria-label={`${clock(p.hour)}: feels like ${degrees(p.feelsLikeC)}, ${percent(p.shade)} shade`}
            onClick={() => onHour(p.hour)}
          />
        ))}
      </div>
      <div className="day-profile-axis">
        <span>{clock(profile[0].hour)}</span>
        <span>Noon</span>
        <span>{clock(profile.at(-1)!.hour)}</span>
      </div>
      <p className="fine">
        Hottest around <strong>{clock(peak.hour)}</strong> (
        {degrees(peak.feelsLikeC)}). Tap an hour to move the sun there.
      </p>
    </div>
  );
}

function PlaceCard({
  place,
  profile,
  currentHour,
  onHour,
  onClose,
  onCompare,
  comparing,
}: {
  place: PlaceHeat;
  profile: ProfileHour[] | null;
  currentHour: number;
  onHour: (hour: number) => void;
  onClose: () => void;
  onCompare: () => void;
  comparing: boolean;
}) {
  return (
    <div className="place-card">
      <div className="place-card-head">
        <div>
          <small>{place.kind === "park" ? "Park" : "Street or path"}</small>
          <h3>{place.name}</h3>
        </div>
        <button
          className="icon-button"
          aria-label="Close place details"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="place-reading">
        <strong>{degrees(place.feelsLikeC)}</strong>
        <HeatBadge reading={place} />
      </div>
      <dl className="place-stats">
        <div>
          <dt>In direct sun</dt>
          <dd>{degrees(place.sunFeelsC)}</dd>
        </div>
        <div>
          <dt>In shade</dt>
          <dd>{degrees(place.shadeFeelsC)}</dd>
        </div>
        <div>
          <dt>Shaded now</dt>
          <dd>{percent(place.shade)}</dd>
        </div>
        {place.length > 0 && (
          <div>
            <dt>Length</dt>
            <dd>{Math.round(place.length)} m</dd>
          </div>
        )}
      </dl>
      {profile && (
        <DayProfile
          profile={profile}
          currentHour={currentHour}
          onHour={onHour}
        />
      )}
      <button className="secondary" onClick={onCompare}>
        {comparing ? "Stop comparing" : "Compare with another place"}
      </button>
    </div>
  );
}

function Comparison({ a, b }: { a: PlaceHeat; b: PlaceHeat }) {
  const diff = Math.round(toF(a.feelsLikeC) - toF(b.feelsLikeC));
  const [hot, cool] = diff >= 0 ? [a, b] : [b, a];
  return (
    <div className="heat-compare">
      {[a, b].map((p) => (
        <div key={p.id}>
          <small>{p.name}</small>
          <strong>{degrees(p.feelsLikeC)}</strong>
          <span>{percent(p.shade)} shade</span>
        </div>
      ))}
      <p>
        {diff === 0
          ? "These feel about the same right now."
          : `${hot.name} feels about ${Math.abs(diff)}°F hotter than ${cool.name} right now.`}
      </p>
    </div>
  );
}

function PlaceList({
  title,
  places,
  onSelect,
}: {
  title: string;
  places: PlaceHeat[];
  onSelect: (place: PlaceHeat) => void;
}) {
  if (!places.length) return null;
  return (
    <div className="place-list">
      <h4>{title}</h4>
      {places.map((p) => (
        <button key={p.id} onClick={() => onSelect(p)}>
          <span
            className="heat-dot"
            style={{ background: relativeHeatColor(p) }}
          />
          <span className="place-name">
            {p.kind === "park" && <Trees size={12} />}
            {p.name}
          </span>
          <span className="place-temp">{degrees(p.feelsLikeC)}</span>
          <small>{percent(p.shade)} shade</small>
        </button>
      ))}
    </div>
  );
}

export default function HeatPanel({
  places,
  range,
  selected,
  compare,
  profile,
  currentHour,
  timeLabel,
  showMap,
  onShowMap,
  onSelect,
  onCompare,
  onClose,
  onHour,
  comparing,
}: {
  places: PlaceHeat[];
  range: HeatReading | null;
  selected: PlaceHeat | null;
  compare: PlaceHeat | null;
  profile: ProfileHour[] | null;
  currentHour: number;
  timeLabel: string;
  showMap: boolean;
  onShowMap: (show: boolean) => void;
  onSelect: (place: PlaceHeat) => void;
  onCompare: () => void;
  onClose: () => void;
  onHour: (hour: number) => void;
  comparing: boolean;
}) {
  const ranked = places.filter((p) => p.id !== selected?.id);
  return (
    <section className="heat-panel">
      <div className="section-title">
        <Thermometer size={17} /> Heat on the ground
      </div>
      <p className="heat-time">{timeLabel}</p>
      <label className="check">
        <input
          type="checkbox"
          checked={showMap}
          onChange={(e) => onShowMap(e.target.checked)}
        />
        Colour walking paths by heat (cool = shaded, red = full sun)
      </label>
      <HeatLegend range={range} />
      {selected ? (
        <PlaceCard
          place={selected}
          profile={profile}
          currentHour={currentHour}
          onHour={onHour}
          onClose={onClose}
          onCompare={onCompare}
          comparing={comparing}
        />
      ) : (
        <p className="heat-hint">
          Tap any path on the map, or a place below, to see how hot it feels and
          when it is coolest.
        </p>
      )}
      {comparing && !compare && (
        <p className="heat-hint">Now tap a second street or park to compare.</p>
      )}
      {selected && compare && <Comparison a={selected} b={compare} />}
      {places.length === 0 ? (
        <p className="heat-hint">
          No named streets or parks in this area yet. Build a real neighborhood
          or campus to compare places.
        </p>
      ) : (
        <>
          <PlaceList
            title="Hottest right now"
            places={ranked.slice(0, 5)}
            onSelect={onSelect}
          />
          <PlaceList
            title="Coolest right now"
            places={ranked
              .slice(-5)
              .reverse()
              .filter((p) => !ranked.slice(0, 5).includes(p))}
            onSelect={onSelect}
          />
        </>
      )}
      <p className="fine">
        Feels-like values are estimates from the forecast or your scenario and
        the modeled shade of mapped buildings and trees. They are not measured
        street temperatures.
      </p>
    </section>
  );
}
