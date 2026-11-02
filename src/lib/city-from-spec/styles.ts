/**
 * What each architecture style and district kind looks like: colours,
 * building proportions, street widths and the words its names are made of.
 */
import type { LandmarkShape, Point } from "../../../shared/types.js";
import type {
  ArchitectureStyle,
  DistrictKind,
} from "../../../shared/city-spec.js";
import { footprints } from "../fiction-cities/kit.js";

export interface StyleLook {
  palette: string[];
  /** Footprint for some buildings; null keeps the plain rectangle. */
  footprint?: (w: number, d: number, tall: boolean) => Point[] | undefined;
  /** Signature silhouette for the tallest few buildings. */
  tallShape?: LandmarkShape;
  /** Tall buildings keep at most this footprint side (narrow towers). */
  towerSide?: number;
  /** Multiplies footprint depth and width (adobe and industrial are thick). */
  bulk: number;
  /** Share of streets that are lit. */
  lit: number;
  words: string[];
  building: string;
}

export const STYLES: Record<ArchitectureStyle, StyleLook> = {
  gothic: {
    palette: ["#3b3633", "#2b2b30", "#45403b", "#33302d", "#4a4d52", "#3e3b38"],
    footprint: (w, d, tall) => (tall ? footprints.octagon(w, d) : undefined),
    tallShape: "spire",
    towerSide: 22,
    bulk: 0.9,
    lit: 0.55,
    building: "Stone block",
    words: [
      "Raven",
      "Gallows",
      "Blackwell",
      "Crane",
      "Ironside",
      "Mourne",
      "Ashgrove",
      "Cinder",
      "Harrow",
      "Thorn",
      "Vane",
      "Crow",
      "Soot",
      "Bellrope",
      "Tallow",
      "Rook",
      "Wick",
      "Lantern",
      "Sexton",
      "Gargoyle",
      "Sable",
      "Vesper",
      "Hollow",
      "Grimsby",
      "Nocturne",
      "Bleak",
      "Widow",
      "Coffin",
      "Moth",
      "Ember",
    ],
  },
  "art-deco": {
    palette: ["#efe3c4", "#d9c08a", "#c9a24a", "#2f7f7a", "#e8d7b0", "#b8c4c2"],
    footprint: (w, d, tall) =>
      tall ? footprints.notched(w, d, Math.min(w, d) * 0.15) : undefined,
    tallShape: "stepped",
    bulk: 1,
    lit: 0.97,
    building: "Deco block",
    words: [
      "Sterling",
      "Gilded",
      "Radiant",
      "Zenith",
      "Halcyon",
      "Meridian",
      "Lumen",
      "Apex",
      "Crown",
      "Jubilee",
      "Regal",
      "Monarch",
      "Starlight",
      "Beacon",
      "Liberty",
      "Vista",
      "Orion",
      "Solstice",
      "Triumph",
      "Paragon",
      "Celeste",
      "Atlas",
      "Aurelia",
      "Sunburst",
      "Chevron",
      "Ziggurat",
      "Gatsby",
      "Palisade",
      "Marquee",
      "Bellair",
    ],
  },
  modern: {
    palette: ["#c9ccd1", "#a7adb5", "#d8d2c8", "#8f98a3", "#e2ded6", "#b5a999"],
    bulk: 1,
    lit: 0.92,
    building: "Office block",
    words: [
      "Maple",
      "Cedar",
      "Harbor",
      "Union",
      "Market",
      "Mill",
      "Lake",
      "Grove",
      "Hill",
      "Spring",
      "Pine",
      "Elm",
      "Birch",
      "River",
      "Garden",
      "Linden",
      "Station",
      "College",
      "Summit",
      "Willow",
      "Orchard",
      "Chestnut",
      "Meadow",
      "Commerce",
      "Franklin",
      "Harmony",
      "Juniper",
      "Laurel",
      "Pioneer",
      "Granite",
    ],
  },
  brutalist: {
    palette: ["#9a9690", "#85817b", "#a9a49b", "#706c67", "#bdb7ac"],
    footprint: (w, d) => footprints.notched(w, d, Math.min(w, d) * 0.12),
    bulk: 1.15,
    lit: 0.85,
    building: "Concrete block",
    words: [
      "Concord",
      "Civic",
      "Forum",
      "Plinth",
      "Bastion",
      "Monolith",
      "Tribune",
      "Quarry",
      "Granite",
      "Slate",
      "Corbel",
      "Pillar",
      "Ledger",
      "Senate",
      "Arsenal",
      "Keystone",
      "Basalt",
      "Assembly",
      "Bulwark",
      "Pylon",
      "Cantilever",
      "Bunker",
      "Aggregate",
      "Lintel",
      "Mortar",
    ],
  },
  adobe: {
    palette: ["#c98b4f", "#d9a066", "#b7773e", "#e0b07a", "#a8693a", "#cf9a5e"],
    footprint: (w, d) =>
      w > 10 && d > 10 ? footprints.notched(w, d, 2.5) : undefined,
    tallShape: "wind-tower",
    bulk: 1.2,
    lit: 0.7,
    building: "Courtyard house",
    words: [
      "Saffron",
      "Cumin",
      "Indigo",
      "Henna",
      "Amber",
      "Cardamom",
      "Copper",
      "Tamarind",
      "Mosaic",
      "Clay",
      "Sandalwood",
      "Mesa",
      "Sage",
      "Juniper",
      "Pinyon",
      "Caravan",
      "Oasis",
      "Mirage",
      "Falcon",
      "Date",
      "Ochre",
      "Kiln",
      "Cistern",
      "Dune",
      "Scorpion",
      "Jackal",
      "Brass",
      "Loom",
      "Kettle",
      "Myrrh",
    ],
  },
  glass: {
    palette: ["#8fa6b8", "#7e93a6", "#a9bccb", "#6e8496", "#b8c7d3", "#5f7486"],
    footprint: (w, d, tall) =>
      tall && Math.abs(w - d) < 8 ? footprints.round(w, d, 16) : undefined,
    bulk: 1,
    lit: 1,
    building: "Glass tower",
    words: [
      "Prism",
      "Quartz",
      "Crystal",
      "Silica",
      "Mirror",
      "Halo",
      "Vector",
      "Lattice",
      "Pixel",
      "Azure",
      "Pulse",
      "Fiber",
      "Optic",
      "Spectrum",
      "Horizon",
      "Nova",
      "Arc",
      "Vertex",
      "Facet",
      "Clearwater",
      "Polaris",
      "Cobalt",
      "Glint",
      "Lucent",
      "Refract",
    ],
  },
  classical: {
    palette: ["#e6dccb", "#d8ccb6", "#efe8da", "#cbbfa8", "#d2c3a5"],
    footprint: (w, d) =>
      w > 18 && d > 18 ? footprints.notched(w, d, 3) : undefined,
    bulk: 1.05,
    lit: 0.95,
    building: "Stone terrace",
    words: [
      "Corinth",
      "Laurel",
      "Olympia",
      "Victoria",
      "Regent",
      "Sovereign",
      "Colonnade",
      "Marble",
      "Augustus",
      "Minerva",
      "Senate",
      "Cypress",
      "Palladian",
      "Forum",
      "Juniper",
      "Imperial",
      "Grace",
      "Belvedere",
      "Carrara",
      "Ionic",
      "Doric",
      "Acanthus",
      "Portico",
      "Aurelian",
      "Vesta",
    ],
  },
  industrial: {
    palette: ["#8a4b32", "#6f6a64", "#9c5a3c", "#5d5953", "#7b3f2b", "#878279"],
    bulk: 1.35,
    lit: 0.6,
    building: "Warehouse",
    words: [
      "Foundry",
      "Forge",
      "Rivet",
      "Anvil",
      "Kiln",
      "Smelter",
      "Boiler",
      "Piston",
      "Gantry",
      "Crane",
      "Ingot",
      "Bellows",
      "Furnace",
      "Slag",
      "Cinder",
      "Tannery",
      "Mill",
      "Dock",
      "Freight",
      "Cable",
      "Gasworks",
      "Spindle",
      "Sprocket",
      "Girder",
      "Coal",
    ],
  },
  victorian: {
    palette: ["#8c4a3c", "#a5644e", "#6e4b3a", "#b98b6a", "#5c6b55", "#7a3e36"],
    footprint: (w, d) =>
      w > 9 && d > 9 && w < 30 ? footprints.ell(w, d, 0.3, 0.35) : undefined,
    bulk: 0.95,
    lit: 0.8,
    building: "Row house",
    words: [
      "Albert",
      "Rosewood",
      "Ivy",
      "Primrose",
      "Wellington",
      "Hawthorn",
      "Gaslight",
      "Thistle",
      "Lavender",
      "Brougham",
      "Paisley",
      "Chester",
      "Abbey",
      "Bramble",
      "Rowan",
      "Clover",
      "Belgrave",
      "Lockwood",
      "Ashby",
      "Wren",
      "Nightingale",
      "Lilac",
      "Foxglove",
      "Marigold",
      "Quill",
    ],
  },
  futurist: {
    palette: ["#d7dde6", "#9aa7bd", "#e8ecf2", "#6b7a99", "#b6c2d9", "#3f4a63"],
    footprint: (w, d, tall) =>
      tall ? footprints.round(w, d, 20) : footprints.octagon(w, d),
    tallShape: "spire",
    towerSide: 34,
    bulk: 1,
    lit: 1,
    building: "Arcology",
    words: [
      "Helix",
      "Ion",
      "Nova",
      "Quantum",
      "Orbit",
      "Vector",
      "Photon",
      "Axiom",
      "Flux",
      "Zenith",
      "Cipher",
      "Neon",
      "Plasma",
      "Synth",
      "Nexus",
      "Kinetic",
      "Vortex",
      "Aero",
      "Fusion",
      "Stratos",
      "Comet",
      "Echo",
      "Tesla",
      "Parallax",
      "Quasar",
    ],
  },
};

export interface KindLook {
  /** Street spacing, metres. */
  block: number;
  /** Building frontage width and depth ranges, metres. */
  width: [number, number];
  depth: [number, number];
  /** Gap between neighbouring buildings and their setback from the kerb. */
  gap: [number, number];
  setback: number;
  /** Local street width and the alley width (0 for no alleys). */
  street: number;
  alley: number;
  /** Local streets are footways (lanes) rather than roads. */
  lanes?: boolean;
  /** Market arcades and covered lanes. */
  covered?: boolean;
  scenic: number;
  /** How strongly heights rise toward the district's centre (0..1). */
  peak: number;
  /** Chance of a second row of buildings behind the first. */
  backRow: number;
  /** Words for squares and corners. */
  places: string[];
  label: string;
}

export const KINDS: Record<DistrictKind, KindLook> = {
  downtown: {
    block: 84,
    width: [22, 40],
    depth: [20, 34],
    gap: [2, 6],
    setback: 2.5,
    street: 12,
    alley: 0,
    scenic: 0.2,
    peak: 0.85,
    backRow: 0.35,
    places: ["Square", "Plaza", "Circle", "Exchange"],
    label: "Downtown",
  },
  "old-quarter": {
    block: 58,
    width: [8, 15],
    depth: [9, 15],
    gap: [0.5, 1.5],
    setback: 1.2,
    street: 5,
    alley: 3,
    lanes: true,
    scenic: 0.6,
    peak: 0.35,
    backRow: 0.6,
    places: ["Cross", "Well", "Steps", "Gate"],
    label: "Old Quarter",
  },
  residential: {
    block: 96,
    width: [10, 17],
    depth: [10, 15],
    gap: [3, 6],
    setback: 4,
    street: 9,
    alley: 0,
    scenic: 0.35,
    peak: 0.25,
    backRow: 0.3,
    places: ["Green", "Corner", "Close", "Row"],
    label: "Residential",
  },
  industrial: {
    block: 140,
    width: [30, 60],
    depth: [24, 44],
    gap: [6, 12],
    setback: 5,
    street: 11,
    alley: 0,
    scenic: 0.05,
    peak: 0.1,
    backRow: 0.45,
    places: ["Yard", "Works", "Junction", "Sidings"],
    label: "Works",
  },
  waterfront: {
    block: 86,
    width: [18, 30],
    depth: [16, 26],
    gap: [3, 6],
    setback: 3,
    street: 10,
    alley: 0,
    scenic: 0.6,
    peak: 0.4,
    backRow: 0.3,
    places: ["Quay", "Landing", "Wharf", "Pier"],
    label: "Waterfront",
  },
  park: {
    block: 120,
    width: [6, 9],
    depth: [6, 9],
    gap: [20, 40],
    setback: 6,
    street: 4,
    alley: 0,
    lanes: true,
    scenic: 0.95,
    peak: 0,
    backRow: 0,
    places: ["Fountain", "Bandstand", "Meadow", "Pond"],
    label: "Park",
  },
  campus: {
    block: 118,
    width: [24, 44],
    depth: [16, 28],
    gap: [10, 18],
    setback: 6,
    street: 7,
    alley: 4,
    scenic: 0.6,
    peak: 0.3,
    backRow: 0.2,
    places: ["Quad", "Court", "Library Steps", "Commons"],
    label: "Campus",
  },
  suburb: {
    block: 110,
    width: [9, 13],
    depth: [9, 12],
    gap: [7, 12],
    setback: 6,
    street: 8,
    alley: 0,
    scenic: 0.45,
    peak: 0.05,
    backRow: 0,
    places: ["Green", "Corner", "Common", "Crossing"],
    label: "Suburb",
  },
  market: {
    block: 52,
    width: [6, 11],
    depth: [6, 10],
    gap: [0.8, 1.6],
    setback: 1.2,
    street: 6,
    alley: 3,
    lanes: true,
    covered: true,
    scenic: 0.5,
    peak: 0.2,
    backRow: 0.5,
    places: ["Market", "Bazaar", "Arcade", "Stalls"],
    label: "Market",
  },
};

/** Footprint for a landmark's signature silhouette. */
export function landmarkFootprint(
  shape: LandmarkShape,
  w: number,
  d: number,
): Point[] | undefined {
  switch (shape) {
    case "cathedral":
      return footprints.cross(w, d);
    case "dome":
    case "globe":
    case "arena":
    case "tanks":
    case "statue":
      return footprints.round(w, d, 20);
    case "spire":
    case "signal":
    case "wind-tower":
      return footprints.octagon(w, d);
    case "stepped":
      return footprints.notched(w, d, Math.min(w, d) * 0.18);
    case "manor":
      return footprints.ell(w, d, 0.35, 0.4);
    case "hall":
      return footprints.notched(w, d, Math.min(w, d) * 0.1);
    default:
      return undefined;
  }
}

/** Tree palettes and names by climate and style. */
export function treeLook(
  temperatureC: number,
  humidity: number,
  style: ArchitectureStyle,
) {
  if (style === "adobe" || (temperatureC >= 30 && humidity < 35))
    return {
      palette: ["#6b8e3a", "#7a9a45", "#5f7f33"],
      name: "Date palm",
      size: [5, 8] as [number, number],
    };
  if (temperatureC >= 26 && humidity >= 65)
    return {
      palette: ["#2f8a3c", "#3c9a46", "#1f7a35", "#4caf50"],
      name: "Rain tree",
      size: [8, 14] as [number, number],
    };
  if (temperatureC <= 6)
    return {
      palette: ["#24452f", "#2e5538", "#1d3b28"],
      name: "Spruce",
      size: [5, 9] as [number, number],
    };
  if (style === "gothic" || style === "victorian")
    return {
      palette: ["#2f4a2c", "#3a5634", "#46603c"],
      name: "Black elm",
      size: [6, 11] as [number, number],
    };
  return {
    palette: ["#3f7a3a", "#4f8a43", "#5a9a4c", "#356d33"],
    name: "Plane tree",
    size: [6, 12] as [number, number],
  };
}
