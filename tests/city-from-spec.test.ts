import { describe, expect, it } from "vitest";
import type {
  Environment,
  Point,
  SceneObject,
  World,
} from "../shared/types.js";
import { LANDMARK_SHAPES } from "../shared/types.js";
import { worldSchema } from "../shared/schema.js";
import {
  REALISM,
  REALISM_LEVELS,
  describeSpecForPrompt,
  parseCitySpec,
  type CitySpec,
  type Realism,
} from "../shared/city-spec.js";
import {
  ambientFromSpec,
  buildCityFromSpec,
} from "../src/lib/city-from-spec.js";
import { extractName, specFromPrompt } from "../src/lib/spec-from-prompt.js";
import { compareRoutes } from "../src/lib/routing.js";
import {
  destinationCatalog,
  rankDestinations,
} from "../src/lib/destinations.js";

const environment: Environment = {
  dateTime: "2026-07-15T19:00:00Z",
  temperatureC: 33,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const BUILDING_KINDS = new Set(["building", "skyscraper", "tower", "landmark"]);
const buildings = (w: World) =>
  w.objects.filter((o) => BUILDING_KINDS.has(o.kind));
const trees = (w: World) => w.objects.filter((o) => o.kind === "tree");

/** World corners of an object's rectangle, turned as the scene turns it. */
function corners(o: SceneObject): Point[] {
  const a = (-o.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return (
    [
      [-o.width / 2, -o.depth / 2],
      [o.width / 2, -o.depth / 2],
      [o.width / 2, o.depth / 2],
      [-o.width / 2, o.depth / 2],
    ] as Point[]
  ).map(([x, z]) => [
    o.position[0] + x * c + z * s,
    o.position[1] - x * s + z * c,
  ]);
}
const cross = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const d1 = cross(c, d, a),
    d2 = cross(c, d, b),
    d3 = cross(a, b, c),
    d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function insidePolygon(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
function rectangleTouchesSegment(rect: Point[], a: Point, b: Point) {
  if (insidePolygon(a, rect) || insidePolygon(b, rect)) return true;
  return rect.some((p, i) => segmentsCross(p, rect[(i + 1) % 4], a, b));
}
function buildingsOnPaths(w: World) {
  const cell = 50;
  const grid = new Map<string, [Point, Point][]>();
  for (const e of w.graph.edges)
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1],
        b = e.points[i];
      for (
        let x = Math.floor(Math.min(a[0], b[0]) / cell);
        x <= Math.floor(Math.max(a[0], b[0]) / cell);
        x++
      )
        for (
          let z = Math.floor(Math.min(a[1], b[1]) / cell);
          z <= Math.floor(Math.max(a[1], b[1]) / cell);
          z++
        )
          (
            grid.get(`${x},${z}`) ?? grid.set(`${x},${z}`, []).get(`${x},${z}`)!
          ).push([a, b]);
    }
  const offenders: string[] = [];
  for (const o of buildings(w)) {
    const rect = corners(o);
    const xs = rect.map((p) => p[0]),
      zs = rect.map((p) => p[1]);
    const seen = new Set<[Point, Point]>();
    for (
      let x = Math.floor(Math.min(...xs) / cell);
      x <= Math.floor(Math.max(...xs) / cell);
      x++
    )
      for (
        let z = Math.floor(Math.min(...zs) / cell);
        z <= Math.floor(Math.max(...zs) / cell);
        z++
      )
        for (const seg of grid.get(`${x},${z}`) ?? []) {
          if (seen.has(seg)) continue;
          seen.add(seg);
          if (rectangleTouchesSegment(rect, seg[0], seg[1]))
            offenders.push(o.id);
        }
  }
  return offenders;
}
function components(w: World) {
  const adjacency = new Map<string, string[]>();
  for (const e of w.graph.edges) {
    (adjacency.get(e.from) ?? adjacency.set(e.from, []).get(e.from)!).push(
      e.to,
    );
    (adjacency.get(e.to) ?? adjacency.set(e.to, []).get(e.to)!).push(e.from);
  }
  const seen = new Set<string>();
  let count = 0;
  for (const n of w.graph.nodes) {
    if (seen.has(n.id)) continue;
    count++;
    const queue = [n.id];
    seen.add(n.id);
    while (queue.length)
      for (const next of adjacency.get(queue.pop()!) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
  }
  return count;
}

const PROMPTS = {
  gothic: "a gothic noir harbor city where it always rains",
  deco: "a gleaming art-deco metropolis for heroes",
  desert: "a desert city of sand, wind towers and an oasis",
  neon: "a neon cyberpunk city like tokyo at night",
  garden: "a leafy forest garden city",
} as const;
const MINIMAL = parseCitySpec({
  name: "Single Square",
  districts: [{ name: "Centre", kind: "downtown" }],
});
type Case = keyof typeof PROMPTS | "minimal";
const CASES: Case[] = [
  ...(Object.keys(PROMPTS) as (keyof typeof PROMPTS)[]),
  "minimal",
];

const specs = new Map<string, CitySpec>();
function specFor(c: Case, realism: Realism) {
  const key = `${c}|${realism}`;
  if (!specs.has(key))
    specs.set(
      key,
      c === "minimal" ? MINIMAL : specFromPrompt(PROMPTS[c], realism),
    );
  return specs.get(key)!;
}
const worlds = new Map<string, World>();
function world(c: Case, realism: Realism) {
  const key = `${c}|${realism}`;
  if (!worlds.has(key))
    worlds.set(key, buildCityFromSpec(specFor(c, realism), realism));
  return worlds.get(key)!;
}

/** Ten districts, twenty-four landmarks and three water bodies. */
const BIG = parseCitySpec({
  name: "Tenfold Harbor",
  tagline: "Every kind of district at once.",
  inspiration: "A stress test",
  origin: { lat: 40.7, lon: -74 },
  timezone: "America/New_York",
  climate: { temperatureC: 30, humidity: 60, windMps: 3, cloudCover: 10 },
  ambient: {
    sky: ["#123456", "#abcdef"],
    fog: "#cccccc",
    accent: "#ffcc00",
    particles: "sun",
    night: false,
  },
  districts: [
    {
      name: "Core",
      kind: "downtown",
      at: [0, 0],
      size: 0.3,
      streets: "grid",
      heights: [30, 400],
      density: 1,
      trees: 0.2,
      style: "art-deco",
    },
    {
      name: "Old Town",
      kind: "old-quarter",
      at: [-0.6, -0.6],
      size: 0.25,
      streets: "organic",
      heights: [6, 20],
      density: 1,
      trees: 0.1,
      style: "gothic",
    },
    {
      name: "Ring",
      kind: "downtown",
      at: [0.6, -0.6],
      size: 0.25,
      streets: "radial",
      heights: [20, 200],
      density: 0.9,
      trees: 0.3,
      style: "futurist",
    },
    {
      name: "Slant",
      kind: "residential",
      at: [-0.6, 0.6],
      size: 0.25,
      streets: "diagonal",
      heights: [8, 30],
      density: 0.8,
      trees: 0.6,
      style: "victorian",
    },
    {
      name: "Works",
      kind: "industrial",
      at: [0.6, 0.6],
      size: 0.25,
      streets: "grid",
      heights: [8, 30],
      density: 0.8,
      trees: 0.05,
      style: "industrial",
    },
    {
      name: "Green",
      kind: "park",
      at: [0, -0.75],
      size: 0.15,
      streets: "organic",
      heights: [4, 6],
      density: 0,
      trees: 1,
      style: "modern",
    },
    {
      name: "Bazaar",
      kind: "market",
      at: [0, 0.75],
      size: 0.15,
      streets: "grid",
      heights: [5, 10],
      density: 1,
      trees: 0.1,
      style: "adobe",
    },
    {
      name: "College",
      kind: "campus",
      at: [-0.8, 0],
      size: 0.15,
      streets: "radial",
      heights: [10, 40],
      density: 0.6,
      trees: 0.6,
      style: "classical",
    },
    {
      name: "Quay",
      kind: "waterfront",
      at: [0.8, 0],
      size: 0.15,
      streets: "grid",
      heights: [10, 60],
      density: 0.8,
      trees: 0.4,
      style: "glass",
    },
    {
      name: "Burbs",
      kind: "suburb",
      at: [0.3, 0.35],
      size: 0.12,
      streets: "organic",
      heights: [4, 9],
      density: 0.6,
      trees: 0.8,
      style: "brutalist",
    },
  ],
  landmarks: Array.from({ length: 24 }, (_, i) => ({
    name: `Landmark Number ${i + 1}`,
    shape: LANDMARK_SHAPES[i % LANDMARK_SHAPES.length],
    district: ["Core", "Old Town", "Ring", "Works", "Quay", "Green"][i % 6],
    height: 20 + i * 10,
    width: 20 + (i % 5) * 10,
    depth: 20 + (i % 4) * 10,
  })),
  water: [
    { kind: "river", side: "center", width: 60 },
    { kind: "bay", side: "south", width: 120 },
    { kind: "canal", side: "west" },
  ],
});

describe("parseCitySpec", () => {
  it("clamps numbers, normalises colours and fills defaults", () => {
    const spec = parseCitySpec({
      name: "  Clampville  ",
      origin: { lat: 89, lon: -400 },
      timezone: "Mars/Olympus_Mons",
      climate: {
        temperatureC: 80,
        humidity: -5,
        windMps: "12",
        cloudCover: 300,
      },
      ambient: {
        sky: ["#ABC", "nope"],
        fog: "123456",
        accent: 7,
        particles: "snow",
        night: "true",
      },
      districts: [
        {
          name: "A",
          at: [3, -4],
          size: 5,
          heights: [1, 9000],
          density: 2,
          trees: -1,
          palette: ["#ff0000", "red", "#00F"],
        },
      ],
    });
    expect(spec.name).toBe("Clampville");
    expect(spec.origin).toEqual({ lat: 70, lon: -180 });
    expect(spec.timezone).toBe("UTC");
    expect(spec.climate).toEqual({
      temperatureC: 50,
      humidity: 0,
      windMps: 12,
      cloudCover: 100,
    });
    expect(spec.ambient.sky).toEqual(["#aabbcc", "#aabbcc"]);
    expect(spec.ambient.fog).toBe("#123456");
    expect(spec.ambient.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(spec.ambient.particles).toBe("mist");
    expect(spec.ambient.night).toBe(true);
    const d = spec.districts[0];
    expect(d.at).toEqual([1, -1]);
    expect(d.size).toBe(0.7);
    expect(d.heights).toEqual([3, 450]);
    expect(d.density).toBe(1);
    expect(d.trees).toBe(0);
    expect(d.palette).toEqual(["#ff0000", "#0000ff"]);
  });

  it("maps or replaces unknown enum values", () => {
    const spec = parseCitySpec({
      name: "Enumtown",
      districts: [
        {
          name: "A",
          kind: "spaceport",
          streets: "spaghetti",
          style: "Art Deco",
        },
        {
          name: "B",
          kind: "Old Town",
          streets: "winding",
          style: "blobitecture",
        },
      ],
      landmarks: [
        { name: "Big Stadium", shape: "stadium" },
        { name: "Thing", shape: "blob" },
        { name: "Church", shape: "Cathedral" },
      ],
      water: [{ kind: "ocean", side: "middle" }, { kind: "lava" }],
    });
    expect(spec.districts.map((d) => d.kind)).toEqual([
      "residential",
      "old-quarter",
    ]);
    expect(spec.districts.map((d) => d.streets)).toEqual(["grid", "organic"]);
    expect(spec.districts.map((d) => d.style)).toEqual(["art-deco", "modern"]);
    expect(spec.landmarks.map((l) => l.shape)).toEqual([
      "arena",
      "hall",
      "cathedral",
    ]);
    expect(spec.water.map((w) => w.kind)).toEqual(["bay", "river"]);
    expect(spec.water[0].side).toBe("center");
  });

  it("accepts missing optional fields and JSON text in code fences", () => {
    const spec = parseCitySpec(
      '```json\n{"name": "Bare", "districts": [{}]}\n```',
    );
    expect(spec.name).toBe("Bare");
    expect(spec.districts).toHaveLength(1);
    expect(spec.districts[0].palette).toBeUndefined();
    expect(spec.landmarks).toEqual([]);
    expect(spec.water).toEqual([]);
    expect(spec.streetNames).toBeUndefined();
    expect(spec.placeNames).toBeUndefined();
    expect(spec.timezone).toBe("UTC");
    expect(spec.ambient.sky).toHaveLength(2);
  });

  it("truncates long lists and drops junk items", () => {
    const spec = parseCitySpec({
      name: "x".repeat(90),
      districts: [
        ...Array.from({ length: 14 }, (_, i) => ({ name: `D${i}` })),
        "junk",
        5,
      ],
      landmarks: Array.from({ length: 40 }, (_, i) => ({
        name: `L${i}`,
        shape: "spire",
      })),
      water: [{}, {}, {}, {}, {}],
      streetNames: [
        ...Array.from({ length: 50 }, (_, i) => `Street ${i}`),
        7,
        "ab",
      ],
      placeNames: ["Plaza One", "Plaza One", "Plaza Two"],
    });
    expect(spec.name).toHaveLength(60);
    expect(spec.districts).toHaveLength(10);
    expect(spec.landmarks).toHaveLength(24);
    expect(spec.water).toHaveLength(3);
    expect(spec.streetNames).toHaveLength(40);
    expect(spec.placeNames).toEqual(["Plaza One", "Plaza Two"]);
  });

  it("throws clearly only without a name or without any district or landmark", () => {
    expect(() => parseCitySpec({ districts: [{}] })).toThrow(/name/);
    expect(() => parseCitySpec({ name: "Empty" })).toThrow(
      /district or landmark/,
    );
    expect(() => parseCitySpec("not json")).toThrow(/JSON/);
    const landmarksOnly = parseCitySpec({
      name: "Spires",
      landmarks: [{ name: "Tall One", shape: "spire" }],
    });
    expect(landmarksOnly.districts).toHaveLength(1);
    expect(landmarksOnly.districts[0].kind).toBe("downtown");
  });

  it("describes the schema compactly for a system prompt", () => {
    for (const r of REALISM_LEVELS) {
      const text = describeSpecForPrompt(r);
      expect(text.length).toBeLessThan(2500);
      expect(text).toContain("districts");
      expect(text).toContain("smokestacks");
    }
    expect(REALISM.sketch.extent).toBeLessThan(REALISM.detailed.extent);
    expect(REALISM.detailed.extent).toBeLessThan(REALISM.dense.extent);
    expect(REALISM.sketch.maxTokens).toBeLessThan(REALISM.dense.maxTokens);
  });
});

describe("specFromPrompt", () => {
  const shapes = (s: CitySpec) => new Set(s.landmarks.map((l) => l.shape));

  it("plans a rainy gothic night city on the New York sun", () => {
    const s = specFromPrompt(
      "a Gotham-like noir crime city in the rain",
      "detailed",
    );
    expect(s.ambient.particles).toBe("rain");
    expect(s.ambient.night).toBe(true);
    expect(s.timezone).toBe("America/New_York");
    expect(
      s.districts.some((d) => d.kind === "downtown" && d.style === "gothic"),
    ).toBe(true);
    expect(s.districts.some((d) => d.kind === "industrial")).toBe(true);
    for (const shape of [
      "smokestacks",
      "tanks",
      "manor",
      "cathedral",
      "signal",
    ] as const)
      expect(shapes(s).has(shape), shape).toBe(true);
    expect(JSON.stringify(s).toLowerCase()).not.toContain("gotham");
  });

  it("plans a sunny art-deco city with a globe tower, a hall and a statue", () => {
    const s = specFromPrompt(
      "a gleaming art deco Metropolis-like utopia",
      "detailed",
    );
    expect(s.ambient.particles).toBe("sun");
    expect(s.ambient.night).toBe(false);
    expect(s.timezone).toBe("America/Chicago");
    expect(
      s.districts.some((d) => d.kind === "downtown" && d.style === "art-deco"),
    ).toBe(true);
    for (const shape of ["globe", "hall", "statue"] as const)
      expect(shapes(s).has(shape)).toBe(true);
    expect(JSON.stringify(s).toLowerCase()).not.toContain("metropolis");
  });

  it("varies by vibe and reads climate words", () => {
    const desert = specFromPrompt("a desert city in a heatwave", "detailed");
    expect(desert.timezone).toBe("America/Phoenix");
    expect(desert.climate.temperatureC).toBeGreaterThanOrEqual(40);
    expect(desert.districts.some((d) => d.style === "adobe")).toBe(true);
    const neon = specFromPrompt("neon cyberpunk night market", "detailed");
    expect(neon.timezone).toBe("Asia/Tokyo");
    expect(neon.ambient.night).toBe(true);
    expect(
      specFromPrompt("a tropical island port, humid", "detailed").timezone,
    ).toBe("Asia/Singapore");
    expect(specFromPrompt("snowy nordic fjord town", "detailed").timezone).toBe(
      "Europe/Oslo",
    );
    expect(
      specFromPrompt("venice-like canals", "detailed").water.some(
        (w) => w.kind === "canal",
      ),
    ).toBe(true);
    expect(
      specFromPrompt("a medieval walled town", "detailed").districts.some(
        (d) => d.streets === "organic",
      ),
    ).toBe(true);
    expect(
      specFromPrompt("a futuristic sci-fi city", "detailed").districts[0].style,
    ).toBe("futurist");
    const cold = specFromPrompt("a cold, cloudy riverside city", "detailed");
    expect(cold.climate.temperatureC).toBeLessThanOrEqual(4);
    expect(cold.climate.cloudCover).toBeGreaterThanOrEqual(80);
    const garden = specFromPrompt("a forest garden city", "detailed");
    expect(garden.ambient.particles).toBe("leaves");
  });

  it("names cities from quotes or capitals, never from trademarks or real places", () => {
    expect(
      specFromPrompt('a harbor town called "Saltmere"', "sketch").name,
    ).toBe("Saltmere");
    expect(specFromPrompt("a gothic city named Ravenholt", "sketch").name).toBe(
      "Ravenholt",
    );
    expect(extractName("build me a rainy port, Brine Hollow, with docks")).toBe(
      "Brine Hollow",
    );
    expect(extractName("make it like Gotham")).toBeUndefined();
    expect(extractName("a neon Tokyo")).toBeUndefined();
    for (const p of ["Gotham", "a city like Metropolis", "Wakanda style"]) {
      const name = specFromPrompt(p, "sketch").name.toLowerCase();
      expect(name).not.toMatch(/gotham|metropolis|wakanda/);
      expect(name.length).toBeGreaterThan(2);
    }
  });

  it("is deterministic per prompt and keeps the name across realism levels", () => {
    const p = "a sleepy seaside town";
    expect(specFromPrompt(p, "detailed")).toEqual(
      specFromPrompt(p, "detailed"),
    );
    expect(specFromPrompt(p, "sketch").name).toBe(
      specFromPrompt(p, "dense").name,
    );
    expect(specFromPrompt(p, "sketch").landmarks.length).toBeLessThanOrEqual(
      REALISM.sketch.maxLandmarks,
    );
  });
});

describe.each(CASES)("%s city", (c) => {
  describe.each(REALISM_LEVELS)("at %s", (realism) => {
    it("passes the world schema with AI provenance", () => {
      const w = world(c, realism);
      const spec = specFor(c, realism);
      expect(() => worldSchema.parse(w)).not.toThrow();
      expect(w.id).toMatch(/^ai-[a-z0-9-]+-[0-9a-z]{7}$/);
      expect(w.name).toBe(`${spec.name} · generated city`);
      expect(w.extent).toBe(REALISM[realism].extent);
      expect(w.origin).toEqual(spec.origin);
      expect(w.timezone).toBe(spec.timezone);
      expect(w.provenance.live).toBe(false);
      expect(w.provenance.attribution).toBe("Walk-Free generated city");
      const notes = w.provenance.notes.join(" ");
      expect(notes).toMatch(/AI/);
      expect(notes).toMatch(/procedural/i);
      expect(notes).toMatch(/not a real place/i);
      expect(notes).toMatch(/illustration/i);
      expect(w.objects.every((o) => o.source === "ai")).toBe(true);
      expect(new Set(w.objects.map((o) => o.id)).size).toBe(w.objects.length);
    });

    it("has one connected walking graph", () => {
      const w = world(c, realism);
      expect(w.graph.edges.length).toBeGreaterThan(20);
      expect(components(w)).toBe(1);
      const ids = new Set(w.graph.nodes.map((n) => n.id));
      for (const e of w.graph.edges) {
        expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
        expect(e.name.trim().length).toBeGreaterThan(2);
      }
    });

    it("keeps every building off the walking network", () => {
      expect(buildingsOnPaths(world(c, realism))).toEqual([]);
    });

    it("keeps everything inside the extent", () => {
      const w = world(c, realism);
      const half = w.extent / 2;
      for (const o of w.objects)
        for (const v of o.position)
          expect(Math.abs(v)).toBeLessThanOrEqual(half);
      for (const n of w.graph.nodes)
        for (const v of n.point) expect(Math.abs(v)).toBeLessThanOrEqual(half);
      for (const l of w.landscapes)
        for (const p of l.points)
          for (const v of p) expect(Math.abs(v)).toBeLessThanOrEqual(half);
    });

    it("places every landmark with its shape beside a named place", () => {
      const w = world(c, realism);
      const spec = specFor(c, realism);
      const named = w.graph.nodes.filter((n) => n.name);
      expect(named.length).toBeGreaterThanOrEqual(12);
      expect(new Set(named.map((n) => n.name)).size).toBe(named.length);
      const wanted = spec.landmarks.slice(0, REALISM[realism].maxLandmarks);
      for (const l of wanted) {
        const o = w.objects.find(
          (x) => x.kind === "landmark" && x.name === l.name,
        );
        expect(o, l.name).toBeDefined();
        expect(o!.shape).toBe(l.shape);
        const near = named.some(
          (n) =>
            Math.hypot(
              n.point[0] - o!.position[0],
              n.point[1] - o!.position[1],
            ) <
            Math.max(o!.width, o!.depth) / 2 + 90,
        );
        expect(near, l.name).toBe(true);
      }
      const amenities = w.amenities ?? [];
      expect(
        amenities.filter((a) => a.kind === "water").length,
      ).toBeGreaterThanOrEqual(3);
      expect(
        amenities.filter((a) => a.kind === "shelter").length,
      ).toBeGreaterThanOrEqual(2);
    });

    it("is deterministic", () => {
      const again = buildCityFromSpec(specFor(c, realism), realism);
      expect(JSON.stringify(again)).toBe(JSON.stringify(world(c, realism)));
    });
  });

  it("builds more as realism rises", () => {
    const [s, d, x] = REALISM_LEVELS.map((r) => buildings(world(c, r)).length);
    expect(s).toBeLessThan(d);
    expect(d).toBeLessThan(x);
  });
});

describe("city flavour in the data", () => {
  it("gives gothic cities tall narrow towers, rain and unlit lanes; art-deco stepped towers", () => {
    const gothic = world("gothic", "detailed");
    const tall = buildings(gothic).filter(
      (o) => o.kind !== "landmark" && o.height > 120,
    );
    expect(tall.length).toBeGreaterThan(0);
    for (const o of tall)
      expect(Math.min(o.width, o.depth)).toBeLessThanOrEqual(22.01);
    expect(gothic.graph.edges.some((e) => e.lit === false)).toBe(true);
    expect(ambientFromSpec(specFor("gothic", "detailed"))).toMatchObject({
      particles: "rain",
      night: true,
    });
    const deco = world("deco", "detailed");
    expect(
      deco.objects.some((o) => o.kind !== "landmark" && o.shape === "stepped"),
    ).toBe(true);
    expect(
      deco.objects.some((o) => o.kind === "landmark" && o.shape === "globe"),
    ).toBe(true);
  });

  it("makes the garden greener than the desert, with parks and water", () => {
    expect(trees(world("garden", "detailed")).length).toBeGreaterThan(
      trees(world("desert", "detailed")).length * 2,
    );
    const garden = world("garden", "detailed");
    expect(garden.landscapes.some((l) => l.kind === "park")).toBe(true);
    expect(garden.landscapes.some((l) => l.kind === "water")).toBe(true);
  });

  it("uses the plan's own street and place names first", () => {
    const spec = parseCitySpec({
      name: "Named Town",
      districts: [{ name: "Middle", kind: "downtown", size: 0.4 }],
      streetNames: ["Lamplighter Avenue", "Copperleaf Road"],
      placeNames: ["Clockmaker Square"],
    });
    const w = buildCityFromSpec(spec, "detailed");
    const streetNames = new Set(w.graph.edges.map((e) => e.name));
    expect(streetNames.has("Lamplighter Avenue")).toBe(true);
    expect(streetNames.has("Copperleaf Road")).toBe(true);
    expect(w.graph.nodes.some((n) => n.name === "Clockmaker Square")).toBe(
      true,
    );
  });

  it("bridges rivers so both banks stay walkable", () => {
    const w = buildCityFromSpec(BIG, "detailed");
    expect(w.landscapes.filter((l) => l.kind === "water").length).toBe(3);
    expect(w.graph.edges.some((e) => /Bridge|Causeway/.test(e.name))).toBe(
      true,
    );
    expect(components(w)).toBe(1);
  });
});

describe("routing and destinations", () => {
  it.each(["gothic", "deco"] as const)(
    "finds quickest and shade routes in the %s city",
    (c) => {
      const w = world(c, "detailed");
      const named = w.graph.nodes.filter((n) => n.name);
      const routes = compareRoutes(w, named[0].id, named.at(-1)!.id, {
        avoidStairs: false,
        allowHypothetical: false,
        maxDetour: 1.6,
        environment,
      });
      expect(routes.quickest).not.toBeNull();
      expect(routes.shade).not.toBeNull();
      expect(routes.quickest!.distance).toBeGreaterThan(50);
    },
  );

  it("indexes nodes and landmarks for destination search", () => {
    const w = world("gothic", "detailed");
    const catalog = destinationCatalog(w);
    expect(catalog.length).toBe(w.graph.nodes.length);
    const landmark = w.objects.find((o) => o.kind === "landmark")!;
    const hits = rankDestinations(catalog, landmark.name);
    expect(hits.length).toBeGreaterThan(0);
    const named = w.graph.nodes.filter((n) => n.name);
    expect(rankDestinations(catalog, named[1].name!)[0].label).toBe(
      named[1].name,
    );
  });
});

describe("performance", () => {
  const LIMITS: Record<Realism, number> = {
    sketch: 250,
    detailed: 600,
    dense: 1500,
  };
  it.each(REALISM_LEVELS)(
    "builds a 10-district, 24-landmark city at %s in time",
    (realism) => {
      buildCityFromSpec(BIG, realism); // warm the JIT
      let best = Infinity;
      let w: World | undefined;
      for (let i = 0; i < 2; i++) {
        const t0 = performance.now();
        w = buildCityFromSpec(BIG, realism);
        best = Math.min(best, performance.now() - t0);
      }
      expect(best).toBeLessThan(LIMITS[realism]);
      expect(() => worldSchema.parse(w)).not.toThrow();
      expect(components(w!)).toBe(1);
      expect(buildingsOnPaths(w!)).toEqual([]);
      const placed = w!.objects.filter((o) => o.kind === "landmark");
      expect(placed.length).toBe(Math.min(24, REALISM[realism].maxLandmarks));
    },
  );
});
