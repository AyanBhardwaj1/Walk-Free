import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type {
  Point,
  SceneObject,
  Terrain,
  WorldIndoor,
} from "../../../shared/types";
import { terrainHeight } from "../../lib/geo";
import { sc, sceneTheme } from "../../lib/scene-theme";
import { LEVEL_HEIGHT_M } from "../../lib/indoor/types";
import { bounds } from "../../lib/indoor/place";

type Kind = WorldIndoor["levels"][number]["rooms"][number]["kind"];

/** Floor colours by what a space is for. */
const FLOOR: Record<Kind, string> = {
  room: "#f1dfb8",
  corridor: "#cfe0c6",
  stairs: "#e4c58f",
  elevator: "#e4c58f",
  restroom: "#d3dde9",
  other: "#e9e2cf",
};
/**
 * Interior walls stand a storey's worth on small buildings and a little
 * taller on big ones, so the cutaway still reads from an overview.
 */
function wallHeight(level: WorldIndoor["levels"][number]) {
  if (!level.rooms.length) return 2.4;
  const b = bounds(level.rooms.flatMap((r) => r.ring));
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return Math.max(2.4, Math.min(6, size / 40));
}

/** One level's floors (a mesh per kind) and walls (one mesh). */
function levelGeometry(level: WorldIndoor["levels"][number], y: number) {
  const floors = new Map<Kind, THREE.BufferGeometry[]>();
  const wall: number[] = [];
  const tall = wallHeight(level);
  for (const room of level.rooms) {
    if (room.ring.length < 3) continue;
    const shape = new THREE.Shape(
      room.ring.map((p) => new THREE.Vector2(p[0], -p[1])),
    );
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y + 0.05, 0);
    floors.set(room.kind, [...(floors.get(room.kind) ?? []), g]);
    // Corridors and open areas have no walls of their own.
    if (room.kind === "corridor" || room.kind === "other") continue;
    for (let i = 0; i < room.ring.length; i++) {
      const a = room.ring[i],
        b = room.ring[(i + 1) % room.ring.length];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const lo = y,
        hi = y + tall;
      wall.push(
        a[0],
        lo,
        a[1],
        b[0],
        lo,
        b[1],
        b[0],
        hi,
        b[1],
        a[0],
        lo,
        a[1],
        b[0],
        hi,
        b[1],
        a[0],
        hi,
        a[1],
      );
    }
  }
  const merged = [...floors].map(([kind, list]) => {
    const g = mergeGeometries(list, false) ?? list[0];
    if (g !== list[0]) list.forEach((x) => x.dispose());
    return { kind, geometry: g };
  });
  const walls = new THREE.BufferGeometry();
  walls.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
  walls.computeVertexNormals();
  return { floors: merged, walls };
}

function InteriorLevel({
  level,
  y,
  current,
}: {
  level: WorldIndoor["levels"][number];
  y: number;
  /** The level being looked at; levels below it are drawn faintly. */
  current: boolean;
}) {
  const theme = sceneTheme();
  const geo = useMemo(() => levelGeometry(level, y), [level, y]);
  useEffect(
    () => () => {
      geo.floors.forEach((f) => f.geometry.dispose());
      geo.walls.dispose();
    },
    [geo],
  );
  const paths = useMemo(
    () =>
      level.paths
        .filter((p) => p.length >= 2)
        .map((p) =>
          p.map(([x, z]): [number, number, number] => [x, y + 0.3, z]),
        ),
    [level.paths, y],
  );
  const opacity = current ? 1 : 0.35;
  return (
    <group>
      {geo.floors.map((f) => (
        <mesh key={f.kind} geometry={f.geometry} receiveShadow>
          <meshStandardMaterial
            key={theme}
            color={sc(FLOOR[f.kind])}
            roughness={1}
            transparent={!current}
            opacity={opacity}
          />
        </mesh>
      ))}
      <mesh geometry={geo.walls} castShadow>
        <meshStandardMaterial
          key={theme}
          color={sc("#b9b19c")}
          roughness={0.9}
          side={THREE.DoubleSide}
          transparent
          opacity={current ? 0.85 : 0.2}
          depthWrite={current}
        />
      </mesh>
      {current &&
        paths.map((p, i) => (
          <Line
            key={i}
            points={p}
            color={sc("#699271")}
            lineWidth={3}
            dashed
            dashSize={1.6}
            gapSize={1}
          />
        ))}
      {current &&
        level.doors.map((d, i) => (
          <mesh key={i} position={[d[0], y + 0.25, d[1]]}>
            <cylinderGeometry args={[0.6, 0.6, 0.3, 12]} />
            <meshStandardMaterial color={sc("#d9a441")} />
          </mesh>
        ))}
    </group>
  );
}

/**
 * The open interior of a building, as a dollhouse cutaway: floors coloured
 * by use, low walls around rooms, and the walkable corridor lines with
 * doorways. Levels below the one being looked at are drawn faintly
 * underneath it; levels above are left off so nothing hides it.
 */
export default function Interiors({
  interior,
  building,
  terrain,
  level,
}: {
  interior: WorldIndoor;
  building?: SceneObject;
  terrain?: Terrain;
  /** Ordinal of the level to show. */
  level: number;
}) {
  const base = terrainHeight((building?.position ?? [0, 0]) as Point, terrain);
  const ground = Math.min(0, ...interior.levels.map((l) => l.ordinal));
  return (
    <group>
      {interior.levels
        .filter((l) => l.ordinal <= level)
        .map((l) => (
          <InteriorLevel
            key={l.ordinal}
            level={l}
            // Basements sit below ground; the scene keeps them visible by
            // lifting the whole stack so the lowest floor is at grade.
            y={base + (l.ordinal - ground) * LEVEL_HEIGHT_M}
            current={l.ordinal === level}
          />
        ))}
    </group>
  );
}
