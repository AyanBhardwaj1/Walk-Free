import type { Point, SceneObject, World } from "../../shared/types.js";
import { samplePolyline } from "./routing.js";

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
  const existing = world.objects
    .filter((o) => o.kind === "tree")
    .map((o) => o.position);
  const planted: SceneObject[] = [];
  const clear = (p: Point) =>
    Math.abs(p[0]) <= world.extent / 2 &&
    Math.abs(p[1]) <= world.extent / 2 &&
    [...existing, ...planted.map((t) => t.position)].every(
      (q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= MIN_GAP_M,
    );
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
        const p: Point = [
          samples[i][0] + normal[0] * OFFSET_M * side,
          samples[i][1] + normal[1] * OFFSET_M * side,
        ];
        if (!clear(p)) continue;
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
