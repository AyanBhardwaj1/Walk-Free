import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
        <p>Explore the city. Choose a neighborhood.</p>
        <label>
          AREA TO BUILD
          <select
            aria-label="Area to build"
            value={radius}
            onChange={(e) => setRadius(+e.target.value)}
          >
            <option value={400}>Local blocks · 0.8 km across</option>
            <option value={800}>Neighborhood · 1.6 km across</option>
            <option value={1000}>Campus / wider area · 2 km across</option>
          </select>
        </label>
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
