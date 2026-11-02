import { describe, expect, it } from "vitest";
import type {
  Environment,
  LandmarkShape,
  Point,
  SceneObject,
  World,
} from "../shared/types.js";
import { LANDMARK_SHAPES } from "../shared/types.js";
import { worldSchema } from "../shared/schema.js";
import {
  FICTION_CITIES,
  createFictionCity,
  type FictionCity,
} from "../src/lib/fiction-cities.js";
import { compareRoutes, samplePolyline } from "../src/lib/routing.js";
import { createShadeTester } from "../src/lib/environment.js";
import { placeHeat } from "../src/lib/heat.js";
import {
  destinationCatalog,
  rankDestinations,
} from "../src/lib/destinations.js";

const environment: Environment = {
  dateTime: "2026-07-15T20:00:00Z",
  temperatureC: 33,
  humidity: 40,
  windMps: 2,
  cloudCover: 0,
  weatherMode: "scenario",
};
const SLUGS = [
  "noir-harbor",
  "skyline-prime",
  "velocity-bay",
  "aurora-realm",
  "neon-district",
  "dune-reach",
  "verdant-canopy",
] as const;
const BUILDING_KINDS = new Set(["building", "skyscraper", "tower", "landmark"]);
const HEX = /^#[0-9a-f]{6}$/i;

const cache = new Map<string, World>();
function city(slug: string): World {
  if (!cache.has(slug)) cache.set(slug, createFictionCity(slug)!);
  return cache.get(slug)!;
}
const buildings = (w: World) =>
  w.objects.filter((o) => BUILDING_KINDS.has(o.kind));
const trees = (w: World) => w.objects.filter((o) => o.kind === "tree");
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const litShare = (w: World) =>
  w.graph.edges.filter((e) => e.lit === true).length / w.graph.edges.length;
const polylineLength = (points: Point[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    );

/** 3 PM local time on 15 July, as UTC, for each city's time zone. */
const THREE_PM: Record<(typeof SLUGS)[number], string> = {
  "noir-harbor": "2026-07-15T19:00:00Z",
  "skyline-prime": "2026-07-15T20:00:00Z",
  "velocity-bay": "2026-07-15T22:00:00Z",
  "aurora-realm": "2026-07-15T13:00:00Z",
  "neon-district": "2026-07-15T06:00:00Z",
  "dune-reach": "2026-07-15T22:00:00Z",
  "verdant-canopy": "2026-07-15T07:00:00Z",
};
const afternoon = (slug: (typeof SLUGS)[number]): Environment => ({
  ...environment,
  dateTime: THREE_PM[slug],
});
/** Each walking edge with its shaded share, sampled as routing samples it. */
function edgeShade(slug: (typeof SLUGS)[number]) {
  const w = city(slug);
  const shaded = createShadeTester(w, afternoon(slug));
  return w.graph.edges.map((e) => {
    const samples = samplePolyline(
      e.points,
      Math.max(1, Math.min(32, Math.ceil(e.distance / 15))),
    );
    return {
      edge: e,
      shade: e.covered ? 1 : samples.filter(shaded).length / samples.length,
    };
  });
}
const shadedMetres = (list: ReturnType<typeof edgeShade>) =>
  list.reduce((s, x) => s + x.shade * x.edge.distance, 0) /
  list.reduce((s, x) => s + x.edge.distance, 0);

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

describe("fictional city catalog", () => {
  it("lists seven original cities with a distinct ambient mood", () => {
    expect(FICTION_CITIES.map((c) => c.slug)).toEqual([...SLUGS]);
    const particles = new Set<string>();
    for (const c of FICTION_CITIES as readonly FictionCity[]) {
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.tagline.length).toBeGreaterThan(8);
      expect(c.tagline.length).toBeLessThan(90);
      expect(c.mood.length).toBeGreaterThan(20);
      expect(Math.abs(c.origin.lat)).toBeLessThan(75);
      expect(Math.abs(c.origin.lon)).toBeLessThanOrEqual(180);
      expect(c.timezone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+/);
      expect(() =>
        new Intl.DateTimeFormat("en", { timeZone: c.timezone }).format(),
      ).not.toThrow();
      expect(c.ambient.sky).toHaveLength(2);
      for (const hex of [...c.ambient.sky, c.ambient.fog, c.ambient.accent])
        expect(hex).toMatch(HEX);
      particles.add(c.ambient.particles);
      expect(typeof c.ambient.night).toBe("boolean");
    }
    expect(particles.size).toBe(7);
    expect(
      FICTION_CITIES.find((c) => c.slug === "aurora-realm")!.origin.lat,
    ).toBeGreaterThan(58);
    expect(
      FICTION_CITIES.find((c) => c.slug === "neon-district")!.ambient.night,
    ).toBe(true);
  });

  it("returns null for an unknown slug", () => {
    expect(createFictionCity("gotham")).toBeNull();
    expect(createFictionCity("")).toBeNull();
  });
});

describe.each(SLUGS)("%s", (slug) => {
  it("generates deterministically and quickly", () => {
    const t0 = performance.now();
    const first = createFictionCity(slug);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(400);
    expect(JSON.stringify(createFictionCity(slug))).toBe(JSON.stringify(first));
  });

  it("is labelled as a fictional, procedurally generated world", () => {
    const w = city(slug);
    const meta = FICTION_CITIES.find((c) => c.slug === slug)!;
    expect(w.id).toBe(`fiction-${slug}`);
    expect(w.name).toContain(meta.name);
    expect(w.origin).toEqual(meta.origin);
    expect(w.timezone).toBe(meta.timezone);
    expect(w.extent).toBeGreaterThanOrEqual(900);
    expect(w.extent).toBeLessThanOrEqual(1100);
    expect(w.provenance.live).toBe(false);
    expect(w.provenance.source).toMatch(/fictional/i);
    expect(w.provenance.source).toMatch(/procedural/i);
    expect(w.provenance.attribution).toBe("Walk-Free fictional city");
    expect(w.provenance.notes.join(" ")).toMatch(/not a real/i);
    const half = w.extent / 2 + 1;
    for (const o of w.objects) {
      expect(Math.abs(o.position[0])).toBeLessThanOrEqual(half);
      expect(Math.abs(o.position[1])).toBeLessThanOrEqual(half);
    }
    for (const n of w.graph.nodes) {
      expect(Math.abs(n.point[0])).toBeLessThanOrEqual(half);
      expect(Math.abs(n.point[1])).toBeLessThanOrEqual(half);
    }
  });

  it("has realistic density of buildings, trees, parks and water", () => {
    const w = city(slug);
    const b = buildings(w);
    expect(b.length).toBeGreaterThanOrEqual(250);
    expect(b.length).toBeLessThanOrEqual(1200);
    for (const o of b) {
      expect(o.width).toBeGreaterThanOrEqual(4);
      expect(o.depth).toBeGreaterThanOrEqual(4);
      expect(o.width).toBeLessThanOrEqual(220);
      expect(o.depth).toBeLessThanOrEqual(220);
      expect(o.height).toBeGreaterThanOrEqual(4);
      expect(o.height).toBeLessThanOrEqual(400);
      expect(Number.isFinite(o.rotation)).toBe(true);
      expect(o.source).toBe("study");
      expect(o.heightMethod).toBe("designed");
      for (const p of o.footprint ?? []) {
        expect(Math.abs(p[0])).toBeLessThanOrEqual(o.width / 2 + 0.01);
        expect(Math.abs(p[1])).toBeLessThanOrEqual(o.depth / 2 + 0.01);
      }
    }
    expect(b.some((o) => o.footprint && o.footprint.length >= 5)).toBe(true);
    const t = trees(w);
    expect(t.length).toBeGreaterThanOrEqual(150);
    expect(t.length).toBeLessThanOrEqual(3000);
    expect(w.landscapes.some((l) => l.kind === "park")).toBe(true);
    expect(w.landscapes.some((l) => l.kind === "water")).toBe(true);
    const ids = new Set(w.objects.map((o) => o.id));
    expect(ids.size).toBe(w.objects.length);
  });

  it("keeps every building off the walking network", () => {
    const w = city(slug);
    const cell = 50;
    const grid = new Map<string, [Point, Point][]>();
    for (const e of w.graph.edges)
      for (let i = 1; i < e.points.length; i++) {
        const a = e.points[i - 1],
          b = e.points[i];
        const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
        const [z0, z1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
        for (let x = Math.floor(x0 / cell); x <= Math.floor(x1 / cell); x++)
          for (let z = Math.floor(z0 / cell); z <= Math.floor(z1 / cell); z++)
            (
              grid.get(`${x},${z}`) ??
              grid.set(`${x},${z}`, []).get(`${x},${z}`)!
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
    expect(offenders).toEqual([]);
  });

  it("has one connected, well-formed walking graph and drawn streets", () => {
    const w = city(slug);
    const { nodes, edges } = w.graph;
    expect(edges.length).toBeGreaterThanOrEqual(300);
    expect(edges.length).toBeLessThanOrEqual(2500);
    const nodeIds = new Set(nodes.map((n) => n.id));
    expect(nodeIds.size).toBe(nodes.length);
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
      expect(e.from).not.toBe(e.to);
      expect(e.distance).toBeGreaterThan(0);
      expect(e.distance).toBeCloseTo(polylineLength(e.points), 1);
      expect(e.scenic).toBeGreaterThanOrEqual(0);
      expect(e.scenic).toBeLessThanOrEqual(1);
      expect(["major", "street", "service", "path"]).toContain(e.roadClass);
      expect(typeof e.lit).toBe("boolean");
      expect(e.name.trim().length).toBeGreaterThan(2);
      expect(["Street", "Footpath", "Path"]).not.toContain(e.name);
      const node = (id: string) => nodes.find((n) => n.id === id)!.point;
      expect(e.points[0]).toEqual(node(e.from));
      expect(e.points.at(-1)).toEqual(node(e.to));
      adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);
      adjacency.set(e.to, [...(adjacency.get(e.to) ?? []), e.from]);
    }
    const seen = new Set([nodes[0].id]);
    const queue = [nodes[0].id];
    while (queue.length)
      for (const next of adjacency.get(queue.pop()!) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    expect(seen.size).toBe(nodes.length);
    expect(w.roads.length).toBeGreaterThan(25);
    const drawn = w.roads.reduce((s, r) => s + polylineLength(r.points), 0);
    const walked = edges.reduce((s, e) => s + e.distance, 0);
    expect(drawn).toBeGreaterThan(walked * 0.97);
    for (const r of w.roads) {
      expect(r.points.length).toBeGreaterThanOrEqual(2);
      expect(r.width).toBeGreaterThan(1);
      expect(r.name.trim().length).toBeGreaterThan(2);
    }
    expect(new Set(edges.map((e) => e.name)).size).toBeGreaterThanOrEqual(10);
  });

  it("names places, landmarks and amenities", () => {
    const w = city(slug);
    const named = w.graph.nodes.filter((n) => n.name);
    expect(named.length).toBeGreaterThanOrEqual(12);
    expect(new Set(named.map((n) => n.name)).size).toBe(named.length);
    const landmarks = w.objects.filter((o) => o.kind === "landmark");
    expect(landmarks.length).toBeGreaterThanOrEqual(8);
    for (const l of landmarks) {
      const near = named.some(
        (n) =>
          Math.hypot(n.point[0] - l.position[0], n.point[1] - l.position[1]) <
          Math.max(l.width, l.depth) / 2 + 90,
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

  it("works with routing, heat and destination search", () => {
    const w = city(slug);
    const named = w.graph.nodes.filter((n) => n.name);
    const routes = compareRoutes(w, named[0].id, named.at(-1)!.id, {
      avoidStairs: false,
      allowHypothetical: false,
      maxDetour: 1.6,
      environment,
    });
    expect(routes.quickest).not.toBeNull();
    expect(routes.shade).not.toBeNull();
    expect(routes.night).not.toBeNull();
    expect(routes.quickest!.distance).toBeGreaterThan(100);
    expect(placeHeat(w, environment).length).toBeGreaterThan(0);
    const catalog = destinationCatalog(w);
    expect(catalog.length).toBe(w.graph.nodes.length);
    const landmark = w.objects.find((o) => o.kind === "landmark")!;
    const hits = rankDestinations(catalog, landmark.name);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].search).toContain(
      landmark.name
        .toLowerCase()
        .replace(/[^a-z0-9&]+/g, " ")
        .trim(),
    );
    expect(rankDestinations(catalog, named[1].name!)[0].label).toBe(
      named[1].name,
    );
  });
});

describe("city moods differ in the data", () => {
  const heights = (slug: string) => buildings(city(slug)).map((o) => o.height);
  const streetWidth = (slug: string) =>
    median(
      city(slug)
        .roads.filter((r) => r.kind === "road")
        .map((r) => r.width),
    );

  it("noir towers over the mid-rise bay", () => {
    expect(median(heights("noir-harbor"))).toBeGreaterThan(
      median(heights("velocity-bay")),
    );
    const noir = heights("noir-harbor");
    expect(Math.max(...noir)).toBeGreaterThanOrEqual(200);
    expect(Math.max(...noir)).toBeLessThanOrEqual(260);
    const velocity = heights("velocity-bay").filter((h) => h > 0);
    expect(median(velocity)).toBeGreaterThanOrEqual(15);
    expect(median(velocity)).toBeLessThanOrEqual(80);
    expect(Math.max(...heights("skyline-prime"))).toBeGreaterThan(280);
  });

  it("has different tree cover, lighting and street widths", () => {
    expect(trees(city("aurora-realm")).length).toBeGreaterThan(
      trees(city("noir-harbor")).length * 3,
    );
    expect(trees(city("skyline-prime")).length).toBeGreaterThan(
      trees(city("neon-district")).length,
    );
    expect(litShare(city("neon-district"))).toBe(1);
    expect(litShare(city("noir-harbor"))).toBeLessThan(0.8);
    expect(litShare(city("skyline-prime"))).toBeGreaterThan(0.95);
    expect(streetWidth("skyline-prime")).toBeGreaterThan(
      streetWidth("noir-harbor") * 1.8,
    );
    expect(streetWidth("noir-harbor")).toBeLessThan(
      streetWidth("velocity-bay"),
    );
  });

  it("gives each city its signature features", () => {
    const noir = city("noir-harbor");
    expect(noir.graph.edges.some((e) => e.covered)).toBe(true);
    expect(noir.objects.some((o) => /cathedral/i.test(o.name))).toBe(true);
    expect(noir.graph.edges.filter((e) => !e.lit).length).toBeGreaterThan(60);
    const skyline = city("skyline-prime");
    expect(skyline.objects.some((o) => /globe/i.test(o.name))).toBe(true);
    expect(skyline.landscapes.some((l) => /plaza|park/i.test(l.name))).toBe(
      true,
    );
    const velocity = city("velocity-bay");
    expect(velocity.roads.some((r) => r.kind === "cycleway")).toBe(true);
    expect(velocity.graph.edges.some((e) => /promenade/i.test(e.name))).toBe(
      true,
    );
    const aurora = city("aurora-realm");
    const rainbow = aurora.graph.edges.filter((e) => /rainbow/i.test(e.name));
    expect(rainbow.length).toBeGreaterThan(0);
    expect(rainbow.every((e) => e.scenic === 1)).toBe(true);
    expect(rainbow.reduce((s, e) => s + e.distance, 0)).toBeGreaterThanOrEqual(
      150,
    );
    expect(aurora.graph.edges.some((e) => /bridge/i.test(e.name))).toBe(true);
    expect(
      aurora.landscapes.filter((l) => l.kind === "water").length,
    ).toBeGreaterThan(1);
    const citadel = aurora.objects.find((o) => /citadel/i.test(o.name))!;
    expect(citadel.height).toBeGreaterThan(120);
    expect(Math.hypot(...citadel.position)).toBeLessThan(60);
    const neon = city("neon-district");
    expect(neon.graph.edges.filter((e) => e.covered).length).toBeGreaterThan(
      30,
    );
    const neonHeights = heights("neon-district");
    expect(Math.min(...neonHeights)).toBeLessThan(16);
    expect(Math.max(...neonHeights)).toBeGreaterThan(150);
  });
});

describe("the desert and the garden", () => {
  const BOULEVARD_X = 60;

  it("gives Dune Reach a low walled maze, wind towers, a treeless boulevard district and an oasis", () => {
    const dune = city("dune-reach");
    const houses = dune.objects.filter((o) => o.name === "Courtyard house");
    expect(houses.length).toBeGreaterThan(400);
    for (const h of houses) {
      expect(h.height).toBeGreaterThanOrEqual(6);
      expect(h.height).toBeLessThanOrEqual(14);
    }
    const towers = dune.objects.filter((o) => /wind/i.test(o.name));
    expect(towers.length).toBeGreaterThanOrEqual(3);
    for (const t of towers) {
      expect(["tower", "landmark"]).toContain(t.kind);
      expect(Math.max(t.width, t.depth)).toBeLessThanOrEqual(10);
      expect(t.height).toBeGreaterThan(
        median(houses.map((h) => h.height)) * 1.5,
      );
    }
    const lanes = dune.roads.filter((r) => /Lane$|Alley$/.test(r.name));
    expect(lanes.length).toBeGreaterThan(40);
    expect(Math.max(...lanes.map((r) => r.width))).toBeLessThanOrEqual(3);
    const boulevards = dune.roads.filter((r) => r.kind === "road");
    expect(median(boulevards.map((r) => r.width))).toBeGreaterThanOrEqual(30);
    expect(trees(dune).filter((t) => t.position[0] > BOULEVARD_X - 10)).toEqual(
      [],
    );
    expect(
      dune.landscapes.some((l) => l.kind === "water" && /oasis/i.test(l.name)),
    ).toBe(true);
    expect(
      dune.landscapes.some((l) => l.kind === "park" && /oasis/i.test(l.name)),
    ).toBe(true);
    expect(
      trees(dune).filter((t) => /palm/i.test(t.name)).length,
    ).toBeGreaterThan(150);
  });

  it("sends Dune Reach's 3 PM shade route through the old-quarter lanes", () => {
    const dune = city("dune-reach");
    const id = (name: string) =>
      dune.graph.nodes.find((n) => n.name === name)!.id;
    const routes = compareRoutes(dune, id("Caravan Gate"), id("Mirage Gate"), {
      avoidStairs: false,
      allowHypothetical: false,
      maxDetour: 1.6,
      environment: afternoon("dune-reach"),
    });
    const quickest = routes.quickest!,
      shade = routes.shade!;
    expect(quickest.edges.every((e) => e.name === "Sun Boulevard")).toBe(true);
    expect(quickest.shadeFraction).toBeLessThan(0.1);
    expect(shade.shadeFraction).toBeGreaterThan(quickest.shadeFraction + 0.4);
    const laneMetres = shade.edges
      .filter((e) => / Lane$/.test(e.name))
      .reduce((s, e) => s + e.distance, 0);
    expect(laneMetres / shade.distance).toBeGreaterThan(0.5);
    expect(shade.warnings).toEqual([]);
  });

  it("gives Verdant Canopy terraced mid-rises, the most trees, arcades, a river and a botanic garden", () => {
    const verdant = city("verdant-canopy");
    const homes = verdant.objects.filter((o) => o.name === "Terraced homes");
    expect(homes.length).toBeGreaterThan(200);
    for (const h of homes) {
      expect(h.height).toBeGreaterThanOrEqual(15);
      expect(h.height).toBeLessThanOrEqual(40);
    }
    const count = trees(verdant).length;
    for (const slug of SLUGS)
      if (slug !== "verdant-canopy")
        expect(count).toBeGreaterThan(trees(city(slug)).length);
    expect(verdant.graph.edges.filter((e) => e.covered).length).toBeGreaterThan(
      30,
    );
    expect(verdant.graph.edges.some((e) => /arcade/i.test(e.name))).toBe(true);
    expect(
      verdant.landscapes.some(
        (l) => l.kind === "water" && /river/i.test(l.name),
      ),
    ).toBe(true);
    expect(verdant.landscapes.some((l) => /botanic/i.test(l.name))).toBe(true);
    expect(
      verdant.objects.some(
        (o) => o.kind === "landmark" && /glasshouse/i.test(o.name),
      ),
    ).toBe(true);
    expect(
      verdant.landscapes.filter((l) => l.kind === "park").length,
    ).toBeGreaterThanOrEqual(6);
  });

  it("makes Verdant Canopy the coolest city to walk at 3 PM", () => {
    const verdant = edgeShade("verdant-canopy");
    const boulevards = edgeShade("dune-reach").filter(
      (x) => x.edge.roadClass === "major",
    );
    expect(boulevards.length).toBeGreaterThan(30);
    const verdantMedian = median(verdant.map((x) => x.shade));
    expect(verdantMedian).toBeGreaterThan(
      median(boulevards.map((x) => x.shade)) + 0.5,
    );
    expect(verdantMedian).toBeGreaterThanOrEqual(0.9);
    // More of its walking metres lie in shade than in any other city.
    const share = shadedMetres(verdant);
    for (const slug of SLUGS)
      if (slug !== "verdant-canopy")
        expect(share, slug).toBeGreaterThan(shadedMetres(edgeShade(slug)));
  });
});

describe("signature landmarks", () => {
  /** Each city's shaped landmarks: [shape, name]. */
  const SIGNATURES: Record<(typeof SLUGS)[number], [LandmarkShape, RegExp][]> =
    {
      "noir-harbor": [
        ["cathedral", /^Saint Vesper Cathedral$/],
        ["signal", /^Central Precinct$/],
        ["manor", /^Graymoor Manor$/],
        ["manor", /^Blackwater Asylum$/],
        ["bridge", /^Graymoor Bridge$/],
        ["bridge", /^Harbor Elevated Line$/],
        ["smokestacks", /^Harbor Chemical Works$/],
        ["tanks", /^Harbor Chemical Tank Farm$/],
        ["spire", /^Gargoyle Spire$/],
        ["stepped", /^Monarch Grand Hotel$/],
      ],
      "skyline-prime": [
        ["globe", /^Daily Clarion Globe Tower$/],
        ["hall", /^Hall of Champions$/],
        ["spire", /^Apex Tower$/],
        ["statue", /^Guardian of Tomorrow Statue$/],
        ["bridge", /^Starliner Bay Bridge$/],
        ["dome", /^Aerial Museum$/],
        ["stepped", /^Skyline Prime City Hall$/],
      ],
      "velocity-bay": [
        ["bridge", /^Velocity Bay Bridge$/],
        ["arena", /^Photon Arena$/],
      ],
      "aurora-realm": [
        ["dome", /^Sunhold Citadel$/],
        ["spire", /^Spire of Dawn$/],
        ["hall", /^Great Hall of Feasts$/],
        ["bridge", /^Rainbow Bridge$/],
      ],
      "neon-district": [
        ["stepped", /^Hologram Tower$/],
        ["signal", /^Searchlight Tower$/],
        ["arena", /^Synthwave Arena$/],
      ],
      "dune-reach": [
        ["wind-tower", /^Tower of Seven Winds$/],
        ["dome", /^Copper Dome Observatory$/],
      ],
      "verdant-canopy": [["glasshouse", /^Great Glasshouse$/]],
    };
  const shaped = (w: World, shape: LandmarkShape) =>
    w.objects.filter((o) => o.shape === shape);
  const inWater = (w: World, p: Point) =>
    w.landscapes.some((l) => l.kind === "water" && insidePolygon(p, l.points));
  const named = (w: World, name: string) =>
    w.objects.find((o) => o.name === name)!;

  it.each(SLUGS)("gives %s its signature shaped landmarks", (slug) => {
    const w = city(slug);
    for (const [shape, name] of SIGNATURES[slug]) {
      const hits = shaped(w, shape).filter((o) => name.test(o.name));
      expect(hits.length, `${shape} ${name}`).toBeGreaterThan(0);
    }
    for (const o of w.objects.filter((o) => o.shape)) {
      expect(LANDMARK_SHAPES).toContain(o.shape);
      expect(o.kind).not.toBe("tree");
    }
    // Shaped objects survive the scene schema.
    expect(worldSchema.safeParse(w).success).toBe(true);
  });

  it("keeps the iconic-inspired cities trademark-safe", () => {
    const banned =
      /gotham|wayne|arkham|metropolis|daily planet|justice|lexcorp|ace chem|luthor|batman|superman/i;
    for (const slug of SLUGS) {
      const w = city(slug);
      const names = [
        ...w.objects.map((o) => o.name),
        ...w.graph.nodes.flatMap((n) => (n.name ? [n.name] : [])),
        ...w.graph.edges.map((e) => e.name),
        ...w.landscapes.map((l) => l.name),
      ];
      expect(
        names.filter((n) => banned.test(n)),
        slug,
      ).toEqual([]);
    }
  });

  it("fills Noir Harbor's core with gothic spires and deco setbacks", () => {
    const noir = city("noir-harbor");
    const core = noir.objects.filter(
      (o) =>
        (o.shape === "spire" || o.shape === "stepped") &&
        Math.hypot(...o.position) < 300,
    );
    expect(core.length).toBeGreaterThanOrEqual(30);
    expect(core.some((o) => o.shape === "spire")).toBe(true);
    expect(core.some((o) => o.shape === "stepped")).toBe(true);
    for (const o of core) expect(o.height).toBeGreaterThan(100);
  });

  it("sets Noir Harbor's manor outside the core across a bridge, and its asylum out on the water", () => {
    const noir = city("noir-harbor");
    const manor = named(noir, "Graymoor Manor");
    const bridge = named(noir, "Graymoor Bridge");
    const cathedral = named(noir, "Saint Vesper Cathedral");
    expect(Math.hypot(...manor.position)).toBeGreaterThan(300);
    // The bridge spans the river between the manor and the city.
    expect(inWater(noir, bridge.position)).toBe(true);
    expect(manor.position[0]).toBeLessThan(bridge.position[0]);
    expect(bridge.position[0]).toBeLessThan(cathedral.position[0]);
    expect(
      noir.objects.filter((o) => o.name === "Graymoor oak").length,
    ).toBeGreaterThan(60);
    // The asylum stands on dry land with the harbor round three sides.
    const asylum = named(noir, "Blackwater Asylum");
    const [x, z] = asylum.position;
    expect(inWater(noir, asylum.position)).toBe(false);
    for (const p of [
      [x - 70, z],
      [x + 80, z],
      [x, z + 60],
    ] as Point[])
      expect(inWater(noir, p)).toBe(true);
    // The elevated line runs the waterfront in several spans.
    const el = noir.objects.filter((o) => o.name === "Harbor Elevated Line");
    expect(el.length).toBeGreaterThanOrEqual(4);
    expect(el.reduce((s, o) => s + o.width, 0)).toBeGreaterThan(600);
  });

  it("fills Skyline Prime with gleaming setback towers round a statue and a harbor bridge", () => {
    const skyline = city("skyline-prime");
    expect(shaped(skyline, "stepped").length).toBeGreaterThanOrEqual(30);
    for (const o of shaped(skyline, "stepped"))
      expect(o.height).toBeGreaterThanOrEqual(80);
    const statue = named(skyline, "Guardian of Tomorrow Statue");
    const plaza = skyline.landscapes.find(
      (l) => l.name === "Grand Concourse Plaza",
    )!;
    expect(insidePolygon(statue.position, plaza.points)).toBe(true);
    const globe = named(skyline, "Daily Clarion Globe Tower");
    expect(globe.height).toBeGreaterThan(280);
    for (const name of ["Starliner Bay Bridge"])
      expect(inWater(skyline, named(skyline, name).position)).toBe(true);
  });

  it("lays every decorative bridge over water", () => {
    for (const [slug, name] of [
      ["noir-harbor", "Graymoor Bridge"],
      ["skyline-prime", "Starliner Bay Bridge"],
      ["velocity-bay", "Velocity Bay Bridge"],
      ["aurora-realm", "Rainbow Bridge"],
    ] as const) {
      const w = city(slug);
      const o = named(w, name);
      expect(o.shape, name).toBe("bridge");
      expect(inWater(w, o.position), name).toBe(true);
    }
  });
});
