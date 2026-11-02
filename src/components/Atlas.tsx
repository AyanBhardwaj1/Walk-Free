import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Select from "./Select";
import {
  findPlace,
  googleWalkingLink,
  quickRoute,
  type FoundPlace,
  type QuickRoute,
} from "../lib/quick-route";

const SOURCE_LABEL: Record<QuickRoute["source"], string> = {
  OSRM: "OSRM walking router · OpenStreetMap",
  Valhalla: "Valhalla walking router · OpenStreetMap",
  Estimate: "Straight-line estimate (routers unreachable)",
};
export default function Atlas({
  lat,
  lon,
  onBuild,
}: {
  lat: number;
  lon: number;
  onBuild: (lat: number, lon: number, radius: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState("");
  const [radius, setRadius] = useState(800);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [walk, setWalk] = useState<{
    route: QuickRoute;
    a: FoundPlace;
    b: FoundPlace;
  } | null>(null);
  const [walkError, setWalkError] = useState("");
  const markers = useRef<maplibregl.Marker[]>([]);
  async function findWalk() {
    const m = map.current;
    if (!m || !from.trim() || !to.trim()) return;
    setBusy(true);
    setWalkError("");
    try {
      const c = m.getCenter();
      const near = { lat: c.lat, lon: c.lng };
      const [a, b] = await Promise.all([
        findPlace(from, near),
        findPlace(to, near),
      ]);
      if (!a || !b) {
        setWalk(null);
        setWalkError(
          `Couldn't find ${!a ? `“${from}”` : `“${to}”`} near here. Try a fuller name or a street address.`,
        );
        return;
      }
      const route = await quickRoute(a, b);
      setWalk({ route, a, b });
      // Drawing waits for the map style; a drawing hiccup never hides the
      // route that was found.
      const draw = () => {
        try {
          const data = {
            type: "Feature" as const,
            properties: {},
            geometry: { type: "LineString" as const, coordinates: route.line },
          };
          const source = m.getSource("quick-walk") as
            maplibregl.GeoJSONSource | undefined;
          if (source) source.setData(data);
          else {
            m.addSource("quick-walk", { type: "geojson", data });
            m.addLayer({
              id: "quick-walk-casing",
              type: "line",
              source: "quick-walk",
              paint: { "line-color": "#fffdf4", "line-width": 9 },
              layout: { "line-cap": "round", "line-join": "round" },
            });
            m.addLayer({
              id: "quick-walk",
              type: "line",
              source: "quick-walk",
              paint: {
                "line-color": "#1d3557",
                "line-width": 5,
              },
              layout: { "line-cap": "round", "line-join": "round" },
            });
          }
          // An estimate is dashed: it is not a street-by-street route.
          m.setPaintProperty(
            "quick-walk",
            "line-dasharray",
            route.estimate ? [1, 1.5] : [1, 0],
          );
          markers.current.forEach((k) => k.remove());
          markers.current = [
            new maplibregl.Marker({ color: "#3f5938" })
              .setLngLat([a.lon, a.lat])
              .addTo(m),
            new maplibregl.Marker({ color: "#b85b3b" })
              .setLngLat([b.lon, b.lat])
              .addTo(m),
          ];
          const lons = route.line.map((p) => p[0]),
            lats = route.line.map((p) => p[1]);
          m.fitBounds(
            [
              [Math.min(...lons), Math.min(...lats)],
              [Math.max(...lons), Math.max(...lats)],
            ],
            { padding: 90, duration: 900, pitch: 45 },
          );
        } catch {
          /* The summary card still shows the route. */
        }
      };
      // "load" fires once per map; while tiles stream, wait for the next idle.
      if (m.isStyleLoaded()) draw();
      else m.once("idle", draw);
    } catch {
      setWalkError("The walking route couldn't be found. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!host.current) return;
    const m = new maplibregl.Map({
      container: host.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [lon, lat],
      zoom: 14.5,
      pitch: 55,
      bearing: -20,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.on("idle", () => {
      if (host.current) {
        host.current.dataset.ready = "true";
        host.current.dataset.features = String(
          m.queryRenderedFeatures().length,
        );
      }
    });
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("load", () => {
      const sources = m.getStyle().sources;
      const id = Object.keys(sources).find((k) => sources[k].type === "vector");
      if (id) {
        m.addLayer({
          id: "walk-free-buildings",
          type: "fill-extrusion",
          source: id,
          "source-layer": "building",
          minzoom: 13,
          paint: {
            "fill-extrusion-color": "#c8cfbf",
            "fill-extrusion-height": [
              "coalesce",
              ["get", "render_height"],
              ["get", "height"],
              10,
            ],
            "fill-extrusion-base": [
              "coalesce",
              ["get", "render_min_height"],
              0,
            ],
            "fill-extrusion-opacity": 0.9,
          },
        });
      }
      setError("");
    });
    m.on("error", () =>
      setError(
        "Some map tiles could not be loaded. Check map-provider access or try another area.",
      ),
    );
    return () => m.remove();
  }, [lat, lon]);
  return (
    <>
      <div className="atlas-map" ref={host} />
      <div className="atlas-build">
        <form
          className="quick-walk"
          onSubmit={(e) => {
            e.preventDefault();
            void findWalk();
          }}
        >
          <p>Quick walk anywhere in this city</p>
          <input
            className="text-field"
            aria-label="Walk from"
            placeholder="From (a place or address)"
            value={from}
            maxLength={160}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className="text-field"
            aria-label="Walk to"
            placeholder="To"
            value={to}
            maxLength={160}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            className="primary"
            type="submit"
            disabled={busy || !from.trim() || !to.trim()}
          >
            {busy ? "Finding a walking route…" : "Find a walking route"}
          </button>
          {walkError && <p role="alert">{walkError}</p>}
          {walk && (
            <div className="quick-walk-result" role="status">
              <strong>
                {walk.route.estimate ? "About " : ""}
                {Math.max(1, Math.round(walk.route.minutes))} min ·{" "}
                {(walk.route.distance / 1000).toFixed(2)} km
              </strong>
              <small>
                {walk.a.label} → {walk.b.label}
              </small>
              <small className="quick-walk-source">
                {SOURCE_LABEL[walk.route.source]} · places via {walk.a.source}
              </small>
              {walk.route.steps.length > 0 && (
                <ol>
                  {walk.route.steps.slice(0, 6).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  onBuild(
                    (walk.a.lat + walk.b.lat) / 2,
                    (walk.a.lon + walk.b.lon) / 2,
                    Math.min(
                      1500,
                      Math.max(400, Math.round(walk.route.distance / 2 + 200)),
                    ),
                  )
                }
              >
                See its shade and heat in 3D
              </button>
              <a
                href={googleWalkingLink(walk.a, walk.b)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps ↗
              </a>
            </div>
          )}
        </form>
        <p>Or explore the city and choose a neighborhood.</p>
        <div className="field">
          <span className="field-label">AREA TO BUILD</span>
          <Select
            label="Area to build"
            value={String(radius)}
            options={[
              {
                value: "400",
                label: "Local blocks",
                detail: "0.8 km across · fastest",
              },
              { value: "800", label: "Neighborhood", detail: "1.6 km across" },
              { value: "1000", label: "Campus", detail: "2 km across" },
              {
                value: "1500",
                label: "City district",
                detail: "3 km across · built in tiles, slower",
              },
            ]}
            onChange={(v) => setRadius(+v)}
          />
        </div>
        <button
          className="primary"
          onClick={() => {
            const c = map.current?.getCenter();
            if (c) onBuild(c.lat, c.lng, radius);
          }}
        >
          Build a detailed scene here ↗
        </button>
        <small>
          Walking routes stay inside the built area. Pan to center your start
          and destination before building.
        </small>
        {error && <p role="status">{error}</p>}
      </div>
    </>
  );
}
