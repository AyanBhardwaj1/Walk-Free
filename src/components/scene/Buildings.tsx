import { memo, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import type { SceneObject, Terrain } from "../../../shared/types";
import { terrainHeight } from "../../lib/geo";
import { sc } from "../../lib/scene-theme";
import { buildingGeometry, facadeGeometry, hash } from "./geometry";

interface Props {
  object: SceneObject;
  terrain?: Terrain;
  selected: boolean;
  detailed: boolean;
  onPointerDown?: (
    event: ThreeEvent<PointerEvent>,
    object: SceneObject,
  ) => void;
}

const wallColors = [
  "#d8d0bd",
  "#cfc9b8",
  "#d9d4c8",
  "#c8c4b7",
  "#e1d9ca",
  "#c9c4af",
];

function Tower({ object }: { object: SceneObject }) {
  const { width: w, depth: d, height: h } = object;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, h * 0.08, 0]}>
        <boxGeometry args={[w, h * 0.16, d]} />
        <meshStandardMaterial
          color={object.color || sc("#d6cdb8")}
          roughness={0.85}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, h * 0.47, 0]}>
        <boxGeometry args={[w * 0.43, h * 0.65, d * 0.43]} />
        <meshStandardMaterial
          color={object.color || sc("#e2d8c2")}
          roughness={0.85}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, h * 0.8, 0]}>
        <boxGeometry args={[w * 0.76, h * 0.12, d * 0.76]} />
        <meshStandardMaterial color={sc("#b6b5a4")} roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, h * 0.9, 0]}>
        <cylinderGeometry args={[w * 0.03, w * 0.16, h * 0.2, 4]} />
        <meshStandardMaterial color={sc("#66796e")} roughness={0.65} />
      </mesh>
      {[1, -1].map((sign) => (
        <mesh key={sign} position={[0, h * 0.8, sign * (d * 0.38 + 0.04)]}>
          <circleGeometry args={[Math.min(w * 0.11, h * 0.04), 24]} />
          <meshStandardMaterial color={sc("#f7f4e9")} side={2} />
        </mesh>
      ))}
    </group>
  );
}

function Landmark({ object }: { object: SceneObject }) {
  const { width: w, depth: d, height: h } = object;
  const radius = Math.min(w, d) * 0.32;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, h * 0.3, 0]}>
        <boxGeometry args={[w, h * 0.6, d]} />
        <meshStandardMaterial
          color={object.color || sc("#ded5c0")}
          roughness={0.9}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, h * 0.62, 0]}>
        <boxGeometry args={[w * 1.06, h * 0.045, d * 1.06]} />
        <meshStandardMaterial color={sc("#eee7d6")} roughness={0.85} />
      </mesh>
      <mesh
        castShadow
        position={[0, h * 0.64, 0]}
        scale={[1, Math.max(0.3, (h * 0.35) / radius), 1]}
      >
        <sphereGeometry
          args={[radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
        />
        <meshStandardMaterial color={sc("#899a87")} roughness={0.65} />
      </mesh>
      {[-0.36, -0.18, 0, 0.18, 0.36].map((x) => (
        <mesh key={x} castShadow position={[w * x, h * 0.3, d * 0.53]}>
          <cylinderGeometry args={[w * 0.025, w * 0.03, h * 0.54, 10]} />
          <meshStandardMaterial color={sc("#f1ecdf")} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Building({
  object,
  terrain,
  selected,
  detailed,
  onPointerDown,
}: Props) {
  // Objects are replaced, never mutated, so identity tracks every change.
  const geometry = useMemo(() => buildingGeometry(object), [object]);
  const lines = useMemo(() => facadeGeometry(object), [object]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  useEffect(
    () => () => {
      lines.dispose();
    },
    [lines],
  );
  const designed = object.source !== "osm";
  const customAsset =
    designed && (object.kind === "tower" || object.kind === "landmark");
  const wallColor = selected
    ? sc("#b4c2a9")
    : object.color ||
      (object.kind === "skyscraper"
        ? sc("#abbcb4")
        : sc(wallColors[hash(object.id) % wallColors.length]));
  const roofColor = selected
    ? sc("#ced9c0")
    : object.kind === "skyscraper"
      ? sc("#e0e5da")
      : sc("#e9e3d5");
  const rectangle = !object.footprint;
  const h = object.height;
  return (
    <group
      position={[
        object.position[0],
        terrainHeight(object.position, terrain) + 0.1,
        object.position[1],
      ]}
      rotation={[0, (-object.rotation * Math.PI) / 180, 0]}
      onPointerDown={
        onPointerDown ? (event) => onPointerDown(event, object) : undefined
      }
    >
      {customAsset ? (
        object.kind === "tower" ? (
          <Tower object={object} />
        ) : (
          <Landmark object={object} />
        )
      ) : (
        <>
          <mesh geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial
              attach="material-0"
              color={roofColor}
              roughness={0.9}
            />
            <meshStandardMaterial
              attach="material-1"
              color={wallColor}
              roughness={object.kind === "skyscraper" ? 0.5 : 0.92}
              metalness={object.kind === "skyscraper" ? 0.1 : 0}
            />
            {detailed && (
              <Edges
                threshold={25}
                color={selected ? sc("#526b4c") : sc("#a59d89")}
                transparent
                opacity={0.22}
              />
            )}
          </mesh>
          {detailed && rectangle && h > 9 && (
            <lineSegments geometry={lines}>
              <lineBasicMaterial
                color={
                  object.kind === "skyscraper" ? sc("#edf0e5") : sc("#a69e88")
                }
                transparent
                opacity={object.kind === "skyscraper" ? 0.65 : 0.18}
              />
            </lineSegments>
          )}
          {detailed && rectangle && h > 12 && (
            <>
              <mesh
                castShadow
                position={[
                  object.width * 0.12,
                  h + Math.min(3, h * 0.07),
                  -object.depth * 0.1,
                ]}
              >
                <boxGeometry
                  args={[
                    object.width * 0.28,
                    Math.min(6, h * 0.14),
                    object.depth * 0.3,
                  ]}
                />
                <meshStandardMaterial color={sc("#c1c0b2")} roughness={0.85} />
              </mesh>
              {object.kind !== "skyscraper" && (
                <mesh
                  position={[
                    -object.width * 0.2,
                    h + 0.35,
                    object.depth * 0.15,
                  ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <planeGeometry
                    args={[object.width * 0.24, object.depth * 0.36]}
                  />
                  <meshStandardMaterial color={sc("#73867f")} roughness={0.6} />
                </mesh>
              )}
            </>
          )}
        </>
      )}
      {selected && (
        <mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[
              Math.max(object.width, object.depth) * 0.65,
              Math.max(object.width, object.depth) * 0.65 + 1.6,
              64,
            ]}
          />
          <meshBasicMaterial
            color={sc("#385948")}
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

export default memo(Building);
