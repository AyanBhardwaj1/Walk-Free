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
import MergedBuildings from "./scene/MergedBuildings";
import { sunDirection } from "../lib/environment";
import { terrainHeight } from "../lib/geo";
import { sc, sceneTheme, setSceneTheme } from "../lib/scene-theme";
import type { ThemeName } from "../lib/theme";
/** Screen space covered by panels, in CSS pixels, so the map frames around it. */
export interface MapInsets {
  left: number;
  bottom: number;
  top: number;
}
const NO_INSETS: MapInsets = { left: 0, bottom: 0, top: 0 };
const VIEW_DIRECTION = new THREE.Vector3(0.65, 0.72, 0.7).normalize();
/**
 * Frames the route (or the whole area) inside the part of the screen that
 * panels leave visible, by shifting the projection centre into that region.
 * Re-frames only when the endpoints, area or visible region change, so the
 * time slider never moves the camera.
 */
function FrameArea({
  extent,
  insets,
  focus,
}: {
  extent: number;
  insets: MapInsets;
  focus: Point[];
}) {
  const { camera, size, invalidate, controls } = useThree();
  const focusKey = focus.map((p) => p.map(Math.round).join(",")).join("|");
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const left = Math.min(insets.left, size.width * 0.6);
    const bottom = Math.min(insets.bottom, size.height * 0.7);
    const top = Math.min(insets.top, size.height * 0.2);
    const visible = Math.max(
      120,
      Math.min(size.width - left, size.height - bottom - top),
    );
    cam.setViewOffset(
      size.width,
      size.height,
      -left / 2,
      (bottom - top) / 2,
      size.width,
      size.height,
    );
    let center: Point = [0, 0];
    let radius = extent / 2;
    if (focus.length) {
      const xs = focus.map((p) => p[0]),
        zs = focus.map((p) => p[1]);
      center = [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      ];
      const half =
        Math.hypot(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...zs) - Math.min(...zs),
        ) / 2;
      radius = Math.min(extent / 2, Math.max(160, half * 1.35 + 60));
    }
    // Distance at which a circle of this radius fits the visible region.
    const tan = Math.tan(((cam.fov / 2) * Math.PI) / 180);
    const distance = (radius * 0.9) / (tan * (visible / size.height));
    const target = new THREE.Vector3(center[0], 0, center[1]);
    cam.position.copy(target).addScaledVector(VIEW_DIRECTION, distance);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    const orbit = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    } | null;
    if (orbit) {
      orbit.target.copy(target);
      orbit.update();
    }
    invalidate();
    // focusKey stands in for focus, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    camera,
    controls,
    extent,
    focusKey,
    insets.left,
    insets.bottom,
    insets.top,
    size.width,
    size.height,
    invalidate,
  ]);
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
      <lineBasicMaterial color={sc("#699271")} transparent opacity={0.65} />
    </lineSegments>
  );
}
export interface HeatOverlay {
  colors: Map<string, string>;
  highlight?: Set<string>;
}
/** Walking paths coloured by heat, drawn as one batched line. */
function HeatPaths({
  world,
  heat,
  onSelect,
}: {
  world: World;
  heat: HeatOverlay;
  onSelect: (edgeId: string, point: Point) => void;
}) {
  const { points, colors, edgeAt, highlight } = useMemo(() => {
    const points: [number, number, number][] = [],
      colors: [number, number, number][] = [],
      edgeAt: string[] = [],
      highlight: [number, number, number][] = [];
    const color = new THREE.Color();
    for (const edge of world.graph.edges) {
      const hex = heat.colors.get(edge.id);
      if (!hex) continue;
      color.set(hex);
      const lifted = heat.highlight?.has(edge.id);
      for (let i = 1; i < edge.points.length; i++) {
        for (const p of [edge.points[i - 1], edge.points[i]]) {
          const v: [number, number, number] = [
            p[0],
            terrainHeight(p, world.terrain) + 1.4,
            p[1],
          ];
          points.push(v);
          colors.push([color.r, color.g, color.b]);
          if (lifted) highlight.push([v[0], v[1] + 0.6, v[2]]);
        }
        edgeAt.push(edge.id);
      }
    }
    return { points, colors, edgeAt, highlight };
  }, [world.graph, world.terrain, heat]);
  if (!points.length) return null;
  return (
    <>
      <Line
        points={points}
        vertexColors={colors}
        segments
        lineWidth={world.graph.edges.length > 3000 ? 2.5 : 4}
        onClick={(e) => {
          const edgeId = edgeAt[e.faceIndex ?? -1];
          if (!edgeId) return;
          e.stopPropagation();
          onSelect(edgeId, [e.point.x, e.point.z]);
        }}
      />
      {highlight.length > 0 && (
        <Line points={highlight} segments color={sc("#1f2a1c")} lineWidth={7} />
      )}
    </>
  );
}
const MERGE_THRESHOLD = 500;
/** Streets and footpaths batched into two lines instead of one per road. */
function Roads({ world }: { world: World }) {
  const batches = useMemo(() => {
    const road: [number, number, number][] = [],
      path: [number, number, number][] = [];
    for (const r of world.roads) {
      const target = r.kind === "road" ? road : path;
      for (let i = 1; i < r.points.length; i++)
        for (const p of [r.points[i - 1], r.points[i]])
          target.push([p[0], terrainHeight(p, world.terrain) + 0.6, p[1]]);
    }
    return { road, path };
  }, [world.roads, world.terrain]);
  return (
    <>
      {batches.road.length > 0 && (
        <Line
          points={batches.road}
          segments
          color={sc("#faf7ed")}
          lineWidth={5}
        />
      )}
      {batches.path.length > 0 && (
        <Line
          points={batches.path}
          segments
          color={sc("#dfd4bd")}
          lineWidth={2}
        />
      )}
    </>
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
      <meshStandardMaterial color={sc("#e5e1d5")} roughness={1} />
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
    ctx.fillStyle = label === "Start" ? sc("#3f5938") : sc("#a55c32");
    ctx.strokeStyle = sc("#fffdf4");
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 104, 48);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sc("#ffffff");
    ctx.font = "500 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 57);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
    // The label is drawn in the scene's colours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, sceneTheme()]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[point[0], terrainHeight(point, terrain) + 4, point[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5, 9, 32]} />
        <meshBasicMaterial
          color={label === "Start" ? sc("#3f5938") : sc("#b46539")}
          depthTest={false}
        />
      </mesh>
      {/* A constant size on screen, however close the camera frames. */}
      <sprite
        position={[0, 8, 0]}
        center={[0.5, 0]}
        scale={[0.05, 0.022, 1]}
        renderOrder={10}
      >
        <spriteMaterial
          sizeAttenuation={false}
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
  heat,
  onHeatSelect,
  insets = NO_INSETS,
  theme = "editorial",
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
  heat?: HeatOverlay | null;
  onHeatSelect?: (edgeId: string, point: Point) => void;
  /** Panels over the map; the camera frames the area beside them. */
  insets?: MapInsets;
  /** Interface style; the scene's colours follow it. */
  theme?: ThemeName;
}) {
  // Children read the scene style while rendering (see lib/scene-theme).
  setSceneTheme(theme);
  const sun = sunDirection(environment, world.origin);
  const extent = world.extent;
  // Large mapped areas draw OSM buildings as one mesh; designed objects and
  // the selected building stay individual so they keep their detail.
  const merged = useMemo(
    () =>
      world.objects.length >= MERGE_THRESHOLD
        ? world.objects.filter(
            (o) =>
              o.kind !== "tree" && o.source === "osm" && o.id !== selectedId,
          )
        : null,
    [world.objects, selectedId],
  );
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
      // Draw only when the camera or scene changes, not 60 times a second.
      frameloop="demand"
      raycaster={{ params: { Line: { threshold: 3 } } } as never}
    >
      <FrameArea
        extent={extent}
        insets={insets}
        focus={startPoint && endPoint ? [startPoint, endPoint] : []}
      />
      <color attach="background" args={[sc("#eeece3")]} />
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
          color={l.kind === "water" ? sc("#a5bcba") : sc("#bdc6a0")}
        />
      ))}
      <Roads world={world} />
      {heat ? (
        <HeatPaths
          world={world}
          heat={heat}
          onSelect={(edgeId, point) =>
            pickingEndpoint || !onHeatSelect
              ? onGroundClick(point)
              : onHeatSelect(edgeId, point)
          }
        />
      ) : (
        showWalkingPaths && (
          <WalkingPaths world={world} onClick={onGroundClick} />
        )
      )}
      <group
        onClick={(e) => {
          if (pickingEndpoint) {
            e.stopPropagation();
            onGroundClick([e.point.x, e.point.z]);
          }
        }}
      >
        {showBuildings && merged && (
          <MergedBuildings
            objects={merged}
            terrain={world.terrain}
            onPick={(o) => {
              if (!pickingEndpoint) onSelect(o.id);
            }}
          />
        )}
        {showBuildings &&
          world.objects
            .filter(
              (o) =>
                o.kind !== "tree" &&
                (!merged || o.source !== "osm" || o.id === selectedId),
            )
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
      {route &&
        (heat ? (
          // Over heat colours, draw the route as a dark line with a light
          // casing so it never blends into the orange "hot" paths.
          <>
            <Line
              points={route.points.map((p) => [
                p[0],
                terrainHeight(p, world.terrain) + 3,
                p[1],
              ])}
              color={sc("#fffdf4")}
              lineWidth={10}
            />
            <Line
              points={route.points.map((p) => [
                p[0],
                terrainHeight(p, world.terrain) + 3.2,
                p[1],
              ])}
              color={sc("#1d3557")}
              lineWidth={5}
            />
          </>
        ) : (
          <Line
            points={route.points.map((p) => [
              p[0],
              terrainHeight(p, world.terrain) + 3,
              p[1],
            ])}
            color={sc("#d57b48")}
            lineWidth={5}
          />
        ))}
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
          <meshBasicMaterial color={sc("#3479bf")} depthTest={false} />
        </mesh>
      )}
      <OrbitControls
        makeDefault
        minDistance={70}
        maxDistance={extent * 4}
        maxPolarAngle={Math.PI * 0.48}
      />
    </Canvas>
  );
}
