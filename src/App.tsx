import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  lazy,
  Suspense,
  useDeferredValue,
  useCallback,
} from "react";
import {
  ArrowUpRight,
  TreePine,
  Building2,
  Route,
  Sun,
  Moon,
  Cloud,
  CloudRain,
  Layers,
  Undo2,
  Download,
  Camera,
  FileText,
  Upload,
  Trash2,
  Sparkles,
  Footprints,
  Users,
  MapPin,
  Navigation,
  Mountain,
  Plus,
  Minus,
  MousePointer2,
  Landmark,
  Compass,
  Crosshair,
  Rotate3d,
  Check,
  X,
  Share2,
  Bookmark,
  Thermometer,
  Map as MapIcon,
  Box,
  Trees,
  ArrowUpDown,
  LocateFixed,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
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
import { placeLabels } from "./lib/place-labels";
import { applyDesignProposal } from "./lib/proposals";
import { addPlanningPassage } from "./lib/planning";
import { worldSchema } from "../shared/schema";
import { speak, stopSpeech, nativeNavigation } from "./lib/navigation";
import JourneyPanel from "./components/JourneyPanel";
import RouteProfile from "./components/RouteProfile";
import PhotoRenderDialog, {
  type PhotoRender,
} from "./components/PhotoRenderDialog";
import RouteChoices from "./components/RouteChoices";
import HeatPanel, { clock } from "./components/HeatPanel";
import HeatImpact from "./components/HeatImpact";
import AssistantPanel from "./components/AssistantPanel";
import {
  converse,
  PartialChatError,
  type ChatMessage,
} from "./lib/assistant-client";
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
  heatRamp,
  HEAT_LEVELS,
  heatLevel,
  weatherAt,
  scenarioAt,
  areaHeat,
  clockLabel,
  canopyShare,
} from "./lib/heat";
import { PREBUILT_AREAS, prebuiltAreaFor } from "../shared/areas";
import { matchDestinations, runTool } from "./lib/assistant-tools";
import DemoTour, { type TourStep } from "./components/DemoTour";
import { CITY_IDEAS } from "./components/CityGenerator";
import PlaceField from "./components/PlaceField";
import OmniSearch, { matchFiction } from "./components/OmniSearch";
import Select from "./components/Select";
import { googleMapsWalk } from "./lib/google-maps";
import { defaultEndpoints, destinationCatalog } from "./lib/destinations";
import { baseEdgeId, hasArrived, snapWalkPosition } from "./lib/walk-location";
import { spokenShadeHint, sunAhead } from "./lib/sun-ahead";
import { useWalkLocation } from "./hooks/useWalkLocation";
import { createStudyWorld } from "./lib/study";
import { FICTION_CITIES, createFictionCity } from "./lib/fiction-cities";
import { isDarkSky, skyAt } from "./lib/fiction-catalog";
import { ambientFromSpec, buildCityFromSpec } from "./lib/city-from-spec";
import { specFromPrompt } from "./lib/spec-from-prompt";
import {
  parseCitySpec,
  type CitySpec,
  type Realism,
} from "../shared/city-spec";
import { findGenerated, rememberGenerated } from "./lib/generated-cities";
import CityGenerator from "./components/CityGenerator";
import { rememberPlace } from "./lib/last-place";
import AmbientBackdrop from "./components/AmbientBackdrop";
import WeatherControls, { julyAfternoon } from "./components/WeatherControls";
import DayInLife from "./components/DayInLife";
import { planDay, type DayPlan } from "./lib/day-plan";
import {
  clampSunAversion,
  compareRoutes,
  DEFAULT_SUN_AVERSION,
  nearestWalkNode,
  SUN_AVERSION_RANGE,
  sunAversionLabel,
} from "./lib/routing";
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
import { loadOutlook } from "./lib/outlook-source";
import {
  activeOutlook,
  HEAT_RISK_LEVELS,
  outlookContext,
  type Outlook,
} from "../shared/outlook";
import OutlookNotice from "./components/OutlookNotice";
import CoolWalkCard from "./components/CoolWalkCard";
import AssistantDemo from "./components/AssistantDemo";
import HeatRiskWeek from "./components/HeatRiskWeek";
import { streetHeatCsv } from "./lib/heat-csv";
import { heatBrief } from "./lib/heat-brief";
import ProposalDialog from "./components/ProposalDialog";
import type { CoolWalkability } from "./lib/cool-walkability";
import { speechLang } from "./lib/speech-lang";
import {
  formatTemp,
  inUnit,
  loadUnit,
  saveUnit,
  UnitContext,
  type TempUnit,
} from "./lib/units";
import {
  uvLabel,
  describeConditions,
  liveConditions,
} from "./lib/live-weather";
import { friendlyError } from "./lib/errors";
import { loadProject, saveProject } from "./lib/project-store";
import { clampObjectField, repairWorld } from "./lib/scene-limits";
import type { MapCamera } from "./components/scene/CameraRig";
import WorldCanvas, { type MapInsets } from "./components/WorldCanvas";
import DataLayers from "./components/DataLayers";
import BestTime from "./components/BestTime";
import { routeLabels } from "./components/RouteChoices";
import { parseWalkLink, walkLinkUrl, type WalkLink } from "./lib/walk-links";
import {
  loadSavedWalks,
  removeSavedWalk,
  saveWalk,
  type SavedWalk,
} from "./lib/saved-walks";
import {
  bestTimeToLeave,
  type BestTime as BestTimePlan,
} from "./lib/best-time";
import ThemePicker from "./components/ThemePicker";
import Shortcuts, {
  ignoreShortcut,
  loadShortcutsOn,
} from "./components/Shortcuts";
import {
  THEMES,
  applyTheme,
  loadTheme,
  saveTheme,
  type ThemeName,
} from "./lib/theme";
import WalkMap2D from "./components/WalkMap2D";
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
/** "3 building(s)" as "3 buildings", "1 way(s)" as "1 way" in stored notes. */
function plainCounts(note: string) {
  return (
    note
      // Whole numbers only: never the digits after a decimal point.
      .replace(/(?<![\d.,])\b(\d{4,})(?= [a-z])/g, (n) =>
        Number(n).toLocaleString("en-US"),
      )
      .replace(
        /\b(\d+) ([^()\s]+(?: [^()\s]+)?)\(s\)(?: (are|were)\b)?/g,
        (_, n: string, word: string, verb?: string) => {
          const one = n === "1";
          const v = verb && (one ? (verb === "are" ? "is" : "was") : verb);
          return `${n} ${word}${one ? "" : "s"}${v ? ` ${v}` : ""}`;
        },
      )
  );
}
/** "north-east" and so on, for a compass bearing in degrees. */
function compassWord(degrees: number) {
  const names = [
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
  ];
  return names[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}
/** Where a clicked point is, in plain words, from the area's centre. */
function probeLabel([x, z]: Point) {
  const part = (v: number, plus: string, minus: string) =>
    Math.abs(v) < 5
      ? ""
      : `${Math.round(Math.abs(v))} m ${v > 0 ? plus : minus}`;
  const parts = [part(x, "east", "west"), part(z, "south", "north")].filter(
    Boolean,
  );
  return parts.length ? `${parts.join(", ")} of centre` : "the centre";
}
/** Below this sun height (about 8°) the guest demo opens at 3 PM. */
const DEMO_MIN_SUN_RAD = (8 * Math.PI) / 180;
/** Weather that suits each fictional city's mood, as a starting scenario. */
const MOOD_WEATHER = {
  rain: { temperatureC: 19, humidity: 88, windMps: 5, cloudCover: 85 },
  sun: { temperatureC: 33, humidity: 35, windMps: 2, cloudCover: 5 },
  sparks: { temperatureC: 28, humidity: 45, windMps: 6, cloudCover: 10 },
  aurora: { temperatureC: 15, humidity: 60, windMps: 3, cloudCover: 25 },
  mist: { temperatureC: 25, humidity: 82, windMps: 1, cloudCover: 55 },
  shimmer: { temperatureC: 41, humidity: 14, windMps: 2, cloudCover: 0 },
  leaves: { temperatureC: 31, humidity: 74, windMps: 2, cloudCover: 30 },
} as const;
/** A fictional city's own weather, at its evening or afternoon hour. */
function moodEnv(
  previous: Environment,
  meta: (typeof FICTION_CITIES)[number],
): Environment {
  return {
    ...previous,
    ...MOOD_WEATHER[meta.ambient.particles],
    dateTime: atLocalHour(
      new Date().toISOString(),
      meta.timezone,
      meta.ambient.night ? 21 : 15,
    ),
    weatherMode: "scenario",
  };
}
/** Query parameters a shared walk link uses (lib/walk-links.ts). */
const WALK_LINK_PARAMS = [
  "fiction",
  "tour",
  "generate",
  "generated",
  "name",
  "area",
  "lat",
  "lon",
  "radius",
  "from",
  "to",
  "pref",
  "t",
  "tab",
];
/** "Play the day": from this hour to that, in steps this long and fast. */
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 20;
const DAY_STEP_HOURS = 0.25;
const DAY_STEP_MS = 220;
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
  const [arrivalFrom, setArrivalFrom] = useState<string | null>(null);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // ?tour=auto plays every step on its own, for judges and recordings.
  const [autoTour, setAutoTour] = useState(false);
  // The on-screen map controls drive the 3D camera through this.
  const cameraApi = useRef<MapCamera | null>(null);
  const [bearing, setBearing] = useState(0);
  // Points the camera frames instead of the walk (a planted street).
  const [focusOn, setFocusOn] = useState<Point[] | null>(null);
  // The tour's day plays itself; one planned by hand waits for Play.
  const [dayAutoPlay, setDayAutoPlay] = useState(false);
  // The route being walked at street level: a copy taken when the walk
  // starts, so recomputed routes (time slider, play the day) don't restart it.
  const [walk3d, setWalk3d] = useState<Point[] | null>(null);
  // A different area, or leaving the 3D view, ends the walk.
  const [walkFor, setWalkFor] = useState(world.id);
  if (walkFor !== world.id) {
    setWalkFor(world.id);
    setWalk3d(null);
  }
  const cityThisTurn = useRef(false);
  const genToken = useRef(0);
  const [genPrompt, setGenPrompt] = useState("");
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [dayBusy, setDayBusy] = useState(false);
  // A day planned for one area means nothing in the next.
  const [dayFor, setDayFor] = useState(world.id);
  if (dayFor !== world.id) {
    setDayFor(world.id);
    setDayPlan(null);
  }
  const weatherChip = useRef<HTMLButtonElement>(null);
  const weatherPop = useRef<HTMLDivElement>(null);
  // The weather popover takes focus when it opens, gives it back to the chip
  // when it closes, and closes on Escape only while focus is in it.
  useEffect(() => {
    if (!weatherOpen) return;
    weatherPop.current?.querySelector<HTMLElement>("button")?.focus();
    const chip = weatherChip.current;
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      const at = document.activeElement;
      if (weatherPop.current?.contains(at) || at === chip)
        setWeatherOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      chip?.focus();
    };
  }, [weatherOpen]);
  const captureRef = useRef<(() => string) | null>(null);
  const setCapture = useCallback((capture: (() => string) | null) => {
    captureRef.current = capture;
  }, []);
  /** The open fictional city, if any; it brings its own sky and weather. */
  const fiction = useMemo(
    () => FICTION_CITIES.find((c) => `fiction-${c.slug}` === world.id) ?? null,
    [world.id],
  );
  /** A city generated from a description, if that is what's open. */
  const generated = useMemo(
    () => (world.id.startsWith("ai-") ? findGenerated(world.id) : null),
    [world.id],
  );
  /** Whatever brings its own sky: a fictional or a generated city. */
  const themed = useMemo(
    () =>
      fiction
        ? { ambient: fiction.ambient, tagline: fiction.tagline }
        : generated
          ? {
              ambient: ambientFromSpec(generated.spec),
              tagline: generated.spec.tagline,
            }
          : null,
    [fiction, generated],
  );
  // Saving waits until the stored scene has been read back.
  const [hydrated, setHydrated] = useState(false);
  // Interface style (see lib/theme.ts); remembered in this browser.
  const [theme, setTheme] = useState<ThemeName>(loadTheme);
  // Before the workspace paints (no flash), and only while it's open: the
  // landing, login and loading screens keep their own look.
  useLayoutEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    return () => applyTheme("editorial");
  }, [theme]);
  // Set when the saved scene couldn't be read, so it is never overwritten.
  const saveBlocked = useRef(false);
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
  // °F or °C for every temperature shown; kept on this device.
  const [unit, setUnit] = useState<TempUnit>(loadUnit);
  const unitRef = useRef(unit);
  // The heat brief dialog, and the latest Compare walks result for it.
  const [brief, setBrief] = useState<{ title: string; text: string } | null>(
    null,
  );
  const [walkComparison, setWalkComparison] = useState<CoolWalkability | null>(
    null,
  );
  unitRef.current = unit;
  // How much this person avoids the sun; kept on this device.
  const [sunAversion, setSunAversion] = useState(() => {
    try {
      return clampSunAversion(
        Number(localStorage.getItem("walk-free-sun-aversion") ?? undefined),
      );
    } catch {
      return DEFAULT_SUN_AVERSION;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("walk-free-sun-aversion", String(sunAversion));
    } catch {
      /* Private windows can refuse storage; the setting still applies. */
    }
  }, [sunAversion]);
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
  /** Air quality and official alerts near the area; null until loaded. */
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  // The assistant reads the latest outlook when it is asked, not a stale one.
  const outlookRef = useRef(outlook);
  outlookRef.current = outlook;
  const [lat, lon] = [world.origin.lat, world.origin.lon];
  // Air quality and official alerts for the area shown, whatever the weather
  // mode, refreshed every 10 minutes. A new area (or undo to another one)
  // clears the old area's outlook first.
  useEffect(() => {
    if (atlas) return;
    let current = true;
    setOutlook(null);
    const refresh = () =>
      void loadOutlook(
        { lat, lon },
        { fetch: window.fetch.bind(window), apiBase: API_BASE },
      ).then((o) => {
        if (current) setOutlook(o);
      });
    refresh();
    const timer = window.setInterval(refresh, 10 * 60 * 1000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [lat, lon, atlas]);
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
      // On phones the guided tour's card covers the top of the map.
      const tour = phone
        ? main.querySelector(".demo-tour:not(.is-low)")?.getBoundingClientRect()
        : undefined;
      const next = phone
        ? // Above the sheet and the time-of-day card that sits on it.
          {
            left: 0,
            bottom: Math.max(0, m.bottom - a.top) + 110,
            top: tour ? Math.max(64, Math.round(tour.bottom - m.top) + 12) : 64,
          }
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
    // The sheet itself, so the end of its slide is measured too, and the
    // tour card, which grows and shrinks from step to step.
    observer.observe(aside);
    const tourCard = main.querySelector(".demo-tour");
    if (tourCard) observer.observe(tourCard);
    aside.addEventListener("transitionend", measure);
    measure();
    return () => {
      clearTimeout(settle);
      observer.disconnect();
      aside.removeEventListener("transitionend", measure);
    };
  }, [panelOpen, sheet, tourOpen, walk3d]);
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
  // Guests can ask the shared assistant when the site has a model key.
  const [guestAi, setGuestAi] = useState(false);
  const [chatModel, setChatModel] = useState<string>();
  useEffect(() => {
    if (!guest) return;
    let live = true;
    fetch(API_BASE + "/api/health")
      .then((r) => r.json())
      .then((h) => live && setGuestAi(h?.guestAi === true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [guest]);
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
        sunAversion,
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
      sunAversion,
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
  // What Meta's DINOv3 canopy crowns add to this walk's shade.
  const canopyPart = useMemo(
    () =>
      currentRoute ? canopyShare(world, routeEnv, currentRoute.edges) : null,
    [world, routeEnv, currentRoute],
  );
  // Hide the canopy crowns on the map to see the walk without them.
  const [hideCanopy, setHideCanopy] = useState(false);
  const withoutCanopy = useMemo(
    () =>
      hideCanopy
        ? {
            ...world,
            objects: world.objects.filter((o) => o.source !== "canopy"),
          }
        : null,
    [hideCanopy, world],
  );
  // Best hour to set off: computed when the browser is idle, and only when
  // the walk itself (not just its id) or the day's weather changes.
  const [bestTime, setBestTime] = useState<BestTimePlan | null>(null);
  const routeKey = currentRoute?.edges.map((e) => e.id).join(",") ?? "";
  const bestTimeDay = [
    new Date(env.dateTime).toLocaleDateString("en-CA", {
      timeZone: world.timezone,
    }),
    Math.floor(localHour(env.dateTime, world.timezone)),
    env.weatherMode,
    env.temperatureC,
    env.humidity,
    env.windMps,
    env.cloudCover,
    env.solarWm2,
  ].join("|");
  useEffect(() => {
    if (!currentRoute || mode !== "explore" || tab !== "route" || atlas) {
      setBestTime(null);
      return;
    }
    // The first rating of a new route takes a few hundred milliseconds, so
    // wait for an idle moment (repeat ratings reuse cached shade).
    const run = () =>
      setBestTime(bestTimeToLeave(world, env, currentRoute, forecast));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 120);
    return () => clearTimeout(timer);
    // routeKey and bestTimeDay stand in for the route and environment;
    // world changes too when canopy arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, bestTimeDay, world, forecast, mode, tab, atlas]);
  // Heat follows the slider a frame behind so dragging stays smooth.
  const heatEnv = useDeferredValue(env);
  const heatActive = !atlas && (heatMap || tab === "heat");
  const edgeHeat = useMemo(
    () => (heatActive ? edgeHeatMap(world, heatEnv) : null),
    [heatActive, world, heatEnv],
  );
  // The prebuilt area's landmarks, named on the 3D map (phones show fewer).
  const areaLabels = useMemo(() => {
    if (!world.provenance.live) return [];
    return placeLabels(
      world,
      prebuiltAreaFor(world.origin.lat, world.origin.lon, world.extent / 2)
        ?.labels,
    );
  }, [world]);
  // People on the streets: on by default where the city is the show.
  const [peopleFor, setPeopleFor] = useState<{ id: string; on: boolean }>({
    id: "",
    on: false,
  });
  // Phones and tablets start without them to spare the battery; the
  // toggle still turns them on.
  const [lowPowerDevice] = useState(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(max-width: 720px), (pointer: coarse)").matches,
  );
  const people =
    peopleFor.id === world.id
      ? peopleFor.on
      : !lowPowerDevice &&
        (world.id.startsWith("fiction-") || world.id.startsWith("ai-"));
  const edgeShade = useMemo(
    () =>
      edgeHeat
        ? new Map([...edgeHeat].map(([id, r]) => [id, r.shade]))
        : undefined,
    [edgeHeat],
  );
  const places = useMemo(
    () => (edgeHeat ? placeHeat(world, heatEnv, edgeHeat) : []),
    [edgeHeat, world, heatEnv],
  );
  // Suggested questions name this map's hottest street and a landmark.
  const assistantHints = useMemo(
    () => ({
      street: places.find(
        (p) =>
          p.kind === "street" &&
          /street|avenue|drive|road|lane|way|boulevard|speedway|mall/i.test(
            p.name,
          ),
      )?.name,
      place:
        areaLabels[1]?.text ??
        world.objects.find((o) => o.kind === "landmark" && o.name)?.name,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, world.id],
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
  // The day's weather at noon: hand-set weather follows the day's cycle, so
  // this stays put as the clock moves and the profile isn't recomputed.
  const profileEnv = scenarioAt(heatEnv, profileDay, world.timezone);
  // With a forecast each hour has its own weather, so the values shown for
  // the current hour don't matter to the profile; in a scenario they do.
  const profileWeather =
    heatEnv.weatherMode === "forecast" && forecast
      ? forecast
      : `${profileEnv.temperatureC.toFixed(2)},${profileEnv.humidity},${profileEnv.windMps},${profileEnv.cloudCover}`;
  // A fictional city's sky follows the sun: golden at dusk, dark at night.
  // Rounded so dragging the time slider doesn't redraw for every minute.
  const sunY = Math.round(sunDirection(env, world.origin).y * 60) / 60;
  const sky = useMemo(
    () => (themed ? skyAt(themed.ambient, sunY) : null),
    [themed, sunY],
  );
  const walking =
    walk3d !== null && !atlas && !(view === "2d" && mode === "explore");
  // The 3D map shows unless the flat walking map has replaced it.
  const flatMap = view === "2d" && mode === "explore";
  const show3dNav = !flatMap && !walking && !busy;
  // A one-time hint on how to move the 3D map, gone on first use.
  const [navTip, setNavTip] = useState(() => {
    try {
      return localStorage.getItem("walk-free-nav-tip") !== "seen";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!navTip) return;
    const done = () => {
      setNavTip(false);
      try {
        localStorage.setItem("walk-free-nav-tip", "seen");
      } catch {
        /* Private mode: the hint just shows again next time. */
      }
    };
    // Counted from when the map is ready, not from page load.
    if (busy) return;
    const timer = setTimeout(done, 9000);
    const onUse = (e: Event) => {
      if ((e.target as Element | null)?.tagName === "CANVAS") done();
    };
    window.addEventListener("pointerdown", onUse);
    window.addEventListener("wheel", onUse);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", onUse);
      window.removeEventListener("wheel", onUse);
    };
  }, [navTip, busy]);
  // On phones a street-level walk gets the screen: lower the sheet.
  useEffect(() => {
    if (walk3d && window.matchMedia("(max-width: 720px)").matches) setSheet(0);
  }, [walk3d]);
  // Switching to the flat walking map ends a street-level walk for good.
  useEffect(() => {
    if (view === "2d" && mode === "explore") setWalk3d(null);
  }, [view, mode]);
  // The fictional sky only shows behind the 3D scene.
  const onSky =
    themed && !atlas && !(view === "2d" && mode === "explore") ? themed : null;
  const mapCredit = atlas
    ? "© OpenFreeMap · OpenMapTiles · OpenStreetMap contributors"
    : world.provenance.live
      ? world.objects.some((o) => o.source === "canopy")
        ? "© OpenStreetMap contributors · Canopy © Meta & WRI"
        : "© OpenStreetMap contributors"
      : fiction
        ? "Fictional city · generated by Walk-Free"
        : generated
          ? `Generated city · ${generated.via === "ai" ? "planned by AI" : "offline designer"} · not a real place`
          : "Original design study";
  const heatProfile = useMemo(
    () =>
      heatPlace
        ? dailyProfile(
            world,
            profileEnv,
            heatPlace,
            heatEnv.weatherMode === "forecast" ? forecast : null,
          )
        : null,
    // Recompute per place and day, not on every slider move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heatPlace?.id, world, profileDay, profileWeather],
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
  /** Shade at each point of the route (as RouteResult.points), by edge. */
  const routeShade = useMemo(() => {
    if (!currentRoute || !edgeHeat) return undefined;
    return currentRoute.edges.flatMap((e, i) => {
      const shade = edgeHeat.get(baseEdgeId(e.id))?.shade ?? 0.5;
      return (i ? e.points.slice(1) : e.points).map(() => shade);
    });
  }, [currentRoute, edgeHeat]);
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
  /** Shade on the rest of the walk, for "shade in 80 m" nudges. */
  const ahead = useMemo(
    () =>
      currentRoute && edgeHeat
        ? sunAhead(currentRoute.edges, (id) => edgeHeat.get(id))
        : null,
    [currentRoute, edgeHeat],
  );
  function setLocalHour(hour: number, dayOffset = 0) {
    setEnv((previous) => {
      const day = new Date(
        Date.parse(previous.dateTime) + dayOffset * 24 * 60 * 60 * 1000,
      ).toISOString();
      const dateTime = atLocalHour(day, world.timezone, hour);
      // In forecast mode, temperature and cloud follow the chosen hour.
      // Otherwise hand-set weather follows the day's usual cycle.
      return previous.weatherMode === "forecast" && forecast
        ? weatherAt(previous, dateTime, forecast)
        : scenarioAt(
            { ...previous, weatherMode: "scenario" },
            dateTime,
            world.timezone,
          );
    });
  }
  // "Play the day": the sun sweeps from morning to evening.
  const [playing, setPlaying] = useState(false);
  const hourRef = useRef(0);
  const setLocalHourRef = useRef(setLocalHour);
  setLocalHourRef.current = setLocalHour;
  // A new walk or area goes back to framing the walk.
  useEffect(() => setFocusOn(null), [start, end, world.id]);
  useEffect(() => {
    if (mode === "explore") setFocusOn(null);
  }, [mode]);
  // A new area ends the day being played.
  useEffect(() => setPlaying(false), [world.id]);
  hourRef.current = localHour(env.dateTime, world.timezone);
  useEffect(() => {
    if (!playing) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const step = reduced ? 1 : DAY_STEP_HOURS;
    const timer = setInterval(
      () => {
        const next = Math.round((hourRef.current + step) / step) * step;
        if (next >= DAY_END_HOUR) setPlaying(false);
        // Through a ref: the latest time zone and forecast, not the ones
        // from when play began.
        setLocalHourRef.current(Math.min(next, DAY_END_HOUR));
      },
      reduced ? 800 : DAY_STEP_MS,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const [savedWalks, setSavedWalks] = useState<SavedWalk[]>(loadSavedWalks);
  const labelOf = (id: string) =>
    endpointCatalog.find((d) => d.id === id)?.label ?? "Mapped point";
  /** A link anyone can open (no account) to this walk at this hour. */
  async function shareWalk() {
    const area = prebuiltAreaFor(
      world.origin.lat,
      world.origin.lon,
      world.extent / 2,
    );
    const url = walkLinkUrl(window.location.origin, {
      ...(area
        ? { area: area.slug }
        : {
            lat: world.origin.lat,
            lon: world.origin.lon,
            radius: world.extent / 2,
          }),
      // A GPS start can't be shared; the chosen start can.
      from: start,
      to: end,
      pref,
      hour: Math.round(currentHour * 4) / 4,
    });
    const text = `A cooler walk on ${world.name}: ${labelOf(start)} to ${labelOf(end)}`;
    try {
      if (navigator.share)
        await navigator.share({ title: "Walk-Free", text, url });
      else {
        await navigator.clipboard.writeText(url);
        flash("Link copied. Anyone can open it, no account needed.");
      }
    } catch (e) {
      // Closing the share sheet isn't an error.
      if ((e as Error).name !== "AbortError")
        setMessage(`Couldn't share automatically. Copy this link: ${url}`);
    }
  }
  function saveCurrentWalk() {
    setSavedWalks(
      saveWalk({
        worldId: world.id,
        areaName: world.name,
        from: start,
        to: end,
        fromLabel: labelOf(start),
        toLabel: labelOf(end),
        pref,
      }),
    );
    flash("Walk saved. It's listed under Saved walks for this area.");
  }
  const areaWalks = savedWalks.filter((w) => w.worldId === world.id);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutsOn, setShortcutsOn] = useState(loadShortcutsOn);
  // Keyboard shortcuts (listed in components/Shortcuts.tsx).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shortcutsOn || ignoreShortcut(e)) return;
      if (e.key === "/") {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>(
            'input[aria-label="Search places, buildings or cities"]',
          )
          ?.focus();
      } else if (e.key === "?") setShowShortcuts(true);
      else if (e.key.toLowerCase() === "p" && !atlas) playDayRef.current();
      else if (e.key.toLowerCase() === "s") {
        const next =
          THEMES[
            (THEMES.findIndex((t) => t.name === theme) + 1) % THEMES.length
          ];
        setTheme(next.name);
        flash(`Style: ${next.label}`);
      } else if (e.key.toLowerCase() === "v" && !atlas && mode === "explore")
        setView((v) => (v === "3d" ? "2d" : "3d"));
      else if (e.key.toLowerCase() === "u") {
        const next = unit === "F" ? "C" : "F";
        setUnit(next);
        saveUnit(next);
        flash(`Temperatures in °${next}`);
      } else if (!atlas && !flatMap && cameraApi.current) {
        // The 3D map: zoom, back to the walk, tilt, north and pan.
        const cam = cameraApi.current;
        const pan: Record<string, [number, number]> = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        };
        if (e.key === "+" || e.key === "=") cam.zoom(0.62);
        else if (e.key === "-" || e.key === "_") cam.zoom(1.6);
        else if (e.key === "0") cam.reset();
        else if (e.key.toLowerCase() === "t") cam.tilt();
        else if (e.key.toLowerCase() === "n") cam.north();
        else if (
          pan[e.key] &&
          // Only when nothing else wants the arrows (tabs, sliders, lists).
          (document.activeElement === document.body ||
            document.activeElement?.tagName === "CANVAS")
        ) {
          e.preventDefault();
          cam.pan(...pan[e.key]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theme, atlas, mode, shortcutsOn, unit, view, flatMap]);
  const playDayRef = useRef(() => {});
  playDayRef.current = playDay;
  function playDay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    // Start at sunrise-ish when the day is over or not yet begun.
    if (currentHour < DAY_START_HOUR || currentHour >= DAY_END_HOUR)
      setLocalHour(DAY_START_HOUR);
    setPlaying(true);
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
    scene: world,
    env,
    forecast,
    sunAversion,
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
    // Hand-set weather follows the day's cycle, as with the time slider.
    setDateTime: (dateTime) =>
      setEnv((previous) => scenarioAt(previous, dateTime, world.timezone)),
    highlightPlace(id) {
      setHeatMap(true);
      setHeatPlaceId(id);
      setComparePlaceId(null);
    },
    async generateCity(description, realism) {
      // One generated city per question: each costs credits.
      if (cityThisTurn.current)
        return "A city was already generated for this question.";
      cityThisTurn.current = true;
      return planAndOpenCity(description, realism, true);
    },
    async buildArea(query) {
      // A fictional city opens at once, and stays in the conversation.
      // Only an exact name opens a fictional city ("Aurora" is a real city).
      const wanted = query.trim().toLowerCase();
      const fictional = matchFiction(query).filter(
        (c) => c.name.toLowerCase() === wanted,
      );
      if (fictional.length === 1 && openFiction(fictional[0].slug, true))
        return `Opened ${fictional[0].name}, a fictional city: ${fictional[0].mood} Its heat numbers are illustrations.`;
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
      // Show the street that was planted, not the whole area.
      const planted = new Set(result.edgeIds);
      const street = result.world.graph.edges
        .filter((e) => planted.has(e.id))
        .flatMap((e) => e.points);
      if (street.length) {
        // At least 250 m across, so a short street keeps its surroundings.
        const xs = street.map((p) => p[0]),
          zs = street.map((p) => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
          cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        setFocusOn([...street, [cx - 125, cz - 125], [cx + 125, cz + 125]]);
      }
      setPlanting((current) => ({
        street: result.street,
        edgeIds: result.edgeIds,
        planted: (current?.planted ?? 0) + result.planted,
      }));
      // Stay in the conversation; the studio holds the before/after card.
      flash(
        `Planted ${result.planted} shade trees along ${result.street}. ${
          mode === "studio"
            ? "The Heat impact card shows before and after."
            : "See Heat impact in Design studio."
        }`,
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
    cityThisTurn.current = false;
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
            ...outlookContext(
              activeOutlook(outlookRef.current),
              t.world.timezone,
            ),
            temperatureUnit: unitRef.current,
            canBuildAreas: true,
          };
        },
        () => toolHost.current,
        (url, body) =>
          api(
            guest && url === "/api/agent/chat" ? "/api/guest/chat" : url,
            body,
            guest ? {} : ownKeyHeaders(ownKey),
          ).then((answer) => {
            if (typeof answer?.model === "string") setChatModel(answer.model);
            return answer;
          }),
        (name) =>
          setChatStatus(
            {
              plan_route: "Planning routes…",
              best_time_to_leave: "Finding the coolest hour…",
              compare_walks: "Comparing walks…",
              heat_ranking: "Ranking heat…",
              place_heat: "Checking the heat…",
              build_area: "Building the area…",
              generate_city: "Planning and building your city…",
              propose_design: "Sketching a design…",
            }[name] ?? "Working…",
          ),
      );
      setChat(messages);
      if (speakReplies) speak(reply, speechLang(reply));
    } catch (e) {
      if (e instanceof PartialChatError) {
        // Tools already changed the map; keep that in the conversation.
        setChat(e.messages);
        setChatError(
          `${friendlyError(e)} Changes already made stay on the map; use Undo to remove them.`,
        );
      } else setChatError(friendlyError(e));
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
      .then(async (stored) => {
        if (!active || !stored) return;
        let parsed = worldSchema.safeParse(stored);
        // An old out-of-range edit shouldn't cost the whole scene.
        if (!parsed.success)
          parsed = worldSchema.safeParse(repairWorld(stored));
        if (!parsed.success) {
          // Set the unreadable copy aside before anything can save over it.
          saveBlocked.current = true;
          const keptAside = await saveProject(
            `${projectKey}:unreadable`,
            stored,
          ).then(
            () => true,
            () => false,
          );
          // Once it's safe, new work saves as usual (now and next time).
          saveBlocked.current = !keptAside;
          setMessage(
            keptAside
              ? "Your saved scene couldn't be opened, so a copy was kept aside and you're starting fresh. New changes save as usual."
              : "Your saved scene couldn't be opened, so this session won't save over it. Export your work to keep a copy.",
          );
          return;
        }
        const data = parsed.data;
        // Never replace an area the person built while this was loading.
        if (worldRef.current !== firstWorld.current) return;
        setWorld(data);
        // A saved fictional city comes back in its own weather and hour.
        const meta = FICTION_CITIES.find(
          (c) => `fiction-${c.slug}` === data.id,
        );
        if (meta) setEnv((previous) => moodEnv(previous, meta));
      })
      .catch(() => {
        // Reading failed: don't overwrite what might still be there.
        saveBlocked.current = true;
        setMessage(
          "Your saved scene couldn't be read, so this session won't save over it. Export your work to keep a copy.",
        );
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
    // Areas opened from here on get an arrival card; the scene already on
    // screen (the default study or a restored one) does not.
    setArrivalFrom(worldRef.current.id);
    const link = parseWalkLink(window.location.search);
    const params0 = new URLSearchParams(window.location.search);
    const fiction = new URLSearchParams(window.location.search).get("fiction");
    // A remembered place keeps its own name rather than "Shared walk".
    const placeName = new URLSearchParams(window.location.search)
      .get("name")
      ?.trim()
      .slice(0, 80);
    // Use the link once; reloading shouldn't replace the scene again.
    const params = new URLSearchParams(window.location.search);
    for (const key of WALK_LINK_PARAMS) params.delete(key);
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : ""),
    );
    const generatedId = params0.get("generated");
    const stored = generatedId ? findGenerated(generatedId) : null;
    if (stored) {
      openGenerated(stored.spec, stored.realism, stored.via, stored.prompt);
      return;
    }
    if (params0.has("tour")) {
      setAutoTour(params0.get("tour") === "auto");
      openTour();
    }
    if (params0.has("generate")) {
      setGenPrompt((params0.get("generate") ?? "").slice(0, 600));
      setGenOpen(true);
    }
    if (fiction && openFiction(fiction)) {
      if (link.tab) setTab(link.tab);
      return;
    }
    // A guest arriving at the plain demo starts on UT Austin, the most
    // complete campus, rather than the abstract design study.
    const fresh =
      guest &&
      !link.area &&
      link.lat === undefined &&
      !params0.has("generate") &&
      // Only when nothing was restored: a guest's own saved study stays.
      worldRef.current === firstWorld.current;
    const area = PREBUILT_AREAS.find(
      (a) => a.slug === (link.area ?? (fresh ? "ut-austin" : undefined)),
    );
    const city: City | null = area
      ? {
          id: area.slug,
          name: area.name.replace(/, [A-Z]{2}$/, ""),
          state: area.name.match(/, ([A-Z]{2})$/)?.[1] ?? "",
          lat: area.lat,
          lon: area.lon,
          timezone: "",
        }
      : link.lat !== undefined && link.lon !== undefined
        ? {
            id: "shared-walk",
            name: placeName || "Shared walk",
            state: "",
            lat: link.lat,
            lon: link.lon,
            timezone: "",
          }
        : null;
    if (!city) {
      // A link to a tab without an area, such as /app?tab=ask from home.
      if (link.tab) setTab(link.tab);
      return;
    }
    // A link to a place that doesn't exist says so, after the area that
    // opened instead has loaded (its own message would replace this one).
    const askedArea = params0.get("area");
    const missing =
      fiction && !FICTION_CITIES.some((c) => c.slug === fiction)
        ? `There's no invented city called "${fiction.slice(0, 40)}", so this opens ${area?.name ?? "the demo"}.`
        : askedArea && !PREBUILT_AREAS.some((a) => a.slug === askedArea)
          ? `"${askedArea.slice(0, 40)}" isn't one of the ready areas, so this opens ${area?.name ?? "the demo"}.`
          : "";
    void loadCity(city, true, area?.radius ?? link.radius ?? 800, link).then(
      (ok) => {
        if (ok && missing) flash(missing, 12000);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  // Keep live weather fresh while the tab is visible.
  useEffect(() => {
    if (env.weatherMode !== "forecast" || atlas) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void weather(world.origin, { quiet: true });
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.weatherMode, world.origin, atlas]);
  useEffect(() => {
    if (!hydrated || saveBlocked.current) return;
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
    // A different area makes any before/after planting comparison meaningless.
    // Read the scene now on screen, not the one this closure saw: a city
    // generated over a slow AI call must not undo past later changes.
    const current = worldRef.current;
    if (next.id !== current.id) clearHeatImpact();
    setHistory((h) => [...h.slice(-29), current]);
    setWorld(next);
  }
  function clearHeatImpact() {
    setHeatBaseline(null);
    setPlanting(null);
  }
  function updateObject(changes: Partial<SceneObject>) {
    edit({
      ...world,
      objects: world.objects.map((o) =>
        o.id === selected ? { ...o, ...changes } : o,
      ),
    });
  }
  /** Open one of the generated fictional cities, dressed for its mood. */
  function openFiction(slug: string, fromAssistant = false) {
    const meta = FICTION_CITIES.find((c) => c.slug === slug);
    const w = meta && createFictionCity(slug);
    if (!meta || !w) return false;
    // Any area still building is no longer wanted.
    ++buildRequest.current;
    setBusy("");
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
    if (!fromAssistant) setTab("route");
    setPicking(null);
    setTrees(true);
    setBuildings(true);
    setShowPaths(true);
    setForecast(null);
    setEnv((previous) => moodEnv(previous, meta));
    rememberPlace({ name: meta.name, href: `/app?fiction=${meta.slug}` });
    flash(
      `Welcome to ${meta.name}, a fictional city. ${meta.tagline} Shade and heat here are illustrations.`,
    );
    return true;
  }
  /** Plans the day here and shows it; null when the area can't. */
  function planDayNow() {
    const day = planDay(routeWorld, env, {
      avoidStairs: stairs,
      sunAversion,
      hints: prebuiltAreaFor(world.origin.lat, world.origin.lon, 1000)?.day,
    });
    setDayPlan(day);
    if (!day)
      flash(
        "This area has too few connected, named places to plan a day here.",
      );
    return day;
  }
  /**
   * Opens the panel for a tour step. On phones the sheet drops to a peek
   * for steps that happen on the map, and rises halfway for panel steps.
   */
  function tourPanel(level: 0 | 1) {
    setPanelOpen(true);
    if (window.matchMedia("(max-width: 720px)").matches) setSheet(level);
  }
  /** After the panel re-renders, scroll a section of it into view. */
  function revealInPanel(selector: string) {
    setTimeout(
      () =>
        asideRef.current
          ?.querySelector(selector)
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      350,
    );
  }
  function openTour() {
    setTourOpen(true);
    if (window.matchMedia("(max-width: 720px)").matches) setSheet(0);
  }
  /** The guided tour: each step explains a feature and does it. */
  const tourSteps: TourStep[] = [
    {
      title: "A July afternoon",
      text: `This is ${world.name.split(" · ")[0]}, mapped building by building with Meta and WRI's canopy map. Shade matters most in summer heat, so let's set a July afternoon.`,
      action: "Make it July, 3 PM",
      run: () => {
        setPlaying(false);
        setEnv((previous) => julyAfternoon(previous, world.timezone));
        setMode("explore");
        setTab("route");
        tourPanel(0);
      },
    },
    {
      title: "The shade route",
      text: "Red paths are in full sun, blue ones in shade. Compare Quickest with More shade: the same trip, with less sun for little or no extra time.",
      action: "Show the shade route",
      run: () => {
        setMode("explore");
        setTab("route");
        setPref("shade");
        setHeatMap(true);
        tourPanel(0);
      },
    },
    {
      title: "Walk it at street level",
      dwell: 16000,
      text: "Drop to street level and walk the shade route between the buildings, then come back up whenever you like.",
      action: "Walk it",
      run: () => {
        setMode("explore");
        setTab("route");
        setPlaying(false);
        tourPanel(0);
        if (currentRoute) setWalk3d(currentRoute.points);
        else flash("Choose a start and end first, then walk it.");
      },
    },
    {
      title: "The hottest streets",
      text: "Every street and park ranked by how it feels right now. Tap one to see its day: when it peaks, and how much shade it has.",
      action: "Rank the heat",
      run: () => {
        setMode("explore");
        setTab("heat");
        setHeatMap(true);
        tourPanel(1);
        revealInPanel(".place-list");
      },
    },
    {
      title: "A day in the life",
      dwell: 18000,
      text: "Coffee, class, lunch outside, an errand, home: each walk planned in shade at its own hour, played one after another.",
      action: "Plan and play my day",
      run: () => {
        setMode("explore");
        setTab("route");
        tourPanel(1);
        setDayAutoPlay(true);
        planDayNow();
      },
    },
    {
      title: "Plant trees, watch it cool",
      text: "Line the hottest street with shade trees and see shade and feels-like before and after, then turn it into a proposal.",
      action: "Plant the hottest street",
      run: async () => {
        // Plant for the afternoon peak, whatever hour the day step left.
        // The studio view also ends any day still playing on the Route tab.
        setPlaying(false);
        setDayAutoPlay(false);
        setMode("studio");
        tourPanel(1);
        setLocalHour(15);
        const afternoon = scenarioAt(
          heatEnv,
          atLocalHour(heatEnv.dateTime, world.timezone, 15),
          world.timezone,
        );
        // Let the assistant tools see the new hour before planting.
        await new Promise((r) => setTimeout(r, 60));
        const streets = placeHeat(world, afternoon).filter(
          (p) => p.kind === "street",
        );
        // Prefer a name that reads as a street ("Speedway", "24th Street").
        const hottest =
          streets.find((p) =>
            /street|avenue|drive|road|lane|way|boulevard|speedway|mall/i.test(
              p.name,
            ),
          ) ?? streets[0];
        if (!hottest) return;
        const result = (await runTool(
          toolHost.current,
          "plant_shade_trees",
          JSON.stringify({ street: hottest.name }),
        )) as { error?: string };
        if (result?.error) flash(result.error);
        else {
          setMode("studio");
          tourPanel(1);
          revealInPanel(".heat-impact");
        }
      },
    },
    {
      title: "Ask Walk-Free",
      text: "The assistant, built for Meta's Muse Spark, uses the same tools: it plans routes, ranks heat, moves the clock and plants trees, in your language. Press Watch what it does to see it work.",
      action: "Open the assistant",
      run: () => {
        setMode("explore");
        setTab("ask");
        tourPanel(1);
      },
    },
    {
      title: "Any city you can imagine",
      text: "Describe a city, real or imagined, and walk it a minute later, with weather you control.",
      action: "Generate a city",
      run: () => {
        setGenPrompt(CITY_IDEAS[0]);
        setGenOpen(true);
      },
    },
  ];
  /** Builds a generated city, opens it and drops you in the middle. */
  function openGenerated(
    spec: CitySpec,
    realism: Realism,
    via: "ai" | "offline",
    prompt: string,
    fromAssistant = false,
  ) {
    const w = buildCityFromSpec(spec, realism);
    rememberGenerated({
      id: w.id,
      spec,
      realism,
      via,
      prompt,
      createdAt: new Date().toISOString(),
    });
    ++buildRequest.current;
    setBusy("");
    edit(w);
    setAtlas(null);
    setSelected(null);
    // You start at the named corner nearest the middle of the city, heading
    // for one of its landmarks a short walk away.
    const point = new Map(w.graph.nodes.map((n) => [n.id, n.point]));
    const connected = new Set(w.graph.edges.flatMap((e) => [e.from, e.to]));
    const named = w.graph.nodes.filter((n) => n.name && connected.has(n.id));
    const centre =
      named.sort(
        (a, b) => Math.hypot(...a.point) - Math.hypot(...b.point),
      )[0] ?? nearestWalkNode(w, [0, 0], w.extent / 2);
    const from = centre?.id ?? defaultEndpoints(w)[0];
    const fromAt = point.get(from) ?? [0, 0];
    const landmarkNames = new Set(
      spec.landmarks.map((l) => l.name.toLowerCase()),
    );
    const catalog = destinationCatalog(w).filter((d) => d.id !== from);
    const near = (list: typeof catalog) =>
      list
        .map((d) => {
          const p = point.get(d.id) ?? [0, 0];
          return {
            d,
            gap: Math.abs(Math.hypot(p[0] - fromAt[0], p[1] - fromAt[1]) - 450),
          };
        })
        .sort((a, b) => a.gap - b.gap)[0]?.d.id;
    const to =
      near(
        catalog.filter((d) =>
          [...landmarkNames].some((n) => d.label.toLowerCase().includes(n)),
        ),
      ) ??
      near(catalog.filter((d) => d.keys.some((k) => k.place))) ??
      defaultEndpoints(w)[1];
    setStart(from);
    setEnd(to);
    setHypothetical(false);
    setMode("explore");
    if (!fromAssistant) setTab("route");
    setPicking(null);
    setTrees(true);
    setBuildings(true);
    setShowPaths(true);
    setForecast(null);
    setEnv((previous) => ({
      ...previous,
      ...spec.climate,
      dateTime: atLocalHour(
        new Date().toISOString(),
        w.timezone,
        spec.ambient.night ? 21 : 15,
      ),
      weatherMode: "scenario",
    }));
    rememberPlace({ name: spec.name, href: `/app?generated=${w.id}` });
    const buildingsCount = w.objects.filter((o) => o.kind !== "tree").length;
    flash(
      `Welcome to ${spec.name}: ${buildingsCount.toLocaleString()} buildings, ${w.graph.nodes.length.toLocaleString()} street corners, ${
        via === "ai" ? "planned by AI" : "designed from your words offline"
      }. Change the weather from the chip on the map.`,
    );
    return w;
  }
  /**
   * Plans a city with the AI when it can, or offline when it can't, then
   * opens it. Returns a one-line summary for the assistant.
   */
  async function planAndOpenCity(
    prompt: string,
    realism: Realism,
    fromAssistant = false,
  ) {
    // Anything opened meanwhile (or a closed dialog) makes this stale.
    const request = ++buildRequest.current;
    let spec: CitySpec | null = null;
    let note = "";
    if (!guest) {
      try {
        const data = await api(
          "/api/agent/city",
          { prompt, realism },
          ownKeyHeaders(ownKey),
        );
        spec = parseCitySpec(data.spec);
      } catch (e) {
        note = friendlyError(e, "The AI couldn't plan this city.");
      }
    }
    const via = spec ? "ai" : "offline";
    spec ??= specFromPrompt(prompt, realism);
    // Let the dialog paint its progress before the build runs.
    await new Promise((r) => setTimeout(r, 40));
    if (request !== buildRequest.current)
      return "The city wasn't opened: something else was opened meanwhile.";
    const w = openGenerated(spec, realism, via, prompt, fromAssistant);
    if (note && !fromAssistant)
      setMessage(
        `${note} Built it with the offline designer instead, from your words.`,
      );
    return `Generated ${spec.name} (${realism}, ${via === "ai" ? "planned by AI" : "offline designer"}${note ? `; the AI planner was unavailable: ${note}` : ""}): ${w.objects.filter((o) => o.kind !== "tree").length} buildings, ${w.graph.nodes.length} street corners. ${spec.tagline} The person now stands in the middle of the city with a first walk on the map.`;
  }
  async function generateCity(prompt: string, realism: Realism) {
    const token = ++genToken.current;
    await planAndOpenCity(prompt, realism);
    // A dialog closed or reopened meanwhile is left alone.
    if (token === genToken.current) setGenOpen(false);
  }
  async function loadCity(
    c: City,
    build = false,
    radius = 800,
    /** A shared walk to open in this area once it's built. */
    link?: WalkLink,
  ): Promise<boolean> {
    const request = ++buildRequest.current;
    // An invented city's weather (rain, snow, its own heat) is its own: a
    // real place starts from ordinary weather until live weather arrives.
    const fromInvented = /^(fiction-|ai-)/.test(worldRef.current.id);
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
      const shipped = prebuiltAreaFor(c.lat, c.lon, radius);
      rememberPlace({
        name: c.name,
        href: shipped
          ? `/app?area=${shipped.slug}`
          : `/app?lat=${c.lat.toFixed(5)}&lon=${c.lon.toFixed(5)}&radius=${radius}&name=${encodeURIComponent(
              c.name,
            ).replace(
              /[!'()*~]/g,
              (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
            )}`,
      });
      // Meta's canopy arrives after the map: add it in place (not as an
      // undoable edit) if the same area is still open.
      void canopy?.then((cells) => {
        const add = (current: World) =>
          current.id === w.id && !hasCanopy(current)
            ? addCanopy(current, cells)
            : current;
        setWorld(add);
        // Planting compares against this; give it the same trees.
        setHeatBaseline((before) => before && add(before));
      });
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
      // A shared walk's points win when they exist in this area.
      const has = (id?: string) =>
        !!id && w.graph.nodes.some((n) => n.id === id);
      setStart(has(link?.from) ? link!.from! : from);
      setEnd(has(link?.to) ? link!.to! : to);
      if (link?.pref) setPref(link.pref);
      setHypothetical(false);
      setMode("explore");
      setTab(link?.tab ?? "route");
      setPicking(null);
      setTrees(true);
      setBuildings(true);
      setShowPaths(true);
      const now = new Date().toISOString();
      // A guest demo after dark would show a night map where every route
      // looks the same; show this afternoon instead and say so.
      const afternoon =
        guest &&
        link?.hour === undefined &&
        sunDirection({ ...env, dateTime: now }, w.origin).altitude <
          DEMO_MIN_SUN_RAD;
      setEnv((previous) => ({
        ...previous,
        ...(fromInvented && {
          temperatureC: initial.temperatureC,
          humidity: initial.humidity,
          windMps: initial.windMps,
          cloudCover: initial.cloudCover,
        }),
        dateTime:
          link?.hour !== undefined
            ? atLocalHour(now, w.timezone, link.hour)
            : afternoon
              ? atLocalHour(now, w.timezone, 15)
              : now,
        weatherMode: "scenario",
      }));
      setForecast(null);
      void weather(w.origin, { quiet: true, request, reportFailure: true });
      flash(
        !(from && to)
          ? "This area has no public walking connections. Build a nearby area to plan a walk."
          : afternoon
            ? `It's dark at ${w.name.split(" · ")[0].replace(/, [A-Z]{2}$/, "")} right now, so this shows 3 PM, when shade matters. Move the clock to see now.`
            : "Your area is ready. Search a building or street, pick endpoints, or use your location to plan a walk.",
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
    {
      quiet = false,
      request = buildRequest.current,
      reportFailure = !quiet,
    }: { quiet?: boolean; request?: number; reportFailure?: boolean } = {},
  ) {
    const working = "Getting live weather…";
    if (!quiet) setBusy(working);
    try {
      const f = await loadWeather(origin, {
        fetch: window.fetch.bind(window),
        apiBase: API_BASE,
      });
      // Weather that arrives after another area was built is discarded.
      if (request !== buildRequest.current) return;
      setForecast(f);
      // Quiet refreshes keep the time the person (or assistant) chose;
      // asking for live weather jumps to now.
      setEnv((env) => liveConditions(env, f, quiet ? env.dateTime : undefined));
      if (!quiet)
        flash(`Live weather on · ${f.source}. Updates every 10 minutes.`);
    } catch (e) {
      // Background refreshes keep the last weather; a new area says so.
      if (reportFailure && request === buildRequest.current) {
        if (quiet)
          flash(
            "Live weather isn't available for this area right now, so heat uses the scenario values on the Climate tab.",
          );
        else setMessage(friendlyError(e));
      }
    } finally {
      // Only clear the spinner this call started.
      if (!quiet) setBusy((current) => (current === working ? "" : current));
    }
  }
  /** A short confirmation that clears itself; errors use setMessage. */
  function flash(text: string, ms = 6000) {
    setMessage(text);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(
      () => setMessage((current) => (current === text ? "" : current)),
      ms,
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
  /** Save the 3D view as a picture, with its sky and a small caption. */
  // The planted street as a photo, rendered by Meta's Muse Image.
  const [photoRender, setPhotoRender] = useState<PhotoRender | null>(null);
  async function renderPlantedPhoto() {
    const shot = captureRef.current?.();
    if (!shot) return;
    // A JPEG up to 1024 px wide keeps the request small.
    let before = shot;
    try {
      const img = new Image();
      img.src = shot;
      await img.decode();
      const k = Math.min(1, 1024 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d");
      if (ctx) {
        // The scene may be transparent behind a backdrop: give it a sky.
        ctx.fillStyle = sky?.sky[0] ?? "#e9ecdf";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        before = c.toDataURL("image/jpeg", 0.85);
      }
    } catch {
      /* Keep the full-size capture. */
    }
    const place = world.name.split(" · ")[0];
    const title = `${planting?.street ?? place}, planted`;
    if (guest) {
      setPhotoRender({
        before,
        title,
        note: "Rendering a photo uses Meta's Muse Image. Create a free account (or add your own Meta Model API key in AI settings) to see this street planted.",
      });
      return;
    }
    setPhotoRender({ before, title, busy: true });
    try {
      const data = (await api(
        "/api/agent/visualize",
        {
          image: before,
          place,
          ...(planting && planting.street !== "this path"
            ? { street: planting.street, trees: planting.planted }
            : {}),
        },
        ownKeyHeaders(ownKey),
      )) as { image: string };
      setPhotoRender((r) => r && { ...r, busy: false, after: data.image });
    } catch (e) {
      setPhotoRender(
        (r) =>
          r && {
            ...r,
            busy: false,
            note: friendlyError(e, "Muse Image couldn't render this view."),
          },
      );
    }
  }
  async function saveImage() {
    const shot = captureRef.current?.();
    if (!shot) return;
    try {
      const img = new Image();
      img.src = shot;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      if (themed) {
        const g = ctx.createLinearGradient(0, 0, 0, c.height);
        g.addColorStop(0, sky?.sky[0] ?? themed.ambient.sky[0]);
        g.addColorStop(0.62, sky?.sky[1] ?? themed.ambient.sky[1]);
        g.addColorStop(1, sky?.fog ?? themed.ambient.fog);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(img, 0, 0);
      const k = Math.max(1, c.width / 1200);
      let when = "";
      try {
        when = new Date(env.dateTime).toLocaleString("en-US", {
          timeZone: world.timezone || undefined,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      } catch {
        /* An unknown time zone just leaves the time out. */
      }
      const title = world.name.split(" · ")[0];
      const line = [title, when].filter(Boolean).join(" · ");
      ctx.font = `600 ${16 * k}px "DM Sans", system-ui, sans-serif`;
      const w = ctx.measureText(line).width + 32 * k;
      ctx.fillStyle = "rgba(23, 36, 27, 0.78)";
      ctx.fillRect(16 * k, c.height - 64 * k, w, 48 * k);
      ctx.fillStyle = "#f4f1e6";
      ctx.fillText(line, 32 * k, c.height - 34 * k);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `walk-free-${world.id.replace(/[^a-z0-9-]+/gi, "-")}.png`;
      a.click();
      flash("Saved a picture of this view.");
    } catch {
      setMessage("This view couldn't be saved as a picture. Try again.");
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
      // With each new turn, say when shade is close ahead.
      speak(text + spokenShadeHint(ahead));
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
    <UnitContext.Provider value={unit}>
      <div className="app">
        <header>
          <a className="brand" href={guest ? "/" : "/home"}>
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
                  <span className="long-label">Create free account</span>
                  <span className="short-label">Sign up</span>
                </a>
              </div>
            ) : (
              <div className="account-controls">
                <span title={account.email}>
                  {account.name || account.email}
                </span>
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
              className="icon-button unit-toggle"
              aria-label={`Show temperatures in ${unit === "F" ? "Celsius" : "Fahrenheit"}`}
              title="Temperature unit (U)"
              onClick={() => {
                const next = unit === "F" ? "C" : "F";
                setUnit(next);
                saveUnit(next);
              }}
            >
              °{unit}
            </button>
            <ThemePicker value={theme} onChange={setTheme} />
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
                flash(
                  start && start !== id
                    ? "Destination set. The walk keeps its start; change it under From."
                    : "Destination set. Choose where you're starting from.",
                );
              }}
              onCity={(c) =>
                void loadCity(c, !!prebuiltAreaFor(c.lat, c.lon, 1000), 1000)
              }
              onFiction={openFiction}
              onGenerate={(query) => {
                setGenPrompt(query);
                setGenOpen(true);
              }}
            />
            <button
              type="button"
              className="generate-entry"
              onClick={() => {
                setGenPrompt("");
                setGenOpen(true);
              }}
            >
              <Sparkles size={15} aria-hidden />
              <span>
                <strong>Generate a city</strong>
                <small>Describe any city, real or imagined, and walk it</small>
              </span>
            </button>
            <CityGenerator
              key={genOpen ? `open-${genPrompt}` : "closed"}
              open={genOpen}
              initialPrompt={genPrompt}
              onClose={() => {
                // Closing mid-generation abandons it: nothing opens later.
                ++buildRequest.current;
                ++genToken.current;
                setGenOpen(false);
              }}
              onGenerate={generateCity}
              free={guest}
              aiNote={
                guest
                  ? "You're exploring as a guest, so the offline designer builds this from your words, free. Sign in and the AI (Meta's Muse Spark, or your own key) plans districts, landmarks and street names in full."
                  : "The AI plans the districts, landmarks and street names (Meta's Muse Spark, or your own key from AI settings). If it can't, the offline designer builds it from your words instead."
              }
            />
            <PhotoRenderDialog
              render={photoRender}
              onClose={() => setPhotoRender(null)}
            />
            {fiction && !atlas && (
              <nav className="fiction-switch" aria-label="Fictional cities">
                {FICTION_CITIES.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    aria-current={c.slug === fiction.slug ? "true" : undefined}
                    title={c.tagline}
                    style={{
                      ["--sky-top" as string]: c.ambient.sky[0],
                      ["--sky-bottom" as string]: c.ambient.sky[1],
                      ["--accent" as string]: c.ambient.accent,
                    }}
                    onClick={() =>
                      c.slug !== fiction.slug && openFiction(c.slug)
                    }
                  >
                    <i aria-hidden />
                    {c.name}
                  </button>
                ))}
              </nav>
            )}
            {!atlas && (
              // The tabs inside take focus; per WAI-ARIA the list itself doesn't.
              // eslint-disable-next-line jsx-a11y/interactive-supports-focus
              <div
                className="tabs"
                role="tablist"
                aria-label="Panel sections"
                onKeyDown={(e) => {
                  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const tabs = [
                    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    ),
                  ];
                  const i = tabs.indexOf(e.target as HTMLButtonElement);
                  if (i < 0) return;
                  const next =
                    tabs[
                      (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                        tabs.length
                    ];
                  next.focus();
                  next.click();
                }}
              >
                {(mode === "explore"
                  ? ["route", "heat", "ask", "climate", "data"]
                  : ["build", "assistant", "data"]
                ).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    tabIndex={tab === t ? 0 : -1}
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
                  <OutlookNotice
                    outlook={outlook}
                    timeZone={world.timezone}
                    origin={world.origin}
                  />
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
                      disabled={
                        tracking || locating || !world.graph.edges.length
                      }
                      onClick={() => pickEndpoint("start")}
                    >
                      <MapPin size={13} /> Start on map
                    </button>
                    <button
                      className="chip"
                      aria-pressed={picking === "end"}
                      disabled={
                        tracking || locating || !world.graph.edges.length
                      }
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
                  {currentRoute && !(view === "2d" && mode === "explore") && (
                    <button
                      type="button"
                      className="walk-3d"
                      onClick={() => {
                        setPlaying(false);
                        setWalk3d(currentRoute.points);
                      }}
                    >
                      <Footprints size={15} aria-hidden /> Walk it at street
                      level
                    </button>
                  )}
                  {world.provenance.live && start && end && start !== end && (
                    <div className="walk-actions">
                      <button
                        className="text-button"
                        onClick={() => void shareWalk()}
                      >
                        <Share2 size={14} aria-hidden /> Share walk
                      </button>
                      <button className="text-button" onClick={saveCurrentWalk}>
                        <Bookmark size={14} aria-hidden /> Save walk
                      </button>
                    </div>
                  )}
                  {areaWalks.length > 0 && (
                    <div className="saved-walks">
                      <div className="field-label">SAVED WALKS</div>
                      <ul>
                        {areaWalks.map((w) => (
                          <li key={w.id}>
                            <button
                              onClick={() => {
                                location.reset();
                                setStart(w.from);
                                setEnd(w.to);
                                setPref(w.pref);
                              }}
                            >
                              <span>
                                {w.fromLabel.replace(/^Path near /, "")} →{" "}
                                {w.toLabel.replace(/^Path near /, "")}
                              </span>
                              <small>{routeLabels[w.pref]}</small>
                            </button>
                            <button
                              className="remove"
                              aria-label={`Remove saved walk ${w.fromLabel} to ${w.toLabel}`}
                              onClick={() =>
                                setSavedWalks(removeSavedWalk(w.id))
                              }
                            >
                              <X size={13} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
                  {!fiction &&
                    world.provenance.live &&
                    env.temperatureC < 29 && (
                      <button
                        type="button"
                        className="july-nudge"
                        onClick={() => {
                          setPlaying(false);
                          setEnv((previous) =>
                            julyAfternoon(previous, world.timezone),
                          );
                        }}
                      >
                        <Sun size={16} aria-hidden />
                        <span>
                          <strong>It&apos;s mild here right now.</strong> See
                          how this walk feels on a July afternoon
                        </span>
                        <ArrowUpRight size={15} aria-hidden />
                      </button>
                    )}
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
                          {Math.round(currentRoute.shadeFraction * 100)}%
                          modeled shade
                        </span>
                      </div>
                      {edgeHeat && (
                        <RouteProfile
                          route={currentRoute}
                          shadeOf={(id) => edgeHeat.get(baseEdgeId(id))?.shade}
                        />
                      )}
                      {canopyPart &&
                        canopyPart.with - canopyPart.without >= 0.01 && (
                          <div className="canopy-part">
                            <Trees size={15} aria-hidden />
                            <span>
                              With Meta&apos;s DINOv3 canopy, this walk is{" "}
                              <strong>
                                {Math.round(canopyPart.with * 100)}%
                              </strong>{" "}
                              shaded; without it,{" "}
                              {Math.round(canopyPart.without * 100)}%.
                            </span>
                            <button
                              className="text-button"
                              aria-pressed={hideCanopy}
                              onClick={() => setHideCanopy((v) => !v)}
                            >
                              {hideCanopy ? "Show its trees" : "Hide its trees"}
                            </button>
                          </div>
                        )}
                      <button
                        className="primary"
                        onClick={navigation}
                        disabled={
                          locating ||
                          (!tracking &&
                            (!world.provenance.live || hypothetical))
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
                  <BestTime
                    plan={bestTime}
                    onPick={(hour, dayOffset) => {
                      setPlaying(false);
                      setLocalHour(hour, dayOffset);
                    }}
                  />
                  <DayInLife
                    key={world.id}
                    plan={dayPlan}
                    busy={dayBusy}
                    autoPlay={dayAutoPlay}
                    onPlan={() => {
                      setDayAutoPlay(false);
                      setDayBusy(true);
                      // Let the button show its busy state before the work.
                      setTimeout(() => {
                        try {
                          planDayNow();
                        } finally {
                          setDayBusy(false);
                        }
                      }, 30);
                    }}
                    onShow={(leg) => {
                      // Played once; a later visit to this tab waits for Play.
                      setDayAutoPlay(false);
                      setPlaying(false);
                      setPicking(null);
                      setPref("shade");
                      setStart(leg.from.id);
                      setEnd(leg.to.id);
                      setLocalHour(leg.hour);
                    }}
                  />
                  <details className="route-options">
                    <summary>Route options</summary>
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
                      Plan through possible indoor shortcuts
                    </label>
                    <label>
                      LONGEST DETOUR · {Math.round((detour - 1) * 100)}% LONGER
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step=".1"
                        value={detour}
                        onChange={(e) => setDetour(+e.target.value)}
                      />
                    </label>
                    <label>
                      SUN AVERSION · {sunAversionLabel(sunAversion)}
                      <input
                        type="range"
                        min={SUN_AVERSION_RANGE[0]}
                        max={SUN_AVERSION_RANGE[1]}
                        step=".5"
                        value={sunAversion}
                        aria-valuetext={`${sunAversionLabel(sunAversion)}: a metre in the sun counts as ${sunAversion} metres in shade`}
                        title="How much longer a walk you'd take to stay out of the sun. Shapes the Shade route."
                        onChange={(e) => setSunAversion(+e.target.value)}
                      />
                    </label>
                  </details>
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
            {!atlas &&
              mode === "explore" &&
              tab === "ask" &&
              guest &&
              !guestAi && (
                <section className="guest-lock">
                  <div className="section-title">
                    <Sparkles size={17} /> Ask Walk-Free
                  </div>
                  <p>
                    Plan routes in plain words, ask why a street is hot, or
                    plant trees by asking. Create a free account to use the
                    assistant, or watch what it does on this map first.
                  </p>
                  <a className="primary" href="/signup">
                    Create free account <ArrowUpRight size={16} />
                  </a>
                  <AssistantDemo
                    host={() => toolHost.current}
                    area={world.id}
                  />
                </section>
              )}
            {!atlas &&
              mode === "explore" &&
              tab === "ask" &&
              (!guest || guestAi) && (
                <AssistantPanel
                  guest={guest}
                  model={chatModel}
                  hints={assistantHints}
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
              <HeatRiskWeek
                risk={outlook?.heatRisk}
                timeZone={world.timezone}
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
                <WeatherControls
                  env={env}
                  setEnv={setEnv}
                  world={world}
                  unit={unit}
                  onLive={() => void weather()}
                />
                <div className="probe-summary">
                  <div className="eyebrow">
                    Selected point · {probeLabel(probe)}
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
                      : `Shade heat index ≈ ${formatTemp(heatIndexC(env.temperatureC, env.humidity)!, unit)}`}
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
                        forecast.hours.findIndex(
                          (h) => h.time === env.dateTime,
                        ),
                      )}
                      placeholder="Choose an hour"
                      options={forecast.hours.map((h, i) => ({
                        value: String(i),
                        label: new Date(h.time).toLocaleString("en-US", {
                          timeZone: world.timezone,
                          weekday: "short",
                          hour: "numeric",
                        }),
                        detail: `${formatTemp(h.temperatureC, unit)} · ${h.description || "forecast"}`,
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
                    area={world.name}
                    date={heatEnv.dateTime}
                    timeZone={world.timezone}
                    sunUp={sunDirection(heatEnv, world.origin).y > 0}
                    canopy={world.objects.some((o) => o.source === "canopy")}
                    liveWeather={heatEnv.weatherMode === "forecast"}
                    onRenderPhoto={() => void renderPlantedPhoto()}
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
                    // It replaces the whole map, which is easy to hit by
                    // mistake in the middle of a demo.
                    if (
                      world.objects.length > 0 &&
                      !window.confirm(
                        `Clear ${world.name.split(" · ")[0]} and start an empty landscape? Undo brings it back.`,
                      )
                    )
                      return;
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
                  Choose an asset, then click the ground to place it. Shade
                  trees: click a path to line its whole street and see the heat
                  drop. Drag to orbit; right-drag to pan; scroll to zoom.
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
                            max={k === "rotation" ? 360 : 1500}
                            value={object[k]}
                            onChange={(e) => {
                              // Clamp to what a saved scene allows; ignore "-".
                              const value = clampObjectField(
                                k,
                                e.target.valueAsNumber,
                              );
                              if (value !== null) updateObject({ [k]: value });
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
                            const value = e.target.valueAsNumber;
                            if (!Number.isFinite(value)) return;
                            const p: Point = [...object.position];
                            p[i] = Math.max(
                              -world.extent / 2,
                              Math.min(world.extent / 2, value),
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
                  Describe a place and the assistant drafts it for you to
                  preview. Create a free account to use it.
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
                      {proposal.removeIds?.length || 0} removals · preview on
                      map
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
                <DataLayers
                  world={world}
                  env={env}
                  forecast={forecast}
                  outlook={outlook}
                />
                <button
                  className="secondary heat-csv"
                  onClick={() => {
                    // Every street and park at the hour shown, for planners.
                    const csv = streetHeatCsv(placeHeat(world, heatEnv), {
                      area: world.name,
                      at: clockLabel(heatEnv.dateTime, world.timezone),
                    });
                    const url = URL.createObjectURL(
                      new Blob([csv], { type: "text/csv;charset=utf-8" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${world.name.replace(/[^\w-]+/g, "-").toLowerCase()}-street-heat.csv`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={15} aria-hidden /> Download street heat (CSV)
                </button>
                <button
                  className="secondary heat-csv"
                  onClick={() => {
                    const trees = world.objects.filter(
                      (o) => o.kind === "tree",
                    );
                    const canopy = trees.filter(
                      (o) => o.source === "canopy",
                    ).length;
                    setBrief(
                      heatBrief({
                        area: world.name,
                        at: clockLabel(heatEnv.dateTime, world.timezone),
                        places: placeHeat(world, heatEnv),
                        trees: { mapped: trees.length - canopy, canopy },
                        walks: walkComparison ?? undefined,
                        unit,
                      }),
                    );
                  }}
                >
                  <FileText size={15} aria-hidden /> Write a heat brief
                </button>
                <ProposalDialog
                  proposal={brief}
                  onClose={() => setBrief(null)}
                />
                <CoolWalkCard
                  onResult={setWalkComparison}
                  world={world}
                  env={routeEnv}
                  sunAversion={sunAversion}
                  timeLabel={clockLabel(routeEnv.dateTime, world.timezone)}
                />
                <p>{world.provenance.source}</p>
                <p className="fine">{world.provenance.attribution}</p>
                {world.provenance.notes.map((n) => (
                  <p className="fine" key={n}>
                    {plainCounts(n)}
                  </p>
                ))}
                <div className="data-counts">
                  <span>
                    {world.objects.length.toLocaleString("en-US")} objects
                  </span>
                  <span>
                    {world.graph.edges.length.toLocaleString("en-US")} walking
                    links
                  </span>
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
              <button
                className="text-button footer-shortcuts"
                onClick={() => setShowShortcuts(true)}
              >
                Keyboard shortcuts
              </button>
            </footer>
          </aside>
          <div
            className={`viewport${picking ? " picking-route" : ""}${atlas ? " atlas-mode" : ""}`}
          >
            {atlas ? (
              <Suspense
                fallback={
                  <div className="loading">Loading the city atlas…</div>
                }
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
                theme={theme}
              />
            ) : (
              <>
                {themed && (
                  <AmbientBackdrop
                    ambient={sky ?? themed.ambient}
                    layer="sky"
                  />
                )}
                <WorldCanvas
                  key={world.id}
                  world={
                    proposal
                      ? applyDesignProposal(world, proposal)
                      : withoutCanopy && canopyPart
                        ? withoutCanopy
                        : world
                  }
                  environment={env}
                  selectedId={selected}
                  onSelect={setSelected}
                  onGroundClick={ground}
                  route={mode === "explore" ? currentRoute : null}
                  startPoint={mode === "explore" ? startNode?.point : undefined}
                  endPoint={mode === "explore" ? endNode?.point : undefined}
                  focusOn={focusOn?.length ? focusOn : undefined}
                  cameraApi={cameraApi}
                  onBearing={setBearing}
                  routeShade={routeShade}
                  pickingEndpoint={!!picking}
                  showWalkingPaths={showPaths && mode === "explore"}
                  locationPoint={userPosition || undefined}
                  showTrees={trees}
                  showBuildings={buildings}
                  heat={heatOverlay}
                  insets={mapInsets}
                  theme={theme}
                  ambient={sky}
                  walkthrough={walking ? walk3d : null}
                  labels={mode === "explore" ? areaLabels : undefined}
                  onWalkthroughDone={() => setWalk3d(null)}
                  crowd={
                    people
                      ? {
                          count: world.extent > 1300 ? 220 : 160,
                          shade: edgeShade,
                          hot: heatEnv.temperatureC >= 28,
                        }
                      : null
                  }
                  onCaptureReady={setCapture}
                  onHeatSelect={
                    mode === "explore" || tool === "shaderow"
                      ? selectHeatEdge
                      : undefined
                  }
                />
                {themed && (
                  <AmbientBackdrop
                    ambient={sky ?? themed.ambient}
                    layer="weather"
                  />
                )}
                {/* Arriving somewhere: its name, centre stage, then gone. */}
                {arrivalFrom !== null && world.id !== arrivalFrom && (
                  <div
                    key={`arrival-${world.id}`}
                    style={{ marginLeft: mapInsets.left / 2 }}
                    className={`arrival${
                      (themed && sky ? isDarkSky(sky.sky[0]) : sunY < -0.02)
                        ? " on-dark"
                        : ""
                    }`}
                    aria-hidden
                  >
                    <small>
                      {fiction
                        ? "A fictional city"
                        : generated
                          ? generated.via === "ai"
                            ? "A city planned by AI"
                            : "A city from your words"
                          : world.provenance.live
                            ? "Mapped from OpenStreetMap"
                            : "The Walk-Free atlas"}
                    </small>
                    <strong>{world.name.split(" · ")[0]}</strong>
                    {themed && <span>{themed.tagline}</span>}
                  </div>
                )}
              </>
            )}
            {walking && (
              <button
                type="button"
                className="walk-3d-stop"
                // Centred on the visible map, beside the panel.
                style={{ marginLeft: mapInsets.left / 2 }}
                onClick={() => setWalk3d(null)}
              >
                <X size={15} aria-hidden /> Stop walking
              </button>
            )}
            {!atlas &&
              (tourOpen ? (
                <DemoTour
                  steps={tourSteps}
                  waiting={!!busy}
                  low={walking}
                  autoPlay={autoTour}
                  left={mapInsets.left}
                  onClose={() => setTourOpen(false)}
                />
              ) : (
                world.provenance.live &&
                prebuiltAreaFor(world.origin.lat, world.origin.lon, 1000) && (
                  <button
                    type="button"
                    className="tour-launch"
                    style={{ left: mapInsets.left + 16 }}
                    onClick={openTour}
                  >
                    <Play size={14} aria-hidden /> Take the 1-minute tour
                  </button>
                )
              ))}
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
                    ` · next stretch ~${formatTemp(nextStretch.feelsC, unit)}, ${Math.round(nextStretch.shade * 100)}% shade`}
                </span>
                {ahead && (
                  <span className="walk-shade">
                    {ahead.inShade
                      ? `In shade for ${ahead.shadeForM} m`
                      : ahead.shadeInM !== null
                        ? `Shade in ${ahead.shadeInM} m`
                        : "No shade ahead: keep to the shady side"}
                    {ahead.sunMinutesLeft > 0 &&
                      ` · ${ahead.sunMinutesLeft} min in sun left`}
                  </span>
                )}
              </div>
            )}
            {picking && (
              <div className="pick-banner" role="status">
                <span>
                  Pick your {picking === "start" ? "start" : "destination"} near
                  a path junction · snaps within 40 m
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
              className={`map-heading${
                onSky
                  ? isDarkSky((sky ?? onSky.ambient).sky[0])
                    ? " on-sky on-dark"
                    : " on-sky"
                  : // Real maps darken after sunset too.
                    !fiction &&
                      !atlas &&
                      !(view === "2d" && mode === "explore") &&
                      sunY < -0.02
                    ? " on-dark"
                    : ""
              }`}
              hidden={
                panelOpen ||
                (!atlas &&
                  view === "2d" &&
                  mode === "explore" &&
                  !!currentRoute)
              }
            >
              <div className="eyebrow">
                {atlas
                  ? "CITY ATLAS"
                  : fiction
                    ? "A FICTIONAL CITY"
                    : generated
                      ? "A GENERATED CITY"
                      : world.provenance.live
                        ? "MAPPED NEIGHBORHOOD"
                        : "THE WALK-FREE ATLAS / 001"}
              </div>
              <h2>{atlas ? atlas.name : world.name.split(" · ")[0]}</h2>
              <span>
                {atlas
                  ? "City atlas · OpenFreeMap / OpenStreetMap"
                  : themed
                    ? themed.tagline
                    : world.provenance.live
                      ? "OpenStreetMap · " +
                        (world.extent / 1000).toFixed(1) +
                        " km detail area"
                      : "An editable, fictional urban design study"}
              </span>
            </div>
            {!atlas && (
              <button
                type="button"
                ref={weatherChip}
                className="weather-chip"
                aria-expanded={weatherOpen}
                aria-controls={weatherOpen ? "weather-pop" : undefined}
                title="Change the weather"
                onClick={() => setWeatherOpen((open) => !open)}
              >
                {env.cloudCover >= 70 && env.humidity >= 85 ? (
                  <CloudRain size={23} aria-hidden />
                ) : env.cloudCover >= 70 ? (
                  <Cloud size={23} aria-hidden />
                ) : sunDirection(env, world.origin).y <= 0 ? (
                  <Moon size={23} aria-hidden />
                ) : (
                  <Sun size={23} aria-hidden />
                )}
                <strong>
                  {Math.round(inUnit(env.temperatureC, unit))}°
                  <small>{unit}</small>
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
                  {outlook?.air && (
                    <small
                      className={`uv-badge ${outlook.air.level >= 2 ? "high" : ""}`}
                      title={`Area air quality (US AQI) from Open-Meteo · PM2.5 ${outlook.air.pm25 ?? "n/a"} µg/m³`}
                    >
                      AQI {outlook.air.usAqi} · {outlook.air.category}
                    </small>
                  )}
                  {outlook?.heatRisk && outlook.heatRisk.today >= 1 && (
                    <small
                      className={`uv-badge ${outlook.heatRisk.today >= 2 ? "high" : ""}`}
                      title="National Weather Service HeatRisk for today (experimental, 0-4)"
                    >
                      HeatRisk {outlook.heatRisk.today} ·{" "}
                      {HEAT_RISK_LEVELS[outlook.heatRisk.today].label}
                    </small>
                  )}
                </div>
              </button>
            )}
            {!atlas && weatherOpen && (
              <div
                id="weather-pop"
                ref={weatherPop}
                className="weather-pop"
                role="dialog"
                aria-label="Weather"
              >
                <div className="weather-pop-head">
                  <strong>Weather</strong>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close weather"
                    onClick={() => setWeatherOpen(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <WeatherControls
                  env={env}
                  setEnv={setEnv}
                  world={world}
                  unit={unit}
                  onLive={() => void weather()}
                  compact
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setWeatherOpen(false);
                    setTab("climate");
                    setPanelOpen(true);
                  }}
                >
                  More weather settings
                </button>
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
                      // The planting totals no longer describe the scene.
                      clearHeatImpact();
                      setWorld(history.at(-1)!);
                      setHistory(history.slice(0, -1));
                    }}
                  >
                    <Undo2 size={19} />
                  </button>
                  <button
                    title={people ? "Hide people" : "Show people walking"}
                    aria-label={people ? "Hide people" : "Show people walking"}
                    aria-pressed={people}
                    className={!people ? "muted" : ""}
                    onClick={() => setPeopleFor({ id: world.id, on: !people })}
                  >
                    <Users size={19} />
                  </button>
                  <button
                    title={trees ? "Hide trees" : "Show trees"}
                    aria-label="Show trees"
                    aria-pressed={trees}
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
                      onClick={() => {
                        // On phones the flat map needs the room the sheet takes.
                        if (
                          view === "3d" &&
                          window.matchMedia("(max-width: 720px)").matches
                        )
                          setSheet(0);
                        setView(view === "3d" ? "2d" : "3d");
                      }}
                    >
                      {view === "3d" ? (
                        <MapIcon size={19} />
                      ) : (
                        <Box size={19} />
                      )}
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
                    title={buildings ? "Hide buildings" : "Show buildings"}
                    aria-label="Show buildings"
                    aria-pressed={buildings}
                    onClick={() => setBuildings(!buildings)}
                  >
                    <Building2 size={19} />
                  </button>
                  {!(view === "2d" && mode === "explore") && (
                    <button
                      title="Save a picture of this view"
                      aria-label="Save a picture of this view"
                      onClick={() => void saveImage()}
                    >
                      <Camera size={19} />
                    </button>
                  )}
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
                {show3dNav &&
                  heatOverlay &&
                  mode === "explore" &&
                  !tourOpen &&
                  edgeHeat && (
                    <div className="map-legend" aria-hidden>
                      <span>
                        <i
                          style={{
                            background: `linear-gradient(90deg, ${heatRamp(
                              edgeHeat.values().next().value ?? {
                                sunFeelsC: 40,
                              },
                            ).join(", ")})`,
                          }}
                        />
                        Paths: shaded → full sun
                      </span>
                      {currentRoute && (
                        <span>
                          <i className="map-legend-route" />
                          Your walk: in shade → in sun
                        </span>
                      )}
                    </div>
                  )}
                {show3dNav && navTip && !tourOpen && (
                  <p className="map-nav-tip" role="note">
                    {window.matchMedia("(pointer: coarse)").matches
                      ? "Drag to move · pinch to zoom · two fingers to turn"
                      : "Drag to move · right-drag to turn · scroll to zoom"}
                  </p>
                )}
                {show3dNav && (
                  <div
                    className="map-nav"
                    role="group"
                    aria-label="Map view controls"
                  >
                    <button
                      type="button"
                      title="Zoom in (+)"
                      aria-label="Zoom in"
                      onClick={() => cameraApi.current?.zoom(0.62)}
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      type="button"
                      title="Zoom out (−)"
                      aria-label="Zoom out"
                      onClick={() => cameraApi.current?.zoom(1.6)}
                    >
                      <Minus size={18} />
                    </button>
                    <button
                      type="button"
                      title="Back to the walk (0)"
                      aria-label="Back to the walk"
                      onClick={() => cameraApi.current?.reset()}
                    >
                      <Crosshair size={17} />
                    </button>
                    <button
                      type="button"
                      title="Tilt: look straight down or at an angle (T)"
                      aria-label="Tilt the view"
                      onClick={() => cameraApi.current?.tilt()}
                    >
                      <Rotate3d size={17} />
                    </button>
                    <button
                      type="button"
                      className="map-nav-compass"
                      title="Face north (N)"
                      aria-label={`Facing ${compassWord(bearing)}. Face north`}
                      onClick={() => cameraApi.current?.north()}
                    >
                      <Compass
                        size={22}
                        strokeWidth={1.4}
                        style={{ transform: `rotate(${-bearing - 45}deg)` }}
                      />
                      <small>N</small>
                    </button>
                  </div>
                )}
              </>
            )}
            {!atlas && (
              <div
                className={`timeline${walking ? " is-walking" : ""}${
                  tourOpen && sheet === 1 ? " is-tucked" : ""
                }`}
              >
                <div>
                  <Sun size={18} />
                  <strong>Time of day</strong>
                  <button
                    className="play-day"
                    aria-pressed={playing}
                    aria-label={playing ? "Pause the day" : "Play the day"}
                    title={`${playing ? "Pause" : "Play"} the day (P)`}
                    onClick={playDay}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                    {playing ? "Pause" : "Play the day"}
                  </button>
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
                  aria-valuetext={clock(currentHour)}
                  type="range"
                  min="0"
                  max="23.75"
                  step=".25"
                  value={currentHour}
                  onChange={(e) => {
                    setPlaying(false);
                    setLocalHour(+e.target.value);
                  }}
                />
                {bestTime && bestTime.dayOffset === 0 && (
                  <div
                    className="timeline-heat"
                    title="How this walk feels at each hour; the mark is the coolest time still ahead"
                    aria-hidden
                  >
                    {bestTime.hours.map((h) => (
                      <i
                        key={h.hour}
                        style={{
                          left: `${(h.hour / 23.75) * 100}%`,
                          width: `${100 / 23.75}%`,
                          background:
                            HEAT_LEVELS[heatLevel(h.feelsLikeC)].color,
                        }}
                      />
                    ))}
                    <b
                      style={{
                        left: `${((bestTime.best.hour + 0.5) / 23.75) * 100}%`,
                      }}
                    />
                  </div>
                )}
                <div className="timeline-labels">
                  {[0, 6, 12, 18, 23.75].map((h) => (
                    <span key={h}>{h === 12 ? "Noon" : clock(h)}</span>
                  ))}
                </div>
                {/* On phones the map credit lives here, clear of the sheet. */}
                <small className="timeline-credit">{mapCredit}</small>
              </div>
            )}
            <div className={`map-credit${atlas ? "" : " has-timeline"}`}>
              {mapCredit}
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
        <Shortcuts
          open={showShortcuts}
          onClose={() => setShowShortcuts(false)}
          enabled={shortcutsOn}
          onEnabled={setShortcutsOn}
        />
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
    </UnitContext.Provider>
  );
}
