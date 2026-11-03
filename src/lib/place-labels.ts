import type { Point, World } from "../../shared/types.js";

export interface PlaceLabel {
  text: string;
  point: Point;
  /** Top of the place: its tallest building part, or the ground. */
  height: number;
}

/**
 * Resolves an area's named places to points on its map. A building's label
 * sits over the tallest object inside its outline (outlines with 3D parts
 * are only as tall as their lowest part). Names not in the data are skipped.
 */
export function placeLabels(
  world: World,
  labels: readonly { name: string; label?: string }[] | undefined,
): PlaceLabel[] {
  if (!labels?.length) return [];
  const out: PlaceLabel[] = [];
  for (const { name, label } of labels) {
    const text = label ?? name;
    const o = world.objects.find((x) => x.kind !== "tree" && x.name === name);
    if (o) {
      const halfW = o.width / 2,
        halfD = o.depth / 2;
      let height = o.height;
      for (const x of world.objects) {
        if (
          x.kind !== "tree" &&
          Math.abs(x.position[0] - o.position[0]) <= halfW &&
          Math.abs(x.position[1] - o.position[1]) <= halfD
        )
          height = Math.max(height, x.height);
      }
      out.push({ text, point: o.position, height });
      continue;
    }
    const l = world.landscapes.find((x) => x.name === name);
    if (l?.points.length) {
      const xs = l.points.map((p) => p[0]),
        zs = l.points.map((p) => p[1]);
      out.push({
        text,
        point: [
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...zs) + Math.max(...zs)) / 2,
        ],
        height: 0,
      });
    }
  }
  return out;
}
