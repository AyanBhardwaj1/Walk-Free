import { describe, expect, it } from "vitest";
import { clampObjectField, repairWorld } from "../src/lib/scene-limits";
import { worldSchema } from "../shared/schema";
import { createStudyWorld } from "../src/lib/study";

describe("keeping saved scenes openable", () => {
  it("brings out-of-range edits back inside the limits instead of losing the scene", () => {
    const world = createStudyWorld();
    const broken = {
      ...world,
      objects: world.objects.map((o, i) =>
        i === 0
          ? { ...o, height: 2000, rotation: 720, width: 6000 }
          : i === 1
            ? { ...o, position: [Number.NaN, 5] }
            : o,
      ),
    };
    expect(worldSchema.safeParse(broken).success).toBe(false);
    const repaired = worldSchema.safeParse(repairWorld(broken));
    expect(repaired.success).toBe(true);
    const [first, second] = repaired.data!.objects;
    expect(first.height).toBe(1500);
    expect(first.rotation).toBe(0);
    expect(first.width).toBe(5000);
    expect(second.position).toEqual([0, 5]);
    expect(repaired.data!.objects.length).toBe(world.objects.length);
  });

  it("clamps editor input and ignores half-typed numbers", () => {
    expect(clampObjectField("height", 2000)).toBe(1500);
    expect(clampObjectField("height", 0)).toBe(1);
    expect(clampObjectField("rotation", 450)).toBe(90);
    expect(clampObjectField("rotation", -450)).toBe(-90);
    expect(clampObjectField("width", Number.NaN)).toBeNull();
  });
});
