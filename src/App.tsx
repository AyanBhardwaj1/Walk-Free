import { useState, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import {
  ArrowUpRight,
  Search,
  TreePine,
  Building2,
  Route,
  Sun,
  Layers,
  Undo2,
  Download,
  Upload,
  Trash2,
  Sparkles,
  MapPin,
  Navigation,
  ChevronRight,
  Mountain,
  Plus,
  Minus,
  MousePointer2,
  Landmark,
  Wind,
  Compass,
  Check,
  X,
} from "lucide-react";
import type {
  World,
  Environment,
  Point,
  SceneObject,
  City,
  RoutePreference,
  WeatherForecast,
} from "../shared/types";
import { heatIndexC, isShaded, sunDirection } from "./lib/environment";
import { applyDesignProposal, type DesignProposal } from "./lib/proposals";
import { addPlanningPassage } from "./lib/planning";
import { worldSchema } from "../shared/schema";
import {
  startTracking,
  speak,
  stopSpeech,
  nativeNavigation,
} from "./lib/navigation";
import JourneyPanel from "./components/JourneyPanel";
import { createStudyWorld } from "./lib/study";
import { route } from "./lib/routing";
import { brushTerrain, toLocal } from "./lib/geo";
import WorldCanvas from "./components/WorldCanvas";
const Atlas = lazy(() => import("./components/Atlas"));
const initial: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 30,
  humidity: 50,
  windMps: 3,
  cloudCover: 15,
  weatherMode: "scenario",
};
async function api(url: string, body?: unknown) {
  const r = await fetch(
    (import.meta.env.VITE_API_BASE_URL || "") + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
const tools = [
  ["select", "Select", MousePointer2],
  ["tree", "Tree", TreePine],
  ["building", "Building", Building2],
  ["skyscraper", "High-rise", Building2],
  ["tower", "Tower", Landmark],
  ["landmark", "Landmark", Landmark],
  ["road", "Road", Route],
  ["passage", "Passage", Route],
  ["raise", "Raise", Mountain],
  ["lower", "Lower", Minus],
  ["flatten", "Flatten", Layers],
] as const;
export default function App() {
  const [world, setWorld] = useState<World>(() => {
    try {
      const s = localStorage.getItem("walk-free-project");
      return s ? worldSchema.parse(JSON.parse(s)) : createStudyWorld();
    } catch {
      return createStudyWorld();
    }
  });
  const [atlas, setAtlas] = useState<City | null>(null);
  const [mode, setMode] = useState<"explore" | "studio">("explore");
  const [env, setEnv] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState("select");
  const [probe, setProbe] = useState<Point>([0, 0]);
  const [history, setHistory] = useState<World[]>([]);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("route");
  const [start, setStart] = useState("market-gate");
  const [end, setEnd] = useState("observatory");
  const [pref, setPref] = useState<RoutePreference>("shade");
  const [hypothetical, setHypothetical] = useState(false);
  const [stairs, setStairs] = useState(false);
  const [detour, setDetour] = useState(1.8);
  const [trees, setTrees] = useState(true);
  const [buildings, setBuildings] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<{
    summary: string;
    objects: SceneObject[];
    removeIds?: string[];
  } | null>(null);
  const [roadStart, setRoadStart] = useState<Point | null>(null);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [tracking, setTracking] = useState(false);
  const watch = useRef<(() => void) | null>(null);
  const lastSpoken = useRef("");
  const worldRef = useRef(world);
  worldRef.current = world;
  const upload = useRef<HTMLInputElement>(null);
  const currentRoute = useMemo(
    () =>
      route(world, start, end, {
        preference: pref,
        avoidStairs: stairs,
        allowHypothetical: hypothetical,
        maxDetour: detour,
        environment: env,
      }),
    [world, start, end, pref, stairs, hypothetical, detour, env],
  );
  const object = world.objects.find((o) => o.id === selected);
  const named = world.graph.nodes.filter((n) => n.name);
  const nodes = named.length > 1 ? named : world.graph.nodes.slice(0, 250);
  useEffect(() => {
    try {
      localStorage.setItem("walk-free-project", JSON.stringify(world));
    } catch {
      setMessage("Local storage is full. Export your project to keep a copy.");
    }
  }, [world]);
  useEffect(() => {
    if (!query.trim()) {
      setCities([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        fetch(
          `${import.meta.env.VITE_API_BASE_URL || ""}/api/cities?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
          .then((r) => r.json())
          .then(setCities)
          .catch(() => {}),
      200,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  useEffect(
    () => () => {
      if (watch.current) watch.current();
    },
    [],
  );
  function edit(next: World) {
    watch.current?.();
    watch.current = null;
    setTracking(false);
    stopSpeech();
    setProposal(null);
    setHistory((h) => [...h.slice(-29), world]);
    setWorld(next);
  }
  function updateObject(changes: Partial<SceneObject>) {
    edit({
      ...world,
      objects: world.objects.map((o) =>
        o.id === selected ? { ...o, ...changes } : o,
      ),
    });
  }
  async function loadCity(c: City, build = false) {
    if (!build) {
      watch.current?.();
      watch.current = null;
      setTracking(false);
      stopSpeech();
      setAtlas(c);
      setQuery("");
      setMode("explore");
      setTab("route");
      return;
    }
    setBusy(`Building ${c.name}…`);
    setQuery("");
    try {
      const w = await api(
        `/api/world?lat=${c.lat}&lon=${c.lon}&name=${encodeURIComponent(c.name + ", " + c.state)}`,
      );
      edit(w);
      setAtlas(null);
      setSelected(null);
      setStart(w.graph.nodes[0]?.id || "");
      setEnd(w.graph.nodes.at(-1)?.id || "");
      setForecast(null);
      setMessage(
        "Loaded mapped geometry. Open Data & sources to inspect coverage.",
      );
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy("");
    }
  }
  function ground(p: Point) {
    if (mode === "explore") {
      setProbe(p);
      setTab("climate");
      return;
    }
    if (tool === "select") return;
    if (["raise", "lower", "flatten"].includes(tool)) {
      const t = world.terrain || {
        size: world.extent,
        resolution: 33,
        heights: Array(1089).fill(0),
      };
      edit({ ...world, terrain: brushTerrain(t, p, tool) });
      return;
    }
    if (tool === "passage") {
      if (!roadStart) {
        setRoadStart(p);
        setMessage(
          "Choose the other entrance. Endpoints within 20 m of an existing path node connect to it.",
        );
        return;
      }
      try {
        edit(addPlanningPassage(world, roadStart, p));
        setMessage(
          "Hypothetical passage added. Enable indoor planning to include it in route comparisons.",
        );
      } catch (e) {
        setMessage((e as Error).message);
      }
      setRoadStart(null);
      return;
    }
    if (tool === "road") {
      if (!roadStart) {
        setRoadStart(p);
        setMessage("Choose the second road endpoint.");
        return;
      }
      const id = crypto.randomUUID();
      edit({
        ...world,
        roads: [
          ...world.roads,
          {
            id,
            name: "Designed road",
            points: [roadStart, p],
            width: 8,
            kind: "road",
            source: "user",
          },
        ],
      });
      setRoadStart(null);
      setMessage(
        "Road added as a design feature; it is not a verified navigation connection.",
      );
      return;
    }
    const tree = tool === "tree";
    const o: SceneObject = {
      id: crypto.randomUUID(),
      name: `New ${tool}`,
      kind: tool as SceneObject["kind"],
      position: p,
      width: tree ? 18 : 35,
      depth: tree ? 18 : 30,
      height: tree
        ? 16
        : tool === "skyscraper"
          ? 120
          : tool === "tower"
            ? 75
            : 28,
      rotation: 0,
      source: "user",
      heightMethod: "designed",
    };
    edit({ ...world, objects: [...world.objects, o] });
    setSelected(o.id);
  }
  async function weather() {
    setBusy("Fetching the forecast…");
    try {
      const f = await api(
        `/api/weather?lat=${world.origin.lat}&lon=${world.origin.lon}`,
      );
      setForecast(f);
      const h = f.hours[0];
      setEnv({
        ...env,
        dateTime: h.time,
        temperatureC: h.temperatureC,
        humidity: h.humidity ?? 50,
        windMps: h.windMps,
        cloudCover: h.cloudCover ?? 50,
        weatherMode: "forecast",
      });
      setMessage(
        "NWS forecast loaded. Shade remains a geometry-based estimate.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function ask() {
    setBusy("Sketching your proposal…");
    const snapshot = JSON.stringify(world);
    try {
      const result = await api("/api/agent/propose", {
        prompt,
        extent: world.extent,
        scene: world.objects.slice(0, 300),
        roads: world.roads
          .slice(0, 60)
          .map((r) => ({ name: r.name, points: r.points.slice(0, 200) })),
      });
      if (JSON.stringify(worldRef.current) !== snapshot) {
        setMessage(
          "The scene changed while the assistant was working. Request a fresh proposal.",
        );
        return;
      }
      setProposal(result);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function exportWorld() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(world, null, 2)], { type: "application/json" }),
    );
    a.download = "walk-free-scene.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function navigation() {
    if (tracking) {
      watch.current?.();
      watch.current = null;
      setTracking(false);
      stopSpeech();
      return;
    }
    if (!world.provenance.live || currentRoute?.hypothetical || !currentRoute) {
      setMessage(
        "Live navigation requires a mapped area and a route without hypothetical passages.",
      );
      return;
    }
    try {
      watch.current = await startTracking(
        (lat, lon) => {
          const p = toLocal(lat, lon, world.origin);
          const n = [...world.graph.nodes].sort(
            (a, b) =>
              Math.hypot(a.point[0] - p[0], a.point[1] - p[1]) -
              Math.hypot(b.point[0] - p[0], b.point[1] - p[1]),
          )[0];
          if (n && Math.hypot(n.point[0] - p[0], n.point[1] - p[1]) < 100) {
            if (
              n.id !== end ||
              Math.hypot(n.point[0] - p[0], n.point[1] - p[1]) < 20
            )
              setStart(n.id);
          } else
            setMessage("Your location is outside the loaded walking network.");
        },
        (msg) => {
          setMessage(msg);
          watch.current?.();
          watch.current = null;
          setTracking(false);
        },
      );
      setTracking(true);
      speak(currentRoute.directions[0].text);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    if (!tracking) return;
    if (start === end) {
      speak("You have arrived.");
      watch.current?.();
      watch.current = null;
      setTracking(false);
      return;
    }
    const text = currentRoute?.directions[0]?.text;
    if (text && text !== lastSpoken.current) {
      lastSpoken.current = text;
      speak(text);
    }
  }, [tracking, start, end, currentRoute]);

  return (
    <div className="app">
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">
            w<span>f</span>
          </span>
          walk-free<span className="brand-dot">®</span>
        </a>
        <nav>
          <button
            className={mode === "explore" ? "active" : ""}
            onClick={() => {
              setMode("explore");
              setTab("route");
            }}
          >
            Explore
          </button>
          <button
            className={mode === "studio" ? "active" : ""}
            onClick={() => {
              watch.current?.();
              watch.current = null;
              setTracking(false);
              stopSpeech();
              setMode("studio");
              setTab("build");
              setAtlas(null);
            }}
          >
            Design studio
          </button>
        </nav>
        <div className="header-right">
          <span className="status-dot" /> Your urban field guide{" "}
          <button
            className="icon-button"
            aria-label="Export project"
            onClick={exportWorld}
          >
            <Download size={18} />
          </button>
        </div>
      </header>
      <main>
        <aside>
          <div className="eyebrow">CITIES, AT HUMAN PACE</div>
          <h1>
            {mode === "explore" ? (
              <>
                Take the
                <br />
                <em>better way.</em>
              </>
            ) : (
              <>
                Make room
                <br />
                <em>for better.</em>
              </>
            )}
          </h1>
          <p className="intro">
            {mode === "explore"
              ? "Less heat. More green. A little more discovery between here and there."
              : "Shape a place worth walking through. See how every change feels on the ground."}
          </p>
          {tracking && (
            <button className="secondary" onClick={navigation}>
              End active navigation <X size={16} />
            </button>
          )}
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search US cities"
              placeholder="Find your city…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>US</span>
          </div>
          {cities.length > 0 && (
            <div className="search-results">
              {cities.map((c) => (
                <button key={c.id} onClick={() => loadCity(c)}>
                  <MapPin size={15} />
                  {c.name}
                  <small>{c.state}</small>
                </button>
              ))}
            </div>
          )}
          {!atlas && (
            <div className="tabs">
              {(mode === "explore"
                ? ["route", "transit", "climate", "data"]
                : ["build", "assistant", "data"]
              ).map((t) => (
                <button
                  key={t}
                  className={tab === t ? "chosen" : ""}
                  onClick={() => setTab(t)}
                >
                  {t === "data" ? "Data & sources" : t}
                </button>
              ))}
            </div>
          )}
          {!atlas &&
            mode === "explore" &&
            tab !== "climate" &&
            tab !== "data" &&
            tab !== "transit" && (
              <section>
                <div className="section-title">
                  <Route size={17} /> Your next walk
                </div>
                <label>
                  FROM
                  <select
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  >
                    {nodes.map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.name || n.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  TO
                  <select value={end} onChange={(e) => setEnd(e.target.value)}>
                    {nodes.map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.name || n.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>WHAT MATTERS TODAY?</label>
                <div className="preferences">
                  {(["quickest", "shade", "scenic", "indoors"] as const).map(
                    (p) => (
                      <button
                        className={p === pref ? "selected" : ""}
                        key={p}
                        onClick={() => setPref(p)}
                      >
                        {p === "quickest"
                          ? "Quickest"
                          : p === "shade"
                            ? "More shade"
                            : p === "scenic"
                              ? "Scenic"
                              : "Stay inside"}
                      </button>
                    ),
                  )}
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={stairs}
                    onChange={(e) => setStairs(e.target.checked)}
                  />
                  Avoid stairs
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={hypothetical}
                    onChange={(e) => setHypothetical(e.target.checked)}
                  />
                  Hypothetical indoor planning
                </label>
                <label>
                  DETOUR BUDGET · {Math.round((detour - 1) * 100)}%
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step=".1"
                    value={detour}
                    onChange={(e) => setDetour(+e.target.value)}
                  />
                </label>
                {currentRoute ? (
                  <>
                    <div className="route-summary">
                      <strong>
                        {Math.round(currentRoute.durationMinutes)}
                        <small>min</small>
                      </strong>
                      <span>
                        {(currentRoute.distance / 1000).toFixed(2)} km
                        <br />
                        {Math.round(currentRoute.shadeFraction * 100)}% modeled
                        shade
                      </span>
                    </div>
                    <button className="primary" onClick={navigation}>
                      <Navigation size={17} />
                      {tracking ? "End walk" : "Start walking"}
                      <ArrowUpRight size={18} />
                    </button>
                    <p className="fine">
                      {world.provenance.live
                        ? nativeNavigation
                          ? "Native GPS active only during your walk."
                          : "Foreground browser GPS. Keep this page open."
                        : "Design study route · not real-world directions."}
                    </p>
                    {currentRoute.warnings.map((w) => (
                      <p className="fine" key={w}>
                        {w}
                      </p>
                    ))}
                    <details>
                      <summary>Walking directions</summary>
                      {currentRoute.directions.map((d, i) => (
                        <p className="direction" key={i}>
                          {i + 1}. {d.text}{" "}
                          <small>{Math.round(d.distance)} m</small>
                        </p>
                      ))}
                    </details>
                  </>
                ) : (
                  <p className="fine">
                    Choose two different connected points to calculate a walk.
                  </p>
                )}
              </section>
            )}
          {atlas && (
            <section>
              <div className="section-title">
                <MapPin size={17} /> {atlas.name}
              </div>
              <p className="intro">
                Pan and zoom through the city atlas. Build a neighborhood to
                inspect its paths, shade, and editable geometry.
              </p>
              <button className="secondary" onClick={() => setAtlas(null)}>
                Back to the design scene
              </button>
              <p className="fine">
                City map: OpenFreeMap, OpenMapTiles, and OpenStreetMap
                contributors. Building heights depend on mapped coverage.
              </p>
            </section>
          )}
          {!atlas && tab === "transit" && <JourneyPanel />}
          {!atlas && tab === "climate" && (
            <section>
              <div className="section-title">
                <Sun size={17} /> The atmosphere
              </div>
              <label>
                SCENARIO DATE & TIME · UTC
                <input
                  className="text-field"
                  type="datetime-local"
                  value={new Date(env.dateTime).toISOString().slice(0, 16)}
                  onChange={(e) => {
                    if (e.target.value)
                      setEnv({
                        ...env,
                        dateTime: new Date(e.target.value + "Z").toISOString(),
                        weatherMode: "scenario",
                      });
                  }}
                />
              </label>
              <div className="probe-summary">
                <div className="eyebrow">
                  SELECTED POINT · {Math.round(probe[0])} E /{" "}
                  {Math.round(probe[1])} S
                </div>
                <h3>
                  {sunDirection(env, world.origin).y <= 0
                    ? "After sunset"
                    : isShaded(probe, world, env)
                      ? "In modeled shade"
                      : "Exposed to the sun"}
                </h3>
                <p>
                  {heatIndexC(env.temperatureC, env.humidity) === null
                    ? "Heat index is outside the hot/humid range."
                    : `Shade heat index ≈ ${Math.round(heatIndexC(env.temperatureC, env.humidity)!)}°C`}
                </p>
                <small>
                  Click the ground to inspect another point. Heat index
                  estimates apparent heat in shade; it is not a local
                  air-temperature measurement.
                </small>
              </div>
              <button className="secondary" onClick={weather}>
                Load local forecast <ArrowUpRight size={16} />
              </button>
              {forecast && (
                <label>
                  FORECAST HOUR
                  <select
                    onChange={(e) => {
                      const h = forecast.hours[+e.target.value];
                      setEnv({
                        ...env,
                        dateTime: h.time,
                        temperatureC: h.temperatureC,
                        humidity: h.humidity ?? 50,
                        windMps: h.windMps,
                        cloudCover: h.cloudCover ?? 50,
                        weatherMode: "forecast",
                      });
                    }}
                  >
                    {forecast.hours.map((h, i) => (
                      <option value={i} key={h.time}>
                        {new Date(h.time).toLocaleString()} ·{" "}
                        {Math.round(h.temperatureC)}°C
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                SCENARIO AIR TEMPERATURE · {env.temperatureC}°C
                <input
                  type="range"
                  min="-10"
                  max="45"
                  value={env.temperatureC}
                  onChange={(e) =>
                    setEnv({
                      ...env,
                      temperatureC: +e.target.value,
                      weatherMode: "scenario",
                    })
                  }
                />
              </label>
              <label>
                RELATIVE HUMIDITY · {env.humidity}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={env.humidity}
                  onChange={(e) =>
                    setEnv({
                      ...env,
                      humidity: +e.target.value,
                      weatherMode: "scenario",
                    })
                  }
                />
              </label>
              <label>
                CLOUD COVER · {env.cloudCover}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={env.cloudCover}
                  onChange={(e) =>
                    setEnv({
                      ...env,
                      cloudCover: +e.target.value,
                      weatherMode: "scenario",
                    })
                  }
                />
              </label>
              <label>
                WIND · {env.windMps} m/s
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={env.windMps}
                  onChange={(e) =>
                    setEnv({
                      ...env,
                      windMps: +e.target.value,
                      weatherMode: "scenario",
                    })
                  }
                />
              </label>
              <p className="fine">
                Air temperature is an area forecast or your scenario input.
                Shadows estimate solar exposure from mapped or designed
                geometry; they do not measure sidewalk temperature. Unknown
                trees reduce coverage.
              </p>
            </section>
          )}
          {mode === "studio" && tab !== "assistant" && tab !== "data" && (
            <section>
              <div className="section-title">
                <Layers size={17} /> Your building blocks
              </div>
              <button
                className="secondary"
                onClick={() => {
                  edit({
                    ...createStudyWorld(),
                    id: crypto.randomUUID(),
                    name: "Untitled landscape",
                    objects: [],
                    roads: [],
                    landscapes: [],
                    graph: { nodes: [], edges: [] },
                  });
                  setSelected(null);
                }}
              >
                Start an empty landscape <Plus size={16} />
              </button>
              <div className="tool-grid">
                {tools.map(([id, label, Icon]) => (
                  <button
                    className={tool === id ? "selected" : ""}
                    key={id}
                    onClick={() => {
                      setTool(id);
                      setRoadStart(null);
                    }}
                  >
                    <Icon size={21} />
                    {label}
                  </button>
                ))}
              </div>
              <p className="fine">
                Choose an asset, then click the ground to place it. Drag to
                orbit; right-drag to pan; scroll to zoom.
              </p>
              {object && (
                <div className="inspector">
                  <div className="section-title">
                    {object.name}
                    <button
                      className="icon-button"
                      aria-label="Delete object"
                      onClick={() => {
                        edit({
                          ...world,
                          objects: world.objects.filter(
                            (o) => o.id !== selected,
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {(["height", "width", "depth", "rotation"] as const).map(
                    (k) => (
                      <label key={k}>
                        {k.toUpperCase()}
                        <input
                          type="number"
                          min={k === "rotation" ? -360 : 1}
                          max={k === "rotation" ? 360 : 600}
                          value={object[k]}
                          onChange={(e) => {
                            if (
                              Number.isFinite(+e.target.value) &&
                              +e.target.value >= (k === "rotation" ? -360 : 1)
                            )
                              updateObject({ [k]: +e.target.value });
                          }}
                        />
                      </label>
                    ),
                  )}
                  {[0, 1].map((i) => (
                    <label key={i}>
                      {i ? "SOUTH / NORTH" : "EAST / WEST"} · METERS
                      <input
                        type="number"
                        value={Math.round(object.position[i])}
                        onChange={(e) => {
                          const p: Point = [...object.position];
                          p[i] = Math.max(
                            -world.extent / 2,
                            Math.min(world.extent / 2, +e.target.value),
                          );
                          updateObject({ position: p });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>
          )}
          {mode === "studio" && tab === "assistant" && (
            <section>
              <div className="section-title">
                <Sparkles size={17} /> A second imagination
              </div>
              <p className="intro">
                Describe a place. Review the design, then make it yours.
              </p>
              <textarea
                placeholder="A shaded plaza with a clock tower, a grove of trees, and low-rise buildings…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button
                className="primary"
                disabled={!prompt.trim() || !!busy}
                onClick={ask}
              >
                Sketch a proposal <Sparkles size={16} />
              </button>
              {proposal && (
                <div className="proposal">
                  <p>{proposal.summary}</p>
                  <small>
                    {proposal.objects.length} additions / updates ·{" "}
                    {proposal.removeIds?.length || 0} removals · preview on map
                  </small>
                  <button
                    className="primary"
                    onClick={() => {
                      edit(applyDesignProposal(world, proposal));
                      setProposal(null);
                    }}
                  >
                    Apply design <Check size={16} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setProposal(null)}
                  >
                    Discard preview
                  </button>
                </div>
              )}
              <p className="fine">
                OpenAI runs on the server. Your original scene stays intact
                until you apply a proposal.
              </p>
            </section>
          )}
          {!atlas && tab === "data" && (
            <section>
              <div className="section-title">Know your ground</div>
              <p>{world.provenance.source}</p>
              <p className="fine">{world.provenance.attribution}</p>
              {world.provenance.notes.map((n) => (
                <p className="fine" key={n}>
                  {n}
                </p>
              ))}
              <div className="data-counts">
                <span>{world.objects.length} objects</span>
                <span>{world.graph.edges.length} walking links</span>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  edit(createStudyWorld());
                  setStart("market-gate");
                  setEnd("observatory");
                }}
              >
                Open the design study
              </button>
            </section>
          )}
          <footer>
            <span className="tiny-symbol">✳</span> Built for the journey, not
            just the destination.
          </footer>
        </aside>
        <div className="viewport">
          {atlas ? (
            <Suspense
              fallback={<div className="loading">Loading the city atlas…</div>}
            >
              <Atlas
                lat={atlas.lat}
                lon={atlas.lon}
                onBuild={(lat, lon) => loadCity({ ...atlas, lat, lon }, true)}
              />
            </Suspense>
          ) : (
            <WorldCanvas
              world={proposal ? applyDesignProposal(world, proposal) : world}
              environment={env}
              selectedId={selected}
              onSelect={setSelected}
              onGroundClick={ground}
              route={mode === "explore" ? currentRoute : null}
              showTrees={trees}
              showBuildings={buildings}
            />
          )}
          <div className="map-heading">
            <div className="eyebrow">
              {world.provenance.live
                ? "MAPPED NEIGHBORHOOD"
                : "THE WALK-FREE ATLAS / 001"}
            </div>
            <h2>{atlas ? atlas.name : world.name.split(" · ")[0]}</h2>
            <span>
              {atlas
                ? "City atlas · OpenFreeMap / OpenStreetMap"
                : world.provenance.live
                  ? "OpenStreetMap · " +
                    (world.extent / 1000).toFixed(1) +
                    " km detail area"
                  : "An editable, fictional urban design study"}
            </span>
          </div>
          {!atlas && (
            <div className="weather-chip">
              <Sun size={23} />
              <strong>
                {Math.round(env.temperatureC)}°<small>C</small>
              </strong>
              <div>
                {env.weatherMode === "scenario"
                  ? "Your scenario"
                  : "NWS forecast"}
                <small>{env.windMps} m/s wind</small>
              </div>
            </div>
          )}
          <div className="map-actions">
            <button
              title="Undo"
              aria-label="Undo"
              disabled={!history.length}
              onClick={() => {
                setWorld(history.at(-1)!);
                setHistory(history.slice(0, -1));
              }}
            >
              <Undo2 size={19} />
            </button>
            <button
              title="Toggle trees"
              aria-label="Toggle trees"
              className={!trees ? "muted" : ""}
              onClick={() => setTrees(!trees)}
            >
              <TreePine size={19} />
            </button>
            <button
              title="Toggle buildings"
              aria-label="Toggle buildings"
              onClick={() => setBuildings(!buildings)}
            >
              <Building2 size={19} />
            </button>
            <button
              title="Import scene"
              aria-label="Import scene"
              onClick={() => upload.current?.click()}
            >
              <Upload size={19} />
            </button>
            <button
              title="Export scene"
              aria-label="Export scene"
              onClick={exportWorld}
            >
              <Download size={19} />
            </button>
          </div>
          <div className="compass">
            <Compass size={33} strokeWidth={1} />
            <small>N</small>
          </div>
          {!atlas && (
            <div className="timeline">
              <div>
                <Sun size={18} />
                <strong>Follow the sun</strong>
                <span>
                  {new Date(env.dateTime).toLocaleString("en-US", {
                    timeZone: world.timezone,
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <input
                aria-label="Sun time"
                type="range"
                min="0"
                max="23"
                step=".25"
                value={
                  new Date(env.dateTime).getUTCHours() +
                  new Date(env.dateTime).getUTCMinutes() / 60
                }
                onChange={(e) => {
                  const d = new Date(env.dateTime);
                  d.setUTCHours(
                    Math.floor(+e.target.value),
                    (+e.target.value % 1) * 60,
                    0,
                    0,
                  );
                  setEnv({
                    ...env,
                    dateTime: d.toISOString(),
                    weatherMode: "scenario",
                  });
                }}
              />
              <div className="timeline-labels">
                <span>00:00 UTC</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00 UTC</span>
              </div>
            </div>
          )}
          <div className="map-credit">
            {world.provenance.live
              ? "© OpenStreetMap contributors"
              : "Original design study"}
            <span>Scene units: meters</span>
          </div>
          {busy && (
            <div className="loading">
              <span className="spinner" />
              {busy}
            </div>
          )}
          {message && (
            <div className="toast" role="status">
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      </main>
      <input
        hidden
        ref={upload}
        type="file"
        accept="application/json"
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 8e6) throw Error("Scene file exceeds 8 MB.");
            const w = worldSchema.parse(JSON.parse(await f.text()));
            if (
              !w.origin ||
              !Array.isArray(w.objects) ||
              !Array.isArray(w.roads) ||
              !w.graph?.nodes ||
              !w.provenance ||
              !w.extent
            )
              throw Error("Invalid Walk-Free scene file.");
            edit(w);
            setSelected(null);
          } catch (err) {
            setMessage((err as Error).message);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
