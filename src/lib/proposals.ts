import type { World, SceneObject } from "../../shared/types.js";
export interface DesignProposal {
  summary: string;
  objects: SceneObject[];
  removeIds?: string[];
}
export function applyDesignProposal(
  world: World,
  proposal: DesignProposal,
): World {
  const replaced = new Set([
    ...proposal.objects.map((o) => o.id),
    ...(proposal.removeIds || []),
  ]);
  return {
    ...world,
    objects: [
      ...world.objects.filter((o) => !replaced.has(o.id)),
      ...proposal.objects,
    ],
  };
}
