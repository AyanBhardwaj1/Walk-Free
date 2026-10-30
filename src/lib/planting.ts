import type { Point, SceneObject, World } from "../../shared/types.js";
import { samplePolyline } from "./routing.js";
import { inside } from "../../shared/canopy.js";

const SPACING_M = 10;
/** Trees sit beside the path, not on it. */
const OFFSET_M = 5;
const MIN_GAP_M = 4;
const MAX_TREES = 150;
const GENERIC = new Set(["Footpath", "Street", "Path"]);
/** A young-to-mature street tree, such as a live oak. */
const TREE = { width: 10, depth: 10, height: 12 };

export interface PlantingResult {
  world: World;
  street: string;
  edgeIds: string[];
  planted: number;
}

/**
 * Plants shade trees on both sides of the street containing `edgeId`
 * (the whole named street, or just this path if it is unnamed).
 */
export function plantShadeRow(
  world: World,
  edgeId: string,
): PlantingResult | null {
  const picked = world.graph.edges.find((e) => e.id === edgeId);
  if (!picked) return null;
  const named = !GENERIC.has(picked.name);
  const edges = named
    ? world.graph.edges.filter((e) => e.name === picked.name)
    : [picked];
  // Trees by grid cell, so spacing checks look only at neighbours.
  const cell = (p: Point) =>
    `${Math.floor(p[0] / MIN_GAP_M)},${Math.floor(p[1] / MIN_GAP_M)}`;
  const trees = new Map<string, Point[]>();
  const addTree = (p: Point) => {
    const k = cell(p);
    trees.set(k, [...(trees.get(k) ?? []), p]);
  };
  for (const o of world.objects) if (o.kind === "tree") addTree(o.position);
  const crowded = (p: Point) => {
    const [cx, cy] = cell(p).split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const q of trees.get(`${cx + dx},${cy + dy}`) ?? [])
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < MIN_GAP_M) return true;
    return false;
  };
  const planted: SceneObject[] = [];
  const footprints = buildingOutlines(world, edges);
  const clear = (p: Point) =>
    Math.abs(p[0]) <= world.extent / 2 &&
    Math.abs(p[1]) <= world.extent / 2 &&
    !footprints.some(
      (f) =>
        p[0] >= f.minX &&
        p[0] <= f.maxX &&
        p[1] >= f.minY &&
        p[1] <= f.maxY &&
        inside(f.ring, p[0], p[1]),
    ) &&
    !crowded(p);
  for (const e of edges) {
    const samples = samplePolyline(
      e.points,
      Math.max(1, Math.round(e.distance / SPACING_M)),
    );
    for (let i = 0; i < samples.length && planted.length < MAX_TREES; i++) {
      const a = samples[Math.max(0, i - 1)],
        b = samples[Math.min(samples.length - 1, i + 1)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      for (const side of [1, -1]) {
        if (planted.length >= MAX_TREES) break;
        const p: Point = [
          samples[i][0] + normal[0] * OFFSET_M * side,
          samples[i][1] + normal[1] * OFFSET_M * side,
        ];
        if (!clear(p)) continue;
        addTree(p);
        planted.push({
          id: crypto.randomUUID(),
          kind: "tree",
          name: "Planted shade tree",
          position: p,
          ...TREE,
          rotation: 0,
          source: "user",
          heightMethod: "designed",
        });
      }
    }
  }
  if (!planted.length) return null;
  return {
    world: { ...world, objects: [...world.objects, ...planted] },
    street: named ? picked.name : "this path",
    edgeIds: edges.map((e) => e.id),
    planted: planted.length,
  };
}

/** Outlines of buildings near the street, turned as the scene draws them. */
function buildingOutlines(world: World, edges: World["graph"]["edges"]) {
  const xs = edges.flatMap((e) => e.points.map((p) => p[0]));
  const ys = edges.flatMap((e) => e.points.map((p) => p[1]));
  const reach = OFFSET_M + 200;
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs) - reach,
    Math.max(...xs) + reach,
    Math.min(...ys) - reach,
    Math.max(...ys) + reach,
  ];
  return world.objects
    .filter(
      (o) =>
        o.kind !== "tree" &&
        o.position[0] >= minX &&
        o.position[0] <= maxX &&
        o.position[1] >= minY &&
        o.position[1] <= maxY,
    )
    .map((o) => {
      const a = (o.rotation * Math.PI) / 180,
        cos = Math.cos(a),
        sin = Math.sin(a);
      const shape: Point[] = o.footprint ?? [
        [-o.width / 2, -o.depth / 2],
        [o.width / 2, -o.depth / 2],
        [o.width / 2, o.depth / 2],
        [-o.width / 2, o.depth / 2],
      ];
      const ring = shape.map(([x, z]): Point => [
        o.position[0] + x * cos - z * sin,
        o.position[1] + x * sin + z * cos,
      ]);
      return {
        ring,
        minX: Math.min(...ring.map((p) => p[0])),
        maxX: Math.max(...ring.map((p) => p[0])),
        minY: Math.min(...ring.map((p) => p[1])),
        maxY: Math.max(...ring.map((p) => p[1])),
      };
    });
}
