import type { Point, WorldIndoor } from "../../../shared/types.js";

/**
 * The inside of a building, in the map's local metres: rooms as outlines,
 * corridors as walkable centre lines, on one or more levels.
 */
export interface IndoorRoom {
  name: string;
  /** Outline, local metres. */
  ring: Point[];
  kind: "room" | "corridor" | "stairs" | "elevator" | "restroom" | "other";
}

export interface IndoorLevel {
  /** 0 is the ground floor; negative below ground. */
  ordinal: number;
  name: string;
  rooms: IndoorRoom[];
  /** Walkable centre lines through corridors and open areas. */
  paths: Point[][];
  /** Doorways and openings, where rooms meet corridors. */
  doors: Point[];
  /** Ways in from outside, where known. */
  entrances?: Point[];
  /** Placed by hand from a plan image (kept whole, never clipped). */
  placed?: boolean;
}

/** Same shape as the world's stored interiors. */
export type IndoorMapStored = WorldIndoor;
export interface IndoorMap {
  /** The building (scene object) this is the inside of. */
  buildingId: string;
  buildingName: string;
  levels: IndoorLevel[];
  /** Where it came from: "IMDF", "OpenStreetMap indoor", "GeoJSON" or "floor plan image". */
  source: string;
  /** Opening hours, OSM opening_hours syntax, when known. */
  hours?: string;
}

/** Storey height used to stack levels in 3D, metres. */
export const LEVEL_HEIGHT_M = 4;
