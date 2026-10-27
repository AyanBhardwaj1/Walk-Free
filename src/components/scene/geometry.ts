import * as THREE from "three";
import type { Point, SceneObject, Terrain } from "../../../shared/types";
import { terrainHeight } from "../../lib/geo";

export function footprint(object: SceneObject): Point[] {
  if (object.footprint && object.footprint.length >= 3) return object.footprint;
  const w = object.width / 2;
  const d = object.depth / 2;
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ];
}

export function buildingGeometry(object: SceneObject): THREE.ExtrudeGeometry {
  const points = footprint(object);
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], -points[0][1]);
  points.slice(1).forEach(([x, z]) => shape.lineTo(x, -z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.5, object.height),
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function landscapeGeometry(
  points: Point[],
  terrain?: Terrain,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  if (points.length < 3) return new THREE.BufferGeometry();
  shape.moveTo(points[0][0], -points[0][1]);
  points.slice(1).forEach(([x, z]) => shape.lineTo(x, -z));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i += 1) {
    vertices.setY(
      i,
      terrainHeight([vertices.getX(i), vertices.getZ(i)], terrain) + 0.15,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Joined ribbon; sampled terrain elevations prevent roads floating above edited ground. */
export function ribbonGeometry(
  points: Point[],
  width: number,
  terrain?: Terrain,
  lift = 0.24,
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    const nx = ((-dz / length) * width) / 2;
    const nz = ((dx / length) * width) / 2;
    for (const sign of [-1, 1]) {
      const x = points[i][0] + nx * sign;
      const z = points[i][1] + nz * sign;
      vertices.push(x, terrainHeight([x, z], terrain) + lift, z);
    }
    if (i > 0) {
      const n = i * 2;
      indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function groundGeometry(
  extent: number,
  terrain?: Terrain,
): THREE.PlaneGeometry {
  const resolution = terrain?.resolution ?? 2;
  const size = terrain?.size ?? extent * 1.5;
  const geometry = new THREE.PlaneGeometry(
    size,
    size,
    resolution - 1,
    resolution - 1,
  );
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i += 1) {
    vertices.setY(
      i,
      terrainHeight([vertices.getX(i), vertices.getZ(i)], terrain),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function facadeGeometry(object: SceneObject): THREE.BufferGeometry {
  const w = object.width / 2 + 0.025;
  const d = object.depth / 2 + 0.025;
  const vertices: number[] = [];
  const floors = Math.min(40, Math.floor(object.height / 4));
  for (let i = 1; i < floors; i += 1) {
    const y = (i * object.height) / floors;
    vertices.push(
      -w,
      y,
      -d,
      w,
      y,
      -d,
      w,
      y,
      -d,
      w,
      y,
      d,
      w,
      y,
      d,
      -w,
      y,
      d,
      -w,
      y,
      d,
      -w,
      y,
      -d,
    );
  }
  if (object.kind === "skyscraper") {
    const columns = Math.min(8, Math.max(2, Math.floor(object.width / 5)));
    for (let i = 1; i < columns; i += 1) {
      const x = -w + (i * object.width) / columns;
      vertices.push(
        x,
        0,
        -d,
        x,
        object.height,
        -d,
        x,
        0,
        d,
        x,
        object.height,
        d,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  return geometry;
}

export function hash(value: string): number {
  let n = 0;
  for (let i = 0; i < value.length; i += 1)
    n = ((n << 5) - n + value.charCodeAt(i)) | 0;
  return Math.abs(n);
}
