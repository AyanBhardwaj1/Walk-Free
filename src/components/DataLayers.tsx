import { CheckCircle2, CircleDashed } from "lucide-react";
import type { Environment, WeatherForecast, World } from "../../shared/types";
import type { Outlook } from "../../shared/outlook";

/**
 * Every source behind the current map, with what it contributed, so people
 * can see where each number comes from and which layers are missing.
 */
export default function DataLayers({
  world,
  env,
  forecast,
  outlook = null,
}: {
  world: World;
  env: Environment;
  forecast: WeatherForecast | null;
  outlook?: Outlook | null;
}) {
  const count = (n: number) => new Intl.NumberFormat("en-US").format(n);
  const trees = world.objects.filter((o) => o.kind === "tree");
  const canopy = trees.filter((o) => o.source === "canopy").length;
  const buildings = world.objects.length - trees.length;
  const water = (world.amenities ?? []).filter((a) => a.kind === "water");
  const shelters = (world.amenities ?? []).length - water.length;
  const live = env.weatherMode === "forecast" && forecast;
  const layers: {
    name: string;
    source: string;
    detail: string;
    ok: boolean;
  }[] = [
    {
      name: "Streets, paths and buildings",
      source: "OpenStreetMap",
      detail: `${count(world.graph.edges.length)} walking links · ${count(buildings)} buildings`,
      ok: world.provenance.live,
    },
    {
      name: "Mapped trees",
      source: "OpenStreetMap",
      detail: `${count(trees.length - canopy)} surveyed trees`,
      ok: trees.length - canopy > 0,
    },
    {
      name: "Tree canopy",
      source: "Meta & WRI canopy height map (1 m, from Meta's DINOv3)",
      detail: canopy
        ? `${count(canopy)} crowns where no tree is mapped`
        : world.provenance.live
          ? "Not loaded for this area yet"
          : "Not used in design studies",
      ok: canopy > 0,
    },
    {
      name: "Drinking water and shelters",
      source: "OpenStreetMap",
      detail: world.amenities
        ? `${count(water.length)} water points · ${count(shelters)} shelters`
        : "Rebuild this area to load them",
      ok: !!world.amenities?.length,
    },
    {
      name: "Weather, sunlight and UV",
      source: live ? forecast.source : "Your scenario",
      detail: live
        ? env.solarWm2 !== undefined
          ? `Measured sunlight ${Math.round(env.solarWm2)} W/m²${env.uvIndex !== undefined ? ` · UV ${Math.round(env.uvIndex)}` : ""}`
          : "Sunlight estimated from sun height and cloud"
        : "Set by hand on the Climate tab",
      ok: !!live,
    },
    {
      name: "Air quality",
      source: "Open-Meteo air quality (CAMS model, about 40 km grid)",
      detail: outlook?.air
        ? `US AQI ${outlook.air.usAqi} · ${outlook.air.category}${outlook.air.pm25 !== null ? ` · PM2.5 ${outlook.air.pm25} µg/m³` : ""}`
        : "Unavailable right now",
      ok: !!outlook?.air,
    },
    {
      name: "Official heat and air alerts",
      source: "National Weather Service (US only)",
      detail: outlook?.alerts
        ? outlook.alerts.length
          ? outlook.alerts.map((a) => a.event).join(" · ")
          : "No heat or air-quality alerts in effect"
        : "Unavailable here or right now",
      ok: !!outlook?.alerts,
    },
  ];
  return (
    <ul className="data-layers" aria-label="Data layers">
      {layers.map((l) => (
        <li key={l.name}>
          {l.ok ? (
            <CheckCircle2 size={15} aria-label="Loaded" />
          ) : (
            <CircleDashed size={15} aria-label="Not loaded" />
          )}
          <div>
            <strong>{l.name}</strong>
            <span>{l.source}</span>
            <small>{l.detail}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
