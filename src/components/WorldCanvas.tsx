import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import { useMemo, useEffect } from "react";
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
function FrameArea({ extent }: { extent: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const fit = Math.max(1, 1.2 / (size.width / size.height));
    camera.position.set(
      extent * 0.65 * fit,
      extent * 0.72 * fit,
      extent * 0.7 * fit,
    );
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, extent, size.width, size.height, invalidate]);
  return null;
}
function WalkingPaths({
  world,
  onClick,
}: {
  world: World;
  onClick: (point: Point) => void;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const edge of world.graph.edges) {
      if (edge.indoor === "hypothetical") continue;
      for (let i = 1; i < edge.points.length; i++)
        for (const p of [edge.points[i - 1], edge.points[i]])
          positions.push(p[0], terrainHeight(p, world.terrain) + 1.2, p[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [world.graph, world.terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation();
        onClick([e.point.x, e.point.z]);
      }}
    >
      <lineBasicMaterial color="#699271" transparent opacity={0.65} />
    </lineSegments>
  );
}
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
function Endpoint({
  point,
  label,
  terrain,
}: {
  point: Point;
  label: string;
  terrain?: Terrain;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 112;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = label === "Start" ? "#3f5938" : "#a55c32";
    ctx.strokeStyle = "#fffdf4";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 104, 48);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 57);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[point[0], terrainHeight(point, terrain) + 4, point[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5, 9, 32]} />
        <meshBasicMaterial
          color={label === "Start" ? "#3f5938" : "#b46539"}
          depthTest={false}
        />
      </mesh>
      <sprite position={[0, 22, 0]} scale={[58, 25, 1]} renderOrder={10}>
        <spriteMaterial
          map={texture}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
export default function WorldCanvas({
  world,
  environment,
  selectedId,
  onSelect,
  onGroundClick,
  route,
  startPoint,
  endPoint,
  showWalkingPaths = false,
  locationPoint,
  pickingEndpoint = false,
  showTrees = true,
  showBuildings = true,
}: {
  world: World;
  environment: Environment;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGroundClick: (p: Point) => void;
  route: RouteResult | null;
  startPoint?: Point;
  endPoint?: Point;
  locationPoint?: Point;
  showWalkingPaths?: boolean;
  pickingEndpoint?: boolean;
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
      <FrameArea extent={extent} />
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
      {showWalkingPaths && (
        <WalkingPaths world={world} onClick={onGroundClick} />
      )}
      <group
        onClick={(e) => {
          if (pickingEndpoint) {
            e.stopPropagation();
            onGroundClick([e.point.x, e.point.z]);
          }
        }}
      >
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
                  if (!pickingEndpoint) onSelect(obj.id);
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
              if (!pickingEndpoint) onSelect(o.id);
            }}
          />
        )}
      </group>
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
      {startPoint && (
        <Endpoint point={startPoint} label="Start" terrain={world.terrain} />
      )}
      {endPoint && (
        <Endpoint point={endPoint} label="Finish" terrain={world.terrain} />
      )}
      {locationPoint && (
        <mesh
          position={[
            locationPoint[0],
            terrainHeight(locationPoint, world.terrain) + 5,
            locationPoint[1],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={11}
        >
          <circleGeometry args={[6, 24]} />
          <meshBasicMaterial color="#3479bf" depthTest={false} />
        </mesh>
      )}
      <OrbitControls
        makeDefault
        minDistance={70}
        maxDistance={extent * 4}
        maxPolarAngle={Math.PI * 0.48}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
