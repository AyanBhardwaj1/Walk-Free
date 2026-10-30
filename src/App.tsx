import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  lazy,
  Suspense,
  useDeferredValue,
} from "react";
import {
  ArrowUpRight,
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
  Mountain,
  Plus,
  Minus,
  MousePointer2,
  Landmark,
  Compass,
  Check,
  X,
  Thermometer,
  Map as MapIcon,
  Box,
  Trees,
  ArrowUpDown,
  LocateFixed,
  PanelLeftClose,
  PanelLeftOpen,
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
import { applyDesignProposal } from "./lib/proposals";
import { addPlanningPassage } from "./lib/planning";
import { worldSchema } from "../shared/schema";
import { speak, stopSpeech, nativeNavigation } from "./lib/navigation";
import JourneyPanel from "./components/JourneyPanel";
import RouteChoices from "./components/RouteChoices";
import HeatPanel, { clock } from "./components/HeatPanel";
import HeatImpact from "./components/HeatImpact";
import AssistantPanel from "./components/AssistantPanel";
import { converse, type ChatMessage } from "./lib/assistant-client";
import type { ToolHost } from "./lib/assistant-tools";
import { searchCities } from "../server/cities";
import {
  atLocalHour,
  dailyProfile,
  edgeHeatMap,
  edgePlace,
  localHour,
  placeHeat,
  relativeHeatColor,
  weatherAt,
  areaHeat,
  clockLabel,
} from "./lib/heat";
import { PREBUILT_AREAS, prebuiltAreaFor } from "../shared/areas";
import { matchDestinations } from "./lib/assistant-tools";
import PlaceField from "./components/PlaceField";
import OmniSearch from "./components/OmniSearch";
import Select from "./components/Select";
import { googleMapsWalk } from "./lib/google-maps";
import { defaultEndpoints, destinationCatalog } from "./lib/destinations";
import { baseEdgeId, hasArrived, snapWalkPosition } from "./lib/walk-location";
import { useWalkLocation } from "./hooks/useWalkLocation";
import { createStudyWorld } from "./lib/study";
import { compareRoutes, nearestWalkNode } from "./lib/routing";
import { brushTerrain, toLatLon, toLocal } from "./lib/geo";
import { addCanopy, loadWorld } from "./lib/world-source";
import { hasCanopy } from "../shared/canopy";
import { loadOwnKey, ownKeyHeaders, saveOwnKey } from "./lib/ai-key";
import {
  openCoolStops,
  reachedCoolStop,
  walkCoolStops,
  type WalkStop,
} from "./lib/cool-stops";
import { plantShadeRow } from "./lib/planting";
import { nearestEdge } from "./lib/geo";
import { loadWeather } from "./lib/weather-source";
import {
  uvLabel,
  describeConditions,
  liveConditions,
} from "./lib/live-weather";
import { friendlyError } from "./lib/errors";
import { loadProject, saveProject } from "./lib/project-store";
import WorldCanvas, { type MapInsets } from "./components/WorldCanvas";
import DataLayers from "./components/DataLayers";
import WalkMap2D from "./components/WalkMap2D";
import { toF } from "./lib/heat";
import type { Account } from "./lib/account";
import { ZodError } from "zod";
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
const LIVE_REFRESH_MS = 10 * 60 * 1000;
const NEXT_STRETCH_M = 150;
const PLANT_PICK_M = 30;
const SHEET_HEIGHTS = ["132px", "46dvh", "88dvh"];
const SHEET_DRAG_PX = 30;
const SERVER_MAX_RADIUS = 800;
async function api(
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const r = await fetch(
    API_BASE + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
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
/**
 * The best match for a place name: the server's index plus its worldwide
 * geocoder, or the bundled index alone when the API can't be reached.
 */
async function lookUpPlace(query: string): Promise<City | undefined> {
  try {
    const r = await fetch(
      `${API_BASE}/api/cities?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const found = r.ok ? ((await r.json()) as City[]) : [];
    if (Array.isArray(found) && found[0]) return found[0];
  } catch {
    // Offline or blocked: the bundled index still knows US cities.
  }
  return searchCities(query.toLowerCase())[0];
}
const tools = [
  ["select", "Select", MousePointer2],
  ["tree", "Tree", TreePine],
  ["shaderow", "Shade trees", Trees],
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
  guest = false,
}: {
  account: Account;
  onSignOut: () => Promise<void>;
  /** Demo without an account: no server API, no assistant. */
  guest?: boolean;
}) {
  const projectKey = `walk-free-project:${account.id}`;
  const [legacyProject, setLegacyProject] = useState(() => {
    try {
      return localStorage.getItem("walk-free-project") !== null;
    } catch {
      return false;
    }
  });
  const [world, setWorld] = useState<World>(createStudyWorld);
  // Saving waits until the stored scene has been read back.
  const [hydrated, setHydrated] = useState(false);
  const firstWorld = useRef(world);
  const [atlas, setAtlas] = useState<City | null>(null);
  const [mode, setMode] = useState<"explore" | "studio">("explore");
  const [env, setEnv] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState("select");
  const [probe, setProbe] = useState<Point>([0, 0]);
  const [history, setHistory] = useState<World[]>([]);
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
  // Walking defaults to the flat map: easier to read and lighter on battery.
  useEffect(() => {
    if (tracking) setView("2d");
  }, [tracking]);
  const [voice, setVoice] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [heatMap, setHeatMap] = useState(true);
  const [heatPlaceId, setHeatPlaceId] = useState<string | null>(null);
  const [comparePlaceId, setComparePlaceId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [panelOpen, setPanelOpen] = useState(true);
  // Phone bottom sheet: a peek at the map, half, or nearly full screen.
  const [sheet, setSheet] = useState<0 | 1 | 2>(1);
  const asideRef = useRef<HTMLElement>(null);
  const [mapInsets, setMapInsets] = useState<MapInsets>({
    left: 0,
    bottom: 0,
    top: 0,
  });
  // Track how much of the screen the panel or sheet covers, so the map
  // frames the route in the part people can see.
  useLayoutEffect(() => {
    const aside = asideRef.current;
    const main = aside?.parentElement;
    if (!aside || !main) return;
    const measure = () => {
      const a = aside.getBoundingClientRect(),
        m = main.getBoundingClientRect();
      const phone = window.matchMedia("(max-width: 650px)").matches;
      const next = phone
        ? { left: 0, bottom: Math.max(0, m.bottom - a.top), top: 64 }
        : {
            left: panelOpen ? Math.max(0, a.right - m.left) : 0,
            bottom: 110,
            top: 0,
          };
      setMapInsets((prev) =>
        prev.left === next.left &&
        prev.bottom === next.bottom &&
        prev.top === next.top
          ? prev
          : next,
      );
    };
    // Wait for the sheet's height transition before measuring again.
    const settle = setTimeout(measure, 320);
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    measure();
    return () => {
      clearTimeout(settle);
      observer.disconnect();
    };
  }, [panelOpen, sheet]);
  const sheetDrag = useRef<number | null>(null);
  // The scene before the first tree in this comparison, and the last row.
  const [heatBaseline, setHeatBaseline] = useState<World | null>(null);
  const [planting, setPlanting] = useState<{
    street: string;
    edgeIds: string[];
    planted: number;
  } | null>(null);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [chatError, setChatError] = useState("");
  const [ownKey, setOwnKey] = useState(() => loadOwnKey(account.id));
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
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const worldRef = useRef(world);
  worldRef.current = world;
  const upload = useRef<HTMLInputElement>(null);
  // Routes depend on the time (through the sun) and nothing else in the
  // weather, so temperature or humidity changes don't re-plan them.
  const routeTime = useDeferredValue(env.dateTime);
  const routeEnv = useMemo(
    () => ({ ...env, dateTime: routeTime }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeTime],
  );
  // While walking, keep the cool stop chosen at the start (see walkCoolStops).
  const [walkStop, setWalkStop] = useState<WalkStop | null>(null);
  const coolStops = useMemo(
    () => walkCoolStops(openCoolStops(world, routeEnv), walkStop),
    [world, routeEnv, walkStop],
  );
  const routeChoices = useMemo(
    () =>
      compareRoutes(routeWorld, routeStart, end, {
        avoidStairs: stairs,
        allowHypothetical: tracking ? false : hypothetical,
        maxDetour: detour,
        environment: routeEnv,
        coolStops,
      }),
    [
      routeWorld,
      routeStart,
      end,
      stairs,
      hypothetical,
      detour,
      routeEnv,
      coolStops,
      tracking,
    ],
  );
  useEffect(() => {
    setWalkStop(
      tracking
        ? { name: routeChoices.indoors?.coolStop ?? null, reached: false }
        : null,
    );
    // Only the moment a walk starts or ends matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking]);
  useEffect(() => {
    if (
      walkStop?.name &&
      !walkStop.reached &&
      userPosition &&
      reachedCoolStop(
        world,
        openCoolStops(world, routeEnv),
        walkStop.name,
        userPosition,
      )
    )
      setWalkStop({ ...walkStop, reached: true });
  }, [walkStop, userPosition, world, routeEnv]);
  const currentRoute = routeChoices[pref];
  // Heat follows the slider a frame behind so dragging stays smooth.
  const heatEnv = useDeferredValue(env);
  const heatActive = !atlas && (heatMap || tab === "heat");
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
      colors.set(id, relativeHeatColor(reading));
    const highlight = new Set([
      ...(heatPlace?.edgeIds ?? []),
      ...(comparePlace?.edgeIds ?? []),
    ]);
    return { colors, highlight };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeHeat, heatMap, heatPlace?.id, comparePlace?.id]);
  const currentHour = localHour(env.dateTime, world.timezone);
  /** Heat of the next ~150 m of the route, for the walking banner. */
  const nextStretch = useMemo(() => {
    if (!currentRoute || !edgeHeat) return null;
    let length = 0,
      feels = 0,
      shade = 0;
    for (const e of currentRoute.edges) {
      // The stretch being walked is split at the walker; use its mapped edge.
      const reading = edgeHeat.get(baseEdgeId(e.id));
      if (!reading) continue;
      length += e.distance;
      feels += reading.feelsLikeC * e.distance;
      shade += reading.shade * e.distance;
      if (length >= NEXT_STRETCH_M) break;
    }
    return length ? { feelsC: feels / length, shade: shade / length } : null;
  }, [currentRoute, edgeHeat]);
  function setLocalHour(hour: number) {
    setEnv((previous) => {
      const dateTime = atLocalHour(previous.dateTime, world.timezone, hour);
      // In forecast mode, temperature and cloud follow the chosen hour.
      return previous.weatherMode === "forecast" && forecast
        ? weatherAt(previous, dateTime, forecast)
        : { ...previous, dateTime, weatherMode: "scenario" };
    });
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
    if (mode === "studio") {
      if (tool === "shaderow") plantShade(edgeId);
      return;
    }
    const place = places.find((p) => p.edgeIds.includes(edgeId));
    selectHeatPlace(place ? place.id : `edge:${edgeId}`);
  }
  function plantShade(edgeId: string) {
    const result = plantShadeRow(world, edgeId);
    if (!result) {
      setMessage("There's no room for more trees along this path.");
      return;
    }
    if (!heatBaseline) setHeatBaseline(world);
    edit(result.world);
    setHeatMap(true);
    setPlanting({
      street: result.street,
      edgeIds: result.edgeIds,
      planted: (planting?.planted ?? 0) + result.planted,
    });
    flash(`Planted ${result.planted} shade trees along ${result.street}.`);
  }
  const baselineHeat = useMemo(
    () =>
      heatBaseline && edgeHeat ? edgeHeatMap(heatBaseline, heatEnv) : null,
    [heatBaseline, heatEnv, edgeHeat],
  );
  const impact = useMemo(() => {
    if (!heatBaseline || !baselineHeat || !edgeHeat || !planting) return null;
    const street = new Set(planting.edgeIds);
    return {
      street: [
        areaHeat(heatBaseline, baselineHeat, street),
        areaHeat(world, edgeHeat, street),
      ],
      area: [areaHeat(heatBaseline, baselineHeat), areaHeat(world, edgeHeat)],
    };
  }, [heatBaseline, baselineHeat, edgeHeat, world, planting]);
  const startNode = routeWorld.graph.nodes.find((n) => n.id === routeStart);
  const endNode = world.graph.nodes.find((n) => n.id === end);
  // Off-map or disconnected walks hand off to Google Maps.
  const googleWalk =
    world.provenance.live && startNode && endNode && startNode !== endNode
      ? googleMapsWalk(
          toLatLon(startNode.point, routeWorld.origin),
          toLatLon(endNode.point, world.origin),
        )
      : null;
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
            keys: [{ text: "your location", place: true }],
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
      const city = await lookUpPlace(query);
      if (!city) return `No city or campus matching "${query}" was found.`;
      const built = await loadCity(city, true, 1000);
      return built
        ? `Built ${city.name}, ${city.state}. Routes and heat now use this area.`
        : `Could not build ${city.name}; the map providers may be busy.`;
    },
    applyPlanting(result, before) {
      setHeatBaseline((current) => current ?? before);
      edit(result.world);
      setHeatMap(true);
      setPlanting((current) => ({
        street: result.street,
        edgeIds: result.edgeIds,
        planted: (current?.planted ?? 0) + result.planted,
      }));
      // Stay in the conversation; the studio holds the before/after card.
      flash(
        `Planted ${result.planted} shade trees along ${result.street}. See Heat impact in Design studio.`,
      );
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
            weather: `${Math.round((t.env.temperatureC * 9) / 5 + 32)}°F, ${Math.round(t.env.humidity)}% humidity, ${Math.round(t.env.cloudCover)}% cloud, ${t.env.windMps} m/s wind (${t.env.weatherMode === "forecast" ? "live weather" : "scenario"})`,
            route: quick
              ? `${pref} route, ${Math.round(quick.durationMinutes)} min`
              : undefined,
            canBuildAreas: true,
          };
        },
        () => toolHost.current,
        (url, body) => api(url, body, ownKeyHeaders(ownKey)),
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
      setChatError(friendlyError(e));
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
    // Endpoints depend on the walking graph only; edits that leave it alone
    // (trees, buildings) must not reset them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    let active = true;
    loadProject(projectKey)
      .then((stored) => {
        const parsed = stored ? worldSchema.safeParse(stored) : null;
        // Never replace an area the person built while this was loading.
        if (active && parsed?.success)
          setWorld((current) =>
            current === firstWorld.current ? parsed.data : current,
          );
      })
      .catch(() => {
        /* No saved scene, or storage is unavailable: keep the study. */
      })
      .finally(() => active && setHydrated(true));
    return () => {
      active = false;
    };
  }, [projectKey]);
  // Landing-page campus links open that campus directly (/demo?area=ut-austin).
  const openedArea = useRef(false);
  useEffect(() => {
    // Wait for the saved scene, so building pushes it onto undo history.
    if (!hydrated || openedArea.current) return;
    openedArea.current = true;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("area");
    if (slug) {
      // Use the link once; reloading shouldn't replace the scene again.
      params.delete("area");
      const rest = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (rest ? `?${rest}` : ""),
      );
    }
    const area = PREBUILT_AREAS.find((a) => a.slug === slug);
    if (area)
      void loadCity(
        {
          id: area.slug,
          name: area.name.replace(/, [A-Z]{2}$/, ""),
          state: area.name.match(/, ([A-Z]{2})$/)?.[1] ?? "",
          lat: area.lat,
          lon: area.lon,
          timezone: "",
        },
        true,
        area.radius,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  // Keep live weather fresh while the tab is visible.
  useEffect(() => {
    if (env.weatherMode !== "forecast" || atlas) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void weather(world.origin, true, buildRequest.current);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.weatherMode, world.origin, atlas]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      saveProject(projectKey, world).catch(() =>
        setMessage(
          "This browser couldn't save your scene. Export it to keep a copy.",
        ),
      );
    }, 600);
    return () => clearTimeout(timer);
  }, [world, projectKey, hydrated]);
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
      setMode("explore");
      setTab("route");
      return true;
    }
    setBusy(`Building ${c.name}…`);
    try {
      const { world: loaded, canopy } = await loadWorld(
        {
          lat: c.lat,
          lon: c.lon,
          name: [c.name, c.state].filter(Boolean).join(", "),
          radius,
        },
        {
          fetch: window.fetch.bind(window),
          apiBase: API_BASE,
          // Guests have no session; areas wider than a campus exceed Vercel's
          // 4.5 MB response limit, so both build straight from the browser.
          skipServer: guest || radius > SERVER_MAX_RADIUS,
          onStage: (stage) =>
            request === buildRequest.current &&
            setBusy(`Building ${c.name} · ${stage}`),
        },
      );
      if (request !== buildRequest.current) return false;
      // A geocoded place knows its own time zone; the parser only guesses
      // from the nearest indexed US city.
      const w = worldSchema.parse(
        c.timezone ? { ...(loaded as object), timezone: c.timezone } : loaded,
      );
      edit(w);
      // Meta's canopy arrives after the map: add it in place (not as an
      // undoable edit) if the same area is still open.
      void canopy?.then((cells) =>
        setWorld((current) =>
          current.id === w.id && !hasCanopy(current)
            ? addCanopy(current, cells)
            : current,
        ),
      );
      setAtlas(null);
      setSelected(null);
      let [from, to] = defaultEndpoints(w, {
        avoidStairs: stairs,
        allowHypothetical: false,
      });
      const hero = prebuiltAreaFor(c.lat, c.lon, radius)?.walk;
      if (hero) {
        const catalog = destinationCatalog(w);
        const a = matchDestinations(catalog, hero.from)[0]?.id;
        const b = matchDestinations(catalog, hero.to)[0]?.id;
        const linked =
          a &&
          b &&
          compareRoutes(w, a, b, {
            avoidStairs: stairs,
            allowHypothetical: false,
            maxDetour: 2,
            environment: env,
          }).quickest;
        if (linked) [from, to] = [a, b];
      }
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
      void weather(w.origin, true, request);
      flash(
        from && to
          ? "Your area is ready. Search a building or street, pick endpoints, or use your location to plan a walk."
          : "This area has no public walking connections. Build a nearby area to plan a walk.",
      );
      return true;
    } catch (e) {
      if (request === buildRequest.current)
        setMessage(
          friendlyError(e, "This area could not be built. Try again shortly."),
        );
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
    if (tool === "shaderow") {
      const edge = nearestEdge(world, p, PLANT_PICK_M);
      if (edge) plantShade(edge.id);
      else setMessage("Click on or next to a walking path to plant along it.");
      return;
    }
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
        setMessage(friendlyError(e, "That passage could not be added here."));
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
  async function weather(
    origin = world.origin,
    quiet = false,
    request?: number,
  ) {
    if (!quiet) setBusy("Getting live weather…");
    try {
      const f = await loadWeather(origin, {
        fetch: window.fetch.bind(window),
        apiBase: API_BASE,
      });
      // Weather that arrives after another area was built is discarded.
      if (request !== undefined && request !== buildRequest.current) return;
      setForecast(f);
      // Quiet refreshes keep the time the person (or assistant) chose;
      // asking for live weather jumps to now.
      setEnv((env) => liveConditions(env, f, quiet ? env.dateTime : undefined));
      if (!quiet)
        flash(`Live weather on · ${f.source}. Updates every 10 minutes.`);
    } catch (e) {
      // Background refreshes fail quietly and keep the last weather.
      if (!quiet) setMessage(friendlyError(e));
    } finally {
      if (!quiet) setBusy("");
    }
  }
  /** A short confirmation that clears itself; errors use setMessage. */
  function flash(text: string) {
    setMessage(text);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(
      () => setMessage((current) => (current === text ? "" : current)),
      6000,
    );
  }
  async function ask(request = prompt): Promise<string> {
    setBusy("Sketching your proposal…");
    const snapshot = JSON.stringify(world);
    try {
      const result = await api(
        "/api/agent/propose",
        {
          prompt: request,
          extent: world.extent,
          scene: world.objects.slice(0, 300),
          roads: world.roads
            .slice(0, 60)
            .map((r) => ({ name: r.name, points: r.points.slice(0, 200) })),
        },
        ownKeyHeaders(ownKey),
      );
      if (JSON.stringify(worldRef.current) !== snapshot) {
        setMessage(
          "The scene changed while the assistant was working. Request a fresh proposal.",
        );
        return "The scene changed while drafting; nothing was proposed.";
      }
      setProposal(result);
      return `Preview ready: ${result.summary} The person can apply or discard it in the Design studio.`;
    } catch (e) {
      setMessage(
        friendlyError(e, "The design could not be drafted. Try again."),
      );
      return `Could not draft a design: ${friendlyError(e)}`;
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
    // `location` is a fresh object every render; its fix and stop are what
    // this effect uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {guest ? (
            <div className="account-controls">
              <a href="/login">Log in</a>
              <a className="account-cta" href="/signup">
                Create free account
              </a>
            </div>
          ) : (
            <div className="account-controls">
              <span title={account.email}>{account.name || account.email}</span>
              <button
                onClick={() => {
                  // Don't leave a personal AI key behind on a shared computer.
                  saveOwnKey(account.id, null);
                  void onSignOut();
                }}
              >
                Sign out
              </button>
            </div>
          )}
          <button
            className="icon-button"
            aria-label="Export project"
            onClick={exportWorld}
          >
            <Download size={18} />
          </button>
        </div>
      </header>
      <main
        style={
          { "--sheet-height": SHEET_HEIGHTS[sheet] } as React.CSSProperties
        }
      >
        <aside ref={asideRef} className={panelOpen ? "" : "collapsed"}>
          <button
            className="sheet-handle"
            aria-label={sheet === 2 ? "Show more map" : "Show more controls"}
            onPointerDown={(e) => {
              sheetDrag.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              const start = sheetDrag.current;
              sheetDrag.current = null;
              const dy = start === null ? 0 : e.clientY - start;
              setSheet((level) =>
                Math.abs(dy) < SHEET_DRAG_PX
                  ? level === 2
                    ? 1
                    : ((level + 1) as 1 | 2)
                  : dy < 0
                    ? (Math.min(2, level + 1) as 0 | 1 | 2)
                    : (Math.max(0, level - 1) as 0 | 1 | 2),
              );
            }}
          >
            <span />
          </button>
          {legacyProject && (
            <button
              className="legacy-export"
              onClick={exportLegacyProject}
              title="Download the local scene saved before accounts were added"
            >
              Export earlier scene
            </button>
          )}
          <div className="panel-head">
            <div>
              <small>{mode === "explore" ? "Exploring" : "Designing"}</small>
              <h1 className="panel-title">
                {atlas ? atlas.name : world.name.split(" · ")[0]}
              </h1>
            </div>
            <button
              className="icon-button panel-toggle"
              aria-label="Hide panel"
              onClick={() => setPanelOpen(false)}
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
          {(tracking || locating) && (
            <button className="secondary" onClick={navigation}>
              {tracking ? "End active navigation" : "Cancel location lookup"}{" "}
              <X size={16} />
            </button>
          )}
          <OmniSearch
            catalog={catalog}
            areaName={world.name}
            onPlace={(id) => {
              setMode("explore");
              setTab("route");
              setEnd(id);
              setPicking(null);
              flash("Destination set. Choose where you're starting from.");
            }}
            onCity={(c) =>
              void loadCity(c, !!prebuiltAreaFor(c.lat, c.lon, 1000), 1000)
            }
          />
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
                <div className="planner">
                  <PlaceField
                    key={world.id + "-from"}
                    label="From"
                    catalog={endpointCatalog}
                    value={routeStart}
                    areaName={world.name}
                    disabled={tracking || locating}
                    onChange={(id) => {
                      location.reset();
                      setStart(id);
                      setPicking(null);
                    }}
                  />
                  <button
                    className="planner-swap"
                    aria-label="Swap start and destination"
                    title="Swap"
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
                    <ArrowUpDown size={15} />
                  </button>
                  <PlaceField
                    key={world.id + "-to"}
                    label="To"
                    catalog={catalog}
                    value={end}
                    areaName={world.name}
                    disabled={tracking || locating}
                    onChange={(id) => {
                      setEnd(id);
                      setPicking(null);
                    }}
                  />
                </div>
                <div className="chip-row">
                  <button
                    className="chip"
                    aria-pressed={picking === "start"}
                    disabled={tracking || locating || !world.graph.edges.length}
                    onClick={() => pickEndpoint("start")}
                  >
                    <MapPin size={13} /> Start on map
                  </button>
                  <button
                    className="chip"
                    aria-pressed={picking === "end"}
                    disabled={tracking || locating || !world.graph.edges.length}
                    onClick={() => pickEndpoint("end")}
                  >
                    <MapPin size={13} /> End on map
                  </button>
                  {world.provenance.live && (
                    <button
                      className="chip"
                      disabled={tracking || locating || !catalog.length}
                      onClick={() => {
                        setPicking(null);
                        location.begin(false);
                      }}
                    >
                      <LocateFixed size={13} /> My location
                    </button>
                  )}
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
                <div className="field-label section-label">
                  WHAT MATTERS TODAY?
                </div>
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
                    {googleWalk && (
                      <a
                        className="google-link"
                        href={googleWalk}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Compare in Google Maps <ArrowUpRight size={13} />
                      </a>
                    )}
                  </>
                ) : (
                  <p className="fine">
                    {!catalog.length
                      ? "No public walking paths in this build. Choose another area in the city atlas."
                      : routeStart === end
                        ? "Start and destination are the same. Choose a different endpoint."
                        : "No connected walk with these settings. Try different endpoints or route options."}
                    {googleWalk && (
                      <a
                        className="google-link"
                        href={googleWalk}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get walking directions in Google Maps{" "}
                        <ArrowUpRight size={13} />
                      </a>
                    )}
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
          {!atlas && mode === "explore" && tab === "ask" && guest && (
            <section className="guest-lock">
              <div className="section-title">
                <Sparkles size={17} /> Ask Walk-Free
              </div>
              <p>
                Plan routes in plain words, ask why a street is hot, or plant
                trees by asking. Create a free account to use the assistant.
              </p>
              <a className="primary" href="/signup">
                Create free account <ArrowUpRight size={16} />
              </a>
            </section>
          )}
          {!atlas && mode === "explore" && tab === "ask" && !guest && (
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
              ownKey={ownKey}
              onTestKey={async (value) => {
                const check = await api(
                  "/api/agent/test-key",
                  {},
                  ownKeyHeaders(value),
                );
                return { model: check.model, latencyMs: check.latencyMs };
              }}
              onOwnKey={(value) => {
                setOwnKey(value);
                saveOwnKey(account.id, value);
                setChatError("");
              }}
            />
          )}
          {!atlas && mode === "explore" && tab === "heat" && (
            <HeatPanel
              places={places}
              range={edgeHeat?.values().next().value ?? null}
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
              })} · ${env.weatherMode === "forecast" ? "live weather" : "your weather scenario"}`}
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
              <button className="secondary" onClick={() => void weather()}>
                {env.weatherMode === "forecast"
                  ? "Refresh live weather"
                  : "Use live weather"}{" "}
                <ArrowUpRight size={16} />
              </button>
              {forecast && (
                <div className="field">
                  <span className="field-label">FORECAST HOUR</span>
                  <Select
                    label="Forecast hour"
                    value={String(
                      forecast.hours.findIndex((h) => h.time === env.dateTime),
                    )}
                    placeholder="Choose an hour"
                    options={forecast.hours.map((h, i) => ({
                      value: String(i),
                      label: new Date(h.time).toLocaleString("en-US", {
                        timeZone: world.timezone,
                        weekday: "short",
                        hour: "numeric",
                      }),
                      detail: `${Math.round(toF(h.temperatureC))}°F · ${h.description || "forecast"}`,
                    }))}
                    onChange={(value) =>
                      setEnv((previous) => ({
                        ...liveConditions(
                          previous,
                          forecast,
                          forecast.hours[+value].time,
                        ),
                      }))
                    }
                  />
                </div>
              )}
              <label>
                SCENARIO AIR TEMPERATURE · {Math.round(toF(env.temperatureC))}°F
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
              {impact && planting && (
                <HeatImpact
                  impact={impact}
                  street={planting.street}
                  planted={planting.planted}
                  time={clockLabel(heatEnv.dateTime, world.timezone)}
                  onReset={() => {
                    setHeatBaseline(null);
                    setPlanting(null);
                  }}
                />
              )}
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
                Choose an asset, then click the ground to place it. Shade trees:
                click a path to line its whole street and see the heat drop.
                Drag to orbit; right-drag to pan; scroll to zoom.
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
          {mode === "studio" && tab === "assistant" && guest && (
            <section className="guest-lock">
              <div className="section-title">
                <Sparkles size={17} /> A second imagination
              </div>
              <p>
                Describe a place and the assistant drafts it for you to preview.
                Create a free account to use it.
              </p>
              <a className="primary" href="/signup">
                Create free account <ArrowUpRight size={16} />
              </a>
            </section>
          )}
          {mode === "studio" && tab === "assistant" && !guest && (
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
                The AI model runs on our server. Your original scene stays
                intact until you apply a proposal.
              </p>
            </section>
          )}
          {!atlas && tab === "data" && (
            <section>
              <div className="section-title">Know your ground</div>
              <DataLayers world={world} env={env} forecast={forecast} />
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
        <div
          className={`viewport${picking ? " picking-route" : ""}${atlas ? " atlas-mode" : ""}`}
        >
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
          ) : view === "2d" && mode === "explore" ? (
            <WalkMap2D
              world={routeWorld}
              route={currentRoute}
              you={userPosition ?? undefined}
              accuracy={location.fix?.accuracy}
              start={startNode?.point}
              end={endNode?.point}
              edgeColors={heatOverlay?.colors}
              insets={mapInsets}
            />
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
              insets={mapInsets}
              onHeatSelect={
                mode === "explore" || tool === "shaderow"
                  ? selectHeatEdge
                  : undefined
              }
            />
          )}
          {!atlas && view === "2d" && mode === "explore" && currentRoute && (
            <div className="walk-banner" role="status" aria-live="polite">
              <strong>
                {currentRoute.directions[0]?.text ?? "Follow the route"}
              </strong>
              <span>
                {tracking ? "" : "Preview · "}
                {Math.max(1, Math.round(currentRoute.durationMinutes))} min ·{" "}
                {(currentRoute.distance / 1000).toFixed(2)} km left
                {nextStretch &&
                  ` · next stretch ~${Math.round(toF(nextStretch.feelsC))}°F, ${Math.round(nextStretch.shade * 100)}% shade`}
              </span>
            </div>
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
          {!panelOpen && (
            <button
              className="panel-open"
              onClick={() => setPanelOpen(true)}
              aria-label="Show panel"
            >
              <PanelLeftOpen size={18} /> Search & routes
            </button>
          )}
          <div
            className="map-heading"
            hidden={
              panelOpen ||
              (!atlas && view === "2d" && mode === "explore" && !!currentRoute)
            }
          >
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
                {env.weatherMode === "scenario" ? (
                  "Your scenario"
                ) : (
                  <span className="live-badge">Live weather</span>
                )}
                <small>
                  {env.weatherMode === "forecast" && forecast
                    ? `${describeConditions(env, forecast)} · updated ${new Date(
                        forecast.fetchedAt,
                      ).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : `${Math.round(env.windMps * 2.237)} mph wind`}
                </small>
                {env.weatherMode === "forecast" && uvLabel(env.uvIndex) && (
                  <small
                    className={`uv-badge ${uvLabel(env.uvIndex)!.high ? "high" : ""}`}
                    title="UV index from Open-Meteo"
                  >
                    {uvLabel(env.uvIndex)!.text}
                  </small>
                )}
              </div>
            </div>
          )}
          {!atlas && (
            <>
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
                {mode === "explore" && (
                  <button
                    title={
                      view === "3d"
                        ? "Switch to flat walking map"
                        : "Switch to 3D view"
                    }
                    aria-label={
                      view === "3d"
                        ? "Switch to flat walking map"
                        : "Switch to 3D view"
                    }
                    onClick={() => setView(view === "3d" ? "2d" : "3d")}
                  >
                    {view === "3d" ? <MapIcon size={19} /> : <Box size={19} />}
                  </button>
                )}
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
                  className="desktop-only"
                  title="Import scene"
                  aria-label="Import scene"
                  onClick={() => upload.current?.click()}
                >
                  <Upload size={19} />
                </button>
                <button
                  className="desktop-only"
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
            </>
          )}
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
            {atlas
              ? "© OpenFreeMap · OpenMapTiles · OpenStreetMap contributors"
              : world.provenance.live
                ? world.objects.some((o) => o.source === "canopy")
                  ? "© OpenStreetMap contributors · Canopy © Meta & WRI"
                  : "© OpenStreetMap contributors"
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
            setMessage(
              err instanceof SyntaxError || err instanceof ZodError
                ? "That file isn't a valid Walk-Free scene."
                : friendlyError(err, "That file couldn't be opened."),
            );
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
