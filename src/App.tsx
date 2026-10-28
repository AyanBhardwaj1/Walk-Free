import {
  useState,
  useMemo,
  useEffect,
  useRef,
  lazy,
  Suspense,
  useDeferredValue,
} from "react";
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
  Thermometer,
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
import { speak, stopSpeech, nativeNavigation } from "./lib/navigation";
import JourneyPanel from "./components/JourneyPanel";
import RouteChoices from "./components/RouteChoices";
import HeatPanel, { clock } from "./components/HeatPanel";
import AssistantPanel from "./components/AssistantPanel";
import { converse, type ChatMessage } from "./lib/assistant-client";
import type { ToolHost } from "./lib/assistant-tools";
import { searchCities } from "../server/cities";
import {
  HEAT_LEVELS,
  atLocalHour,
  dailyProfile,
  edgeHeatMap,
  edgePlace,
  localHour,
  placeHeat,
} from "./lib/heat";
import EndpointPicker from "./components/EndpointPicker";
import { defaultEndpoints, destinationCatalog } from "./lib/destinations";
import { snapWalkPosition, hasArrived } from "./lib/walk-location";
import { useWalkLocation } from "./hooks/useWalkLocation";
import { createStudyWorld } from "./lib/study";
import { compareRoutes, nearestWalkNode } from "./lib/routing";
import { brushTerrain, toLocal } from "./lib/geo";
import { loadWorld } from "./lib/world-source";
import WorldCanvas from "./components/WorldCanvas";
import type { Account } from "./lib/account";
const Atlas = lazy(() => import("./components/Atlas"));
const initial: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 30,
  humidity: 50,
  windMps: 3,
  cloudCover: 15,
  weatherMode: "scenario",
};
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
async function api(url: string, body?: unknown) {
  const r = await fetch(
    API_BASE + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  // A crashed host can answer with plain text; never surface a JSON parse error.
  const data = await r.json().catch(() => null);
  if (!r.ok || !data)
    throw Error(
      data?.error || "The service is unavailable right now. Please try again.",
    );
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
export default function App({
  account,
  onSignOut,
}: {
  account: Account;
  onSignOut: () => Promise<void>;
}) {
  const projectKey = `walk-free-project:${account.id}`;
  const [legacyProject, setLegacyProject] = useState(() => {
    try {
      return localStorage.getItem("walk-free-project") !== null;
    } catch {
      return false;
    }
  });
  const [world, setWorld] = useState<World>(() => {
    try {
      const s = localStorage.getItem(projectKey);
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
  const [start, setStart] = useState(() =>
    world.provenance.live ? defaultEndpoints(world)[0] : "market-gate",
  );
  const [end, setEnd] = useState(() =>
    world.provenance.live ? defaultEndpoints(world)[1] : "observatory",
  );
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
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
  const location = useWalkLocation();
  const tracking = location.mode === "walking";
  const locating = location.mode === "locating";
  const [voice, setVoice] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [heatMap, setHeatMap] = useState(true);
  const [heatPlaceId, setHeatPlaceId] = useState<string | null>(null);
  const [comparePlaceId, setComparePlaceId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [chatError, setChatError] = useState("");
  const [speakReplies, setSpeakReplies] = useState(false);
  const userPosition = useMemo(
    () =>
      location.fix
        ? toLocal(location.fix.lat, location.fix.lon, world.origin)
        : null,
    [location.fix, world.origin],
  );
  const snappedLocation = useMemo(
    () =>
      userPosition
        ? snapWalkPosition(world, userPosition, {
            avoidStairs: stairs,
            allowHypothetical: tracking ? false : hypothetical,
          })
        : null,
    [world, userPosition, stairs, hypothetical, tracking],
  );
  const routeWorld = snappedLocation?.world || world;
  const routeStart = location.fix ? snappedLocation?.nodeId || "" : start;
  const lastSpoken = useRef("");
  const buildRequest = useRef(0);
  const worldRef = useRef(world);
  worldRef.current = world;
  const upload = useRef<HTMLInputElement>(null);
  const routeChoices = useMemo(
    () =>
      compareRoutes(routeWorld, routeStart, end, {
        avoidStairs: stairs,
        allowHypothetical: tracking ? false : hypothetical,
        maxDetour: detour,
        environment: env,
      }),
    [routeWorld, routeStart, end, stairs, hypothetical, detour, env, tracking],
  );
  const currentRoute = routeChoices[pref];
  // Heat follows the slider a frame behind so dragging stays smooth.
  const heatEnv = useDeferredValue(env);
  const heatActive =
    mode === "explore" && !atlas && (heatMap || tab === "heat");
  const edgeHeat = useMemo(
    () => (heatActive ? edgeHeatMap(world, heatEnv) : null),
    [heatActive, world, heatEnv],
  );
  const places = useMemo(
    () => (edgeHeat ? placeHeat(world, heatEnv, edgeHeat) : []),
    [edgeHeat, world, heatEnv],
  );
  const findPlace = (id: string | null) => {
    if (!id || !edgeHeat) return null;
    if (id.startsWith("edge:")) {
      const edgeId = id.slice(5);
      const reading = edgeHeat.get(edgeId);
      return reading ? edgePlace(world, edgeId, reading) : null;
    }
    return places.find((p) => p.id === id) ?? null;
  };
  const heatPlace = findPlace(heatPlaceId);
  const comparePlace = findPlace(comparePlaceId);
  const profileDay = atLocalHour(heatEnv.dateTime, world.timezone, 12);
  const heatProfile = useMemo(
    () =>
      heatPlace
        ? dailyProfile(
            world,
            { ...heatEnv, dateTime: profileDay },
            heatPlace,
            heatEnv.weatherMode === "forecast" ? forecast : null,
          )
        : null,
    // Recompute per place and day, not on every slider move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      heatPlace?.id,
      world,
      profileDay,
      heatEnv.temperatureC,
      heatEnv.humidity,
      heatEnv.windMps,
      heatEnv.cloudCover,
      heatEnv.weatherMode,
      forecast,
    ],
  );
  const heatOverlay = useMemo(() => {
    if (!edgeHeat || !heatMap) return null;
    const colors = new Map<string, string>();
    for (const [id, reading] of edgeHeat)
      colors.set(id, HEAT_LEVELS[reading.level].color);
    const highlight = new Set([
      ...(heatPlace?.edgeIds ?? []),
      ...(comparePlace?.edgeIds ?? []),
    ]);
    return { colors, highlight };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeHeat, heatMap, heatPlace?.id, comparePlace?.id]);
  const currentHour = localHour(env.dateTime, world.timezone);
  function setLocalHour(hour: number) {
    setEnv((previous) => ({
      ...previous,
      dateTime: atLocalHour(previous.dateTime, world.timezone, hour),
      weatherMode:
        previous.weatherMode === "forecast" && forecast
          ? "forecast"
          : "scenario",
    }));
  }
  function selectHeatPlace(id: string) {
    setTab("heat");
    if (comparing && heatPlaceId && id !== heatPlaceId) {
      setComparePlaceId(id);
      return;
    }
    setHeatPlaceId(id);
    setComparePlaceId(null);
  }
  function selectHeatEdge(edgeId: string) {
    const place = places.find((p) => p.edgeIds.includes(edgeId));
    selectHeatPlace(place ? place.id : `edge:${edgeId}`);
  }
  const startNode = routeWorld.graph.nodes.find((n) => n.id === routeStart);
  const endNode = world.graph.nodes.find((n) => n.id === end);
  const object = world.objects.find((o) => o.id === selected);
  const catalog = useMemo(() => destinationCatalog(world), [world]);
  const endpointCatalog =
    snappedLocation && !catalog.some((n) => n.id === routeStart)
      ? [
          {
            id: routeStart,
            label: "Your location on mapped path",
            detail: "GPS start",
            search: "your location",
          },
          ...catalog,
        ]
      : catalog;
  // The assistant's tools read the latest app state through this ref.
  const toolHost = useRef<ToolHost>(null!);
  toolHost.current = {
    world: routeWorld,
    env,
    forecast,
    catalog: endpointCatalog,
    myLocationNodeId: snappedLocation?.nodeId ?? null,
    showRoute({ start: from, end: to, preference, avoidStairs, dateTime }) {
      if (from !== snappedLocation?.nodeId) {
        location.reset();
        setStart(from);
      }
      setEnd(to);
      setPref(preference);
      setStairs(avoidStairs);
      setEnv((previous) => ({ ...previous, dateTime }));
    },
    setDateTime: (dateTime) =>
      setEnv((previous) => ({ ...previous, dateTime })),
    highlightPlace(id) {
      setHeatMap(true);
      setHeatPlaceId(id);
      setComparePlaceId(null);
    },
    async buildArea(query) {
      const city = searchCities(query.toLowerCase())[0];
      if (!city) return `No US city or campus matching "${query}" is indexed.`;
      const built = await loadCity(city, true, 1000);
      return built
        ? `Built ${city.name}, ${city.state}. Routes and heat now use this area.`
        : `Could not build ${city.name}; the map providers may be busy.`;
    },
    async proposeDesign(request) {
      setMode("studio");
      setTab("assistant");
      setPrompt(request);
      return ask(request);
    },
  };
  async function sendChat(text: string) {
    setChatError("");
    const history: ChatMessage[] = [...chat, { role: "user", content: text }];
    setChat(history);
    setChatStatus("Thinking…");
    try {
      const { messages, reply } = await converse(
        history,
        () => {
          const t = toolHost.current;
          const quick = routeChoices[pref];
          return {
            area: t.world.name,
            localTime: new Date(t.env.dateTime).toLocaleString("en-US", {
              timeZone: t.world.timezone,
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
            weather: `${Math.round((t.env.temperatureC * 9) / 5 + 32)}°F, ${Math.round(t.env.humidity)}% humidity, ${Math.round(t.env.cloudCover)}% cloud, ${t.env.windMps} m/s wind (${t.env.weatherMode === "forecast" ? "NWS forecast" : "scenario"})`,
            route: quick
              ? `${pref} route, ${Math.round(quick.durationMinutes)} min`
              : undefined,
            canBuildAreas: true,
          };
        },
        () => toolHost.current,
        (url, body) => api(url, body),
        (name) =>
          setChatStatus(
            {
              plan_route: "Planning routes…",
              heat_ranking: "Ranking heat…",
              place_heat: "Checking the heat…",
              build_area: "Building the area…",
              propose_design: "Sketching a design…",
            }[name] ?? "Working…",
          ),
      );
      setChat(messages);
      if (speakReplies) speak(reply);
    } catch (e) {
      setChatError((e as Error).message);
    } finally {
      setChatStatus(null);
    }
  }
  useEffect(() => {
    const [from, to] = defaultEndpoints(world, {
      avoidStairs: stairs,
      allowHypothetical: hypothetical,
    });
    if (!world.graph.nodes.some((n) => n.id === start)) setStart(from);
    if (!world.graph.nodes.some((n) => n.id === end)) setEnd(to);
  }, [world.graph, start, end, stairs, hypothetical]);
  useEffect(() => {
    setPicking(null);
  }, [mode, atlas, world.id, tab]);
  useEffect(() => {
    if (!picking) return;
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [picking]);
  function pickEndpoint(endpoint: "start" | "end") {
    setPicking(picking === endpoint ? null : endpoint);
    setMessage("");
    if (window.matchMedia("(max-width: 650px)").matches)
      document
        .querySelector(".viewport")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  useEffect(() => {
    try {
      localStorage.setItem(projectKey, JSON.stringify(world));
    } catch {
      setMessage("Local storage is full. Export your project to keep a copy.");
    }
  }, [world, projectKey]);
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
  useEffect(() => () => stopSpeech(), []);
  function edit(next: World) {
    location.reset();
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
  async function loadCity(
    c: City,
    build = false,
    radius = 800,
  ): Promise<boolean> {
    const request = ++buildRequest.current;
    if (!build) {
      setBusy("");
      location.reset();
      stopSpeech();
      setAtlas(c);
      setQuery("");
      setMode("explore");
      setTab("route");
      return true;
    }
    setBusy(`Building ${c.name}…`);
    setQuery("");
    try {
      const { world: loaded } = await loadWorld(
        {
          lat: c.lat,
          lon: c.lon,
          name: [c.name, c.state].filter(Boolean).join(", "),
          radius,
        },
        { fetch: window.fetch.bind(window), apiBase: API_BASE },
      );
      if (request !== buildRequest.current) return false;
      const w = worldSchema.parse(loaded);
      edit(w);
      setAtlas(null);
      setSelected(null);
      const [from, to] = defaultEndpoints(w, {
        avoidStairs: stairs,
        allowHypothetical: false,
      });
      setStart(from);
      setEnd(to);
      setHypothetical(false);
      setMode("explore");
      setTab("route");
      setPicking(null);
      setTrees(true);
      setBuildings(true);
      setShowPaths(true);
      setEnv((previous) => ({
        ...previous,
        dateTime: new Date().toISOString(),
        weatherMode: "scenario",
      }));
      setForecast(null);
      setMessage(
        from && to
          ? "Your area is ready. Search a building or street, pick endpoints, or use your location to plan a walk."
          : "This area has no public walking connections. Build a nearby area to plan a walk.",
      );
      return true;
    } catch (e) {
      if (request === buildRequest.current)
        setMessage(String(e instanceof Error ? e.message : e));
      return false;
    } finally {
      if (request === buildRequest.current) setBusy("");
    }
  }
  function ground(p: Point) {
    if (mode === "explore") {
      if (picking) {
        const node = nearestWalkNode(world, p);
        if (!node) {
          setMessage(
            "No path node within 40 m. Choose a point closer to a mapped path junction.",
          );
          return;
        }
        if (picking === "start") {
          location.reset();
          setStart(node.id);
        } else setEnd(node.id);
        setMessage(
          `Selected ${node.name || "path junction"} as your ${picking === "start" ? "start" : "destination"}.`,
        );
        setPicking(null);
        return;
      }
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
  async function ask(request = prompt): Promise<string> {
    setBusy("Sketching your proposal…");
    const snapshot = JSON.stringify(world);
    try {
      const result = await api("/api/agent/propose", {
        prompt: request,
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
        return "The scene changed while drafting; nothing was proposed.";
      }
      setProposal(result);
      return `Preview ready: ${result.summary} The person can apply or discard it in the Design studio.`;
    } catch (e) {
      setMessage((e as Error).message);
      return `Could not draft a design: ${(e as Error).message}`;
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
  function exportLegacyProject() {
    try {
      const saved = localStorage.getItem("walk-free-project");
      if (!saved) {
        setLegacyProject(false);
        return;
      }
      const previous = worldSchema.parse(JSON.parse(saved));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([JSON.stringify(previous, null, 2)], {
          type: "application/json",
        }),
      );
      link.download = "walk-free-before-accounts.json";
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage(
        "Earlier scene exported. Use Import scene to bring it into your account workspace.",
      );
    } catch {
      setMessage(
        "The earlier scene could not be read. Its stored copy has been preserved.",
      );
    }
  }
  function navigation() {
    if (tracking || locating) {
      location.stop();
      stopSpeech();
      return;
    }
    if (
      !world.provenance.live ||
      !endNode ||
      hypothetical ||
      currentRoute?.hypothetical
    ) {
      setMessage(
        "GPS walking requires a mapped area, a destination, and hypothetical planning turned off.",
      );
      return;
    }
    setPicking(null);
    lastSpoken.current = "";
    location.begin(true);
  }
  const gpsRouteStatus =
    location.fix && !snappedLocation
      ? "Your location is outside the loaded walking paths. Build an area around you or choose a start on the map."
      : location.fix && !currentRoute && routeStart !== end
        ? "No connected walk from your location with these settings. Try another destination or route option."
        : "";
  useEffect(() => {
    if (!tracking || !location.fix || !userPosition || !endNode) return;
    const remaining = routeStart === end ? 0 : (currentRoute?.distance ?? null);
    if (
      hasArrived(userPosition, endNode.point, location.fix.accuracy, remaining)
    ) {
      location.stop();
      setMessage("You have arrived at your selected mapped destination.");
      if (voice) speak("You have arrived.");
      return;
    }
    const text = currentRoute?.directions[0]?.text;
    if (!text) {
      stopSpeech();
      lastSpoken.current = "";
      return;
    }
    if (voice && text !== lastSpoken.current) {
      lastSpoken.current = text;
      speak(text);
    }
  }, [
    tracking,
    location.fix,
    userPosition,
    endNode,
    routeStart,
    end,
    currentRoute,
    voice,
    location.stop,
  ]);

  return (
    <div className="app">
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            w<span>f</span>
          </span>
          walk-free
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
              location.reset();
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
          <div className="account-controls">
            <span title={account.email}>{account.name || account.email}</span>
            <button onClick={onSignOut}>Sign out</button>
          </div>
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
          {legacyProject && (
            <button
              className="legacy-export"
              onClick={exportLegacyProject}
              title="Download the local scene saved before accounts were added"
            >
              Export earlier scene
            </button>
          )}
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
          {(tracking || locating) && (
            <button className="secondary" onClick={navigation}>
              {tracking ? "End active navigation" : "Cancel location lookup"}{" "}
              <X size={16} />
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
                ? ["route", "heat", "ask", "climate", "data"]
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
            tab !== "heat" &&
            tab !== "ask" &&
            tab !== "transit" && (
              <section>
                <div className="section-title">
                  <Route size={17} /> Your next walk
                </div>
                <p className="route-area">
                  Walking in <strong>{world.name}</strong>
                </p>
                <p className="fine">
                  {catalog.length.toLocaleString()} mapped path points. Nearby
                  building names select a path outside the building; entry is
                  not verified.
                </p>
                {world.provenance.live && (
                  <button
                    className="endpoint-pick"
                    onClick={() =>
                      loadCity({
                        id: world.id,
                        name: world.name,
                        state: "",
                        lat: world.origin.lat,
                        lon: world.origin.lon,
                        timezone: world.timezone,
                      })
                    }
                  >
                    Change built area · {(world.extent / 1000).toFixed(1)} km
                    across
                  </button>
                )}
                <EndpointPicker
                  key={world.id + "-from"}
                  label="From"
                  catalog={endpointCatalog}
                  value={routeStart}
                  disabled={tracking || locating}
                  onChange={(id) => {
                    location.reset();
                    setStart(id);
                    setPicking(null);
                  }}
                />
                <button
                  className="endpoint-pick"
                  aria-pressed={picking === "start"}
                  disabled={tracking || locating || !world.graph.edges.length}
                  onClick={() => pickEndpoint("start")}
                >
                  <MapPin size={14} />
                  Pick start on map
                </button>
                {world.provenance.live && (
                  <button
                    className="endpoint-pick use-location"
                    disabled={tracking || locating || !catalog.length}
                    onClick={() => {
                      setPicking(null);
                      location.begin(false);
                    }}
                  >
                    Use my location
                  </button>
                )}
                <EndpointPicker
                  key={world.id + "-to"}
                  label="To"
                  catalog={catalog}
                  value={end}
                  disabled={tracking || locating}
                  onChange={(id) => {
                    setEnd(id);
                    setPicking(null);
                  }}
                />
                <div className="endpoint-actions">
                  <button
                    className="endpoint-pick"
                    aria-pressed={picking === "end"}
                    disabled={tracking || locating || !world.graph.edges.length}
                    onClick={() => pickEndpoint("end")}
                  >
                    <MapPin size={14} />
                    Pick destination on map
                  </button>
                  <button
                    className="endpoint-pick"
                    disabled={
                      tracking ||
                      locating ||
                      !!location.fix ||
                      !startNode ||
                      !endNode
                    }
                    onClick={() => {
                      setStart(end);
                      setEnd(start);
                      setPicking(null);
                    }}
                  >
                    Swap
                  </button>
                </div>
                {(location.status || gpsRouteStatus) && (
                  <p className="location-status" role="status">
                    {gpsRouteStatus || location.status}
                  </p>
                )}
                {tracking && !location.fix && (
                  <p className="fine">
                    Waiting for GPS before starting guidance.
                  </p>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={showPaths}
                    onChange={(e) => setShowPaths(e.target.checked)}
                  />
                  Show walking paths
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={voice}
                    onChange={(e) => {
                      setVoice(e.target.checked);
                      stopSpeech();
                      lastSpoken.current = "";
                    }}
                  />
                  Spoken guidance
                </label>
                <label>WHAT MATTERS TODAY?</label>
                <RouteChoices
                  choices={routeChoices}
                  selected={pref}
                  onSelect={setPref}
                  environment={env}
                  origin={world.origin}
                />
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
                    disabled={tracking}
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
                {!currentRoute &&
                  world.provenance.live &&
                  endNode &&
                  !tracking && (
                    <button
                      className="primary"
                      disabled={locating || hypothetical}
                      onClick={navigation}
                    >
                      Start walking from my location <Navigation size={17} />
                    </button>
                  )}
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
                    <button
                      className="primary"
                      onClick={navigation}
                      disabled={
                        locating ||
                        (!tracking && (!world.provenance.live || hypothetical))
                      }
                    >
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
                    {!catalog.length
                      ? "No public walking paths in this build. Choose another area in the city atlas."
                      : routeStart === end
                        ? "Start and destination are the same. Choose a different endpoint."
                        : "No connected walk with these settings. Try different endpoints or route options."}
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
          {!atlas && mode === "explore" && tab === "ask" && (
            <AssistantPanel
              messages={chat}
              status={chatStatus}
              error={chatError}
              speakReplies={speakReplies}
              onSpeakReplies={setSpeakReplies}
              onSend={(text) => void sendChat(text)}
              onReset={() => {
                setChat([]);
                setChatError("");
              }}
            />
          )}
          {!atlas && mode === "explore" && tab === "heat" && (
            <HeatPanel
              places={places}
              selected={heatPlace}
              compare={comparePlace}
              profile={heatProfile}
              currentHour={currentHour}
              timeLabel={`${new Date(env.dateTime).toLocaleString("en-US", {
                timeZone: world.timezone,
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })} · ${env.weatherMode === "forecast" ? "NWS forecast" : "your weather scenario"}`}
              showMap={heatMap}
              onShowMap={setHeatMap}
              onSelect={(p) => selectHeatPlace(p.id)}
              comparing={comparing}
              onCompare={() => {
                setComparing(!comparing);
                setComparePlaceId(null);
              }}
              onClose={() => {
                setHeatPlaceId(null);
                setComparePlaceId(null);
                setComparing(false);
              }}
              onHour={setLocalHour}
            />
          )}
          {!atlas && tab === "transit" && (
            <JourneyPanel key={world.id} world={world} />
          )}
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
                onClick={() => void ask()}
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
        <div className={`viewport${picking ? " picking-route" : ""}`}>
          {atlas ? (
            <Suspense
              fallback={<div className="loading">Loading the city atlas…</div>}
            >
              <Atlas
                lat={atlas.lat}
                lon={atlas.lon}
                onBuild={(lat, lon, radius) =>
                  loadCity({ ...atlas, lat, lon }, true, radius)
                }
              />
            </Suspense>
          ) : (
            <WorldCanvas
              key={world.id}
              world={proposal ? applyDesignProposal(world, proposal) : world}
              environment={env}
              selectedId={selected}
              onSelect={setSelected}
              onGroundClick={ground}
              route={mode === "explore" ? currentRoute : null}
              startPoint={mode === "explore" ? startNode?.point : undefined}
              endPoint={mode === "explore" ? endNode?.point : undefined}
              pickingEndpoint={!!picking}
              showWalkingPaths={showPaths && mode === "explore"}
              locationPoint={userPosition || undefined}
              showTrees={trees}
              showBuildings={buildings}
              heat={heatOverlay}
              onHeatSelect={selectHeatEdge}
            />
          )}
          {picking && (
            <div className="pick-banner" role="status">
              <span>
                Pick your {picking === "start" ? "start" : "destination"} near a
                path junction · snaps within 40 m
              </span>
              <button onClick={() => setPicking(null)}>Cancel</button>
            </div>
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
                {Math.round((env.temperatureC * 9) / 5 + 32)}°<small>F</small>
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
                location.reset();
                stopSpeech();
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
              title="Toggle heat map"
              aria-label="Toggle heat map"
              aria-pressed={heatMap}
              className={!heatMap ? "muted" : ""}
              onClick={() => setHeatMap(!heatMap)}
            >
              <Thermometer size={19} />
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
                <strong>Time of day</strong>
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
                aria-label="Time of day"
                type="range"
                min="0"
                max="23.75"
                step=".25"
                value={currentHour}
                onChange={(e) => setLocalHour(+e.target.value)}
              />
              <div className="timeline-labels">
                {[0, 6, 12, 18, 23.75].map((h) => (
                  <span key={h}>{h === 12 ? "Noon" : clock(h)}</span>
                ))}
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
