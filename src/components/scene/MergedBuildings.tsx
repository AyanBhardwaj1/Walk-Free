import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SceneObject, Terrain } from "../../../shared/types";
import { terrainHeight } from "../../lib/geo";
import { buildingGeometry, hash } from "./geometry";
import { sc, sceneTheme } from "../../lib/scene-theme";

const wallColors = [
  "#d8d0bd",
  "#cfc9b8",
  "#d9d4c8",
  "#c8c4b7",
  "#e1d9ca",
  "#c9c4af",
];

/** One window bay is this wide and one floor this tall, in meters. */
const BAY_M = 4;
const FLOOR_M = 3.6;
/** The window texture covers 8 x 8 bays before it repeats. */
const TILE_BAYS = 8;
let windowTexture: THREE.CanvasTexture | null = null;
/**
 * Lit and dark windows for night views: an 8 x 8 grid of bays, about 55%
 * lit in warm tones of varying brightness, deterministic so it doesn't
 * flicker between renders.
 */
function windows() {
  if (windowTexture || typeof document === "undefined") return windowTexture;
  const size = 256,
    bay = size / TILE_BAYS;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let row = 0; row < TILE_BAYS; row++)
    for (let col = 0; col < TILE_BAYS; col++) {
      if (random() > 0.55) continue;
      const warm = 200 + Math.round(random() * 55);
      const glow = 0.45 + random() * 0.55;
      ctx.fillStyle = `rgba(255, ${warm}, ${Math.round(warm * 0.62)}, ${glow})`;
      ctx.fillRect(
        col * bay + bay * 0.22,
        row * bay + bay * 0.25,
        bay * 0.56,
        bay * 0.45,
      );
    }
  windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.wrapS = windowTexture.wrapT = THREE.RepeatWrapping;
  windowTexture.repeat.set(
    1 / (TILE_BAYS * BAY_M),
    1 / (TILE_BAYS * FLOOR_M),
  );
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  windowTexture.anisotropy = 4;
  return windowTexture;
}

/**
 * All mapped buildings as one mesh: a real campus has thousands, and one
 * draw call keeps orbiting smooth. Clicks resolve to a building through the
 * triangle ranges recorded while merging.
 */
export default function MergedBuildings({
  objects,
  terrain,
  onPick,
  lightsOn = 0,
}: {
  objects: SceneObject[];
  terrain?: Terrain;
  onPick?: (object: SceneObject) => void;
  /** 0 by day, up to 1 after dark: how brightly windows glow. */
  lightsOn?: number;
}) {
  const theme = sceneTheme();
  const { geometry, ranges } = useMemo(() => {
    const ROOF = new THREE.Color(sc("#e9e3d5"));
    const GLASS = new THREE.Color(sc("#abbcb4"));
    const parts: THREE.BufferGeometry[] = [];
    const ranges: { end: number; object: SceneObject }[] = [];
    let triangles = 0;
    const color = new THREE.Color();
    for (const object of objects) {
      // Extruded shapes are already non-indexed; converting again would only
      // log a warning per building.
      const extruded = buildingGeometry(object);
      const g = extruded.index ? extruded.toNonIndexed() : extruded;
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
          : color.set(sc(wallColors[hash(object.id) % wallColors.length]));
      const colors = new Float32Array(g.attributes.position.count * 3);
      // Wall UVs from the extrusion are in meters (along the wall, and
      // height), which the window texture repeats over. Roofs and floors
      // point at a dark corner of it so they never show windows.
      const uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
      for (const group of g.groups) {
        const c = group.materialIndex === 0 ? ROOF : wall;
        for (let v = group.start; v < group.start + group.count; v++) {
          colors.set([c.r, c.g, c.b], v * 3);
          if (uv && group.materialIndex === 0) uv.setXY(v, 0.1, 0.1);
        }
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      g.clearGroups();
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
    // The colours are baked into the mesh, so a new style rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, terrain, theme]);
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
      <meshStandardMaterial
        vertexColors
        roughness={0.86}
        emissive="#ffffff"
        emissiveMap={windows()}
        emissiveIntensity={lightsOn * 1.15}
      />
    </mesh>
  );
}
