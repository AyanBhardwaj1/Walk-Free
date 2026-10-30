import { localPoint } from "./osm.js";
import type { Point, SceneObject } from "./types.js";

/**
 * Tree canopy from Meta and WRI's global canopy height map (CHM v2, 1 m),
 * used to fill in shade where OpenStreetMap has few mapped trees.
 */
export const CANOPY_ATTRIBUTION =
  "Tree canopy: Meta & World Resources Institute, High Resolution Canopy Height Maps v2 (CC BY 4.0)";

/** Heights in metres on a Web Mercator (EPSG:3857) grid. */
export interface CanopyRaster {
  width: number;
  height: number;
  /** Canopy height per pixel, metres; 0 is open ground or no data. */
  data: Uint8Array;
  /** Web Mercator x of the left edge and y of the top edge. */
  west: number;
  north: number;
  /** Web Mercator metres per pixel. */
  resolution: number;
}

const R = 6378137;
export const toMercator = (lat: number, lon: number): Point => [
  (lon * Math.PI * R) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
export const fromMercator = (x: number, y: number) => ({
  lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  lon: (x / R) * (180 / Math.PI),
});

/** Web Mercator box around a point, sized in ground metres. */
export function mercatorBox(lat: number, lon: number, radius: number) {
  const [x, y] = toMercator(lat, lon);
  // Mercator stretches distances by 1/cos(lat).
  const half = radius / Math.cos((lat * Math.PI) / 180);
  return { west: x - half, east: x + half, south: y - half, north: y + half };
}

/** Bing-style quadkeys of the zoom-z tiles covering a Mercator box. */
export function quadkeysFor(
  box: { west: number; east: number; south: number; north: number },
  zoom: number,
) {
  const size = (2 * Math.PI * R) / 2 ** zoom;
  const col = (x: number) => Math.floor((x + Math.PI * R) / size);
  const row = (y: number) => Math.floor((Math.PI * R - y) / size);
  const keys: { key: string; west: number; north: number; size: number }[] = [];
  for (let tx = col(box.west); tx <= col(box.east); tx++)
    for (let ty = row(box.north); ty <= row(box.south); ty++) {
      let key = "";
      for (let z = zoom; z > 0; z--) {
        const bit = 1 << (z - 1);
        key += String((tx & bit ? 1 : 0) + (ty & bit ? 2 : 0));
      }
      keys.push({
        key,
        west: tx * size - Math.PI * R,
        north: Math.PI * R - ty * size,
        size,
      });
    }
  return keys;
}

/** Canopy at least this tall counts as shade-casting tree cover. */
const MIN_TREE_HEIGHT = 3;
/** Ground size of one inferred tree crown cell. */
const CELL = 9;
/** Share of a cell that must be canopy before it becomes a tree. */
const MIN_COVER = 0.45;

/** One inferred crown: local x, y (metres), crown width and height. */
export type CanopyCell = [x: number, y: number, crown: number, height: number];

/**
 * Turns canopy pixels into crown cells on the world's local grid, densest
 * first. Cells depend only on the area, so they can be computed once on the
 * server and cached.
 */
export function canopyCells(
  origin: { lat: number; lon: number },
  extent: number,
  raster: CanopyRaster,
  maxCells = 20000,
): CanopyCell[] {
  const half = extent / 2;
  const cols = Math.ceil(extent / CELL);
  const count = new Uint16Array(cols * cols);
  const canopy = new Uint16Array(cols * cols);
  const heights = new Float32Array(cols * cols);
  const lons = Array.from(
    { length: raster.width },
    (_, px) =>
      fromMercator(raster.west + (px + 0.5) * raster.resolution, 0).lon,
  );
  for (let py = 0; py < raster.height; py++) {
    const { lat } = fromMercator(
      0,
      raster.north - (py + 0.5) * raster.resolution,
    );
    for (let px = 0; px < raster.width; px++) {
      const [x, y] = localPoint(lat, lons[px], origin);
      if (Math.abs(x) >= half || Math.abs(y) >= half) continue;
      const cell =
        Math.floor((y + half) / CELL) * cols + Math.floor((x + half) / CELL);
      count[cell]++;
      const h = raster.data[py * raster.width + px];
      if (h >= MIN_TREE_HEIGHT) {
        canopy[cell]++;
        heights[cell] += h;
      }
    }
  }
  const found: { cell: number; cover: number }[] = [];
  for (let cell = 0; cell < count.length; cell++) {
    if (!count[cell]) continue;
    const cover = canopy[cell] / count[cell];
    if (cover >= MIN_COVER) found.push({ cell, cover });
  }
  // Over the cap, keep the densest canopy; ties (common: full cover) break
  // on a fixed hash so the kept cells spread over the whole area instead of
  // filling its northern rows first.
  const spread = (cell: number) =>
    Math.imul(cell ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  found.sort((a, b) => b.cover - a.cover || spread(a.cell) - spread(b.cell));
  const round = (n: number) => Math.round(n * 10) / 10;
  return found
    .slice(0, maxCells)
    .map(({ cell, cover }) => [
      round((cell % cols) * CELL - half + CELL / 2),
      round(Math.floor(cell / cols) * CELL - half + CELL / 2),
      round(Math.min(CELL + 1, CELL * Math.sqrt(cover))),
      Math.max(
        MIN_TREE_HEIGHT,
        Math.round(Math.min(45, heights[cell] / canopy[cell])),
      ),
    ]);
}

/**
 * Crown cells as tree objects, skipping cells that already hold a mapped
 * tree or sit on a building roof. Inferred trees keep source "canopy" so
 * they can be told apart from surveyed ones.
 */
export function canopyTrees(
  objects: SceneObject[],
  cells: CanopyCell[],
): SceneObject[] {
  const BUCKET = 30;
  const key = (x: number, y: number) =>
    `${Math.floor(x / BUCKET)},${Math.floor(y / BUCKET)}`;
  const trees = new Map<string, Point[]>();
  const buildings = new Map<string, Point[][]>();
  for (const o of objects) {
    if (o.kind === "tree") {
      const k = key(o.position[0], o.position[1]);
      trees.set(k, [...(trees.get(k) ?? []), o.position]);
    } else if (o.footprint) {
      const ring = o.footprint.map((p): Point => [
        p[0] + o.position[0],
        p[1] + o.position[1],
      ]);
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      for (
        let bx = Math.floor(Math.min(...xs) / BUCKET);
        bx <= Math.floor(Math.max(...xs) / BUCKET);
        bx++
      )
        for (
          let by = Math.floor(Math.min(...ys) / BUCKET);
          by <= Math.floor(Math.max(...ys) / BUCKET);
          by++
        ) {
          const k = `${bx},${by}`;
          buildings.set(k, [...(buildings.get(k) ?? []), ring]);
        }
    }
  }
  const nearMappedTree = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const [tx, ty] of trees.get(
          key(x + dx * BUCKET, y + dy * BUCKET),
        ) ?? [])
          if ((tx - x) ** 2 + (ty - y) ** 2 < 36) return true;
    return false;
  };
  const onRoof = (x: number, y: number) =>
    (buildings.get(key(x, y)) ?? []).some((ring) => inside(ring, x, y));
  return cells
    .filter(([x, y]) => !nearMappedTree(x, y) && !onRoof(x, y))
    .map(([x, y, crown, height]) => ({
      id: `canopy-${Math.round(x)}_${Math.round(y)}`,
      kind: "tree",
      name: "Tree canopy",
      position: [x, y],
      width: crown,
      depth: crown,
      height,
      rotation: 0,
      source: "canopy",
      heightMethod: "estimated",
    }));
}

function inside(polygon: number[][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}

/** True once canopy has been added to (or tried for) a world. */
export const hasCanopy = (world: { provenance: { notes: string[] } }) =>
  world.provenance.notes.some((n) => n.startsWith("Tree canopy:"));

/** Adds inferred canopy trees to a world and records where they came from. */
export function withCanopy<
  W extends {
    objects: SceneObject[];
    provenance: { notes: string[]; attribution: string };
  },
>(world: W, cells: CanopyCell[] | null): W {
  const objects = world.objects.filter((o) => o.source !== "canopy");
  const notes = world.provenance.notes.filter(
    (n) => !n.startsWith("Tree canopy"),
  );
  if (!cells)
    return {
      ...world,
      provenance: {
        ...world.provenance,
        notes: [
          ...notes,
          "Tree canopy unavailable: only mapped trees are shown because the canopy height map couldn't be reached.",
        ],
      },
    };
  const mapped = objects.filter((o) => o.kind === "tree").length;
  const added = canopyTrees(objects, cells);
  return {
    ...world,
    objects: [...objects, ...added],
    provenance: {
      ...world.provenance,
      attribution: world.provenance.attribution.includes("Canopy Height")
        ? world.provenance.attribution
        : `${world.provenance.attribution} · ${CANOPY_ATTRIBUTION}`,
      notes: [
        ...notes,
        `Tree canopy: ${added.length} tree crowns inferred from Meta's 1 m canopy height map where OpenStreetMap maps none (${mapped} mapped trees kept as surveyed).`,
      ],
    },
  };
}
