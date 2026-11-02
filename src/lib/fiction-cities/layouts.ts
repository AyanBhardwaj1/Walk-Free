import type { ObjectKind, Point } from "../../../shared/types.js";
import {
  arc,
  between,
  facing,
  footprints,
  lattice,
  lines,
  pick,
  round,
  subdivide,
  tiltedFit,
  withMidlines,
  type CityBuilder,
  type LineSpec,
  type Lot,
  type StreetStyle,
} from "./kit.js";

interface Place {
  name: string;
  node: string;
  at: Point;
  width: number;
  depth: number;
  height: number;
  color: string;
  kind?: ObjectKind;
  shape?: (w: number, d: number) => Point[];
}

/** A named landmark on the nearest free lot, with a named path node beside it. */
function landmark(b: CityBuilder, p: Place, lot?: Lot) {
  const target = lot ?? b.takeLot(p.at);
  if (!target) throw new Error(`No lot left for ${p.name}`);
  target.taken = true;
  const width = Math.min(p.width, target.width),
    depth = Math.min(p.depth, target.depth);
  const o = b.building({
    center: target.center,
    width,
    depth,
    rotation: target.rotation,
    height: p.height,
    color: p.color,
    name: p.name,
    kind: p.kind ?? "landmark",
    footprint: p.shape?.(width, depth),
  });
  if (!o) throw new Error(`${p.name} does not fit its lot`);
  b.nameNode(target.center, p.node);
  return o;
}
function fillLots(b: CityBuilder, fill: (lot: Lot) => void) {
  for (const lot of b.lots)
    if (!lot.taken) {
      lot.taken = true;
      fill(lot);
    }
}
function amenitiesAt(
  b: CityBuilder,
  list: [kind: "water" | "shelter", node: string, label: string][],
) {
  for (const [kind, node, label] of list) {
    const n = b.nodes.find((n) => n.name === node);
    if (n) b.amenity(kind, label, [n.point[0] + 3, n.point[1] + 3]);
  }
}
const style = (s: StreetStyle) => s;

/* ------------------------------------------------------------------ */
/* Noir Harbor: dense gothic towers, unlit alleys, a river and a harbor */

export function noirHarbor(b: CityBuilder) {
  const { rng } = b;
  const xs = withMidlines(rng, lines(rng, -462, 462, 15, 5), 3);
  const zs = [...withMidlines(rng, lines(rng, -462, 290, 12, 5), 3), 322];
  const harbor = zs.length - 1;
  const xNames = [
    "Gallows",
    "Blackwell",
    "Crane",
    "Ironside",
    "Mourne",
    "Ashgrove",
    "Lamplight",
    "",
    "Cinder",
    "",
    "Harrow",
    "Grimsby",
    "Thorn",
    "Vane",
    "Wraithmoor",
  ];
  const zNames = [
    "Nocturne",
    "Raven",
    "Bleak",
    "Saint Ione",
    "",
    "Hollow",
    "Pale",
    "Ferrous",
    "",
    "Drowned",
    "Wharf",
    "Tidewater",
  ];
  const alleys = [
    "Crow",
    "Soot",
    "Bellrope",
    "Coffin",
    "Ink",
    "Tallow",
    "Rook",
    "Gutter",
    "Fog",
    "Moth",
    "Candle",
    "Gargoyle",
    "Bone",
    "Rust",
    "Velvet",
    "Shadow",
    "Widow",
    "Cobble",
    "Tinker",
    "Hangman",
    "Mire",
    "Ember",
    "Thimble",
    "Wick",
    "Lantern",
    "Sexton",
  ];
  const alley = style({
    roadClass: "service",
    lit: false,
    scenic: 0.05,
    width: 3.5,
    kind: "footway",
  });
  const arcade = style({
    roadClass: "path",
    lit: true,
    scenic: 0.35,
    width: 7,
    kind: "footway",
    covered: true,
  });
  const major = style({
    roadClass: "major",
    lit: true,
    scenic: 0.2,
    width: 13,
    kind: "road",
  });
  const line = (axis: "x" | "z", i: number): LineSpec => {
    if (axis === "z" && i === harbor)
      return {
        name: "Harbor Walk",
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.95,
          width: 10,
          kind: "footway",
          trees: 13,
        },
      };
    if (i % 2)
      return {
        name: `${alleys[(axis === "x" ? 0 : 14) + (i - 1) / 2]} Alley`,
        style: alley,
      };
    const k = i / 2;
    if (axis === "x" && k === 7)
      return { name: "Cathedral Avenue", style: major };
    if (axis === "x" && k === 9)
      return { name: "Lantern Arcade", style: arcade };
    if (axis === "z" && k === 4)
      return { name: "Gaslight Arcade", style: arcade };
    if (axis === "z" && k === 8)
      return { name: "Old Harbor Road", style: major };
    return {
      name: axis === "x" ? `${xNames[k]} Street` : `${zNames[k]} Road`,
      style: {
        roadClass: "street",
        lit: rng() < 0.55,
        scenic: 0.1,
        width: 9,
        kind: "road",
      },
    };
  };
  const blocks = lattice(
    b,
    xs,
    zs,
    line,
    (axis, i) =>
      i % 2 && !(axis === "z" && i === harbor) ? rng() < 0.55 : true,
    [
      {
        i0: 4,
        i1: 6,
        j0: 0,
        j1: harbor,
        kind: "water",
        name: "Mourning River",
        bridges: (j) => [2, 10, 16, 20].includes(j),
      },
      {
        i0: 20,
        i1: 24,
        j0: 2,
        j1: 6,
        kind: "park",
        name: "Ravenhollow Cemetery",
      },
      { i0: 12, i1: 16, j0: 6, j1: 10, kind: "lot", name: "Cathedral Close" },
      { i0: 6, i1: 8, j0: 14, j1: 16, kind: "park", name: "Gaslight Commons" },
      {
        i0: 18,
        i1: 20,
        j0: 14,
        j1: 16,
        kind: "plaza",
        name: "Clocktower Square",
      },
    ],
  );
  // A ferry pier reaches out into the harbor.
  const pierX = xs.reduce((a, x) =>
    Math.abs(x - 280) < Math.abs(a - 280) ? x : a,
  );
  b.street(
    [
      [pierX, zs[harbor]],
      [pierX, 380],
      [pierX, 432],
    ],
    "Grey Ferry Pier",
    { roadClass: "path", lit: true, scenic: 0.9, width: 6, kind: "footway" },
  );
  b.street(
    [
      [xs[20], zs[2]],
      [xs[24], zs[6]],
    ],
    "Ravenhollow Path",
    { roadClass: "path", lit: false, scenic: 0.7, width: 3, kind: "footway" },
  );
  b.prune();
  b.node([pierX, 432], "Ferry Pier End");

  const river = blocks[0].polygon;
  b.landscape("water", "Mourning River", [
    [river[0][0], -500],
    [river[1][0], -500],
    [river[1][0], 346],
    [river[0][0], 346],
  ]);
  b.landscape("water", "Noir Harbor", [
    [-500, 342],
    [500, 342],
    [500, 500],
    [-500, 500],
  ]);

  const stone = "#3b3633";
  landmark(
    b,
    {
      name: "Saint Vesper Cathedral",
      node: "Cathedral Steps",
      at: [0, 0],
      width: 58,
      depth: 104,
      height: 96,
      color: stone,
      shape: footprints.cross,
    },
    blocks[2].lot,
  );
  const places: Place[] = [
    {
      name: "Gargoyle Spire",
      node: "Gargoyle Corner",
      at: [-170, -300],
      width: 26,
      depth: 26,
      height: 252,
      color: "#2b2b30",
      shape: footprints.octagon,
    },
    {
      name: "Midnight Clocktower",
      node: "Clocktower Steps",
      at: [blocks[4].lot.center[0] + 70, blocks[4].lot.center[1]],
      width: 22,
      depth: 22,
      height: 204,
      color: "#3a3631",
      shape: footprints.octagon,
    },
    {
      name: "Harbor Gate Customs House",
      node: "Harbor Gate",
      at: [40, 300],
      width: 60,
      depth: 40,
      height: 38,
      color: "#45403b",
    },
    {
      name: "Grey Ferry Terminal",
      node: "Ferry Landing",
      at: [pierX + 30, 300],
      width: 50,
      depth: 40,
      height: 22,
      color: "#4a4d52",
    },
    {
      name: "Hall of Iron Justice",
      node: "Courthouse Steps",
      at: [-80, -60],
      width: 40,
      depth: 40,
      height: 64,
      color: "#3e3b38",
    },
    {
      name: "Obsidian Opera House",
      node: "Opera Corner",
      at: [210, -40],
      width: 40,
      depth: 40,
      height: 48,
      color: "#262428",
    },
    {
      name: "Crowsnest Rail Station",
      node: "Crowsnest Platform",
      at: [-300, 80],
      width: 40,
      depth: 40,
      height: 30,
      color: "#33302d",
    },
    {
      name: "Old Iron Foundry",
      node: "Foundry Yard",
      at: [-400, 200],
      width: 40,
      depth: 40,
      height: 34,
      color: "#4b3b32",
    },
    {
      name: "Weatherglass Observatory",
      node: "Observatory Hill",
      at: [400, -400],
      width: 30,
      depth: 30,
      height: 120,
      color: "#30343c",
      shape: footprints.octagon,
    },
    {
      name: "Monarch Grand Hotel",
      node: "Monarch Corner",
      at: [110, 110],
      width: 40,
      depth: 40,
      height: 158,
      color: "#3a3f47",
    },
    {
      name: "Gargoyle Perch Bank",
      node: "Bankers Row",
      at: [-250, -90],
      width: 40,
      depth: 40,
      height: 112,
      color: "#2f3036",
    },
    {
      name: "Lighthouse of Saint Ione",
      node: "Lighthouse Point",
      at: [-430, 300],
      width: 18,
      depth: 18,
      height: 70,
      color: "#d8d2c4",
      shape: footprints.octagon,
    },
    {
      name: "Ravenhollow Mausoleum",
      node: "Ravenhollow Gate",
      at: [blocks[1].lot.center[0], blocks[1].polygon[0][1] - 40],
      width: 30,
      depth: 30,
      height: 26,
      color: "#5a5650",
    },
  ];
  for (const p of places) landmark(b, p);
  b.nameNode([river[0][0], zs[16]], "Blackwater Bridge");
  b.nameNode(blocks[3].lot.center, "Gaslight Commons Gate");
  b.nameNode(blocks[4].lot.center, "Clocktower Square");
  b.nameNode([xs[18], -420], "Lantern Arcade Entrance");

  const palette = [
    "#2b2d33",
    "#34343a",
    "#3d3a38",
    "#26292f",
    "#45403b",
    "#30343c",
    "#3a3f47",
  ];
  fillLots(b, (lot) => {
    const core = Math.hypot(...lot.center) < 300;
    const across = lot.width >= lot.depth;
    const subs =
      lot.width * lot.depth > 650 && rng() < 0.45
        ? subdivide(rng, lot, across ? 2 : 1, across ? 1 : 2, 2)
        : [lot];
    for (const sub of subs) {
      const roll = rng();
      const height =
        roll < (core ? 0.25 : 0.45)
          ? between(rng, 24, 58)
          : roll < 0.9
            ? between(rng, 60, 165)
            : between(rng, 165, 245);
      const tilt = round(between(rng, -4, 4));
      const [width, depth] = tiltedFit(
        sub.width * between(rng, 0.88, 1),
        sub.depth * between(rng, 0.88, 1),
        tilt,
      );
      const shape =
        height > 100 && rng() < 0.35
          ? footprints.octagon(width, depth)
          : height <= 100 && rng() < 0.2
            ? footprints.ell(
                width,
                depth,
                between(rng, 0.3, 0.5),
                between(rng, 0.3, 0.5),
              )
            : undefined;
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: tilt,
        height,
        color: pick(rng, palette),
        footprint: shape,
      });
    }
  });

  b.landscape("park", "Ravenhollow Cemetery", blocks[1].polygon);
  b.landscape("park", "Gaslight Commons", blocks[3].polygon);
  b.landscape("park", "Clocktower Square", blocks[4].polygon);
  b.landscape("park", "Cathedral Close", blocks[2].polygon);
  const trees = ["#2f3b33", "#36433a", "#2a3530", "#3f4a3c"];
  b.scatterTrees(blocks[1].polygon, 8.5, 0.85, trees, [5, 9], "Cemetery yew");
  b.scatterTrees(blocks[3].polygon, 9, 0.8, trees, [5, 9], "Commons elm");
  b.scatterTrees(blocks[4].polygon, 14, 0.35, trees, [4, 7], "Square plane");
  b.scatterTrees(blocks[2].polygon, 12, 0.4, trees, [5, 8], "Close yew");
  b.streetTrees(trees, [5, 8], "Harbor plane");

  amenitiesAt(b, [
    ["water", "Cathedral Steps", "Cathedral fountain"],
    ["water", "Clocktower Square", "Clocktower fountain"],
    ["water", "Harbor Gate", "Harbor Gate fountain"],
    ["water", "Ravenhollow Gate", "Cemetery tap"],
    ["shelter", "Ferry Pier End", "Ferry shelter"],
    ["shelter", "Crowsnest Platform", "Station canopy"],
    ["shelter", "Lantern Arcade Entrance", "Arcade porch"],
  ]);
}

/* ------------------------------------------------------------------ */
/* Skyline Prime: art-deco towers on wide, tree-lined, well-lit boulevards */

export function skylinePrime(b: CityBuilder) {
  const { rng } = b;
  const coarse = [-450, -350, -250, -150, -50, 50, 150, 250, 350, 450];
  const xs = withMidlines(rng, coarse),
    zs = withMidlines(rng, coarse);
  const avenues = [
    "Aviator",
    "Paragon",
    "Zenith",
    "Lumiere",
    "",
    "",
    "Victory",
    "Gilded",
    "Horizon",
    "Starliner",
  ];
  const streets = [
    "First Light",
    "Mercury",
    "Optimist",
    "Sunray",
    "Marquee",
    "Halcyon",
    "Chrome",
    "Radiance",
    "Jubilee",
    "Promise",
  ];
  const passages = [
    "Bakelite",
    "Zephyr",
    "Terrazzo",
    "Ziggurat",
    "Gilt",
    "Fanfare",
    "Cascade",
    "Chevron",
    "Sunburst",
    "Aurelian",
    "Swing",
    "Tango",
    "Ballroom",
    "Ticker",
    "Pennant",
    "Trumpet",
    "Clipper",
    "Comet",
  ];
  const line = (axis: "x" | "z", i: number): LineSpec => {
    if (i % 2)
      return {
        name: `${passages[(axis === "x" ? 0 : 9) + (i - 1) / 2]} Passage`,
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.35,
          width: 7,
          kind: "footway",
        },
      };
    const k = i / 2;
    if (axis === "x")
      return {
        name:
          k === 4
            ? "Grand Concourse West"
            : k === 5
              ? "Grand Concourse East"
              : `${avenues[k]} Avenue`,
        style: {
          roadClass: "major",
          lit: true,
          scenic: k === 4 || k === 5 ? 0.6 : 0.4,
          width: k === 4 || k === 5 ? 36 : 30,
          kind: "road",
          trees: 20,
        },
      };
    return {
      name: `${streets[k]} Boulevard`,
      style: {
        roadClass: k % 3 ? "street" : "major",
        lit: true,
        scenic: 0.35,
        width: 26,
        kind: "road",
        trees: 24,
      },
    };
  };
  const blocks = lattice(
    b,
    xs,
    zs,
    line,
    (_, i) => (i % 2 ? rng() < 0.7 : true),
    [
      {
        i0: 8,
        i1: 10,
        j0: 8,
        j1: 10,
        kind: "plaza",
        name: "Grand Concourse Plaza",
      },
      { i0: 6, i1: 12, j0: 10, j1: 14, kind: "park", name: "Sunburst Park" },
      { i0: 8, i1: 10, j0: 6, j1: 8, kind: "lot", name: "Globe Plaza" },
      { i0: 8, i1: 10, j0: 2, j1: 4, kind: "lot", name: "City Hall" },
      { i0: 14, i1: 16, j0: 8, j1: 10, kind: "lot", name: "Union Terminal" },
    ],
  );
  const park = blocks[1].polygon;
  const center: Point = [
    (park[0][0] + park[1][0]) / 2,
    (park[0][1] + park[2][1]) / 2,
  ];
  const diagonal = style({
    roadClass: "path",
    lit: true,
    scenic: 0.95,
    width: 6,
    kind: "footway",
  });
  for (const [i, j] of [
    [6, 10],
    [12, 10],
    [12, 14],
    [6, 14],
  ])
    b.street([[xs[i], zs[j]], center], "Sunburst Promenade", diagonal);
  b.node(center, "Sunburst Fountain");
  b.prune();

  const gold = "#e9d9a6";
  landmark(
    b,
    {
      name: "Globe of Tomorrow Tower",
      node: "Globe Tower Plaza",
      at: [0, 0],
      width: 46,
      depth: 46,
      height: 332,
      color: gold,
      shape: (w, d) => footprints.round(w, d, 16),
    },
    blocks[2].lot,
  );
  landmark(
    b,
    {
      name: "Skyline Prime City Hall",
      node: "City Hall Steps",
      at: [0, 0],
      width: 72,
      depth: 52,
      height: 124,
      color: "#efe3c8",
      shape: (w, d) => footprints.notched(w, d, 8),
    },
    blocks[3].lot,
  );
  landmark(
    b,
    {
      name: "Prime Union Terminal",
      node: "Union Terminal Concourse",
      at: [0, 0],
      width: 80,
      depth: 62,
      height: 42,
      color: "#d9c7a0",
      shape: (w, d) => footprints.notched(w, d, 10),
    },
    blocks[4].lot,
  );
  const deco = (w: number, d: number) =>
    footprints.notched(w, d, Math.min(w, d) * 0.18);
  const places: Place[] = [
    {
      name: "Morning Clarion Building",
      node: "Clarion Corner",
      at: [-260, -210],
      width: 30,
      depth: 30,
      height: 236,
      color: "#f4ede0",
      shape: deco,
    },
    {
      name: "Radiant Theater",
      node: "Theater Row",
      at: [210, -120],
      width: 30,
      depth: 30,
      height: 32,
      color: "#c9b28a",
    },
    {
      name: "Aerial Museum",
      node: "Museum Steps",
      at: [-330, 120],
      width: 30,
      depth: 30,
      height: 38,
      color: "#e6d3b3",
    },
    {
      name: "Starlight Ballroom Hotel",
      node: "Starlight Corner",
      at: [300, 280],
      width: 30,
      depth: 30,
      height: 168,
      color: "#b8c4c9",
      shape: deco,
    },
    {
      name: "Chime Tower",
      node: "Chime Square",
      at: [-110, 330],
      width: 24,
      depth: 24,
      height: 142,
      color: "#efe3c8",
      shape: footprints.octagon,
    },
    {
      name: "Mooring Mast Tower",
      node: "Airship Dock",
      at: [390, -390],
      width: 30,
      depth: 30,
      height: 288,
      color: "#dfe4e6",
      shape: deco,
    },
    {
      name: "Victory Arch",
      node: "Victory Arch Gate",
      at: [-400, -400],
      width: 26,
      depth: 16,
      height: 34,
      color: gold,
    },
    {
      name: "Hall of Industry",
      node: "Industry Hall Steps",
      at: [110, -310],
      width: 30,
      depth: 30,
      height: 48,
      color: "#d6c8b5",
    },
    {
      name: "Meridian Savings Bank",
      node: "Meridian Corner",
      at: [-200, 20],
      width: 30,
      depth: 30,
      height: 112,
      color: "#e9e1d4",
      shape: deco,
    },
    {
      name: "Sunburst Bandshell",
      node: "Sunburst Park Gate",
      at: [0, 290],
      width: 26,
      depth: 18,
      height: 14,
      color: "#f2b632",
    },
    {
      name: "Silver Comet Diner",
      node: "Comet Corner",
      at: [380, 120],
      width: 22,
      depth: 14,
      height: 8,
      color: "#c9d3d6",
    },
  ];
  for (const p of places) landmark(b, p);
  b.nameNode([0, -45], "Grand Concourse");

  const palette = [
    "#efe3c8",
    "#d9c7a0",
    "#f4ede0",
    "#c9b28a",
    "#e6d3b3",
    "#b8c4c9",
    "#dcd0b8",
  ];
  fillLots(b, (lot) => {
    const roll = rng();
    const height =
      roll < 0.35
        ? between(rng, 30, 79)
        : roll < 0.86
          ? between(rng, 80, 200)
          : between(rng, 200, 300);
    const across = lot.width >= lot.depth;
    const subs =
      height < 80 && rng() < 0.5
        ? subdivide(rng, lot, across ? 2 : 1, across ? 1 : 2, 3)
        : [lot];
    for (const sub of subs) {
      const width = sub.width * between(rng, 0.85, 1),
        depth = sub.depth * between(rng, 0.85, 1);
      const shape =
        height >= 80 && rng() < 0.45
          ? deco(width, depth)
          : rng() < 0.1
            ? footprints.octagon(width, depth)
            : undefined;
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: 0,
        height: subs.length > 1 ? between(rng, 30, 70) : height,
        color: pick(rng, palette),
        footprint: shape,
      });
    }
  });

  b.landscape("park", "Grand Concourse Plaza", blocks[0].polygon);
  b.landscape("water", "Concourse Reflecting Pool", [
    [-24, -12],
    [24, -12],
    [24, 12],
    [-24, 12],
  ]);
  b.landscape("park", "Sunburst Park", park);
  b.landscape(
    "water",
    "Sunburst Lagoon",
    footprints
      .round(64, 46, 14)
      .map(([x, z]) => [x + center[0] + 95, z + center[1]] as Point),
  );
  b.landscape("park", "Globe Plaza", blocks[2].polygon);
  const trees = ["#5f8f4e", "#6e9e55", "#7aa95c", "#4f7f45"];
  b.scatterTrees(park, 11, 0.75, trees, [6, 11], "Park linden");
  b.scatterTrees(blocks[0].polygon, 16, 0.35, trees, [5, 8], "Plaza plane");
  b.streetTrees(trees, [5, 9], "Boulevard elm");

  amenitiesAt(b, [
    ["water", "Sunburst Fountain", "Sunburst drinking fountain"],
    ["water", "Grand Concourse", "Concourse fountain"],
    ["water", "Union Terminal Concourse", "Terminal fountain"],
    ["water", "City Hall Steps", "City Hall fountain"],
    ["shelter", "Union Terminal Concourse", "Terminal canopy"],
    ["shelter", "Airship Dock", "Dock pavilion"],
    ["shelter", "Sunburst Park Gate", "Park pergola"],
  ]);
}

/* ------------------------------------------------------------------ */
/* Velocity Bay: long sunny avenues, mid-rise labs, cycleways, a bay front */

export function velocityBay(b: CityBuilder) {
  const { rng } = b;
  const xs = [...withMidlines(rng, [-460, -300, -140, 20, 180, 340]), 392];
  const zs = lines(rng, -456, 456, 16, 0);
  const promenade = xs.length - 1;
  const avenues = [
    "Sprint",
    "Relay",
    "Tempo",
    "Momentum",
    "Velocity",
    "Kinetic",
  ];
  const cycleways = ["Gearline", "Spoke", "Pedal", "Freewheel", "Cadence"];
  const streets = [
    "Ohm",
    "Faraday",
    "Kelvin",
    "Joule",
    "Newton",
    "Curie",
    "Hertz",
    "Watt",
    "Planck",
    "Bohr",
    "Maxwell",
    "Lumen",
    "Photon",
    "Quark",
    "Neutrino",
    "Tachyon",
  ];
  const line = (axis: "x" | "z", i: number): LineSpec => {
    if (axis === "z")
      return {
        name: `${streets[i]} Street`,
        style: {
          roadClass: "street",
          lit: rng() < 0.85,
          scenic: 0.15,
          width: 14,
          kind: "road",
          trees: 40,
        },
      };
    if (i === promenade)
      return {
        name: "Bayfront Promenade",
        style: {
          roadClass: "path",
          lit: true,
          scenic: 1,
          width: 12,
          kind: "footway",
          trees: 14,
        },
      };
    if (i % 2)
      return {
        name: `${cycleways[(i - 1) / 2]} Cycleway`,
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.45,
          width: 6,
          kind: "cycleway",
        },
      };
    return {
      name: `${avenues[i / 2]} Avenue`,
      style: {
        roadClass: "major",
        lit: true,
        scenic: 0.2,
        width: 24,
        kind: "road",
        trees: 26,
      },
    };
  };
  const blocks = lattice(b, xs, zs, line, () => true, [
    { i0: 2, i1: 4, j0: 5, j1: 8, kind: "lot", name: "Velocity Labs Campus" },
    { i0: 6, i1: 8, j0: 9, j1: 11, kind: "park", name: "Starting Line Park" },
    { i0: 8, i1: 9, j0: 3, j1: 4, kind: "plaza", name: "Lightning Plaza" },
  ]);
  const parkPoly = blocks[1].polygon;
  b.street(
    [
      [xs[6], zs[9]],
      [xs[8], zs[11]],
    ],
    "Finish Line Path",
    { roadClass: "path", lit: true, scenic: 0.9, width: 5, kind: "footway" },
  );
  b.street(
    [
      [xs[promenade], zs[8]],
      [430, zs[8]],
      [470, zs[8]],
    ],
    "Ferry Pier Walk",
    { roadClass: "path", lit: true, scenic: 1, width: 7, kind: "footway" },
  );
  b.prune();
  b.node([470, zs[8]], "Ferry Landing");
  b.landscape("water", "Velocity Bay", [
    [412, -500],
    [500, -500],
    [500, 500],
    [412, 500],
  ]);

  const [hall, lab] = subdivide(rng, blocks[0].lot, 1, 2, 12);
  landmark(
    b,
    {
      name: "Velocity Labs Accelerator Hall",
      node: "Velocity Labs Gate",
      at: [0, 0],
      width: 120,
      depth: 70,
      height: 34,
      color: "#f2f2ee",
      shape: (w, d) => footprints.round(w, d, 20),
    },
    hall,
  );
  landmark(
    b,
    {
      name: "Photon Research Lab",
      node: "Lab Quad",
      at: [0, 0],
      width: 110,
      depth: 60,
      height: 46,
      color: "#d8e3ea",
      shape: (w, d) => footprints.ell(w, d, 0.4, 0.45),
    },
    lab,
  );
  const places: Place[] = [
    {
      name: "Lightning Clocktower",
      node: "Lightning Plaza",
      at: [blocks[2].lot.center[0] + 80, blocks[2].lot.center[1]],
      width: 18,
      depth: 18,
      height: 78,
      color: "#ff3b30",
      kind: "landmark",
    },
    {
      name: "Bay Ferry Terminal",
      node: "Terminal Steps",
      at: [370, 30],
      width: 40,
      depth: 40,
      height: 18,
      color: "#f5c8a8",
    },
    {
      name: "Sprint Central Station",
      node: "Sprint Station",
      at: [-60, 200],
      width: 60,
      depth: 40,
      height: 24,
      color: "#c8d6cf",
    },
    {
      name: "Kinetic Science Museum",
      node: "Museum Steps",
      at: [100, -380],
      width: 60,
      depth: 40,
      height: 36,
      color: "#e9d8c4",
    },
    {
      name: "Hangar Row Market",
      node: "Hangar Row",
      at: [-380, 380],
      width: 60,
      depth: 40,
      height: 16,
      color: "#a9c1d9",
    },
    {
      name: "Turbine Hall",
      node: "Turbine Corner",
      at: [260, -150],
      width: 60,
      depth: 40,
      height: 28,
      color: "#d8e3ea",
    },
    {
      name: "Relay Tower",
      node: "Relay Square",
      at: [-220, -380],
      width: 26,
      depth: 26,
      height: 80,
      color: "#f2f2ee",
      shape: footprints.octagon,
    },
    {
      name: "Bayview Library",
      node: "Library Steps",
      at: [260, 300],
      width: 50,
      depth: 40,
      height: 22,
      color: "#e9d8c4",
    },
    {
      name: "Photon Arena",
      node: "Arena Gate",
      at: [-400, -60],
      width: 60,
      depth: 40,
      height: 30,
      color: "#f5c8a8",
      shape: (w, d) => footprints.round(w, d, 18),
    },
    {
      name: "Dynamo Lofts",
      node: "Dynamo Corner",
      at: [100, 60],
      width: 60,
      depth: 40,
      height: 42,
      color: "#c8d6cf",
    },
    {
      name: "Pier Nine Boathouse",
      node: "Boathouse Pier",
      at: [370, -330],
      width: 40,
      depth: 30,
      height: 12,
      color: "#f2f2ee",
    },
  ];
  for (const p of places) landmark(b, p);
  b.nameNode(blocks[1].lot.center, "Starting Line");

  const palette = [
    "#f2f2ee",
    "#d8e3ea",
    "#e9d8c4",
    "#c8d6cf",
    "#f5c8a8",
    "#a9c1d9",
    "#eef0e6",
  ];
  fillLots(b, (lot) => {
    const n = lot.width > 45 ? (rng() < 0.5 ? 2 : 3) : 1;
    for (const sub of subdivide(rng, lot, n, 1, 4)) {
      const roll = rng();
      const height =
        roll < 0.55
          ? between(rng, 15, 35)
          : roll < 0.9
            ? between(rng, 35, 60)
            : between(rng, 60, 80);
      const width = sub.width * between(rng, 0.85, 1),
        depth = sub.depth * between(rng, 0.8, 1);
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: 0,
        height,
        color: pick(rng, palette),
        footprint:
          rng() < 0.2
            ? footprints.ell(
                width,
                depth,
                between(rng, 0.3, 0.5),
                between(rng, 0.3, 0.5),
              )
            : undefined,
      });
    }
  });

  b.landscape("park", "Starting Line Park", parkPoly);
  b.landscape("park", "Lightning Plaza", blocks[2].polygon);
  const trees = ["#4f9a4a", "#63ad55", "#79b862", "#3f8a44"];
  b.scatterTrees(parkPoly, 10, 0.8, trees, [6, 10], "Park sycamore");
  b.scatterTrees(blocks[2].polygon, 14, 0.4, trees, [5, 8], "Plaza olive");
  b.streetTrees(trees, [5, 9], "Street sycamore");

  amenitiesAt(b, [
    ["water", "Starting Line", "Park fountain"],
    ["water", "Lightning Plaza", "Plaza fountain"],
    ["water", "Ferry Landing", "Pier fountain"],
    ["water", "Sprint Station", "Station fountain"],
    ["shelter", "Ferry Landing", "Ferry shelter"],
    ["shelter", "Sprint Station", "Station canopy"],
  ]);
}

/* ------------------------------------------------------------------ */
/* Aurora Realm: a radial golden city round a citadel, canals and terraces */

export function auroraRealm(b: CityBuilder) {
  const { rng } = b;
  const R = [90, 155, 220, 270, 320, 370, 420, 465];
  const N = [16, 16, 32, 32, 32, 32, 32, 32];
  const ARC_STEPS = 3;
  const ringNames = [
    "Citadel Ring",
    "Spire Quay",
    "Canal Quay",
    "Mead Ring",
    "Weaver Ring",
    "Rune Ring",
    "Saga Ring",
    "Horizon Ring",
  ];
  const ringStyle = (k: number): StreetStyle =>
    k === 0
      ? { roadClass: "major", lit: true, scenic: 0.7, width: 14, kind: "road" }
      : k === 7
        ? {
            roadClass: "major",
            lit: true,
            scenic: 0.6,
            width: 16,
            kind: "road",
            trees: 15,
          }
        : k <= 2
          ? {
              roadClass: "street",
              lit: true,
              scenic: 0.85,
              width: 10,
              kind: "road",
              trees: 12,
            }
          : {
              roadClass: "street",
              lit: true,
              scenic: 0.4,
              width: 12,
              kind: "road",
              trees: 15,
            };
  const spokeWidth = 9;
  const words = [
    "Sunrise",
    "Raven",
    "Wolf",
    "Elk",
    "Ember",
    "Frost",
    "Amber",
    "Hearth",
    "Bear",
    "Lynx",
    "Swan",
    "Oak",
    "Ash",
    "Thunder",
    "Mist",
    "Salmon",
  ];
  const angle = (k: number, i: number) => (2 * Math.PI * i) / N[k];
  const at = (k: number, i: number): Point => [
    R[k] * Math.cos(angle(k, i)),
    R[k] * Math.sin(angle(k, i)),
  ];
  for (let k = 0; k < R.length; k++)
    b.street(
      Array.from({ length: N[k] + 1 }, (_, i) => at(k, i % N[k])),
      ringNames[k],
      ringStyle(k),
      (i) => arc(R[k], angle(k, i), angle(k, i + 1), ARC_STEPS).slice(1, -1),
    );
  for (let k = 0; k < R.length - 1; k++)
    for (let i = 0; i < N[k]; i++) {
      const s = (i * 32) / N[k];
      const word = words[Math.floor(s / 2)];
      b.street(
        [at(k, i), at(k + 1, (i * N[k + 1]) / N[k])],
        k === 1 ? `${word} Bridge` : s % 2 ? `${word} Lane` : `${word} Way`,
        {
          roadClass: "street",
          lit: true,
          scenic: k === 1 ? 0.95 : 0.3,
          width: spokeWidth,
          kind: "road",
        },
      );
    }
  // The rainbow bridge leaves the Horizon Ring for a point over the fjord.
  const theta = angle(7, 20);
  const rainbow = Array.from({ length: 7 }, (_, i) => {
    const r = R[7] + (i * (686 - R[7])) / 6;
    return [r * Math.cos(theta), r * Math.sin(theta)] as Point;
  });
  b.street(rainbow, "Rainbow Bridge Promenade", {
    roadClass: "path",
    lit: true,
    scenic: 1,
    width: 10,
    kind: "footway",
  });
  b.prune();
  b.node(rainbow[0], "Rainbow Bridge Gate");
  b.node(rainbow.at(-1)!, "Starwatch Point");
  b.node(at(0, 4), "Citadel Gate");
  b.node(at(1, 12), "Spire Court");
  b.node(at(2, 0), "Swan Bridge Landing");
  b.node(at(2, 16), "Raven Bridge Landing");

  // Water: a ring canal (in sixteen reaches between the bridges) and the fjord.
  for (let i = 0; i < 16; i++) {
    const a0 = angle(1, i),
      a1 = angle(1, i + 1);
    b.landscape("water", "Moonwater Canal", [
      ...arc(203, a0, a1, 4),
      ...arc(172, a1, a0, 4),
    ]);
  }
  b.landscape("water", "Skyfjord", [
    [-500, -500],
    [-500, -170],
    [-480, -200],
    [-200, -480],
    [-170, -500],
  ]);

  // Sector lots between rings, each a rectangle facing the citadel.
  const setback = (width: number) => width / 2 + 3;
  const terraces: Point[][] = [];
  const terraceNames = [
    "Moon Garden Terrace",
    "Sun Garden Terrace",
    "Rowan Terrace",
    "Heather Terrace",
    "Juniper Terrace",
    "Saffron Terrace",
    "Lily Terrace",
    "Elder Terrace",
  ];
  const sectors: { lot: Lot; band: number; index: number }[] = [];
  for (const k of [0, 2, 3, 4, 5, 6]) {
    const n = N[k],
      h = Math.PI / n;
    const sIn = setback(ringStyle(k).width),
      sOut = setback(ringStyle(k + 1).width),
      sSide = setback(spokeWidth);
    const ri = R[k] + sIn;
    const outer = R[k + 1] * Math.cos(Math.PI / N[k + 1] / ARC_STEPS) - sOut;
    for (let i = 0; i < n; i++) {
      const mid = angle(k, i) + h;
      if ((k === 3 || k === 5) && i % 8 === 3) {
        const poly: Point[] = [];
        for (const [r, from, to] of [
          [ri, -1, 1],
          [outer, 1, -1],
        ])
          for (let s = 0; s <= 4; s++) {
            const a = mid + (from + ((to - from) * s) / 4) * (h - sSide / r);
            poly.push([r * Math.cos(a), r * Math.sin(a)]);
          }
        terraces.push(poly);
        continue;
      }
      const hw = (ri * Math.sin(h) - sSide) / Math.cos(h);
      const ro = Math.sqrt(outer * outer - hw * hw);
      if (hw < 4 || ro - ri < 8) continue;
      const rc = (ri + ro) / 2;
      const lot = b.fitLot({
        center: [rc * Math.cos(mid), rc * Math.sin(mid)],
        rotation: facing(mid),
        width: hw * 2,
        depth: ro - ri,
      });
      if (!lot) continue;
      b.lots.push(lot);
      sectors.push({ lot, band: k, index: i });
    }
  }

  const gold = ["#e8c065", "#d9a441", "#f1d58a", "#c99a3b"];
  b.building({
    center: [0, 0],
    width: 72,
    depth: 72,
    rotation: 0,
    height: 192,
    color: "#f1d58a",
    name: "Sunhold Citadel",
    kind: "landmark",
    footprint: footprints.round(72, 72, 16),
  });
  [
    "Spire of Dawn",
    "Spire of Noon",
    "Spire of Dusk",
    "Spire of Midnight",
  ].forEach((name, i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    b.building({
      center: [63 * Math.cos(a), 63 * Math.sin(a)],
      width: 11,
      depth: 11,
      rotation: facing(a),
      height: 128 + i * 6,
      color: gold[i],
      name,
      kind: "tower",
      footprint: footprints.octagon(11, 11),
    });
  });
  const places: Place[] = [
    {
      name: "Great Hall of Feasts",
      node: "Feast Hall Steps",
      at: [0, -245],
      width: 60,
      depth: 40,
      height: 46,
      color: "#e8c065",
    },
    {
      name: "Ember Forge",
      node: "Forge Yard",
      at: [295, 30],
      width: 40,
      depth: 40,
      height: 28,
      color: "#b9733a",
    },
    {
      name: "Rune Library",
      node: "Library Steps",
      at: [-250, 150],
      width: 50,
      depth: 40,
      height: 38,
      color: "#efe2bd",
    },
    {
      name: "Skald Theatre",
      node: "Theatre Steps",
      at: [200, 290],
      width: 50,
      depth: 40,
      height: 32,
      color: "#d9a441",
    },
    {
      name: "Weavers Market Hall",
      node: "Weavers Market",
      at: [330, -200],
      width: 60,
      depth: 40,
      height: 24,
      color: "#f1d58a",
    },
    {
      name: "Longship Boathouse",
      node: "Longship Quay",
      at: [-440, -100],
      width: 60,
      depth: 30,
      height: 18,
      color: "#9c7b4f",
    },
    {
      name: "House of Healing",
      node: "Healers Walk",
      at: [110, 410],
      width: 60,
      depth: 30,
      height: 26,
      color: "#efe2bd",
    },
    {
      name: "Horizon Watchtower",
      node: "Horizon Gate",
      at: [440, 0],
      width: 16,
      depth: 16,
      height: 96,
      color: "#e8c065",
      shape: footprints.octagon,
    },
    {
      name: "Rainbow Gatehouse",
      node: "Gatehouse Steps",
      at: [-305, -305],
      width: 40,
      depth: 24,
      height: 34,
      color: "#f1d58a",
    },
    {
      name: "Hall of Shields",
      node: "Shield Court",
      at: [120, -90],
      width: 30,
      depth: 40,
      height: 52,
      color: "#d9a441",
    },
    {
      name: "Moonwell Shrine",
      node: "Moonwell Steps",
      at: [-120, 90],
      width: 30,
      depth: 40,
      height: 40,
      color: "#cfc3a4",
    },
  ];
  for (const p of places) landmark(b, p);
  terraces.forEach((poly, i) =>
    b.nameNode(poly[0], terraceNames[i].replace("Terrace", "Steps")),
  );

  const palette = [
    "#efe2bd",
    "#e8c065",
    "#d9a441",
    "#f1d58a",
    "#cfc3a4",
    "#b9a27a",
  ];
  for (const { lot, band, index } of sectors) {
    if (lot.taken) continue;
    lot.taken = true;
    if (band === 0) {
      const spire = index % 2 === 0;
      const width = spire ? Math.min(14, lot.width) : lot.width * 0.9;
      const depth = spire ? Math.min(14, lot.depth) : lot.depth * 0.8;
      b.building({
        center: lot.center,
        width,
        depth,
        rotation: lot.rotation,
        height: spire ? between(rng, 70, 140) : between(rng, 22, 40),
        color: spire ? pick(rng, gold) : pick(rng, palette),
        name: spire ? "Golden spire" : "Palace hall",
        footprint: spire ? footprints.octagon(width, depth) : undefined,
      });
      continue;
    }
    const n = Math.max(1, Math.round(lot.width / 22));
    for (const sub of subdivide(rng, lot, n, 1, 3)) {
      const spire = rng() < 0.06;
      const base = [0, 0, 28, 20, 16, 12, 12][band];
      const width = spire
        ? Math.min(12, sub.width)
        : sub.width * between(rng, 0.8, 1);
      const depth = spire
        ? Math.min(12, sub.depth)
        : sub.depth * between(rng, 0.75, 1);
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: sub.rotation,
        height: spire ? between(rng, 60, 90) : between(rng, base, base * 1.9),
        color: spire ? pick(rng, gold) : pick(rng, palette),
        footprint: spire
          ? footprints.octagon(width, depth)
          : rng() < 0.25
            ? footprints.notched(width, depth, Math.min(width, depth) * 0.15)
            : undefined,
      });
    }
  }

  const trees = ["#7e9b4a", "#93a84f", "#b5a642", "#6f8f45", "#c9a43a"];
  terraces.forEach((poly, i) => {
    b.landscape("park", terraceNames[i], poly);
    b.scatterTrees(poly, 6.5, 0.9, trees, [5, 10], "Terrace birch");
  });
  const cornerR = R[7] + setback(16) + 1;
  [
    ["Dawn Terraces", -Math.PI / 4],
    ["Harvest Terraces", Math.PI / 4],
    ["Twilight Terraces", (3 * Math.PI) / 4],
  ].forEach(([name, c]) => {
    const mid = c as number;
    const poly: Point[] = [
      ...arc(cornerR, mid - 0.7, mid + 0.7, 10),
      [Math.sign(Math.cos(mid)) * 480, Math.sign(Math.sin(mid)) * 480],
    ];
    b.landscape("park", name as string, poly);
    b.scatterTrees(poly, 9.5, 0.85, trees, [6, 12], "Terrace rowan");
    b.nameNode(
      [cornerR * Math.cos(mid), cornerR * Math.sin(mid)],
      `${name as string} Gate`,
    );
  });
  b.streetTrees(trees, [5, 10], "Golden birch");

  amenitiesAt(b, [
    ["water", "Citadel Gate", "Citadel well"],
    ["water", "Spire Court", "Spire Court fountain"],
    ["water", "Swan Bridge Landing", "Canal fountain"],
    ["water", "Rainbow Bridge Gate", "Bridge fountain"],
    ["shelter", "Starwatch Point", "Starwatch pavilion"],
    ["shelter", "Longship Quay", "Boathouse porch"],
  ]);
}

/* ------------------------------------------------------------------ */
/* Neon District: tight blocks, every street lit, covered skyways */

export function neonDistrict(b: CityBuilder) {
  const { rng } = b;
  const xs = lines(rng, -462, 462, 22, 4);
  const zs = lines(rng, -462, 462, 22, 4);
  const names = [
    "Glitch",
    "Vapor",
    "Laser",
    "Arcade",
    "Synth",
    "Chrome",
    "Static",
    "Circuit",
    "Diode",
    "Cathode",
    "Plasma",
    "Voltage",
    "Prism",
    "Strobe",
    "Echo",
    "Pulse",
    "Bitrate",
    "Pixel",
    "Kilobyte",
    "Sodium",
    "Argon",
    "Krypton",
    "Xenon",
    "Firefly",
    "Midnight",
    "Afterglow",
    "Holo",
    "Signal",
    "Ramen",
    "Karaoke",
    "Vinyl",
    "Lotus",
    "Koi",
    "Lucky Cat",
    "Paper Lantern",
    "Noodle",
    "Bamboo",
    "Taxi",
    "Rain Slick",
    "Moonlight",
    "Jukebox",
    "Tokyo Drift",
    "Polaroid",
    "Cassette",
  ];
  const skyX = new Set([4, 10, 16]),
    skyZ = new Set([5, 13]);
  const line = (axis: "x" | "z", i: number): LineSpec => {
    const name = names[(axis === "x" ? 0 : 22) + i];
    if ((axis === "x" ? skyX : skyZ).has(i))
      return {
        name: `${name} Skyway`,
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.6,
          width: 6,
          kind: "footway",
          covered: true,
        },
      };
    if (axis === "x" && i === 7)
      return {
        name: "Neon Boulevard",
        style: {
          roadClass: "major",
          lit: true,
          scenic: 0.5,
          width: 16,
          kind: "road",
        },
      };
    if (axis === "z" && (i === 9 || i === 17))
      return {
        name: i === 9 ? "Lantern Row" : "Blossom Street",
        style: {
          roadClass: "major",
          lit: true,
          scenic: 0.55,
          width: 14,
          kind: "road",
          trees: 15,
        },
      };
    return {
      name: `${name} Street`,
      style: {
        roadClass: rng() < 0.25 ? "service" : "street",
        lit: true,
        scenic: 0.25,
        width: 11,
        kind: "road",
      },
    };
  };
  const plazas: [number, number, string][] = [
    [3, 3, "Pixel Plaza"],
    [8, 12, "Signal Plaza"],
    [12, 4, "Koi Court"],
    [14, 15, "Static Square"],
    [5, 17, "Glow Garden"],
    [16, 19, "Echo Plaza"],
    [2, 10, "Lantern Court"],
    [12, 9, "Vapor Plaza"],
  ];
  const blocks = lattice(b, xs, zs, line, () => true, [
    {
      i0: 18,
      i1: 19,
      j0: 0,
      j1: 21,
      kind: "water",
      name: "Glowfish Canal",
      bridges: (j) => j % 3 === 0,
    },
    { i0: 9, i1: 11, j0: 16, j1: 18, kind: "plaza", name: "Midnight Market" },
    ...plazas.map(([i, j, name]) => ({
      i0: i,
      i1: i + 1,
      j0: j,
      j1: j + 1,
      kind: "plaza" as const,
      name,
    })),
  ]);
  b.prune();
  const canal = blocks[0].polygon;
  b.landscape("water", "Glowfish Canal", [
    [canal[0][0], -500],
    [canal[1][0], -500],
    [canal[1][0], 500],
    [canal[0][0], 500],
  ]);

  const neon = ["#ff2bd6", "#21e6ff", "#ffe14d", "#7cff6b", "#ff7a1a"];
  const places: Place[] = [
    {
      name: "Hologram Tower",
      node: "Neon Gate",
      at: [-140, -60],
      width: 30,
      depth: 30,
      height: 198,
      color: "#21e6ff",
      shape: footprints.octagon,
    },
    {
      name: "Lotus Pagoda",
      node: "Lotus Steps",
      at: [220, -300],
      width: 24,
      depth: 24,
      height: 46,
      color: "#ff2bd6",
      shape: footprints.octagon,
    },
    {
      name: "Circuit Central Station",
      node: "Circuit Station",
      at: [0, 120],
      width: 30,
      depth: 30,
      height: 26,
      color: "#2a1f45",
    },
    {
      name: "Karaoke Castle",
      node: "Karaoke Corner",
      at: [-300, 250],
      width: 30,
      depth: 30,
      height: 34,
      color: "#ffe14d",
    },
    {
      name: "Midnight Market Hall",
      node: "Market Gate",
      at: [-10, 280],
      width: 30,
      depth: 30,
      height: 18,
      color: "#ff7a1a",
    },
    {
      name: "Synthwave Arena",
      node: "Arena Gate",
      at: [330, 300],
      width: 30,
      depth: 30,
      height: 40,
      color: "#7cff6b",
      shape: (w, d) => footprints.round(w, d, 16),
    },
    {
      name: "Vinyl Vault",
      node: "Vinyl Corner",
      at: [-380, -330],
      width: 30,
      depth: 30,
      height: 14,
      color: "#ff2bd6",
    },
    {
      name: "Lantern Shrine",
      node: "Shrine Steps",
      at: [-420, 60],
      width: 20,
      depth: 20,
      height: 16,
      color: "#ff3b30",
    },
    {
      name: "Club Static",
      node: "Club Door",
      at: [140, 20],
      width: 30,
      depth: 30,
      height: 22,
      color: "#21e6ff",
    },
    {
      name: "Arcade Galaxy",
      node: "Arcade Corner",
      at: [-200, 380],
      width: 30,
      depth: 30,
      height: 28,
      color: "#7cff6b",
    },
    {
      name: "Ramen Row Hall",
      node: "Ramen Row",
      at: [60, -200],
      width: 30,
      depth: 30,
      height: 12,
      color: "#ffe14d",
    },
    {
      name: "Overpass Tower",
      node: "Overpass Junction",
      at: [300, -60],
      width: 30,
      depth: 30,
      height: 176,
      color: "#14202e",
      shape: (w, d) => footprints.notched(w, d, 5),
    },
  ];
  for (const p of places) landmark(b, p);
  b.nameNode([canal[0][0], zs[9]], "Glowfish Bridge");
  b.nameNode(blocks[1].lot.center, "Midnight Market");

  const palette = [
    "#1d1530",
    "#2a1f45",
    "#14202e",
    "#33203d",
    "#1a2633",
    "#241a3a",
  ];
  fillLots(b, (lot) => {
    const across = lot.width >= lot.depth;
    const subs =
      rng() < 0.3
        ? subdivide(rng, lot, across ? 2 : 1, across ? 1 : 2, 2)
        : [lot];
    for (const sub of subs) {
      const roll = rng();
      const height =
        roll < 0.35
          ? between(rng, 10, 28)
          : roll < 0.75
            ? between(rng, 28, 80)
            : roll < 0.95
              ? between(rng, 80, 150)
              : between(rng, 150, 198);
      const width = sub.width * between(rng, 0.88, 1),
        depth = sub.depth * between(rng, 0.88, 1);
      const shape = rng();
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: 0,
        height,
        color: rng() < 0.12 ? pick(rng, neon) : pick(rng, palette),
        footprint:
          shape < 0.25
            ? footprints.ell(
                width,
                depth,
                between(rng, 0.3, 0.5),
                between(rng, 0.3, 0.5),
              )
            : shape < 0.35
              ? footprints.notched(width, depth, Math.min(width, depth) * 0.15)
              : undefined,
      });
    }
  });

  const trees = ["#2f6b4f", "#3c7d5a", "#24594a", "#4a8a64"];
  for (const block of blocks.slice(1)) {
    b.landscape("park", block.spec.name, block.polygon);
    b.scatterTrees(block.polygon, 6.5, 0.7, trees, [4, 7], "Plaza maple");
    if (block.spec.name !== "Midnight Market")
      b.nameNode(block.lot.center, `${block.spec.name} Steps`);
  }
  b.streetTrees(trees, [4, 7], "Cherry tree");

  amenitiesAt(b, [
    ["water", "Pixel Plaza Steps", "Plaza fountain"],
    ["water", "Midnight Market", "Market fountain"],
    ["water", "Circuit Station", "Station fountain"],
    ["water", "Glowfish Bridge", "Canal fountain"],
    ["shelter", "Circuit Station", "Station canopy"],
    ["shelter", "Signal Plaza Steps", "Plaza awning"],
  ]);
}
