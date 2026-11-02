import type {
  LandmarkShape,
  ObjectKind,
  Point,
} from "../../../shared/types.js";
import {
  arc,
  between,
  facing,
  footprints,
  lattice,
  lines,
  pick,
  round,
  spanBetween,
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
  /** Footprint inside the width × depth rectangle. */
  plan?: (w: number, d: number) => Point[];
  /** Signature silhouette, drawn by scene/LandmarkShapes. */
  shape?: LandmarkShape;
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
    footprint: p.plan?.(width, depth),
    shape: p.shape,
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
      {
        i0: 8,
        i1: 12,
        j0: 20,
        j1: harbor,
        kind: "lot",
        name: "Harbor Chemical Works",
      },
      { i0: 0, i1: 4, j0: 10, j1: 16, kind: "lot", name: "Graymoor Estate" },
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
  // A causeway out to the asylum on Blackwater Point.
  const pointX = xs[26];
  b.street(
    [
      [pointX, zs[harbor]],
      [pointX, 392],
    ],
    "Blackwater Causeway",
    { roadClass: "path", lit: false, scenic: 0.6, width: 5, kind: "footway" },
  );
  b.prune();
  b.node([pierX, 432], "Ferry Pier End");
  b.node([pointX, 392], "Asylum Gate");

  const river = blocks[0].polygon;
  // Bridges, the elevated line and the asylum stand over (or beside) the
  // water, so they go up before the water is laid.
  const graymoorZ = (zs[12] + zs[14]) / 2;
  const graymoorBridge = b.building({
    ...spanBetween([xs[4] + 6, graymoorZ], [xs[6] - 6, graymoorZ], 14),
    height: 36,
    color: "#4a4744",
    name: "Graymoor Bridge",
    kind: "landmark",
    shape: "bridge",
  });
  if (!graymoorBridge) throw new Error("Graymoor Bridge does not fit");
  b.nameNode([xs[4], graymoorZ], "Graymoor Bridge West");
  b.nameNode([xs[6], graymoorZ], "Graymoor Bridge East");
  // The elevated line runs the waterfront between the walk and the water,
  // broken at the river, the pier and the causeway.
  const railZ = 335;
  const railRuns: [number, number][] = [
    [-458, river[0][0] - 2],
    [river[1][0] + 2, pierX - 6],
    [pierX + 6, pointX - 6],
    [pointX + 6, 470],
  ];
  for (const [x0, x1] of railRuns) {
    const pieces = Math.ceil((x1 - x0) / 190);
    const step = (x1 - x0) / pieces;
    for (let k = 0; k < pieces; k++)
      b.building({
        ...spanBetween(
          [x0 + step * k + (k ? 4 : 0), railZ],
          [x0 + step * (k + 1) - (k < pieces - 1 ? 4 : 0), railZ],
          9,
        ),
        height: 11,
        color: "#34312f",
        name: "Harbor Elevated Line",
        shape: "bridge",
      });
  }
  const asylum = b.building({
    center: [pointX, 428],
    width: 84,
    depth: 56,
    rotation: 0,
    height: 34,
    color: "#5d5a55",
    name: "Blackwater Asylum",
    kind: "landmark",
    shape: "manor",
  });
  if (!asylum) throw new Error("Blackwater Asylum does not fit");
  const point: [number, number][] = [
    [pointX - 58, 342],
    [pointX + 70, 342],
    [pointX + 70, 470],
    [pointX - 58, 470],
  ];
  b.landscape("water", "Mourning River", [
    [river[0][0], -500],
    [river[1][0], -500],
    [river[1][0], 346],
    [river[0][0], 346],
  ]);
  // The harbor wraps Blackwater Point, a wooded tongue of land.
  b.landscape("water", "Noir Harbor", [
    [-500, 342],
    point[0],
    point[3],
    point[2],
    point[1],
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
      plan: footprints.cross,
      shape: "cathedral",
    },
    blocks[2].lot,
  );
  // The chemical works on the waterfront: a stack hall and a tank farm.
  const [works, tankFarm] = subdivide(rng, blocks[5].lot, 2, 1, 10);
  landmark(
    b,
    {
      name: "Harbor Chemical Works",
      node: "Chemical Works Gate",
      at: [0, 0],
      width: 70,
      depth: 80,
      height: 78,
      color: "#4b4038",
      shape: "smokestacks",
    },
    works,
  );
  landmark(
    b,
    {
      name: "Harbor Chemical Tank Farm",
      node: "Tank Farm Gate",
      at: [0, 0],
      width: 70,
      depth: 80,
      height: 30,
      color: "#6f7468",
      shape: "tanks",
    },
    tankFarm,
  );
  // Graymoor Manor in its woods across the river from the city.
  const estate = blocks[6];
  landmark(
    b,
    {
      name: "Graymoor Manor",
      node: "Graymoor Gate",
      at: [0, 0],
      width: 84,
      depth: 54,
      height: 42,
      color: "#5b5249",
      shape: "manor",
    },
    {
      ...estate.lot,
      center: [estate.lot.center[0], estate.lot.center[1] - 24],
      depth: 54,
    },
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
      plan: footprints.octagon,
      shape: "spire",
    },
    {
      name: "Midnight Clocktower",
      node: "Clocktower Steps",
      at: [blocks[4].lot.center[0] + 70, blocks[4].lot.center[1]],
      width: 22,
      depth: 22,
      height: 204,
      color: "#3a3631",
      plan: footprints.octagon,
      shape: "spire",
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
      name: "Ironbound Courthouse",
      node: "Courthouse Steps",
      at: [-80, -60],
      width: 40,
      depth: 40,
      height: 54,
      color: "#3e3b38",
      shape: "hall",
    },
    {
      name: "Central Precinct",
      node: "Precinct Steps",
      at: [70, -170],
      width: 40,
      depth: 36,
      height: 40,
      color: "#3d4048",
      shape: "signal",
    },
    {
      name: "Obsidian Opera House",
      node: "Opera Corner",
      at: [210, -40],
      width: 40,
      depth: 40,
      height: 48,
      color: "#262428",
      shape: "dome",
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
      height: 58,
      color: "#4b3b32",
      shape: "smokestacks",
    },
    {
      name: "Weatherglass Observatory",
      node: "Observatory Hill",
      at: [400, -400],
      width: 30,
      depth: 30,
      height: 120,
      color: "#30343c",
      plan: footprints.octagon,
      shape: "dome",
    },
    {
      name: "Monarch Grand Hotel",
      node: "Monarch Corner",
      at: [110, 110],
      width: 40,
      depth: 40,
      height: 158,
      color: "#3a3f47",
      shape: "stepped",
    },
    {
      name: "Gargoyle Perch Bank",
      node: "Bankers Row",
      at: [-250, -90],
      width: 40,
      depth: 40,
      height: 112,
      color: "#2f3036",
      shape: "stepped",
    },
    {
      name: "Lighthouse of Saint Ione",
      node: "Lighthouse Point",
      at: [-430, 300],
      width: 18,
      depth: 18,
      height: 70,
      color: "#d8d2c4",
      plan: footprints.octagon,
    },
    {
      name: "Ravenhollow Mausoleum",
      node: "Ravenhollow Gate",
      at: [blocks[1].lot.center[0], blocks[1].polygon[0][1] - 40],
      width: 30,
      depth: 30,
      height: 26,
      color: "#5a5650",
      shape: "pyramid",
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
      // The core's tall towers rise to gothic spires and deco setbacks.
      const form = height > 100 && (core || height > 165) ? rng() : 1;
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: tilt,
        height,
        color: pick(rng, palette),
        footprint: shape,
        shape: form < 0.32 ? "spire" : form < 0.62 ? "stepped" : undefined,
      });
    }
  });

  b.landscape("park", "Ravenhollow Cemetery", blocks[1].polygon);
  b.landscape("park", "Gaslight Commons", blocks[3].polygon);
  b.landscape("park", "Clocktower Square", blocks[4].polygon);
  b.landscape("park", "Cathedral Close", blocks[2].polygon);
  b.landscape("park", "Graymoor Woods", estate.polygon);
  b.landscape("park", "Blackwater Point", point);
  const trees = ["#2f3b33", "#36433a", "#2a3530", "#3f4a3c"];
  b.scatterTrees(blocks[1].polygon, 8.5, 0.85, trees, [5, 9], "Cemetery yew");
  b.scatterTrees(blocks[3].polygon, 9, 0.8, trees, [5, 9], "Commons elm");
  b.scatterTrees(blocks[4].polygon, 14, 0.35, trees, [4, 7], "Square plane");
  b.scatterTrees(blocks[2].polygon, 12, 0.4, trees, [5, 8], "Close yew");
  b.scatterTrees(estate.polygon, 9, 0.8, trees, [7, 12], "Graymoor oak");
  b.scatterTrees(point, 9, 0.6, trees, [5, 9], "Blackwater willow");
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
  // The harbor opens the south-east corner: its outer streets go.
  const harborEdge = (axis: "x" | "z", i: number, seg: number) =>
    i === 18 && seg >= (axis === "x" ? 16 : 14);
  const blocks = lattice(
    b,
    xs,
    zs,
    line,
    (axis, i, seg) =>
      harborEdge(axis, i, seg) ? false : i % 2 ? rng() < 0.7 : true,
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
      { i0: 14, i1: 18, j0: 16, j1: 18, kind: "water", name: "Prime Harbor" },
      { i0: 4, i1: 6, j0: 8, j1: 10, kind: "lot", name: "Champions Court" },
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

  // The harbor bridge strikes out east over the water from the shore.
  const harbor = blocks[5].polygon;
  const bayZ = (harbor[0][1] + 480) / 2;
  const bayBridge = b.building({
    ...spanBetween([harbor[0][0] + 2, bayZ], [478, bayZ], 20),
    height: 66,
    color: "#c9d3d6",
    name: "Starliner Bay Bridge",
    kind: "landmark",
    shape: "bridge",
  });
  if (!bayBridge) throw new Error("Starliner Bay Bridge does not fit");
  b.nameNode([xs[14], bayZ], "Bay Bridge Overlook");
  b.landscape("water", "Prime Harbor", [
    harbor[0],
    [500, harbor[0][1]],
    [500, 500],
    [harbor[0][0], 500],
  ]);

  const gold = "#e9d9a6";
  landmark(
    b,
    {
      name: "Daily Clarion Globe Tower",
      node: "Globe Tower Plaza",
      at: [0, 0],
      width: 46,
      depth: 46,
      height: 332,
      color: gold,
      plan: (w, d) => footprints.round(w, d, 16),
      shape: "globe",
    },
    blocks[2].lot,
  );
  // The hall of heroes faces the Grand Concourse across its court.
  const court = blocks[6].lot;
  landmark(
    b,
    {
      name: "Hall of Champions",
      node: "Champions Court Steps",
      at: [0, 0],
      width: 60,
      depth: 72,
      height: 46,
      color: "#f6f1e4",
      shape: "hall",
    },
    {
      ...court,
      rotation: -90,
      width: court.depth,
      depth: Math.min(court.width, 58),
    },
  );
  const statue = b.building({
    center: [0, 23],
    width: 11,
    depth: 11,
    rotation: 180,
    height: 26,
    color: "#c9a24f",
    name: "Guardian of Tomorrow Statue",
    kind: "landmark",
    shape: "statue",
  });
  if (!statue) throw new Error("The statue does not fit its plaza");
  b.nameNode([0, 50], "Guardian Statue Steps");
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
      plan: (w, d) => footprints.notched(w, d, 8),
      shape: "stepped",
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
      plan: (w, d) => footprints.notched(w, d, 10),
    },
    blocks[4].lot,
  );
  const deco = (w: number, d: number) =>
    footprints.notched(w, d, Math.min(w, d) * 0.18);
  const places: Place[] = [
    {
      name: "Morning Courier Building",
      node: "Courier Corner",
      at: [-260, -210],
      width: 30,
      depth: 30,
      height: 236,
      color: "#f4ede0",
      plan: deco,
      shape: "stepped",
    },
    {
      name: "Apex Tower",
      node: "Apex Plaza",
      at: [220, -300],
      width: 30,
      depth: 30,
      height: 312,
      color: "#9fb2c4",
      plan: footprints.octagon,
      shape: "spire",
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
      height: 44,
      color: "#e6d3b3",
      shape: "dome",
    },
    {
      name: "Starlight Ballroom Hotel",
      node: "Starlight Corner",
      at: [300, 280],
      width: 30,
      depth: 30,
      height: 168,
      color: "#b8c4c9",
      plan: deco,
      shape: "stepped",
    },
    {
      name: "Chime Tower",
      node: "Chime Square",
      at: [-110, 330],
      width: 24,
      depth: 24,
      height: 142,
      color: "#efe3c8",
      plan: footprints.octagon,
      shape: "spire",
    },
    {
      name: "Mooring Mast Tower",
      node: "Airship Dock",
      at: [390, -390],
      width: 30,
      depth: 30,
      height: 288,
      color: "#dfe4e6",
      plan: deco,
      shape: "stepped",
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
      plan: deco,
      shape: "stepped",
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
      const tall = subs.length === 1 && height >= 80;
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: 0,
        height: subs.length > 1 ? between(rng, 30, 70) : height,
        color: pick(rng, palette),
        footprint: shape,
        // Gleaming setback towers fill the downtown.
        ...(tall && rng() < 0.42 ? { shape: "stepped" as const } : {}),
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
  b.landscape("park", "Champions Court", blocks[6].polygon);
  const trees = ["#5f8f4e", "#6e9e55", "#7aa95c", "#4f7f45"];
  b.scatterTrees(park, 11, 0.75, trees, [6, 11], "Park linden");
  b.scatterTrees(blocks[0].polygon, 16, 0.35, trees, [5, 8], "Plaza plane");
  b.scatterTrees(blocks[6].polygon, 12, 0.5, trees, [5, 8], "Court linden");
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
  // A suspension bridge strides along the bay, offshore.
  const bayBridge = b.building({
    ...spanBetween([446, -462], [446, -262], 16),
    height: 62,
    color: "#ff5a3c",
    name: "Velocity Bay Bridge",
    kind: "landmark",
    shape: "bridge",
  });
  if (!bayBridge) throw new Error("Velocity Bay Bridge does not fit");
  b.nameNode([xs[promenade], -362], "Bay Bridge Overlook");
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
      plan: (w, d) => footprints.round(w, d, 20),
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
      plan: (w, d) => footprints.ell(w, d, 0.4, 0.45),
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
      plan: footprints.octagon,
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
      plan: (w, d) => footprints.round(w, d, 18),
      shape: "arena",
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
  // The rainbow bridge itself arcs over the fjord beside its promenade.
  const along = (r: number): Point => [
    r * Math.cos(theta) + 15 * -Math.sin(theta),
    r * Math.sin(theta) + 15 * Math.cos(theta),
  ];
  const rainbowBridge = b.building({
    ...spanBetween(along(495), along(645), 12),
    height: 28,
    color: "#f1d58a",
    name: "Rainbow Bridge",
    kind: "landmark",
    shape: "bridge",
  });
  if (!rainbowBridge) throw new Error("The Rainbow Bridge does not fit");

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
    shape: "dome",
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
      shape: "spire",
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
      shape: "hall",
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
      plan: footprints.octagon,
      shape: "spire",
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
      shape: "dome",
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
      plan: footprints.octagon,
      shape: "stepped",
    },
    {
      name: "Lotus Pagoda",
      node: "Lotus Steps",
      at: [220, -300],
      width: 24,
      depth: 24,
      height: 46,
      color: "#ff2bd6",
      plan: footprints.octagon,
      shape: "stepped",
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
      plan: (w, d) => footprints.round(w, d, 16),
      shape: "arena",
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
      name: "Searchlight Tower",
      node: "Searchlight Corner",
      at: [-60, -360],
      width: 30,
      depth: 30,
      height: 34,
      color: "#2a1f45",
      shape: "signal",
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
      plan: (w, d) => footprints.notched(w, d, 5),
      shape: "stepped",
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

/* ------------------------------------------------------------------ */
/* Dune Reach: a shaded maze of an old quarter beside treeless boulevards */

type Box = [x0: number, x1: number, z0: number, z1: number];
const corners = ([x0, x1, z0, z1]: Box): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
/**
 * Pull each side of an upright rectangle in a metre at a time, only where
 * it crowds a path, so walls hug crooked lanes instead of backing off them.
 */
function hug(b: CityBuilder, start: Box, margin: number): Box | null {
  let [x0, x1, z0, z1] = start;
  const strip = 0.6;
  for (let k = 0; k < 16; k++) {
    if (x1 - x0 < 4 || z1 - z0 < 4) return null;
    if (b.clearOfPaths(corners([x0, x1, z0, z1]), margin))
      return [x0, x1, z0, z1];
    const west = !b.clearOfPaths(corners([x0, x0 + strip, z0, z1]), margin),
      east = !b.clearOfPaths(corners([x1 - strip, x1, z0, z1]), margin),
      north = !b.clearOfPaths(corners([x0, x1, z0, z0 + strip]), margin),
      south = !b.clearOfPaths(corners([x0, x1, z1 - strip, z1]), margin);
    const any = west || east || north || south;
    if (west || !any) x0 += 1;
    if (east || !any) x1 -= 1;
    if (north || !any) z0 += 1;
    if (south || !any) z1 -= 1;
  }
  return null;
}
const boxLot = ([x0, x1, z0, z1]: Box): Lot => ({
  center: [(x0 + x1) / 2, (z0 + z1) / 2],
  rotation: 0,
  width: x1 - x0,
  depth: z1 - z0,
});
const toBox = (lot: Lot): Box => [
  lot.center[0] - lot.width / 2,
  lot.center[0] + lot.width / 2,
  lot.center[1] - lot.depth / 2,
  lot.center[1] + lot.depth / 2,
];
/** A courtyard house: thick walls in a U round a yard that opens along ±x. */
function courtyardHouse(w: number, d: number, open: 1 | -1): Point[] {
  const t = Math.min(w, d) * 0.3;
  return (
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, -d / 2 + t],
      [-w / 2 + t, -d / 2 + t],
      [-w / 2 + t, d / 2 - t],
      [w / 2, d / 2 - t],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as Point[]
  ).map(([x, z]) => [round(x * open), round(z)]);
}
/** One street per unbroken run of present segments, bent a little midway. */
function crookedLine(
  b: CityBuilder,
  points: Point[],
  present: boolean[],
  name: string,
  s: StreetStyle,
  wiggle: number,
) {
  let start = -1;
  for (let k = 0; k <= present.length; k++) {
    if (k < present.length && present[k]) {
      if (start < 0) start = k;
      continue;
    }
    if (start >= 0) {
      const run = points.slice(start, k + 1);
      const bends = run.slice(1).map((p, m): Point[] => {
        const a = run[m];
        const len = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
        const off = between(b.rng, -wiggle, wiggle);
        return [
          [
            (a[0] + p[0]) / 2 - ((p[1] - a[1]) / len) * off,
            (a[1] + p[1]) / 2 + ((p[0] - a[0]) / len) * off,
          ],
        ];
      });
      b.street(run, name, s, wiggle ? (m) => bends[m] : undefined);
      start = -1;
    }
  }
}

export function duneReach(b: CityBuilder) {
  const { rng } = b;
  // The old quarter: a maze of crooked lanes on a jittered grid, west of
  // Sun Boulevard. Its last "column" is the boulevard itself.
  const BOULEVARD_X = 60;
  const cols = 13,
    rows = 19,
    last = rows - 1;
  const baseX = lines(rng, -462, 18, cols, 0);
  const baseZ = lines(rng, -450, 240, rows, 0);
  const P: Point[][] = [...baseX, BOULEVARD_X].map((x, i) =>
    baseZ.map((z, j) => {
      const fixedX = i === 0 || i === cols,
        fixedZ = j === 0 || j === last || i === cols;
      return [
        round(fixedX ? x : x + between(rng, -1.5, 1.5)),
        round(fixedZ ? z : z + between(rng, -3.5, 3.5)),
      ];
    }),
  );
  const laneNames = [
    "Saffron",
    "Cumin",
    "Indigo",
    "Henna",
    "Amber",
    "Cardamom",
    "Lantern",
    "Copper",
    "Tamarind",
    "Mosaic",
    "Clay",
    "Sandalwood",
  ];
  const alleyNames = [
    "Scorpion",
    "Falcon",
    "Jackal",
    "Date",
    "Ochre",
    "Brass",
    "Kettle",
    "Carpet",
    "Loom",
    "Mirror",
    "Potter",
    "Weaver",
    "Spindle",
    "Inkwell",
    "Lizard",
    "Cistern",
    "Myrrh",
  ];
  const lane = (lit: boolean, width: number) =>
    style({ roadClass: "path", lit, scenic: 0.65, width, kind: "footway" });
  const wallRoad = style({
    roadClass: "street",
    lit: true,
    scenic: 0.35,
    width: 8,
    kind: "road",
  });
  const caravanRoad = style({
    roadClass: "street",
    lit: true,
    scenic: 0.3,
    width: 9,
    kind: "road",
  });
  const boulevard = (width: number) =>
    style({ roadClass: "major", lit: true, scenic: 0.1, width, kind: "road" });

  // Lanes run north–south almost unbroken; cross alleys come and go.
  const vertical: (StreetStyle | null)[][] = [];
  for (let i = 0; i < cols; i++) {
    const s = i === 0 ? wallRoad : lane(rng() < 0.6, 3);
    const present = Array.from({ length: last }, () => i === 0 || rng() < 0.88);
    vertical.push(present.map((p) => (p ? s : null)));
    crookedLine(
      b,
      P[i],
      present,
      i === 0 ? "Old Wall Road" : `${laneNames[i - 1]} Lane`,
      s,
      i === 0 ? 0 : 1.5,
    );
  }
  vertical.push(Array.from({ length: last }, () => boulevard(44)));
  const horizontal: (StreetStyle | null)[][] = [];
  for (let j = 0; j < rows; j++) {
    const edge = j === 0 || j === last;
    const s =
      j === 0 ? caravanRoad : j === last ? boulevard(36) : lane(true, 2.6);
    const present = Array.from(
      { length: cols },
      (_, i) => edge || i === cols - 1 || rng() < 0.5,
    );
    horizontal.push(present.map((p) => (p ? s : null)));
    crookedLine(
      b,
      P.map((column) => column[j]),
      present,
      j === 0
        ? "Caravan Road"
        : j === last
          ? "Mirage Avenue"
          : `${alleyNames[j - 1]} Alley`,
      s,
      edge ? 0 : 2.5,
    );
  }

  // The boulevard district: wide, straight and treeless, its long blocks
  // threaded by the old quarter's gate rows.
  const coarse = [0, 4, 8, 12, 15, last, last + 1, last + 2];
  const rowNames: Record<number, string> = {
    0: "Caravan Boulevard",
    4: "Heliograph Boulevard",
    8: "Quartz Boulevard",
    12: "Ember Boulevard",
    15: "Salt Boulevard",
    [last]: "Mirage Avenue",
    [last + 1]: "Palm Gate Boulevard",
    [last + 2]: "Far Sands Boulevard",
  };
  const dxs = [BOULEVARD_X, 190, 320, 450];
  const dzs = [...baseZ, 352, 462];
  const avenueNames = [
    "Sun Boulevard",
    "Glassworks Avenue",
    "Solar Avenue",
    "Horizon Avenue",
  ];
  const districtBlocks = lattice(
    b,
    dxs,
    dzs,
    (axis, i) =>
      axis === "x"
        ? { name: avenueNames[i], style: boulevard(i === 0 ? 44 : 30) }
        : coarse.includes(i)
          ? { name: rowNames[i], style: boulevard(i === last ? 36 : 30) }
          : null,
    () => true,
    coarse.slice(0, -1).flatMap((j0, k) =>
      [0, 1, 2].map((i) => ({
        i0: i,
        i1: i + 1,
        j0,
        j1: coarse[k + 1],
        kind: "lot" as const,
        name: "Boulevard block",
      })),
    ),
  );

  // The oasis: a palm walk round a pool, south of Mirage Avenue.
  const pool: Point = [-215, 368];
  const loop = Array.from({ length: 24 }, (_, k) => {
    const a = (k / 24) * Math.PI * 2;
    return [
      round(pool[0] + 150 * Math.cos(a)),
      round(pool[1] + 78 * Math.sin(a)),
    ] as Point;
  });
  const palmWalk = style({
    roadClass: "path",
    lit: true,
    scenic: 1,
    width: 5,
    kind: "footway",
    trees: 11,
  });
  b.street([...loop, loop[0]], "Palm Walk", palmWalk);
  const nearestOnLoop = (p: Point) =>
    loop.reduce((best, q) =>
      Math.hypot(q[0] - p[0], q[1] - p[1]) <
      Math.hypot(best[0] - p[0], best[1] - p[1])
        ? q
        : best,
    );
  const oasisPath = style({
    roadClass: "path",
    lit: false,
    scenic: 0.9,
    width: 4,
    kind: "footway",
  });
  for (const i of [3, 6, 9]) {
    const gate = P[i][last];
    b.street(
      [gate, nearestOnLoop([gate[0], pool[1] - 78])],
      "Oasis Path",
      oasisPath,
    );
  }
  b.street([loop[0], [BOULEVARD_X, dzs[last + 1]]], "Spring Path", oasisPath);
  b.street(
    [loop[6], [BOULEVARD_X, dzs[last + 2]]],
    "Date Grove Path",
    oasisPath,
  );
  b.prune();

  b.node([BOULEVARD_X, baseZ[0]], "Caravan Gate");
  b.node([BOULEVARD_X, baseZ[last]], "Mirage Gate");
  b.node(loop[18], "Oasis Spring");
  b.node(loop[12], "Palm Walk West");

  // Old-quarter cells: each kept as a lot, its houses fitted to the lanes.
  const sb = (s: StreetStyle | null) =>
    s ? s.width / 2 + (s.kind === "road" ? 3 : 0.9) : 0.8;
  const medina: { lot: Lot; raw: Box }[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < last; j++) {
      const raw: Box = [
        (P[i][j][0] + P[i][j + 1][0]) / 2 + sb(vertical[i][j]),
        (P[i + 1][j][0] + P[i + 1][j + 1][0]) / 2 - sb(vertical[i + 1][j]),
        (P[i][j][1] + P[i + 1][j][1]) / 2 + sb(horizontal[j][i]),
        (P[i][j + 1][1] + P[i + 1][j + 1][1]) / 2 - sb(horizontal[j + 1][i]),
      ];
      const fit = hug(b, raw, 0.8);
      if (!fit) continue;
      const lot = boxLot(fit);
      b.lots.push(lot);
      medina.push({ lot, raw });
    }
  const district: Lot[] = [];
  for (const block of districtBlocks)
    for (const sub of subdivide(rng, block.lot, 2, 2, 0)) {
      const lot = b.fitLot(sub);
      if (lot) {
        b.lots.push(lot);
        district.push(lot);
      }
    }

  const squares: [Point, string][] = [
    [[-250, -190], "Seven Winds Square"],
    [[-110, -380], "Well Square"],
    [[-370, 90], "Lantern Square"],
  ];
  const squarePolys = squares.map(([at, name]) => {
    const lot = b.takeLot(at)!;
    b.nameNode(lot.center, name);
    return { name, poly: corners(toBox(lot)) };
  });

  const places: Place[] = [
    {
      name: "Tower of Seven Winds",
      node: "Windcatcher Steps",
      at: [-210, -190],
      width: 9,
      depth: 9,
      height: 38,
      color: "#c99a62",
      plan: footprints.octagon,
      shape: "wind-tower",
    },
    {
      name: "Saffron Souk Hall",
      node: "Saffron Souk",
      at: [-300, -60],
      width: 30,
      depth: 30,
      height: 12,
      color: "#d9a35f",
      plan: (w, d) => footprints.notched(w, d, 3),
    },
    {
      name: "Old Caravanserai",
      node: "Caravanserai Court",
      at: [-380, -410],
      width: 34,
      depth: 34,
      height: 10,
      color: "#c79e6e",
      plan: (w, d) => courtyardHouse(w, d, 1),
    },
    {
      name: "Cistern of Cool Stone",
      node: "Cistern Steps",
      at: [-120, 60],
      width: 24,
      depth: 24,
      height: 8,
      color: "#bfa27c",
      plan: (w, d) => footprints.round(w, d, 16),
      shape: "dome",
    },
    {
      name: "Mosaic Bathhouse",
      node: "Bathhouse Door",
      at: [-330, 160],
      width: 26,
      depth: 26,
      height: 9,
      color: "#e3c79b",
      plan: (w, d) => footprints.round(w, d, 12),
      shape: "dome",
    },
    {
      name: "Lantern Makers Guildhall",
      node: "Guildhall Corner",
      at: [-60, -280],
      width: 28,
      depth: 28,
      height: 13,
      color: "#b98b5e",
    },
    {
      name: "Palm Court Teahouse",
      node: "Teahouse Corner",
      at: [-240, 215],
      width: 20,
      depth: 20,
      height: 7,
      color: "#e8d2ae",
    },
    {
      name: "Museum of Desert Glass",
      node: "Glass Museum Plaza",
      at: [250, -230],
      width: 50,
      depth: 40,
      height: 22,
      color: "#e9e4d8",
      shape: "pyramid",
    },
    {
      name: "Heliograph Exchange",
      node: "Exchange Plaza",
      at: [380, 60],
      width: 40,
      depth: 40,
      height: 22,
      color: "#e4ddd0",
    },
    {
      name: "Mirage Transit Terminal",
      node: "Mirage Terminal",
      at: [130, 300],
      width: 60,
      depth: 40,
      height: 14,
      color: "#d8d4cc",
    },
    {
      name: "Sandglass Clocktower",
      node: "Sandglass Corner",
      at: [390, -390],
      width: 10,
      depth: 10,
      height: 44,
      color: "#ff8a3d",
      plan: footprints.octagon,
    },
    {
      name: "Copper Dome Observatory",
      node: "Observatory Steps",
      at: [250, 410],
      width: 30,
      depth: 30,
      height: 18,
      color: "#b87333",
      plan: (w, d) => footprints.round(w, d, 16),
      shape: "dome",
    },
  ];
  for (const p of places) landmark(b, p);

  const sand = [
    "#d9b98a",
    "#cfa877",
    "#e3c79b",
    "#c49a6c",
    "#e8d2ae",
    "#b98b5e",
    "#d6ae7b",
  ];
  for (const { lot, raw } of medina) {
    if (lot.taken) continue;
    lot.taken = true;
    const whole = boxLot(raw);
    const nx = whole.width > 24 ? 2 : 1;
    const nz = whole.depth > 24 && rng() < 0.7 ? 2 : 1;
    subdivide(rng, whole, nx, nz, 1.2).forEach((sub, k) => {
      const fit = hug(b, toBox(sub), 0.8);
      if (!fit) return;
      const [, , z0, z1] = fit;
      let [x0, x1] = fit;
      // Left-hand houses open their yards east, right-hand ones west.
      const open: 1 | -1 = nx === 2 && k >= nz ? -1 : 1;
      if (rng() < 0.03 && x1 - x0 >= 15) {
        const tx = open === 1 ? x1 - 2.5 : x0 + 2.5;
        b.building({
          center: [tx, (z0 + z1) / 2],
          width: 5,
          depth: 5,
          rotation: 0,
          height: between(rng, 18, 26),
          color: "#c99a62",
          name: "Wind tower",
          kind: "tower",
          shape: "wind-tower",
        });
        if (open === 1) x1 -= 6;
        else x0 += 6;
      }
      const width = x1 - x0,
        depth = z1 - z0;
      b.building({
        center: [(x0 + x1) / 2, (z0 + z1) / 2],
        width,
        depth,
        rotation: 0,
        height: 6 + 8 * Math.sqrt(rng()),
        color: pick(rng, sand),
        name: "Courtyard house",
        footprint:
          width >= 9 && depth >= 9 && rng() < 0.6
            ? courtyardHouse(width, depth, open)
            : undefined,
      });
    });
  }
  const modern = ["#f2ece0", "#e4ddd0", "#d8d4cc", "#efe6d6", "#c9c2b4"];
  for (const lot of district) {
    if (lot.taken) continue;
    lot.taken = true;
    // Low and sparse: one or two pavilions on a lot of bare, hot ground.
    const n = rng() < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const width = lot.width * between(rng, 0.3, 0.5),
        depth = lot.depth * between(rng, 0.3, 0.5);
      const cx = between(rng, -1, 1) * (lot.width - width) * 0.5,
        cz = between(rng, -1, 1) * (lot.depth - depth) * 0.5;
      b.building({
        center: [lot.center[0] + cx, lot.center[1] + cz],
        width,
        depth,
        rotation: 0,
        height: between(rng, 6, 18),
        color: pick(rng, modern),
        name: "Boulevard pavilion",
      });
    }
  }

  const palms = ["#6b8f3a", "#7d9a3e", "#5f7f34", "#8aa24a"];
  const oasis: Point[] = [
    [-476, 262],
    [34, 262],
    [34, 476],
    [-476, 476],
  ];
  b.landscape(
    "water",
    "Oasis Pool",
    footprints
      .round(230, 96, 20)
      .map(([x, z]) => [x + pool[0], z + pool[1]] as Point),
  );
  b.landscape("park", "Palm Oasis", oasis);
  b.scatterTrees(oasis, 10, 0.7, palms, [4.5, 7.5], "Date palm");
  for (const { name, poly } of squarePolys) {
    b.landscape("park", name, poly);
    b.scatterTrees(poly, 9, 0.35, palms, [4, 6], "Square palm");
  }
  b.streetTrees(palms, [4.5, 7.5], "Walk palm");

  amenitiesAt(b, [
    ["water", "Seven Winds Square", "Seven Winds fountain"],
    ["water", "Well Square", "Old well"],
    ["water", "Oasis Spring", "Oasis spring"],
    ["water", "Mirage Terminal", "Terminal fountain"],
    ["water", "Caravanserai Court", "Caravanserai fountain"],
    ["shelter", "Mirage Terminal", "Terminal shade canopy"],
    ["shelter", "Saffron Souk", "Souk awning"],
    ["shelter", "Oasis Spring", "Spring pavilion"],
  ]);
}

/* ------------------------------------------------------------------ */
/* Verdant Canopy: terraced mid-rises under a forest of street trees */

export function verdantCanopy(b: CityBuilder) {
  const { rng } = b;
  const xs = withMidlines(rng, lines(rng, -462, 462, 9, 3), 2);
  const zs = withMidlines(rng, lines(rng, -462, 462, 9, 3), 2);
  const RIVER = 12;
  const wayNames = [
    "Kapok",
    "Tembusu",
    "Frangipani",
    "Mahogany",
    "Banyan",
    "Angsana",
    "Rain Tree",
    "Jacaranda",
    "Trumpet Tree",
    "Saga",
    "Cinnamon",
    "Nutmeg",
    "Ylang",
    "Sea Almond",
    "Pong Pong",
    "Ironwood",
    "Bodhi",
    "Durian",
  ];
  const laneNames = [
    "Fern",
    "Moss",
    "Orchid",
    "Bamboo",
    "Pandan",
    "Lotus",
    "Ivy",
    "Wisteria",
    "Begonia",
    "Heliconia",
    "Pitcher",
    "Lichen",
    "Calathea",
    "Staghorn",
    "Bromeliad",
    "Monstera",
  ];
  const arcades = { x: new Set([3, 15]), z: new Set([5, 11]) };
  const line = (axis: "x" | "z", i: number): LineSpec => {
    if (axis === "x" && (i === RIVER || i === RIVER + 1))
      return {
        name: i === RIVER ? "West Riverwalk" : "East Riverwalk",
        style: {
          roadClass: "path",
          lit: true,
          scenic: 1,
          width: 8,
          kind: "footway",
          trees: 8,
        },
      };
    const lane = laneNames[(axis === "x" ? 0 : 8) + (i - 1) / 2];
    if (i % 2 && arcades[axis].has(i))
      return {
        name: `${lane} Arcade`,
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.8,
          width: 6,
          kind: "footway",
          covered: true,
        },
      };
    if (i % 2)
      return {
        name: `${lane} Lane`,
        style: {
          roadClass: "path",
          lit: true,
          scenic: 0.9,
          width: 4,
          kind: "footway",
        },
      };
    if (i === 8)
      return {
        name: axis === "x" ? "Canopy Avenue" : "Banyan Avenue",
        style: {
          roadClass: "major",
          lit: true,
          scenic: 0.85,
          width: 14,
          kind: "road",
          trees: 9,
        },
      };
    return {
      name: `${wayNames[(axis === "x" ? 0 : 9) + i / 2]} Way`,
      style: {
        roadClass: "street",
        lit: true,
        scenic: 0.8,
        width: 10,
        kind: "road",
        trees: 11,
      },
    };
  };
  const pockets: [number, number, string][] = [
    [2, 12, "Fern Terrace Garden"],
    [4, 3, "Orchid Terrace Garden"],
    [10, 14, "Moss Terrace Garden"],
    [14, 5, "Bamboo Terrace Garden"],
    [14, 11, "Lotus Terrace Garden"],
    [1, 6, "Ivy Terrace Garden"],
  ];
  const blocks = lattice(
    b,
    xs,
    zs,
    line,
    (axis, i) => (i % 2 && !arcades[axis].has(i) ? rng() < 0.8 : true),
    [
      {
        i0: RIVER,
        i1: RIVER + 1,
        j0: 0,
        j1: zs.length - 1,
        kind: "water",
        name: "Jade River",
        bridges: (j) => j % 2 === 0,
      },
      { i0: 6, i1: 10, j0: 6, j1: 10, kind: "lot", name: "Botanic Garden" },
      ...pockets.map(([i, j, name]) => ({
        i0: i,
        i1: i + 1,
        j0: j,
        j1: j + 1,
        kind: "park" as const,
        name,
      })),
    ],
  );

  // The botanic garden: a fern loop round the glasshouse, walks to its gates.
  const garden = blocks[1];
  const c = garden.lot.center;
  const ring = Array.from({ length: 16 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2;
    return [
      round(c[0] + 62 * Math.cos(a)),
      round(c[1] + 62 * Math.sin(a)),
    ] as Point;
  });
  const gardenWalk = style({
    roadClass: "path",
    lit: true,
    scenic: 1,
    width: 5,
    kind: "footway",
    trees: 10,
  });
  b.street([...ring, ring[0]], "Fern Loop", gardenWalk);
  const gates: [Point, number][] = [
    [[xs[6], zs[6]], 10],
    [[xs[10], zs[6]], 14],
    [[xs[10], zs[10]], 2],
    [[xs[6], zs[10]], 6],
    [[xs[8], zs[6]], 12],
    [[xs[10], zs[8]], 0],
    [[xs[8], zs[10]], 4],
    [[xs[6], zs[8]], 8],
  ];
  gates.forEach(([gate, k], n) =>
    b.street(
      [gate, ring[k]],
      n < 4 ? "Orchid Walk" : "Rain Tree Walk",
      gardenWalk,
    ),
  );
  b.prune();
  b.node(ring[4], "Glasshouse Steps");
  b.node(gates[0][0], "Garden West Gate");
  b.node(gates[2][0], "Garden East Gate");
  b.nameNode([xs[RIVER], zs[8]], "Jade Bridge");
  b.nameNode([xs[RIVER + 1], zs[2]], "Kingfisher Bridge");

  const river = blocks[0].polygon;
  b.landscape("water", "Jade River", [
    [river[0][0], -500],
    [river[1][0], -500],
    [river[1][0], 500],
    [river[0][0], 500],
  ]);
  b.building({
    center: c,
    width: 76,
    depth: 44,
    rotation: 0,
    height: 34,
    color: "#d8efe6",
    name: "Great Glasshouse",
    kind: "landmark",
    shape: "glasshouse",
  });
  const places: Place[] = [
    {
      name: "Verdant Canopy Town Hall",
      node: "Town Hall Steps",
      at: [0, -300],
      width: 50,
      depth: 36,
      height: 32,
      color: "#e8e2d0",
      plan: (w, d) => footprints.notched(w, d, 6),
    },
    {
      name: "Seed Library",
      node: "Seed Library Steps",
      at: [-300, -250],
      width: 40,
      depth: 30,
      height: 18,
      color: "#c8b99a",
    },
    {
      name: "Canopy Lookout",
      node: "Lookout Steps",
      at: [330, -330],
      width: 14,
      depth: 14,
      height: 58,
      color: "#8fb98a",
      plan: footprints.octagon,
    },
    {
      name: "Rainleaf Concert Shell",
      node: "Concert Lawn",
      at: [-330, 280],
      width: 34,
      depth: 24,
      height: 14,
      color: "#efe9dc",
      plan: (w, d) => footprints.round(w, d, 12),
    },
    {
      name: "Jade River Boathouse",
      node: "Boathouse Landing",
      at: [xs[RIVER] - 40, 150],
      width: 30,
      depth: 20,
      height: 10,
      color: "#b9a888",
    },
    {
      name: "Hall of Ferns",
      node: "Ferns Hall Corner",
      at: [150, -160],
      width: 36,
      depth: 30,
      height: 22,
      color: "#dfe6d8",
    },
    {
      name: "Mossbank Market Hall",
      node: "Mossbank Market",
      at: [-180, 380],
      width: 44,
      depth: 32,
      height: 16,
      color: "#d9cfb8",
    },
    {
      name: "Orchid Tower",
      node: "Orchid Corner",
      at: [400, 330],
      width: 24,
      depth: 24,
      height: 40,
      color: "#e8e2d0",
      plan: (w, d) => footprints.notched(w, d, 4),
    },
    {
      name: "Butterfly Conservatory",
      node: "Butterfly Gate",
      at: [-390, -20],
      width: 34,
      depth: 34,
      height: 16,
      color: "#d8efe6",
      shape: "glasshouse",
    },
    {
      name: "Treehouse Library",
      node: "Treehouse Steps",
      at: [400, -60],
      width: 30,
      depth: 30,
      height: 24,
      color: "#c8b99a",
    },
  ];
  for (const p of places) landmark(b, p);

  const palette = [
    "#e8e2d0",
    "#d9cfb8",
    "#c8b99a",
    "#efe9dc",
    "#b9a888",
    "#dfe6d8",
  ];
  fillLots(b, (lot) => {
    const across = lot.width >= lot.depth;
    const subs =
      Math.max(lot.width, lot.depth) > 40 && rng() < 0.6
        ? subdivide(rng, lot, across ? 2 : 1, across ? 1 : 2, 2)
        : [lot];
    for (const sub of subs) {
      const width = sub.width * between(rng, 0.94, 1),
        depth = sub.depth * between(rng, 0.94, 1);
      b.building({
        center: sub.center,
        width,
        depth,
        rotation: 0,
        height: between(rng, 15, 40),
        color: pick(rng, palette),
        name: "Terraced homes",
        footprint:
          rng() < 0.55
            ? footprints.notched(width, depth, Math.min(width, depth) * 0.16)
            : undefined,
      });
    }
  });

  const trees = ["#2f7d3a", "#3f8f45", "#4c9a3f", "#2a6b35", "#5aa648"];
  b.landscape("park", "Canopy Botanic Garden", garden.polygon);
  b.landscape(
    "water",
    "Lily Pond",
    footprints
      .round(30, 24, 14)
      .map(([x, z]) => [x + c[0] + 82, z + c[1] + 30] as Point),
  );
  b.scatterTrees(garden.polygon, 12, 0.35, trees, [8, 14], "Rain tree");
  for (const block of blocks.slice(2)) {
    b.landscape("park", block.spec.name, block.polygon);
    b.scatterTrees(block.polygon, 10, 0.8, trees, [6, 11], "Garden tembusu");
    b.nameNode(block.lot.center, `${block.spec.name} Gate`);
  }
  b.streetTrees(trees, [11, 16], "Canopy tree");

  amenitiesAt(b, [
    ["water", "Glasshouse Steps", "Glasshouse fountain"],
    ["water", "Fern Terrace Garden Gate", "Garden fountain"],
    ["water", "Boathouse Landing", "Riverside tap"],
    ["water", "Town Hall Steps", "Town Hall fountain"],
    ["shelter", "Concert Lawn", "Lawn pavilion"],
    ["shelter", "Boathouse Landing", "Boathouse porch"],
    ["shelter", "Glasshouse Steps", "Glasshouse pergola"],
  ]);
}
