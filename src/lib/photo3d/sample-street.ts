import {
  EYE_M,
  focalFromFov,
  project,
  type TourSetup,
  type Vec3,
} from "./tour";

/**
 * A sample street "photo", drawn in true perspective from a known 3D street
 * (so the reconstruction can be checked against it): a road between
 * sidewalks, building fronts with rows of windows on both sides, and sky.
 */
export interface Shape {
  points: [number, number][];
  color: string;
}

export const SAMPLE_STREET = {
  /** Building fronts stand this far either side of the camera, metres. */
  left: -9,
  right: 11,
  /** Building heights, metres. */
  leftTall: 15,
  rightTall: 21,
  /** The street ends at a building this far ahead, metres. */
  depth: 90,
};

export function sampleStreet(width = 960, height = 640) {
  const s: TourSetup = {
    width,
    height,
    vx: width / 2,
    vy: height * 0.44,
    back: { left: 0, top: 0, right: 0, bottom: 0 },
    focal: focalFromFov(width),
    eye: EYE_M,
  };
  const t = SAMPLE_STREET;
  const shapes: Shape[] = [];
  const quad = (pts: Vec3[], color: string) => {
    const p = pts.map((q) => project(s, q));
    if (p.every(Boolean))
      shapes.push({ points: p as [number, number][], color });
  };
  const near = -0.5,
    far = -t.depth;
  // Sky, then ground.
  shapes.push({
    points: [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ],
    color: "#a9cbe8",
  });
  quad(
    [
      [t.left, 0, near],
      [t.right, 0, near],
      [t.right, 0, far],
      [t.left, 0, far],
    ],
    "#8d8a84",
  );
  // Sidewalks and the road's centre line.
  quad(
    [
      [t.left, 0.02, near],
      [t.left + 3, 0.02, near],
      [t.left + 3, 0.02, far],
      [t.left, 0.02, far],
    ],
    "#c9c3b5",
  );
  quad(
    [
      [t.right - 3, 0.02, near],
      [t.right, 0.02, near],
      [t.right, 0.02, far],
      [t.right - 3, 0.02, far],
    ],
    "#c9c3b5",
  );
  for (let z = -2; z > far; z -= 6)
    quad(
      [
        [0.9, 0.03, z],
        [1.1, 0.03, z],
        [1.1, 0.03, z - 3],
        [0.9, 0.03, z - 3],
      ],
      "#f1e7c8",
    );
  // The building that closes the street.
  quad(
    [
      [t.left, 0, far],
      [t.right, 0, far],
      [t.right, 12, far],
      [t.left, 12, far],
    ],
    "#b8a48a",
  );
  // Fronts, one building every 15 m, with windows.
  const side = (x: number, tall: number, colors: string[]) => {
    for (let z = near, k = 0; z > far; z -= 15, k++) {
      const z2 = Math.max(far, z - 15);
      const h = tall - (k % 3) * 2;
      quad(
        [
          [x, 0, z],
          [x, 0, z2],
          [x, h, z2],
          [x, h, z],
        ],
        colors[k % colors.length],
      );
      for (let y = 3; y + 2 < h; y += 3.5)
        for (let wz = z - 1.5; wz - 1.6 > z2; wz -= 3)
          quad(
            [
              [x, y, wz],
              [x, y, wz - 1.6],
              [x, y + 1.8, wz - 1.6],
              [x, y + 1.8, wz],
            ],
            "#3d4651",
          );
    }
  };
  side(t.left, t.leftTall, ["#c99e7d", "#d8c8ad", "#b9876a"]);
  side(t.right, t.rightTall, ["#d6d0c4", "#a8a49b", "#cdb69a"]);
  // Where the true far wall appears, for checking a reconstruction.
  const corner = (p: Vec3) => project(s, p)!;
  const back = {
    left: corner([t.left, 0, far])[0],
    right: corner([t.right, 0, far])[0],
    top: corner([t.left, 12, far])[1],
    bottom: corner([t.left, 0, far])[1],
  };
  return { shapes, setup: { ...s, back } };
}

/** Draws the sample street onto a canvas context. */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  for (const sh of shapes) {
    ctx.fillStyle = sh.color;
    ctx.beginPath();
    sh.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
}
