import type { Point } from "../../shared/types.js";

/** Size limits shared with the scene schema (shared/schema.ts). */
const LIMITS = {
  height: [1, 1500],
  width: [1, 5000],
  depth: [1, 5000],
} as const;
type SizeField = keyof typeof LIMITS;

/**
 * A value for an object field inside the scene's limits, or null when the
 * input isn't a number yet (such as a lone "-" while typing).
 */
export function clampObjectField(
  field: SizeField | "rotation",
  value: number,
): number | null {
  if (!Number.isFinite(value)) return null;
  if (field === "rotation") return (value % 360) + 0;
  const [min, max] = LIMITS[field];
  return Math.min(max, Math.max(min, value));
}

const finitePoint = (p: unknown): Point =>
  Array.isArray(p) && p.length === 2
    ? [Number.isFinite(p[0]) ? p[0] : 0, Number.isFinite(p[1]) ? p[1] : 0]
    : [0, 0];

/**
 * A stored scene with object sizes, turns and positions brought back inside
 * the schema's limits, so an old out-of-range edit doesn't make the whole
 * scene unreadable. Anything else is left for the schema to judge.
 */
export function repairWorld(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const world = raw as { objects?: unknown };
  if (!Array.isArray(world.objects)) return raw;
  return {
    ...world,
    objects: world.objects.map((o) => {
      if (!o || typeof o !== "object") return o;
      const object = { ...(o as Record<string, unknown>) };
      for (const field of ["height", "width", "depth", "rotation"] as const)
        if (typeof object[field] === "number")
          object[field] =
            clampObjectField(field, object[field]) ??
            (field === "rotation" ? 0 : LIMITS[field][0]);
      object.position = finitePoint(object.position);
      return object;
    }),
  };
}
