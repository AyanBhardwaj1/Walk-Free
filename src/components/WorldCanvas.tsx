import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type {
  World,
  Environment,
  Point,
  RouteResult,
  Terrain,
} from "../../shared/types";
import Building from "./scene/Buildings";
import Trees from "./scene/Trees";
import { sunDirection } from "../lib/environment";
import { terrainHeight } from "../lib/geo";
function Ground({
  world,
  onClick,
}: {
  world: World;
  onClick: (p: Point) => void;
}) {
  const geometry = useMemo(() => {
    const t = world.terrain;
    const n = t?.resolution ?? 2;
    const g = new THREE.PlaneGeometry(
      world.extent * 1.2,
      world.extent * 1.2,
      n - 1,
      n - 1,
    );
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(i, terrainHeight([p.getX(i), p.getZ(i)], t));
    g.computeVertexNormals();
    return g;
  }, [world.terrain, world.extent]);
  return (
    <mesh
      geometry={geometry}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick([e.point.x, e.point.z]);
      }}
    >
      <meshStandardMaterial color="#e5e1d5" roughness={1} />
    </mesh>
  );
}
function Area({ points, color }: { points: Point[]; color: string }) {
  const g = useMemo(() => {
    const shape = new THREE.Shape(
      points.map((p) => new THREE.Vector2(p[0], -p[1])),
    );
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [points]);
  return (
    <mesh geometry={g} position={[0, 0.3, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}
export default function WorldCanvas({
  world,
  environment,
  selectedId,
  onSelect,
  onGroundClick,
  route,
  showTrees = true,
  showBuildings = true,
}: {
  world: World;
  environment: Environment;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGroundClick: (p: Point) => void;
  route: RouteResult | null;
  showTrees?: boolean;
  showBuildings?: boolean;
}) {
  const sun = sunDirection(environment, world.origin);
  const extent = world.extent;
  return (
    <Canvas
      shadows
      camera={{
        position: [extent * 0.65, extent * 0.72, extent * 0.7],
        fov: 40,
        near: 1,
        far: 20000,
      }}
      dpr={[1, 1.6]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#eeece3"]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#fff7e2", "#9aab91", 1.2]} />
      <directionalLight
        castShadow
        intensity={sun.y > 0 ? 2.3 * (1 - environment.cloudCover / 120) : 0}
        position={[sun.x * extent, sun.y * extent, sun.z * extent]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-extent * 0.7}
        shadow-camera-right={extent * 0.7}
        shadow-camera-top={extent * 0.7}
        shadow-camera-bottom={-extent * 0.7}
        shadow-camera-far={extent * 4}
        shadow-bias={-0.0002}
      />
      <Ground world={world} onClick={onGroundClick} />
      {world.landscapes.map((l) => (
        <Area
          key={l.id}
          points={l.points}
          color={l.kind === "water" ? "#a5bcba" : "#bdc6a0"}
        />
      ))}
      {world.roads.map((r) => (
        <Line
          key={r.id}
          points={r.points.map((p) => [
            p[0],
            terrainHeight(p, world.terrain) + 0.6,
            p[1],
          ])}
          color={r.kind === "road" ? "#faf7ed" : "#dfd4bd"}
          lineWidth={r.kind === "road" ? 5 : 2}
        />
      ))}
      {showBuildings &&
        world.objects
          .filter((o) => o.kind !== "tree")
          .map((o) => (
            <Building
              key={o.id}
              object={o}
              terrain={world.terrain}
              selected={o.id === selectedId}
              detailed={world.objects.length < 500}
              onPointerDown={(e, obj) => {
                e.stopPropagation();
                onSelect(obj.id);
              }}
            />
          ))}
      {showTrees && (
        <Trees
          objects={world.objects.filter((o) => o.kind === "tree")}
          terrain={world.terrain}
          selectedId={selectedId}
          onPointerDown={(e, o) => {
            e.stopPropagation();
            onSelect(o.id);
          }}
        />
      )}
      {route && (
        <Line
          points={route.points.map((p) => [
            p[0],
            terrainHeight(p, world.terrain) + 3,
            p[1],
          ])}
          color="#d57b48"
          lineWidth={5}
        />
      )}
      <OrbitControls
        makeDefault
        minDistance={70}
        maxDistance={extent * 2.4}
        maxPolarAngle={Math.PI * 0.48}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
