import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SceneObject, Terrain } from "../../../shared/types";
import { terrainHeight } from "../../lib/geo";
import { buildingGeometry, hash } from "./geometry";

const wallColors = [
  "#d8d0bd",
  "#cfc9b8",
  "#d9d4c8",
  "#c8c4b7",
  "#e1d9ca",
  "#c9c4af",
];
const ROOF = new THREE.Color("#e9e3d5");
const GLASS = new THREE.Color("#abbcb4");

/**
 * All mapped buildings as one mesh: a real campus has thousands, and one
 * draw call keeps orbiting smooth. Clicks resolve to a building through the
 * triangle ranges recorded while merging.
 */
export default function MergedBuildings({
  objects,
  terrain,
  onPick,
}: {
  objects: SceneObject[];
  terrain?: Terrain;
  onPick?: (object: SceneObject) => void;
}) {
  const { geometry, ranges } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const ranges: { end: number; object: SceneObject }[] = [];
    let triangles = 0;
    const color = new THREE.Color();
    for (const object of objects) {
      const g = buildingGeometry(object).toNonIndexed();
      g.rotateY((-object.rotation * Math.PI) / 180);
      g.translate(
        object.position[0],
        terrainHeight(object.position, terrain) + 0.1,
        object.position[1],
      );
      // Group 0 is roof and floor caps, group 1 the walls.
      const wall =
        object.kind === "skyscraper"
          ? GLASS
          : color.set(wallColors[hash(object.id) % wallColors.length]);
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (const group of g.groups) {
        const c = group.materialIndex === 0 ? ROOF : wall;
        for (let v = group.start; v < group.start + group.count; v++)
          colors.set([c.r, c.g, c.b], v * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      g.clearGroups();
      g.deleteAttribute("uv");
      triangles += g.attributes.position.count / 3;
      ranges.push({ end: triangles, object });
      parts.push(g);
    }
    const geometry = parts.length
      ? mergeGeometries(parts, false)
      : new THREE.BufferGeometry();
    parts.forEach((p) => p.dispose());
    geometry.computeBoundingSphere();
    return { geometry, ranges };
  }, [objects, terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onPointerDown={
        onPick
          ? (e) => {
              const face = e.faceIndex ?? -1;
              // Binary search the triangle range that contains this face.
              let lo = 0,
                hi = ranges.length - 1;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (ranges[mid].end > face) hi = mid;
                else lo = mid + 1;
              }
              const hit = ranges[lo];
              if (!hit || face < 0) return;
              e.stopPropagation();
              onPick(hit.object);
            }
          : undefined
      }
    >
      <meshStandardMaterial vertexColors roughness={0.9} />
    </mesh>
  );
}
