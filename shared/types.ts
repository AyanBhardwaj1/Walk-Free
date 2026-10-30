/** Local scene coordinates are meters: +x east, +z south, y elevation. */
export type Point = [number, number];
export type ObjectKind =
  "building" | "skyscraper" | "tower" | "landmark" | "tree";
export type SourceKind = "osm" | "canopy" | "user" | "ai" | "study";
export interface SceneObject {
  id: string;
  kind: ObjectKind;
  name: string;
  position: Point;
  width: number;
  depth: number;
  height: number;
  rotation: number; // degrees clockwise as seen from above
  color?: string;
  footprint?: Point[]; // offsets from position, meters
  source: SourceKind;
  sourceId?: string;
  heightMethod: "mapped" | "levels" | "estimated" | "designed";
  /** Other names: OSM ref, short_name, alt_name and similar. */
  aliases?: string[];
}
export interface SceneRoad {
  id: string;
  name: string;
  points: Point[];
  width: number;
  kind: "road" | "footway" | "cycleway";
  source: SourceKind;
}
export interface Landscape {
  id: string;
  kind: "park" | "water";
  name: string;
  points: Point[];
}
export interface GraphNode {
  id: string;
  point: Point;
  name?: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  points: Point[];
  name: string;
  distance: number;
  covered: boolean;
  scenic: number;
  indoor: "no" | "verified" | "hypothetical";
  stairs: boolean;
  accessible: boolean;
  bidirectional: boolean;
  /** Street lighting from OSM `lit`; absent when unmapped. */
  lit?: boolean;
  /** Broad street type, used to prefer busier, lit streets after dark. */
  roadClass?: "major" | "street" | "service" | "path";
}
export interface WalkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Terrain {
  size: number;
  resolution: number;
  heights: number[];
}
export interface World {
  id: string;
  name: string;
  origin: { lat: number; lon: number };
  timezone: string;
  extent: number;
  objects: SceneObject[];
  roads: SceneRoad[];
  landscapes: Landscape[];
  graph: WalkGraph;
  terrain?: Terrain;
  provenance: {
    source: string;
    attribution: string;
    retrievedAt: string;
    live: boolean;
    notes: string[];
  };
}
export interface City {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  timezone: string;
  population?: number;
}
export interface WeatherHour {
  time: string;
  temperatureC: number;
  humidity: number | null;
  windMps: number;
  cloudCover: number | null;
  description: string;
  /** Measured sunlight on the ground, W/m² (Open-Meteo only). */
  solarWm2?: number | null;
  /** UV index (Open-Meteo only). */
  uvIndex?: number | null;
}
export interface WeatherForecast {
  source: string;
  fetchedAt: string;
  hours: WeatherHour[];
  attribution: string;
  /** Latest observed-model conditions, when the provider reports them. */
  current?: WeatherHour;
}
export interface Environment {
  dateTime: string;
  temperatureC: number;
  humidity: number;
  windMps: number;
  cloudCover: number;
  weatherMode: "forecast" | "scenario";
  /** Live sunlight on the ground, W/m²; used instead of cloud cover. */
  solarWm2?: number;
  uvIndex?: number;
}
export type RoutePreference =
  "quickest" | "shade" | "scenic" | "indoors" | "stepfree" | "night";
export interface RouteOptions {
  preference: RoutePreference;
  avoidStairs: boolean;
  allowHypothetical: boolean;
  maxDetour: number;
  environment: Environment;
  /** Air-conditioned buildings (by nearest path node) the walk may pass through. */
  coolStops?: { nodeId: string; name: string }[];
}
export interface RouteResult {
  id: string;
  preference: RoutePreference;
  points: Point[];
  edges: GraphEdge[];
  distance: number;
  durationMinutes: number;
  shadeFraction: number;
  indoorFraction: number;
  hypothetical: boolean;
  directions: { text: string; distance: number; point: Point }[];
  warnings: string[];
  /** Name of the cool stop the route passes through, when there is one. */
  coolStop?: string;
}
export type EditorTool =
  "select" | ObjectKind | "road" | "footway" | "raise" | "lower" | "flatten";
export type SceneEdit =
  | { type: "add"; object: SceneObject }
  | {
      type: "update";
      id: string;
      changes: Partial<
        Pick<
          SceneObject,
          | "name"
          | "position"
          | "width"
          | "depth"
          | "height"
          | "rotation"
          | "color"
        >
      >;
    }
  | { type: "remove"; id: string }
  | { type: "road"; road: SceneRoad };
export interface AgentProposal {
  summary: string;
  edits: SceneEdit[];
}
