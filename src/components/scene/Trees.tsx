import { useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneObject, Terrain } from "../../../shared/types";
import { terrainHeight } from "../../lib/geo";
import { hash } from "./geometry";

interface Props {
  objects: SceneObject[];
  terrain?: Terrain;
  selectedId: string | null;
  onPointerDown?: (
    event: ThreeEvent<PointerEvent>,
    object: SceneObject,
  ) => void;
}

const greens = [
  "#708363",
  "#82916e",
  "#687d5d",
  "#8a9875",
  "#60785c",
  "#768c67",
];

/**
 * Mapped trees get a detailed crown; canopy inferred from Meta's height map
 * (often ten thousand or more per campus) gets one low-poly crown each, so
 * the scene stays smooth on phones.
 */
export default function Trees(props: Props) {
  const mapped = useMemo(
    () => props.objects.filter((o) => o.source !== "canopy"),
    [props.objects],
  );
  const canopy = useMemo(
    () => props.objects.filter((o) => o.source === "canopy"),
    [props.objects],
  );
  return (
    <>
      <DetailedTrees {...props} objects={mapped} />
      <CanopyCrowns {...props} objects={canopy} />
    </>
  );
}

function CanopyCrowns({ objects, terrain, selectedId, onPointerDown }: Props) {
  const crowns = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const mesh = crowns.current;
    if (!mesh) return;
    objects.forEach((tree, i) => {
      const floor = terrainHeight(tree.position, terrain);
      dummy.position.set(
        tree.position[0],
        floor + tree.height * 0.62,
        tree.position[1],
      );
      dummy.rotation.set(0, hash(tree.id) * 0.37, 0);
      dummy.scale.set(tree.width * 0.6, tree.height * 0.4, tree.depth * 0.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(
        i,
        color.set(
          tree.id === selectedId
            ? "#b1c28b"
            : greens[hash(tree.id) % greens.length],
        ),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [objects, terrain, selectedId, color, dummy]);
  if (!objects.length) return null;
  return (
    <instancedMesh
      key={`canopy-${objects.length}`}
      ref={crowns}
      args={[undefined, undefined, objects.length]}
      castShadow
      receiveShadow
      onPointerDown={
        onPointerDown
          ? (event) => {
              if (event.instanceId !== undefined)
                onPointerDown(event, objects[event.instanceId]);
            }
          : undefined
      }
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.98} flatShading />
    </instancedMesh>
  );
}

function DetailedTrees({ objects, terrain, selectedId, onPointerDown }: Props) {
  const crowns = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    if (!crowns.current || !trunks.current) return;
    objects.forEach((tree, i) => {
      const floor = terrainHeight(tree.position, terrain);
      const trunkHeight = tree.height * 0.5;
      dummy.position.set(
        tree.position[0],
        floor + trunkHeight / 2,
        tree.position[1],
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(
        Math.max(0.16, tree.width * 0.045),
        trunkHeight,
        Math.max(0.16, tree.depth * 0.045),
      );
      dummy.updateMatrix();
      trunks.current!.setMatrixAt(i, dummy.matrix);
      for (let j = 0; j < 3; j += 1) {
        const angle = hash(tree.id) * 0.17 + (j * Math.PI * 2) / 3;
        const spread = j === 0 ? 0 : 0.15;
        dummy.position.set(
          tree.position[0] + Math.cos(angle) * tree.width * spread,
          floor + tree.height * (j === 0 ? 0.73 : 0.61),
          tree.position[1] + Math.sin(angle) * tree.depth * spread,
        );
        dummy.rotation.set(0.2 * j, angle, 0.1 * j);
        dummy.scale.set(
          tree.width * (j === 0 ? 0.46 : 0.36),
          tree.height * (j === 0 ? 0.3 : 0.26),
          tree.depth * (j === 0 ? 0.46 : 0.36),
        );
        dummy.updateMatrix();
        crowns.current!.setMatrixAt(i * 3 + j, dummy.matrix);
        crowns.current!.setColorAt(
          i * 3 + j,
          color.set(
            tree.id === selectedId
              ? "#b1c28b"
              : tree.color || greens[(hash(tree.id) + j) % greens.length],
          ),
        );
      }
    });
    crowns.current.instanceMatrix.needsUpdate = true;
    if (crowns.current.instanceColor)
      crowns.current.instanceColor.needsUpdate = true;
    trunks.current.instanceMatrix.needsUpdate = true;
    crowns.current.computeBoundingSphere();
    trunks.current.computeBoundingSphere();
  }, [objects, terrain, selectedId, color, dummy]);
  if (!objects.length) return null;
  const selected = objects.find((tree) => tree.id === selectedId);
  return (
    <group>
      <instancedMesh
        key={`crowns-${objects.length}`}
        ref={crowns}
        args={[undefined, undefined, objects.length * 3]}
        castShadow
        receiveShadow
        onPointerDown={
          onPointerDown
            ? (event) => {
                if (event.instanceId !== undefined)
                  onPointerDown(
                    event,
                    objects[Math.floor(event.instanceId / 3)],
                  );
              }
            : undefined
        }
      >
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial roughness={0.98} />
      </instancedMesh>
      <instancedMesh
        key={`trunks-${objects.length}`}
        ref={trunks}
        args={[undefined, undefined, objects.length]}
        castShadow
        receiveShadow
        onPointerDown={
          onPointerDown
            ? (event) => {
                if (event.instanceId !== undefined)
                  onPointerDown(event, objects[event.instanceId]);
              }
            : undefined
        }
      >
        <cylinderGeometry args={[0.75, 1, 1, 6]} />
        <meshStandardMaterial color="#91836a" roughness={0.96} />
      </instancedMesh>
      {selected && (
        <mesh
          position={[
            selected.position[0],
            terrainHeight(selected.position, terrain) + 0.5,
            selected.position[1],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry
            args={[selected.width * 0.6, selected.width * 0.6 + 1.1, 48]}
          />
          <meshBasicMaterial
            color="#385948"
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
