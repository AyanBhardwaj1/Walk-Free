import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { GraphEdge, Point, Terrain, World } from "../../../shared/types";
import { terrainHeight } from "../../lib/geo";

/** Walking speed, sped up so a stroll is visible from above. */
const SPEED = 1.4 * 14;
const PALETTE = [
  "#b85b3b",
  "#3f5938",
  "#2f6577",
  "#d9b142",
  "#7a4f9a",
  "#f4f1e6",
];

interface Leg {
  edge: GraphEdge;
  lengths: number[];
  total: number;
}
interface Walker {
  leg: Leg;
  /** Walking from the edge's first point (1) or its last (-1). */
  dir: 1 | -1;
  /** Metres along the edge. */
  at: number;
  speed: number;
}

function legOf(edge: GraphEdge): Leg {
  const lengths = [0];
  for (let i = 1; i < edge.points.length; i++) {
    const [a, b] = [edge.points[i - 1], edge.points[i]];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { edge, lengths, total: lengths.at(-1) || 1 };
}
function pointAt(leg: Leg, at: number): Point {
  const { lengths, edge } = leg;
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < at) i++;
  const span = lengths[i] - lengths[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (at - lengths[i - 1]) / span));
  const [a, b] = [edge.points[i - 1], edge.points[i]];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * People walking the streets: they wander the walking network, thin out at
 * night and, when it's hot, prefer the shaded side of town.
 */
export default function Crowd({
  world,
  count,
  terrain,
  night,
  shade,
  hot,
}: {
  world: World;
  count: number;
  terrain?: Terrain;
  /** 0 by day to 1 at night: fewer people out. */
  night: number;
  /** Shade share by edge id, from the heat map. */
  shade?: Map<string, number>;
  /** Whether heat sends people looking for shade. */
  hot: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const graph = useMemo(() => {
    const legs = new Map<string, Leg>();
    const from = new Map<string, Leg[]>();
    for (const e of world.graph.edges) {
      if (e.indoor === "hypothetical" || e.points.length < 2) continue;
      const leg = legOf(e);
      legs.set(e.id, leg);
      for (const n of [e.from, e.to]) {
        if (!from.has(n)) from.set(n, []);
        from.get(n)!.push(leg);
      }
    }
    return { legs: [...legs.values()], from };
  }, [world.graph]);
  const walkers = useMemo<Walker[]>(() => {
    const out: Walker[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count && graph.legs.length; i++) {
      const leg = graph.legs[Math.floor(rnd() * graph.legs.length)];
      out.push({
        leg,
        dir: rnd() < 0.5 ? 1 : -1,
        at: rnd() * leg.total,
        speed: SPEED * (0.75 + rnd() * 0.5),
      });
    }
    return out;
  }, [graph, count]);
  // Colour each person once.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    walkers.forEach((_, i) =>
      m.setColorAt(i, c.set(PALETTE[i % PALETTE.length])),
    );
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [walkers]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const active = Math.round(walkers.length * (1 - 0.7 * night));
  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m || !walkers.length) return;
    const dt = Math.min(0.1, delta);
    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      if (i >= active) {
        tmp.position.set(0, -1000, 0);
        tmp.scale.setScalar(0);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
        continue;
      }
      w.at += w.speed * dt;
      if (w.at >= w.leg.total) {
        // At a corner: pick the next street, shade-seeking when it's hot.
        const node = w.dir === 1 ? w.leg.edge.to : w.leg.edge.from;
        const options = (graph.from.get(node) ?? []).filter((l) => l !== w.leg);
        const pool = options.length ? options : [w.leg];
        let pick = pool[0];
        let best = -Infinity;
        for (const l of pool) {
          const s = shade?.get(l.edge.id) ?? 0.5;
          const score = Math.random() + (hot ? s * 1.6 : 0);
          if (score > best) {
            best = score;
            pick = l;
          }
        }
        w.dir = pick.edge.from === node ? 1 : -1;
        w.leg = pick;
        w.at = 0;
      }
      const along = w.dir === 1 ? w.at : w.leg.total - w.at;
      const p = pointAt(w.leg, along);
      tmp.position.set(p[0], terrainHeight(p, terrain) + 5.4, p[1]);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    // The canvas draws on demand; keep the crowd moving.
    invalidate();
  });
  if (!walkers.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, walkers.length]}
      castShadow
      // Bounds are computed once, before anyone moves: never cull the crowd.
      frustumCulled={false}
      raycast={() => null}
    >
      <capsuleGeometry args={[2.6, 5.5, 3, 8]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
}
