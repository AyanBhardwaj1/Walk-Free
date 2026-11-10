import type { Gray } from "../../src/lib/indoor/plan-image";

/**
 * A drawn floor plan: a 240×140 building with a corridor across the middle,
 * three rooms above and three below, each with a doorway onto the corridor.
 */
export function drawnPlan({ entrances = false } = {}): Gray {
  const w = 300,
    h = 200;
  const data = new Uint8Array(w * h).fill(255);
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) data[y * w + x] = 20;
  };
  const gap = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) data[y * w + x] = 255;
  };
  // Outer walls (building from x 30..270, y 30..170), 3 px thick.
  wall(30, 30, 270, 32);
  wall(30, 168, 270, 170);
  wall(30, 30, 32, 170);
  wall(268, 30, 270, 170);
  // Corridor walls at y 85 and y 115 (corridor 30 px wide).
  wall(30, 85, 270, 87);
  wall(30, 113, 270, 115);
  // Room dividers above and below.
  for (const x of [110, 190]) {
    wall(x, 30, x + 2, 87);
    wall(x, 113, x + 2, 170);
  }
  // A 6 px doorway from each room onto the corridor.
  for (const cx of [70, 150, 230]) {
    gap(cx - 3, 85, cx + 3, 87);
    gap(cx - 3, 113, cx + 3, 115);
  }
  // Doorways in the outer wall at both ends of the corridor.
  if (entrances) {
    gap(30, 92, 32, 108);
    gap(268, 92, 270, 108);
  }
  return { width: w, height: h, data };
}

/**
 * A harder plan (900 × 700): an L-shaped building with an L-shaped
 * corridor, eleven rooms of different sizes (one L-shaped), desks drawn
 * inside rooms, a dimension line outside, and a double-door entrance at
 * the foot of the corridor.
 */
export function drawnLPlan(): Gray {
  const w = 900,
    h = 700;
  const data = new Uint8Array(w * h).fill(255);
  const fill = (x0: number, y0: number, ww: number, hh: number, v: number) => {
    for (let y = y0; y < y0 + hh; y++)
      for (let x = x0; x < x0 + ww; x++) data[y * w + x] = v;
  };
  const W = (x: number, y: number, ww: number, hh: number) =>
    fill(x, y, ww, hh, 34);
  const gap = (x: number, y: number, ww: number, hh: number) =>
    fill(x, y, ww, hh, 255);
  W(60, 60, 780, 8);
  W(60, 60, 8, 580);
  W(832, 60, 8, 240);
  W(360, 292, 480, 8);
  W(352, 292, 8, 348);
  W(60, 632, 300, 8);
  W(60, 160, 780, 6);
  W(60, 204, 120, 6);
  W(230, 204, 610, 6);
  W(174, 204, 6, 436);
  W(230, 204, 6, 436);
  for (const x of [220, 420, 560]) W(x, 60, 6, 106);
  for (const x of [480, 660]) W(x, 204, 6, 96);
  W(60, 400, 120, 6);
  W(236, 420, 120, 6);
  W(236, 520, 120, 6);
  for (const cx of [140, 320, 490, 700]) gap(cx - 15, 160, 30, 6);
  for (const cx of [380, 570, 760]) gap(cx - 15, 204, 30, 6);
  gap(174, 300, 6, 30);
  gap(174, 520, 6, 30);
  gap(230, 350, 6, 30);
  gap(230, 460, 6, 30);
  gap(230, 580, 6, 30);
  gap(180, 632, 50, 8);
  for (const [x, y] of [
    [100, 90],
    [300, 100],
    [470, 95],
    [620, 90],
    [760, 100],
    [540, 240],
    [720, 240],
    [100, 300],
    [100, 480],
    [280, 360],
    [280, 470],
    [280, 580],
  ])
    W(x, y, 28, 16);
  W(60, 670, 780, 1);
  return { width: w, height: h, data };
}
