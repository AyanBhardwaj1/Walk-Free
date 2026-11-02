/**
 * An offline stand-in for the AI planner: a varied, convincing CitySpec
 * from free text by keyword matching, the same every time for the same
 * prompt. Used when no model is available.
 */
import {
  REALISM,
  parseCitySpec,
  type AmbientParticles,
  type ArchitectureStyle,
  type CitySpec,
  type DistrictKind,
  type Realism,
  type StreetPattern,
} from "../../shared/city-spec.js";
import type { LandmarkShape } from "../../shared/types.js";
import {
  between,
  pick,
  round,
  seededRng,
  type Rng,
} from "./fiction-cities/kit.js";

interface DistrictTemplate {
  name: string;
  kind: DistrictKind;
  at: [number, number];
  size: number;
  streets: StreetPattern;
  heights: [number, number];
  density: number;
  trees: number;
  style: ArchitectureStyle;
  palette?: string[];
}
interface LandmarkTemplate {
  /** "{w}" becomes a themed word. */
  name: string;
  shape: LandmarkShape;
  district?: string;
  at?: [number, number];
  height: number;
  width: number;
  depth: number;
  color?: string;
}
interface Theme {
  key: string;
  keywords: RegExp;
  origin: { lat: number; lon: number };
  timezone: string;
  climate: CitySpec["climate"];
  ambient: {
    sky: [string, string];
    fog: string;
    accent: string;
    particles: AmbientParticles;
    night: boolean;
  };
  inspiration: string;
  taglines: string[];
  name: [string[], string[]];
  words: string[];
  districts: DistrictTemplate[];
  landmarks: LandmarkTemplate[];
  water: {
    kind: "river" | "bay" | "lake" | "canal";
    sides: ("north" | "south" | "east" | "west" | "center")[];
    width?: number;
  }[];
  streetSuffixes: string[];
  places: string[];
}

const GOTHIC: Theme = {
  key: "gothic",
  keywords:
    /\b(gothic|noir|dark|darkness|rain|rainy|gotham\w*|crime|criminal|shadow\w*|grim|vigilante|detective|bat\w*|gargoyle\w*|night)\b/g,
  origin: { lat: 40.71, lon: -74.01 },
  timezone: "America/New_York",
  climate: { temperatureC: 17, humidity: 82, windMps: 5, cloudCover: 92 },
  ambient: {
    sky: ["#141821", "#3a3f4b"],
    fog: "#2a2e38",
    accent: "#d4a24c",
    particles: "rain",
    night: true,
  },
  inspiration:
    "Rain-soaked gothic noir harbor cities of pulp detective fiction",
  taglines: [
    "Rain on black stone, and every alley keeps a secret.",
    "Gargoyles watch the harbor fog roll in.",
    "A city of spires, smoke and lamplit alleys.",
  ],
  name: [
    ["Raven", "Ash", "Grim", "Sable", "Mourne", "Black", "Vesper", "Iron"],
    ["moor", "hollow", "gate", "haven", "wick", "port", "crest", "fall"],
  ],
  words: [
    "Gargoyle",
    "Vesper",
    "Blackwell",
    "Ironside",
    "Nocturne",
    "Raven",
    "Ashgrove",
    "Thorn",
  ],
  districts: [
    {
      name: "Old Spires",
      kind: "downtown",
      at: [0, -0.15],
      size: 0.34,
      streets: "grid",
      heights: [24, 250],
      density: 0.9,
      trees: 0.08,
      style: "gothic",
    },
    {
      name: "Ironworks Docks",
      kind: "industrial",
      at: [-0.45, 0.6],
      size: 0.26,
      streets: "grid",
      heights: [8, 34],
      density: 0.7,
      trees: 0.03,
      style: "industrial",
    },
    {
      name: "Harbor Row",
      kind: "waterfront",
      at: [0.4, 0.55],
      size: 0.22,
      streets: "grid",
      heights: [10, 60],
      density: 0.75,
      trees: 0.12,
      style: "gothic",
    },
    {
      name: "Narrows",
      kind: "old-quarter",
      at: [-0.6, -0.4],
      size: 0.24,
      streets: "organic",
      heights: [8, 36],
      density: 0.85,
      trees: 0.05,
      style: "victorian",
    },
    {
      name: "Hollow Heights",
      kind: "residential",
      at: [0.62, -0.5],
      size: 0.24,
      streets: "organic",
      heights: [8, 26],
      density: 0.6,
      trees: 0.45,
      style: "victorian",
    },
    {
      name: "Ravenhollow Cemetery",
      kind: "park",
      at: [0.15, -0.78],
      size: 0.14,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.7,
      style: "gothic",
    },
  ],
  landmarks: [
    {
      name: "Saint {w} Cathedral",
      shape: "cathedral",
      district: "Old Spires",
      height: 96,
      width: 56,
      depth: 100,
      color: "#3b3633",
    },
    {
      name: "{w} Signal Tower",
      shape: "signal",
      district: "Old Spires",
      height: 230,
      width: 30,
      depth: 30,
      color: "#2b2b30",
    },
    {
      name: "Old {w} Smokestacks",
      shape: "smokestacks",
      district: "Ironworks Docks",
      height: 70,
      width: 60,
      depth: 40,
      color: "#4b3b32",
    },
    {
      name: "{w} Gasworks Tanks",
      shape: "tanks",
      district: "Ironworks Docks",
      height: 34,
      width: 56,
      depth: 56,
      color: "#5a5048",
    },
    {
      name: "{w} Manor",
      shape: "manor",
      at: [0.92, -0.9],
      height: 30,
      width: 70,
      depth: 56,
      color: "#2f2b2a",
    },
    {
      name: "Midnight Clocktower",
      shape: "spire",
      district: "Narrows",
      height: 150,
      width: 20,
      depth: 20,
      color: "#3a3631",
    },
    {
      name: "Hall of {w} Justice",
      shape: "hall",
      district: "Old Spires",
      height: 60,
      width: 50,
      depth: 44,
      color: "#3e3b38",
    },
    {
      name: "{w} Opera House",
      shape: "dome",
      district: "Harbor Row",
      height: 48,
      width: 46,
      depth: 46,
      color: "#262428",
    },
    {
      name: "The {w} Gargoyle",
      shape: "statue",
      district: "Hollow Heights",
      height: 18,
      width: 10,
      depth: 10,
      color: "#4a4d52",
    },
    {
      name: "{w} Lighthouse",
      shape: "spire",
      district: "Harbor Row",
      height: 60,
      width: 14,
      depth: 14,
      color: "#d8d2c4",
    },
  ],
  water: [
    { kind: "bay", sides: ["south"], width: 150 },
    { kind: "river", sides: ["center", "west"], width: 60 },
  ],
  streetSuffixes: ["Street", "Alley", "Row"],
  places: ["Corner", "Steps", "Square", "Cross"],
};

const DECO: Theme = {
  key: "deco",
  keywords:
    /\b(art[\s-]?deco|deco|gleaming|hero\w*|metropolis|utopia\w*|chrome|golden[\s-]age|optimis\w*|superhero|bright|shining|skyline)\b/g,
  origin: { lat: 41.88, lon: -87.63 },
  timezone: "America/Chicago",
  climate: { temperatureC: 27, humidity: 50, windMps: 4, cloudCover: 10 },
  ambient: {
    sky: ["#5fa8e8", "#f6e7c8"],
    fog: "#e8dcc4",
    accent: "#e0b44c",
    particles: "sun",
    night: false,
  },
  inspiration:
    "Optimistic art-deco skylines of golden-age comics and 1930s world's fairs",
  taglines: [
    "Chrome, sunlight and boulevards built for tomorrow.",
    "Setback towers gleam over a grand civic plaza.",
    "A bright city that still believes in heroes.",
  ],
  name: [
    [
      "Aurel",
      "Sky",
      "Lumen",
      "Sterling",
      "Halcyon",
      "Zenith",
      "Crown",
      "Radiant",
    ],
    ["ton", "polis", "haven", "crest", "field", "ville", " City", "mont"],
  ],
  words: [
    "Zenith",
    "Sterling",
    "Halcyon",
    "Meridian",
    "Radiant",
    "Apex",
    "Orion",
    "Paragon",
  ],
  districts: [
    {
      name: "Grand Center",
      kind: "downtown",
      at: [0, 0],
      size: 0.36,
      streets: "grid",
      heights: [30, 380],
      density: 0.9,
      trees: 0.25,
      style: "art-deco",
    },
    {
      name: "Civic Mall",
      kind: "park",
      at: [0, -0.7],
      size: 0.16,
      streets: "grid",
      heights: [4, 6],
      density: 0,
      trees: 0.6,
      style: "classical",
    },
    {
      name: "Bayfront",
      kind: "waterfront",
      at: [0.55, 0.5],
      size: 0.24,
      streets: "grid",
      heights: [14, 120],
      density: 0.7,
      trees: 0.35,
      style: "modern",
    },
    {
      name: "Elm Terraces",
      kind: "residential",
      at: [-0.6, 0.45],
      size: 0.26,
      streets: "diagonal",
      heights: [10, 40],
      density: 0.65,
      trees: 0.55,
      style: "classical",
    },
    {
      name: "University Heights",
      kind: "campus",
      at: [-0.6, -0.5],
      size: 0.22,
      streets: "grid",
      heights: [12, 45],
      density: 0.5,
      trees: 0.6,
      style: "classical",
    },
    {
      name: "Radio Row",
      kind: "market",
      at: [0.6, -0.45],
      size: 0.16,
      streets: "grid",
      heights: [6, 18],
      density: 0.8,
      trees: 0.15,
      style: "art-deco",
    },
  ],
  landmarks: [
    {
      name: "{w} Globe Tower",
      shape: "globe",
      district: "Grand Center",
      height: 300,
      width: 44,
      depth: 44,
      color: "#d9c08a",
    },
    {
      name: "{w} Hall of Records",
      shape: "hall",
      district: "Grand Center",
      height: 70,
      width: 70,
      depth: 50,
      color: "#efe3c4",
    },
    {
      name: "Statue of the {w} Dawn",
      shape: "statue",
      district: "Civic Mall",
      height: 46,
      width: 14,
      depth: 14,
      color: "#c9a24a",
    },
    {
      name: "{w} Sunburst Building",
      shape: "stepped",
      district: "Grand Center",
      height: 340,
      width: 46,
      depth: 46,
      color: "#e8d7b0",
    },
    {
      name: "{w} Stadium",
      shape: "arena",
      district: "Bayfront",
      height: 40,
      width: 150,
      depth: 120,
      color: "#b8c4c2",
    },
    {
      name: "{w} Observatory",
      shape: "dome",
      district: "University Heights",
      height: 44,
      width: 36,
      depth: 36,
      color: "#efe8da",
    },
    {
      name: "Union Air Terminal",
      shape: "stepped",
      district: "Radio Row",
      height: 70,
      width: 60,
      depth: 40,
      color: "#2f7f7a",
    },
    {
      name: "{w} Bandshell",
      shape: "dome",
      district: "Civic Mall",
      height: 18,
      width: 30,
      depth: 24,
      color: "#efe3c4",
    },
  ],
  water: [{ kind: "bay", sides: ["east", "south"], width: 130 }],
  streetSuffixes: ["Avenue", "Boulevard", "Street"],
  places: ["Plaza", "Circle", "Square", "Court"],
};

const DESERT: Theme = {
  key: "desert",
  keywords:
    /\b(desert|dune\w*|sand\w*|oasis|arid|mirage|caravan|adobe|bazaar|souk|camel\w*|scorch\w*)\b/g,
  origin: { lat: 33.45, lon: -112.07 },
  timezone: "America/Phoenix",
  climate: { temperatureC: 41, humidity: 14, windMps: 3, cloudCover: 3 },
  ambient: {
    sky: ["#e0a25a", "#f8e3b5"],
    fog: "#f1d6a4",
    accent: "#c8502d",
    particles: "shimmer",
    night: false,
  },
  inspiration: "Walled desert old towns, wind towers and shaded bazaar lanes",
  taglines: [
    "Shade is a lane wide enough for one camel.",
    "Wind towers breathe over a maze of clay.",
    "A cool oasis at the heart of the heat.",
  ],
  name: [
    ["Sahr", "Qasr", "Amber", "Saffron", "Mira", "Zahra", "Dun", "Oas"],
    ["ah", "abad", "reach", "wells", "mesa", "ara", "ir", "an"],
  ],
  words: [
    "Saffron",
    "Cardamom",
    "Henna",
    "Mirage",
    "Falcon",
    "Oasis",
    "Amber",
    "Copper",
  ],
  districts: [
    {
      name: "Old Medina",
      kind: "old-quarter",
      at: [-0.35, 0],
      size: 0.36,
      streets: "organic",
      heights: [6, 14],
      density: 0.95,
      trees: 0.08,
      style: "adobe",
    },
    {
      name: "Spice Bazaar",
      kind: "market",
      at: [0.2, -0.45],
      size: 0.18,
      streets: "grid",
      heights: [5, 10],
      density: 0.9,
      trees: 0.05,
      style: "adobe",
    },
    {
      name: "Sun Boulevards",
      kind: "downtown",
      at: [0.5, 0.3],
      size: 0.28,
      streets: "grid",
      heights: [12, 140],
      density: 0.6,
      trees: 0.02,
      style: "glass",
    },
    {
      name: "Palm Oasis",
      kind: "park",
      at: [0.05, 0.6],
      size: 0.16,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.9,
      style: "adobe",
    },
    {
      name: "Mesa Homes",
      kind: "suburb",
      at: [0.6, -0.6],
      size: 0.2,
      streets: "organic",
      heights: [4, 9],
      density: 0.55,
      trees: 0.2,
      style: "adobe",
    },
  ],
  landmarks: [
    {
      name: "{w} Wind Tower",
      shape: "wind-tower",
      district: "Old Medina",
      height: 26,
      width: 8,
      depth: 8,
      color: "#d9a066",
    },
    {
      name: "Great {w} Mosque Dome",
      shape: "dome",
      district: "Old Medina",
      height: 40,
      width: 46,
      depth: 46,
      color: "#e0b07a",
    },
    {
      name: "{w} Caravanserai",
      shape: "hall",
      district: "Spice Bazaar",
      height: 14,
      width: 56,
      depth: 56,
      color: "#c98b4f",
    },
    {
      name: "{w} Sun Pyramid",
      shape: "pyramid",
      district: "Sun Boulevards",
      height: 90,
      width: 80,
      depth: 80,
      color: "#cf9a5e",
    },
    {
      name: "{w} Mirage Tower",
      shape: "spire",
      district: "Sun Boulevards",
      height: 180,
      width: 30,
      depth: 30,
      color: "#8fa6b8",
    },
    {
      name: "{w} Palm House",
      shape: "glasshouse",
      district: "Palm Oasis",
      height: 18,
      width: 40,
      depth: 26,
      color: "#b8c7d3",
    },
    {
      name: "{w} Wind Catcher",
      shape: "wind-tower",
      district: "Mesa Homes",
      height: 22,
      width: 8,
      depth: 8,
      color: "#b7773e",
    },
  ],
  water: [{ kind: "lake", sides: ["center", "south"], width: 110 }],
  streetSuffixes: ["Lane", "Alley", "Way"],
  places: ["Well", "Gate", "Court", "Souk"],
};

const NEON: Theme = {
  key: "neon",
  keywords:
    /\b(neon|tokyo\w*|cyberpunk|cyber\w*|synthwave|blade|arcade\w*|night[\s-]?market|hologram\w*|vaporwave|megacity)\b/g,
  origin: { lat: 35.68, lon: 139.69 },
  timezone: "Asia/Tokyo",
  climate: { temperatureC: 27, humidity: 74, windMps: 2, cloudCover: 60 },
  ambient: {
    sky: ["#0b0820", "#3a1452"],
    fog: "#24123a",
    accent: "#ff3fa4",
    particles: "sparks",
    night: true,
  },
  inspiration:
    "Rain-slick neon megacities, covered night markets and holographic towers",
  taglines: [
    "Every street hums under a thousand signs.",
    "The night market never closes.",
    "Neon canyons between glass towers.",
  ],
  name: [
    ["Neo", "Kiro", "Volt", "Shin", "Hika", "Nexa", "Lumi", "Syn"],
    ["dori", "ku", "machi", "polis", "grid", "zaka", "shima", "port"],
  ],
  words: ["Neon", "Pulse", "Cipher", "Volt", "Synth", "Halo", "Pixel", "Flux"],
  districts: [
    {
      name: "Signal District",
      kind: "downtown",
      at: [0.1, -0.1],
      size: 0.32,
      streets: "grid",
      heights: [20, 320],
      density: 0.95,
      trees: 0.03,
      style: "futurist",
    },
    {
      name: "Lantern Market",
      kind: "market",
      at: [-0.45, 0.25],
      size: 0.22,
      streets: "grid",
      heights: [6, 18],
      density: 0.95,
      trees: 0.04,
      style: "futurist",
    },
    {
      name: "Glass Canyon",
      kind: "downtown",
      at: [0.55, 0.45],
      size: 0.22,
      streets: "diagonal",
      heights: [40, 260],
      density: 0.85,
      trees: 0.05,
      style: "glass",
    },
    {
      name: "Stack Housing",
      kind: "residential",
      at: [-0.5, -0.55],
      size: 0.24,
      streets: "organic",
      heights: [14, 70],
      density: 0.9,
      trees: 0.12,
      style: "brutalist",
    },
    {
      name: "Circuit Yards",
      kind: "industrial",
      at: [0.55, -0.6],
      size: 0.2,
      streets: "grid",
      heights: [8, 30],
      density: 0.7,
      trees: 0.02,
      style: "industrial",
    },
    {
      name: "Shrine Garden",
      kind: "park",
      at: [-0.05, 0.62],
      size: 0.13,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.8,
      style: "classical",
    },
  ],
  landmarks: [
    {
      name: "{w} Broadcast Tower",
      shape: "signal",
      district: "Signal District",
      height: 300,
      width: 28,
      depth: 28,
      color: "#3f4a63",
    },
    {
      name: "{w} Spire",
      shape: "spire",
      district: "Glass Canyon",
      height: 260,
      width: 30,
      depth: 30,
      color: "#6b7a99",
    },
    {
      name: "{w} Dome Arena",
      shape: "arena",
      district: "Circuit Yards",
      height: 40,
      width: 120,
      depth: 100,
      color: "#9aa7bd",
    },
    {
      name: "{w} Arcade Hall",
      shape: "hall",
      district: "Lantern Market",
      height: 24,
      width: 50,
      depth: 36,
      color: "#d7dde6",
    },
    {
      name: "{w} Data Globe",
      shape: "globe",
      district: "Signal District",
      height: 90,
      width: 40,
      depth: 40,
      color: "#b6c2d9",
    },
    {
      name: "{w} Shrine Gate",
      shape: "statue",
      district: "Shrine Garden",
      height: 16,
      width: 12,
      depth: 12,
      color: "#c8402d",
    },
  ],
  water: [
    { kind: "canal", sides: ["center"], width: 26 },
    { kind: "bay", sides: ["south", "east"], width: 100 },
  ],
  streetSuffixes: ["Dori", "Street", "Alley"],
  places: ["Crossing", "Plaza", "Station", "Exit"],
};

const GARDEN: Theme = {
  key: "garden",
  keywords:
    /\b(garden\w*|forest\w*|green\w*|leafy|botanic\w*|trees?|canopy|eco|solarpunk|woodland|park\w*|shady|shade)\b/g,
  origin: { lat: 45.52, lon: -122.68 },
  timezone: "America/Los_Angeles",
  climate: { temperatureC: 24, humidity: 60, windMps: 2, cloudCover: 30 },
  ambient: {
    sky: ["#8ec5a4", "#f2f0d8"],
    fog: "#d6e6d0",
    accent: "#e9a23b",
    particles: "leaves",
    night: false,
  },
  inspiration:
    "Garden cities and solarpunk visions where streets run under a closed canopy",
  taglines: [
    "Walk all day and never leave the shade.",
    "Every street a garden, every roof a terrace.",
    "A city that grew its own canopy.",
  ],
  name: [
    ["Verd", "Fern", "Willow", "Moss", "Linden", "Elder", "Hazel", "Bramble"],
    ["dale", "wood", "haven", "glade", "brook", "grove", "field", "shaw"],
  ],
  words: [
    "Linden",
    "Willow",
    "Fern",
    "Hazel",
    "Juniper",
    "Rowan",
    "Laurel",
    "Alder",
  ],
  districts: [
    {
      name: "Canopy Center",
      kind: "downtown",
      at: [0, 0],
      size: 0.28,
      streets: "grid",
      heights: [12, 60],
      density: 0.7,
      trees: 0.85,
      style: "modern",
    },
    {
      name: "Botanic Garden",
      kind: "park",
      at: [-0.5, -0.45],
      size: 0.24,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 1,
      style: "classical",
    },
    {
      name: "Terrace Hill",
      kind: "residential",
      at: [0.55, -0.5],
      size: 0.26,
      streets: "organic",
      heights: [10, 32],
      density: 0.7,
      trees: 0.9,
      style: "modern",
    },
    {
      name: "Mill Commons",
      kind: "residential",
      at: [-0.55, 0.5],
      size: 0.24,
      streets: "grid",
      heights: [8, 24],
      density: 0.6,
      trees: 0.85,
      style: "victorian",
    },
    {
      name: "Seedbank Campus",
      kind: "campus",
      at: [0.55, 0.5],
      size: 0.22,
      streets: "radial",
      heights: [10, 36],
      density: 0.55,
      trees: 0.8,
      style: "glass",
    },
    {
      name: "Orchard Park",
      kind: "park",
      at: [0, 0.72],
      size: 0.15,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.9,
      style: "modern",
    },
  ],
  landmarks: [
    {
      name: "{w} Glasshouse",
      shape: "glasshouse",
      district: "Botanic Garden",
      height: 26,
      width: 70,
      depth: 40,
      color: "#b8c7d3",
    },
    {
      name: "{w} Seed Dome",
      shape: "dome",
      district: "Seedbank Campus",
      height: 34,
      width: 44,
      depth: 44,
      color: "#d8d2c8",
    },
    {
      name: "{w} Tree Tower",
      shape: "stepped",
      district: "Canopy Center",
      height: 90,
      width: 36,
      depth: 36,
      color: "#5f7f5a",
    },
    {
      name: "{w} Library",
      shape: "hall",
      district: "Canopy Center",
      height: 28,
      width: 50,
      depth: 36,
      color: "#c9ccd1",
    },
    {
      name: "{w} Wind Tower",
      shape: "wind-tower",
      district: "Terrace Hill",
      height: 40,
      width: 10,
      depth: 10,
      color: "#a7adb5",
    },
    {
      name: "Statue of the {w} Gardener",
      shape: "statue",
      district: "Orchard Park",
      height: 12,
      width: 8,
      depth: 8,
      color: "#8f98a3",
    },
  ],
  water: [{ kind: "river", sides: ["center", "north"], width: 50 }],
  streetSuffixes: ["Walk", "Lane", "Avenue"],
  places: ["Green", "Grove", "Commons", "Glade"],
};

const CANALS: Theme = {
  key: "canals",
  keywords:
    /\b(venice|venetian|canals?|lagoon|gondola\w*|bridges|floating|water[\s-]?city|islands?)\b/g,
  origin: { lat: 45.44, lon: 12.33 },
  timezone: "Europe/Rome",
  climate: { temperatureC: 26, humidity: 70, windMps: 3, cloudCover: 25 },
  ambient: {
    sky: ["#9cc3e6", "#f4e1c6"],
    fog: "#e6dccb",
    accent: "#c8553d",
    particles: "mist",
    night: false,
  },
  inspiration:
    "Lagoon cities of canals, footbridges, domes and crowded old quarters",
  taglines: [
    "A hundred bridges, and every one a shortcut.",
    "Lanes that end at the water's edge.",
    "Domes and bell towers over the lagoon.",
  ],
  name: [
    ["Serena", "Lagun", "Aqua", "Corallo", "Mare", "Riva", "Bella", "Isola"],
    ["ssima", "ra", "via", "nza", "lto", "dora", "mara", "zza"],
  ],
  words: [
    "Corallo",
    "Laguna",
    "Ponte",
    "Riva",
    "Gondola",
    "Vela",
    "Marina",
    "Sirena",
  ],
  districts: [
    {
      name: "San Riva",
      kind: "old-quarter",
      at: [-0.25, -0.1],
      size: 0.34,
      streets: "organic",
      heights: [10, 28],
      density: 0.95,
      trees: 0.05,
      style: "classical",
    },
    {
      name: "Rialto Market",
      kind: "market",
      at: [0.35, -0.35],
      size: 0.18,
      streets: "grid",
      heights: [8, 18],
      density: 0.9,
      trees: 0.05,
      style: "classical",
    },
    {
      name: "Arsenal Yards",
      kind: "industrial",
      at: [0.55, 0.3],
      size: 0.2,
      streets: "grid",
      heights: [8, 24],
      density: 0.6,
      trees: 0.05,
      style: "victorian",
    },
    {
      name: "Giudecca Homes",
      kind: "residential",
      at: [-0.5, 0.5],
      size: 0.22,
      streets: "organic",
      heights: [10, 22],
      density: 0.8,
      trees: 0.2,
      style: "classical",
    },
    {
      name: "Giardini",
      kind: "park",
      at: [0.1, 0.55],
      size: 0.14,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.8,
      style: "classical",
    },
  ],
  landmarks: [
    {
      name: "Basilica of {w}",
      shape: "dome",
      district: "San Riva",
      height: 44,
      width: 60,
      depth: 70,
      color: "#e6dccb",
    },
    {
      name: "{w} Bell Tower",
      shape: "spire",
      district: "San Riva",
      height: 98,
      width: 13,
      depth: 13,
      color: "#a5644e",
    },
    {
      name: "{w} Palace",
      shape: "manor",
      district: "Rialto Market",
      height: 26,
      width: 60,
      depth: 44,
      color: "#efe8da",
    },
    {
      name: "{w} Bridge Gate",
      shape: "bridge",
      district: "Rialto Market",
      height: 14,
      width: 36,
      depth: 16,
      color: "#d8ccb6",
    },
    {
      name: "{w} Arsenal Hall",
      shape: "hall",
      district: "Arsenal Yards",
      height: 20,
      width: 70,
      depth: 40,
      color: "#8c4a3c",
    },
    {
      name: "Church of the {w}",
      shape: "cathedral",
      district: "Giudecca Homes",
      height: 40,
      width: 36,
      depth: 60,
      color: "#d2c3a5",
    },
  ],
  water: [
    { kind: "canal", sides: ["center"], width: 30 },
    { kind: "canal", sides: ["west", "east"], width: 22 },
    { kind: "bay", sides: ["south"], width: 110 },
  ],
  streetSuffixes: ["Calle", "Fondamenta", "Ramo"],
  places: ["Campo", "Corte", "Ponte", "Riva"],
};

const MEDIEVAL: Theme = {
  key: "medieval",
  keywords:
    /\b(medieval|castle\w*|fantasy|knights?|kingdom|walled|realm|dragon\w*|tavern\w*|cobbled|cobblestone)\b/g,
  origin: { lat: 53.96, lon: -1.08 },
  timezone: "Europe/London",
  climate: { temperatureC: 15, humidity: 72, windMps: 5, cloudCover: 65 },
  ambient: {
    sky: ["#7e8fa6", "#e7dcc8"],
    fog: "#c9c3b6",
    accent: "#b5402f",
    particles: "mist",
    night: false,
  },
  inspiration:
    "Walled medieval market towns with a castle, a minster and crooked lanes",
  taglines: [
    "Crooked lanes climb to the castle gate.",
    "Bells over the market square at noon.",
    "Every wall here is older than the map.",
  ],
  name: [
    ["Wyn", "Thorn", "Ald", "Stag", "Ember", "Raven", "Oak", "Hart"],
    ["ford", "bury", "minster", "keep", "wick", "stead", "holm", "dale"],
  ],
  words: [
    "Shambles",
    "Tanner",
    "Cooper",
    "Mason",
    "Friar",
    "Abbot",
    "Falcon",
    "Hart",
  ],
  districts: [
    {
      name: "Castle Ward",
      kind: "old-quarter",
      at: [0, 0],
      size: 0.3,
      streets: "radial",
      heights: [8, 30],
      density: 0.9,
      trees: 0.08,
      style: "gothic",
      palette: ["#8a8070", "#9c8f7a", "#6f6656", "#b0a38c"],
    },
    {
      name: "The Shambles",
      kind: "market",
      at: [-0.5, -0.3],
      size: 0.2,
      streets: "organic",
      heights: [7, 16],
      density: 0.95,
      trees: 0.05,
      style: "victorian",
    },
    {
      name: "Guild Row",
      kind: "old-quarter",
      at: [0.5, -0.4],
      size: 0.22,
      streets: "organic",
      heights: [8, 20],
      density: 0.85,
      trees: 0.1,
      style: "victorian",
    },
    {
      name: "Mill Lands",
      kind: "industrial",
      at: [0.5, 0.5],
      size: 0.2,
      streets: "grid",
      heights: [6, 18],
      density: 0.5,
      trees: 0.2,
      style: "industrial",
    },
    {
      name: "Kings Meadow",
      kind: "park",
      at: [-0.5, 0.55],
      size: 0.18,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.6,
      style: "classical",
    },
  ],
  landmarks: [
    {
      name: "{w} Castle",
      shape: "manor",
      district: "Castle Ward",
      height: 42,
      width: 80,
      depth: 70,
      color: "#7d7466",
    },
    {
      name: "{w} Minster",
      shape: "cathedral",
      district: "Castle Ward",
      height: 70,
      width: 50,
      depth: 96,
      color: "#9c8f7a",
    },
    {
      name: "{w} Keep Tower",
      shape: "spire",
      district: "Castle Ward",
      height: 60,
      width: 16,
      depth: 16,
      color: "#6f6656",
    },
    {
      name: "{w} Guildhall",
      shape: "hall",
      district: "Guild Row",
      height: 22,
      width: 40,
      depth: 28,
      color: "#8c4a3c",
    },
    {
      name: "{w} Watermill",
      shape: "smokestacks",
      district: "Mill Lands",
      height: 24,
      width: 40,
      depth: 30,
      color: "#6e4b3a",
    },
    {
      name: "Statue of King {w}",
      shape: "statue",
      district: "Kings Meadow",
      height: 14,
      width: 8,
      depth: 8,
      color: "#5c6b55",
    },
  ],
  water: [{ kind: "river", sides: ["center", "east"], width: 46 }],
  streetSuffixes: ["Gate", "Lane", "Row"],
  places: ["Cross", "Gate", "Bar", "Yard"],
};

const FUTURE: Theme = {
  key: "future",
  keywords:
    /\b(futur\w*|sci[\s-]?fi|space\w*|orbital|hover\w*|tomorrow|robot\w*|starship|mars|lunar|high[\s-]?tech)\b/g,
  origin: { lat: 25.2, lon: 55.27 },
  timezone: "Asia/Dubai",
  climate: { temperatureC: 34, humidity: 45, windMps: 4, cloudCover: 5 },
  ambient: {
    sky: ["#4b6cb7", "#dfe9f3"],
    fog: "#cfd9e6",
    accent: "#46e0d1",
    particles: "shimmer",
    night: false,
  },
  inspiration:
    "Speculative future cities of ring roads, arcologies and sky gardens",
  taglines: [
    "Ring roads, sky gardens and towers that touch the clouds.",
    "Tomorrow, built in concentric circles.",
    "An arcology city of glass and light.",
  ],
  name: [
    ["Nova", "Astra", "Helio", "Orbi", "Zeta", "Kyro", "Lyra", "Vela"],
    ["polis", "ton", "prime", "core", "ia", "on", "ara", "nyx"],
  ],
  words: [
    "Helix",
    "Orbit",
    "Photon",
    "Axiom",
    "Nexus",
    "Stratos",
    "Quasar",
    "Ion",
  ],
  districts: [
    {
      name: "Core Ring",
      kind: "downtown",
      at: [0, 0],
      size: 0.36,
      streets: "radial",
      heights: [30, 420],
      density: 0.85,
      trees: 0.2,
      style: "futurist",
    },
    {
      name: "Helix Campus",
      kind: "campus",
      at: [-0.55, -0.5],
      size: 0.22,
      streets: "diagonal",
      heights: [14, 60],
      density: 0.55,
      trees: 0.5,
      style: "glass",
    },
    {
      name: "Sky Gardens",
      kind: "park",
      at: [0.55, -0.55],
      size: 0.18,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.85,
      style: "futurist",
    },
    {
      name: "Habitat Terraces",
      kind: "residential",
      at: [-0.55, 0.5],
      size: 0.24,
      streets: "organic",
      heights: [12, 90],
      density: 0.7,
      trees: 0.4,
      style: "futurist",
    },
    {
      name: "Fusion Works",
      kind: "industrial",
      at: [0.55, 0.55],
      size: 0.2,
      streets: "grid",
      heights: [10, 40],
      density: 0.6,
      trees: 0.05,
      style: "brutalist",
    },
  ],
  landmarks: [
    {
      name: "{w} Needle",
      shape: "spire",
      district: "Core Ring",
      height: 460,
      width: 34,
      depth: 34,
      color: "#d7dde6",
    },
    {
      name: "{w} Sphere",
      shape: "globe",
      district: "Core Ring",
      height: 120,
      width: 70,
      depth: 70,
      color: "#b6c2d9",
    },
    {
      name: "{w} Arcology",
      shape: "stepped",
      district: "Habitat Terraces",
      height: 200,
      width: 70,
      depth: 70,
      color: "#9aa7bd",
    },
    {
      name: "{w} Biodome",
      shape: "glasshouse",
      district: "Sky Gardens",
      height: 40,
      width: 80,
      depth: 60,
      color: "#a9bccb",
    },
    {
      name: "{w} Uplink",
      shape: "signal",
      district: "Helix Campus",
      height: 160,
      width: 22,
      depth: 22,
      color: "#6b7a99",
    },
    {
      name: "{w} Arena",
      shape: "arena",
      district: "Fusion Works",
      height: 40,
      width: 120,
      depth: 110,
      color: "#e8ecf2",
    },
  ],
  water: [{ kind: "lake", sides: ["north", "center"], width: 140 }],
  streetSuffixes: ["Loop", "Way", "Line"],
  places: ["Node", "Hub", "Plaza", "Port"],
};

const TROPICAL: Theme = {
  key: "tropical",
  keywords:
    /\b(tropic\w*|island\w*|beach\w*|palm\w*|caribbean|jungle|monsoon|reef|coral|lush)\b/g,
  origin: { lat: 1.35, lon: 103.82 },
  timezone: "Asia/Singapore",
  climate: { temperatureC: 31, humidity: 84, windMps: 3, cloudCover: 45 },
  ambient: {
    sky: ["#46b3e6", "#fbe9c6"],
    fog: "#d7eef0",
    accent: "#ff8a3d",
    particles: "sun",
    night: false,
  },
  inspiration:
    "Humid tropical port cities of shophouses, covered five-foot ways and rain trees",
  taglines: [
    "Covered five-foot ways from the market to the sea.",
    "Rain trees, shophouses and a warm harbor breeze.",
    "Shade first, then the beach.",
  ],
  name: [
    ["Coral", "Palma", "Suria", "Mango", "Teluk", "Laguna", "Kenari", "Bayu"],
    ["ra", "puri", "haven", "bay", "sari", "ola", "ang", "wan"],
  ],
  words: [
    "Frangipani",
    "Hibiscus",
    "Mango",
    "Coral",
    "Monsoon",
    "Lagoon",
    "Tamarind",
    "Banyan",
  ],
  districts: [
    {
      name: "Harbor Front",
      kind: "waterfront",
      at: [0.1, 0.45],
      size: 0.26,
      streets: "grid",
      heights: [12, 180],
      density: 0.75,
      trees: 0.6,
      style: "glass",
    },
    {
      name: "Shophouse Quarter",
      kind: "old-quarter",
      at: [-0.45, 0.05],
      size: 0.26,
      streets: "grid",
      heights: [8, 18],
      density: 0.95,
      trees: 0.4,
      style: "victorian",
      palette: ["#e8a87c", "#c38d9e", "#41b3a3", "#e27d60"],
    },
    {
      name: "Hawker Market",
      kind: "market",
      at: [0.35, -0.2],
      size: 0.16,
      streets: "grid",
      heights: [5, 10],
      density: 0.9,
      trees: 0.3,
      style: "modern",
    },
    {
      name: "Palm Gardens",
      kind: "park",
      at: [0.05, -0.6],
      size: 0.2,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 1,
      style: "modern",
    },
    {
      name: "Hillside Estates",
      kind: "residential",
      at: [0.6, -0.6],
      size: 0.22,
      streets: "organic",
      heights: [10, 60],
      density: 0.6,
      trees: 0.8,
      style: "modern",
    },
  ],
  landmarks: [
    {
      name: "{w} Supertree Glasshouse",
      shape: "glasshouse",
      district: "Palm Gardens",
      height: 36,
      width: 70,
      depth: 50,
      color: "#a9bccb",
    },
    {
      name: "{w} Harbor Tower",
      shape: "spire",
      district: "Harbor Front",
      height: 220,
      width: 34,
      depth: 34,
      color: "#8fa6b8",
    },
    {
      name: "{w} Temple",
      shape: "stepped",
      district: "Shophouse Quarter",
      height: 30,
      width: 30,
      depth: 40,
      color: "#c8553d",
    },
    {
      name: "{w} Market Hall",
      shape: "hall",
      district: "Hawker Market",
      height: 16,
      width: 50,
      depth: 40,
      color: "#e2ded6",
    },
    {
      name: "{w} Lighthouse",
      shape: "spire",
      district: "Harbor Front",
      height: 40,
      width: 12,
      depth: 12,
      color: "#efe8da",
    },
  ],
  water: [
    { kind: "bay", sides: ["south"], width: 140 },
    { kind: "river", sides: ["west"], width: 40 },
  ],
  streetSuffixes: ["Road", "Jalan", "Walk"],
  places: ["Quay", "Corner", "Square", "Pier"],
};

const NORDIC: Theme = {
  key: "nordic",
  keywords:
    /\b(snow\w*|nordic|arctic|winter\w*|fjords?|scandinavi\w*|viking\w*|auroras?|northern lights|frost\w*|ice|icy|cold)\b/g,
  origin: { lat: 59.91, lon: 10.75 },
  timezone: "Europe/Oslo",
  climate: { temperatureC: -2, humidity: 78, windMps: 6, cloudCover: 55 },
  ambient: {
    sky: ["#0f2340", "#4a7aa8"],
    fog: "#b9c8d8",
    accent: "#7ef0c4",
    particles: "aurora",
    night: true,
  },
  inspiration:
    "Snowy Nordic harbor towns of timber terraces, fjords and northern lights",
  taglines: [
    "Northern lights over a frozen fjord.",
    "Warm windows along the snowy quay.",
    "A harbor town that glows all winter.",
  ],
  name: [
    ["Fjell", "Nord", "Is", "Vinter", "Stjerne", "Ulv", "Bjørk", "Frost"],
    ["vik", "heim", "havn", "by", "dal", "fjord", "strand", "berg"],
  ],
  words: ["Fjell", "Bjørk", "Ulv", "Stjerne", "Nordlys", "Havn", "Elg", "Rein"],
  districts: [
    {
      name: "Bryggen",
      kind: "waterfront",
      at: [-0.2, 0.3],
      size: 0.26,
      streets: "grid",
      heights: [8, 22],
      density: 0.85,
      trees: 0.15,
      style: "victorian",
      palette: ["#a3312a", "#d9a441", "#e8dcc4", "#2e4a62"],
    },
    {
      name: "Stortorg",
      kind: "downtown",
      at: [0.3, -0.1],
      size: 0.28,
      streets: "radial",
      heights: [12, 90],
      density: 0.75,
      trees: 0.25,
      style: "classical",
    },
    {
      name: "Birch Hill",
      kind: "residential",
      at: [-0.5, -0.5],
      size: 0.24,
      streets: "organic",
      heights: [6, 18],
      density: 0.6,
      trees: 0.6,
      style: "modern",
    },
    {
      name: "Ice Harbor Works",
      kind: "industrial",
      at: [0.55, 0.55],
      size: 0.2,
      streets: "grid",
      heights: [8, 30],
      density: 0.55,
      trees: 0.05,
      style: "industrial",
    },
    {
      name: "Frost Park",
      kind: "park",
      at: [0.4, -0.65],
      size: 0.16,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.7,
      style: "modern",
    },
  ],
  landmarks: [
    {
      name: "{w} Opera House",
      shape: "stepped",
      district: "Bryggen",
      height: 36,
      width: 90,
      depth: 60,
      color: "#e8ecf2",
    },
    {
      name: "{w} Stave Church",
      shape: "cathedral",
      district: "Birch Hill",
      height: 30,
      width: 24,
      depth: 36,
      color: "#3b2a22",
    },
    {
      name: "{w} City Hall",
      shape: "hall",
      district: "Stortorg",
      height: 66,
      width: 60,
      depth: 44,
      color: "#a3312a",
    },
    {
      name: "{w} Ski Tower",
      shape: "spire",
      district: "Frost Park",
      height: 60,
      width: 14,
      depth: 14,
      color: "#d7dde6",
    },
    {
      name: "{w} Aurora Observatory",
      shape: "dome",
      district: "Stortorg",
      height: 30,
      width: 30,
      depth: 30,
      color: "#b6c2d9",
    },
  ],
  water: [{ kind: "bay", sides: ["south", "west"], width: 150 }],
  streetSuffixes: ["Gate", "Vei", "Street"],
  places: ["Torg", "Brygge", "Square", "Corner"],
};

const MODERN: Theme = {
  key: "modern",
  keywords: /$^/g,
  origin: { lat: 41.39, lon: 2.17 },
  timezone: "Europe/Madrid",
  climate: { temperatureC: 26, humidity: 55, windMps: 3, cloudCover: 20 },
  ambient: {
    sky: ["#6fa8dc", "#f3e6cf"],
    fog: "#d9dee6",
    accent: "#f2b544",
    particles: "sun",
    night: false,
  },
  inspiration:
    "Balanced contemporary cities: a compact centre, leafy neighbourhoods and a riverside",
  taglines: [
    "A walkable city of squares, trees and a riverside.",
    "Shady avenues from the river to the hills.",
    "Everything you need, a short walk away.",
  ],
  name: [
    ["River", "Bright", "Clear", "Fair", "Green", "Mill", "Stone", "Summer"],
    ["ton", "field", "haven", "port", "bridge", "vale", "mouth", "side"],
  ],
  words: [
    "Maple",
    "Union",
    "Cedar",
    "Harbor",
    "Linden",
    "Summit",
    "Willow",
    "Station",
  ],
  districts: [
    {
      name: "City Centre",
      kind: "downtown",
      at: [0, -0.05],
      size: 0.3,
      streets: "grid",
      heights: [16, 180],
      density: 0.8,
      trees: 0.35,
      style: "glass",
    },
    {
      name: "Old Town",
      kind: "old-quarter",
      at: [-0.5, -0.4],
      size: 0.22,
      streets: "organic",
      heights: [8, 24],
      density: 0.85,
      trees: 0.2,
      style: "classical",
    },
    {
      name: "Riverside",
      kind: "waterfront",
      at: [0.5, 0.45],
      size: 0.22,
      streets: "grid",
      heights: [10, 60],
      density: 0.7,
      trees: 0.45,
      style: "modern",
    },
    {
      name: "Garden Suburb",
      kind: "residential",
      at: [-0.5, 0.5],
      size: 0.24,
      streets: "diagonal",
      heights: [8, 20],
      density: 0.6,
      trees: 0.65,
      style: "modern",
    },
    {
      name: "Central Park",
      kind: "park",
      at: [0.55, -0.5],
      size: 0.18,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 0.8,
      style: "modern",
    },
    {
      name: "Works Quarter",
      kind: "industrial",
      at: [0.05, 0.65],
      size: 0.16,
      streets: "grid",
      heights: [8, 28],
      density: 0.6,
      trees: 0.1,
      style: "industrial",
    },
  ],
  landmarks: [
    {
      name: "{w} Tower",
      shape: "spire",
      district: "City Centre",
      height: 190,
      width: 34,
      depth: 34,
      color: "#8fa6b8",
    },
    {
      name: "{w} City Hall",
      shape: "hall",
      district: "City Centre",
      height: 40,
      width: 56,
      depth: 40,
      color: "#d8d2c8",
    },
    {
      name: "{w} Basilica",
      shape: "cathedral",
      district: "Old Town",
      height: 60,
      width: 40,
      depth: 70,
      color: "#cbbfa8",
    },
    {
      name: "{w} Arena",
      shape: "arena",
      district: "Riverside",
      height: 36,
      width: 120,
      depth: 100,
      color: "#c9ccd1",
    },
    {
      name: "{w} Conservatory",
      shape: "glasshouse",
      district: "Central Park",
      height: 20,
      width: 46,
      depth: 28,
      color: "#b8c7d3",
    },
    {
      name: "{w} Gasholders",
      shape: "tanks",
      district: "Works Quarter",
      height: 30,
      width: 50,
      depth: 50,
      color: "#878279",
    },
  ],
  water: [{ kind: "river", sides: ["center", "south", "east"], width: 60 }],
  streetSuffixes: ["Street", "Avenue", "Road"],
  places: ["Square", "Corner", "Plaza", "Green"],
};

const THEMES: Theme[] = [
  GOTHIC,
  DECO,
  DESERT,
  NEON,
  GARDEN,
  CANALS,
  MEDIEVAL,
  FUTURE,
  TROPICAL,
  NORDIC,
];

/** Names we never echo back: trademarked fictional cities and brands. */
const TRADEMARKED =
  /\b(gotham|metropolis|smallville|wakanda|hogwarts|mordor|gondor|rivendell|coruscant|tatooine|naboo|night city|neo[\s-]?tokyo|rapture|columbia|bikini bottom|springfield|zootopia|arkham|asgard|atlantis|el dorado|blade runner|batman|superman|marvel|dc comics|disney|pixar|star wars|minas tirith|kings landing|king's landing|westeros|zion|midgar|hyrule|los santos|vice city|liberty city|san andreas|bioshock|cyberpunk 2077|akira|ghost in the shell)\b/i;
/** Real cities: a generated city never borrows a real name. */
const REAL_PLACES =
  /\b(tokyo|venice|paris|london|new york|chicago|dubai|singapore|oslo|phoenix|rome|berlin|madrid|barcelona|lisbon|amsterdam|seoul|beijing|shanghai|hong kong|mumbai|delhi|cairo|istanbul|moscow|sydney|melbourne|toronto|vancouver|seattle|portland|boston|miami|los angeles|san francisco|mexico city|rio|bangkok|kyoto|osaka|york)\b/i;
const STOP = new Set([
  "a",
  "an",
  "the",
  "i",
  "make",
  "build",
  "create",
  "generate",
  "give",
  "me",
  "city",
  "town",
  "with",
  "and",
  "of",
  "in",
  "like",
  "please",
  "my",
  "it",
  "its",
  "set",
  "inspired",
  "style",
  "walkable",
  "imagine",
  "design",
  "lots",
  "some",
  "huge",
  "big",
  "small",
  "old",
  "new",
]);

export function specFromPrompt(prompt: string, realism: Realism): CitySpec {
  const text = (prompt ?? "").slice(0, 2000);
  const lower = text.toLowerCase();
  const rng = seededRng(`walk-free-prompt:${lower.trim()}`);
  const level = REALISM[realism] ?? REALISM.detailed;

  const scored = THEMES.map((t) => ({
    t,
    score: (lower.match(t.keywords) ?? []).length,
  }))
    .filter((s) => s.score > 0)
    .sort(
      (a, b) => b.score - a.score || THEMES.indexOf(a.t) - THEMES.indexOf(b.t),
    );
  const theme = scored[0]?.t ?? MODERN;
  const second = scored[1]?.t;

  const word = () => pick(rng, theme.words);
  const fill = (template: string) => template.replace(/\{w\}/g, word);

  // Districts: the theme's own, jittered, plus a flavour from a second theme.
  const jitter = (v: number, by: number) =>
    round(Math.max(-1, Math.min(1, v + between(rng, -by, by))));
  const districts = theme.districts.map((d) => ({
    ...d,
    at: [jitter(d.at[0], 0.08), jitter(d.at[1], 0.08)] as [number, number],
    size: round(d.size * between(rng, 0.9, 1.1)),
    heights: [
      round(d.heights[0]),
      round(d.heights[1] * between(rng, 0.9, 1.08)),
    ] as [number, number],
    density: round(
      Math.max(0, Math.min(1, d.density + between(rng, -0.06, 0.06))),
    ),
    trees: round(Math.max(0, Math.min(1, d.trees + between(rng, -0.06, 0.06)))),
  }));
  if (second && second !== theme) {
    const extra =
      second.districts.find((d) => d.kind !== "park") ?? second.districts[0];
    districts.push({
      ...extra,
      at: [round(between(rng, -0.85, 0.85)), round(between(rng, -0.85, 0.85))],
      size: 0.18,
    });
  }
  if (realism === "dense" && districts.length < 9)
    districts.push({
      name: `${word()} Fields`,
      kind: "suburb",
      at: [
        round(between(rng, -0.8, 0.8)),
        round(between(rng, 0.6, 0.9) * (rng() < 0.5 ? -1 : 1)),
      ],
      size: 0.16,
      streets: rng() < 0.5 ? "organic" : "grid",
      heights: [5, 12],
      density: 0.5,
      trees: 0.6,
      style: theme.districts[0].style,
    });
  if (realism === "sketch") districts.splice(Math.max(3, districts.length - 1));

  const known = new Set(districts.map((d) => d.name));
  const landmarks = [
    ...theme.landmarks,
    ...(second && second !== theme ? second.landmarks.slice(0, 2) : []),
  ]
    .slice(0, level.maxLandmarks)
    .map((l) => ({
      ...l,
      name: fill(l.name),
      district: l.district && known.has(l.district) ? l.district : undefined,
      height: round(l.height * between(rng, 0.92, 1.08)),
    }));

  const water = theme.water.map((w) => ({
    kind: w.kind,
    side: pick(rng, w.sides),
    ...(w.width ? { width: w.width } : {}),
  }));

  const climate = { ...theme.climate };
  if (/\bheat\s?wave|scorching|sweltering|blazing\b/.test(lower))
    climate.temperatureC = 41;
  else if (/\bhot\b/.test(lower))
    climate.temperatureC = Math.max(climate.temperatureC, 34);
  else if (/\bwarm\b/.test(lower))
    climate.temperatureC = Math.max(climate.temperatureC, 28);
  if (/\bfreezing|frozen|blizzard\b/.test(lower)) climate.temperatureC = -8;
  else if (/\bcold|chilly\b/.test(lower))
    climate.temperatureC = Math.min(climate.temperatureC, 4);
  if (/\bhumid|muggy|steamy|sticky\b/.test(lower)) climate.humidity = 86;
  if (/\bdry|arid\b/.test(lower)) climate.humidity = 14;
  if (/\bwindy|gusty|stormy\b/.test(lower)) climate.windMps = 11;
  if (/\bcloudy|overcast|grey|gray|foggy\b/.test(lower))
    climate.cloudCover = 85;
  if (/\bsunny|clear sky|cloudless\b/.test(lower)) climate.cloudCover = 5;
  if (/\brain|rainy|storm\b/.test(lower)) {
    climate.cloudCover = Math.max(climate.cloudCover, 85);
    climate.humidity = Math.max(climate.humidity, 80);
  }
  const ambient = {
    ...theme.ambient,
    sky: [...theme.ambient.sky] as [string, string],
  };
  if (/\b(at night|night|midnight|after dark)\b/.test(lower))
    ambient.night = true;
  if (/\b(daytime|morning|noon|sunny)\b/.test(lower)) ambient.night = false;

  return parseCitySpec({
    name:
      extractName(text) ??
      generatedName(theme, seededRng(`walk-free-name:${lower.trim()}`)),
    tagline: pick(rng, theme.taglines),
    inspiration: theme.inspiration,
    origin: theme.origin,
    timezone: theme.timezone,
    climate,
    ambient,
    districts,
    landmarks,
    water,
    placeNames: theme.places.map((p) => `${word()} ${p}`),
  });
}

function generatedName(theme: Theme, rng: Rng) {
  const raw = `${pick(rng, theme.name[0])}${pick(rng, theme.name[1])}`;
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  return TRADEMARKED.test(name) || REAL_PLACES.test(name)
    ? `${name} Reach`
    : name;
}

/** A name the user gave: quoted text, "called X", or a capitalised phrase. */
export function extractName(prompt: string): string | undefined {
  const ok = (s: string | undefined) => {
    const v = s
      ?.replace(/\s+/g, " ")
      .trim()
      .replace(/[.,;:!?]+$/, "");
    if (!v || v.length < 2 || v.length > 60) return undefined;
    if (TRADEMARKED.test(v) || REAL_PLACES.test(v)) return undefined;
    return v;
  };
  const quoted = prompt.match(/["“«]([^"”»]{2,60})["”»]/);
  if (quoted && ok(quoted[1])) return ok(quoted[1]);
  const called = prompt.match(
    /\b(?:called|named)\s+([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,3})/u,
  );
  if (called && ok(called[1])) return ok(called[1]);
  const tokens = prompt.split(/\s+/);
  let run: string[] = [];
  const runs: string[][] = [];
  tokens.forEach((raw, i) => {
    const t = raw.replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, "");
    const startOfSentence = i === 0 || /[.!?]$/.test(tokens[i - 1]);
    const capital = /^\p{Lu}[\p{L}'-]+$/u.test(t) && !STOP.has(t.toLowerCase());
    if (capital && !startOfSentence && !/-like$/i.test(t)) run.push(t);
    else {
      if (run.length) runs.push(run);
      run = [];
    }
    if (/[,.;:!?]$/.test(raw) && run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  for (const r of runs) {
    const v = ok(r.slice(0, 3).join(" "));
    if (v) return v;
  }
  return undefined;
}
