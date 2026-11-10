/**
 * Finds where a street photo's lines converge (its central vanishing
 * point), the classic computer-vision way and entirely on the device:
 * Sobel edges, a gradient-guided Hough transform for straight lines, then
 * RANSAC over the lines' crossings, refined by least squares.
 */

export interface GrayImage {
  width: number;
  height: number;
  /** One byte per pixel, row by row. */
  data: Uint8Array | Uint8ClampedArray;
}

/** A straight line as x·cos θ + y·sin θ = ρ, with how much edge backs it. */
export interface Line {
  theta: number;
  rho: number;
  votes: number;
}

/** One side of a line out from the vanishing point, and its edge support. */
export interface Ray {
  /** Unit direction in the image, pointing away from the vanishing point. */
  dx: number;
  dy: number;
  /** Edge pixels along it. */
  support: number;
}

export interface Vanishing {
  /** The vanishing point, image pixels (may lie a little outside it). */
  x: number;
  y: number;
  /** Share of the converging lines' support that agrees, 0 to 1. */
  confidence: number;
  /** Lines that pass through it (for drawing). */
  lines: Line[];
  /** Strong upright lines (building edges, poles). */
  verticals: Line[];
  /** The converging lines, split at the vanishing point into the halves
   * the photo actually shows (a kerb runs one way, a roofline the other). */
  rays: Ray[];
}

const THETA_BINS = 180;

/** A 3 × 3 box blur, twice (close to a Gaussian). */
function smooth(img: GrayImage) {
  const { width: w, height: h } = img;
  let src = Float32Array.from(img.data);
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0,
          n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            sum += src[yy * w + xx];
            n++;
          }
        out[y * w + x] = sum / n;
      }
    src = out;
  }
  return src;
}

/**
 * Sobel gradients of the smoothed image: magnitude and direction per
 * pixel. Smoothing first keeps shallow lines' staircased pixels pointing
 * the way the line does.
 */
export function sobel(img: GrayImage) {
  const { width: w, height: h } = img;
  const data = smooth(img);
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        data[i - w + 1] +
        2 * data[i + 1] +
        data[i + w + 1] -
        data[i - w - 1] -
        2 * data[i - 1] -
        data[i + w - 1];
      const gy =
        data[i + w - 1] +
        2 * data[i + w] +
        data[i + w + 1] -
        data[i - w - 1] -
        2 * data[i - w] -
        data[i - w + 1];
      mag[i] = Math.hypot(gx, gy);
      dir[i] = Math.atan2(gy, gx);
    }
  return { mag, dir };
}

/**
 * Straight lines in the image, strongest first. Each edge pixel votes only
 * near the line its gradient points across, which keeps the Hough space
 * clean and fast.
 */
export function houghLines(
  img: GrayImage,
  maxLines = 48,
  /** Keep only lines whose normal angle (radians) passes this test. */
  accept: (theta: number) => boolean = () => true,
): Line[] {
  const { width: w, height: h } = img;
  const { mag, dir } = sobel(img);
  // Edges: the strongest tenth of gradients, and not faint texture.
  const sorted = Float32Array.from(mag).sort();
  const cut = Math.max(60, sorted[Math.floor(sorted.length * 0.9)]);
  const diag = Math.ceil(Math.hypot(w, h));
  const rhoBins = 2 * diag + 1;
  const acc = new Float32Array(THETA_BINS * rhoBins);
  const cos = new Float32Array(THETA_BINS),
    sin = new Float32Array(THETA_BINS);
  for (let t = 0; t < THETA_BINS; t++) {
    cos[t] = Math.cos((t * Math.PI) / THETA_BINS);
    sin[t] = Math.sin((t * Math.PI) / THETA_BINS);
  }
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mag[i] < cut) continue;
      // The gradient is the line's normal; fold it into [0, π).
      let a = dir[i];
      if (a < 0) a += Math.PI;
      const t0 = Math.round((a / Math.PI) * THETA_BINS);
      for (let dt = -3; dt <= 3; dt++) {
        const t = (((t0 + dt) % THETA_BINS) + THETA_BINS) % THETA_BINS;
        const rho = Math.round(x * cos[t] + y * sin[t]) + diag;
        acc[t * rhoBins + rho] += 1;
      }
    }
  // Peaks, with neighbours suppressed so one edge gives one line.
  const lines: Line[] = [];
  const minVotes = Math.max(12, Math.min(w, h) * 0.08);
  const order: number[] = [];
  for (let i = 0; i < acc.length; i++) if (acc[i] >= minVotes) order.push(i);
  order.sort((a, b) => acc[b] - acc[a]);
  const taken = new Uint8Array(acc.length);
  const R = 6;
  for (const i of order) {
    if (lines.length >= maxLines) break;
    if (taken[i]) continue;
    const t = Math.floor(i / rhoBins),
      rho = (i % rhoBins) - diag;
    if (!accept((t * Math.PI) / THETA_BINS)) continue;
    lines.push({ theta: (t * Math.PI) / THETA_BINS, rho, votes: acc[i] });
    for (let dt = -3; dt <= 3; dt++) {
      const tt = t + dt;
      if (tt < 0 || tt >= THETA_BINS) continue;
      for (let dr = -R; dr <= R; dr++) {
        const rr = rho + diag + dr;
        if (rr >= 0 && rr < rhoBins) taken[tt * rhoBins + rr] = 1;
      }
    }
  }
  return lines;
}

/** Distance from a point to a line, pixels. */
export function lineDistance(l: Line, x: number, y: number) {
  return Math.abs(x * Math.cos(l.theta) + y * Math.sin(l.theta) - l.rho);
}

/** How far a line is from upright, radians (0 = vertical). */
const offVertical = (theta: number) => Math.min(theta, Math.PI - theta); // normal along x means upright
/** How far a line is from level, radians (0 = horizontal). */
const offHorizontal = (theta: number) => Math.abs(theta - Math.PI / 2);
const DEG = Math.PI / 180;
/** Lines toward a central vanishing point are neither upright nor level. */
const isSlanted = (theta: number) =>
  offVertical(theta) >= 8 * DEG && offHorizontal(theta) >= 4 * DEG;

/**
 * The central vanishing point from a photo's lines: the crossing most of
 * the slanted lines pass close to. Falls back to the middle of the picture,
 * a little above centre (eye level), with confidence 0.
 */
export function findVanishingPoint(img: GrayImage): Vanishing {
  const { width: w, height: h } = img;
  // Upright edges (windows, poles) far outnumber the slanted ones in a
  // street scene, so each kind gets its own share of lines.
  const verticals = houghLines(img, 24, (t) => offVertical(t) < 6 * DEG);
  const slanted = houghLines(img, 80, isSlanted);
  const fallback: Vanishing = {
    x: w / 2,
    y: h * 0.45,
    confidence: 0,
    lines: [],
    verticals,
    rays: [],
  };
  if (slanted.length < 2) return fallback;
  const tol = Math.hypot(w, h) * 0.015;
  const total = slanted.reduce((s, l) => s + l.votes, 0);
  let best = { x: 0, y: 0, score: -1 };
  for (let i = 0; i < slanted.length; i++)
    for (let j = i + 1; j < slanted.length; j++) {
      const a = slanted[i],
        b = slanted[j];
      const det =
        Math.cos(a.theta) * Math.sin(b.theta) -
        Math.sin(a.theta) * Math.cos(b.theta);
      if (Math.abs(det) < 0.05) continue; // near parallel
      const x = (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det,
        y = (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det;
      if (x < -0.25 * w || x > 1.25 * w || y < -0.25 * h || y > 1.25 * h)
        continue;
      let score = 0;
      for (const l of slanted)
        if (lineDistance(l, x, y) < tol) score += l.votes;
      if (score > best.score) best = { x, y, score };
    }
  if (best.score < 0) return fallback;
  // Refine: the point closest (least squares) to every agreeing line.
  const inliers = slanted.filter((l) => lineDistance(l, best.x, best.y) < tol);
  let sxx = 0,
    sxy = 0,
    syy = 0,
    bx = 0,
    by = 0;
  for (const l of inliers) {
    const c = Math.cos(l.theta),
      s = Math.sin(l.theta),
      wt = l.votes;
    sxx += wt * c * c;
    sxy += wt * c * s;
    syy += wt * s * s;
    bx += wt * c * l.rho;
    by += wt * s * l.rho;
  }
  const det = sxx * syy - sxy * sxy;
  const x = Math.abs(det) > 1e-6 ? (bx * syy - by * sxy) / det : best.x,
    y = Math.abs(det) > 1e-6 ? (by * sxx - bx * sxy) / det : best.y;
  return {
    x,
    y,
    confidence: inliers.length >= 2 ? best.score / total : 0,
    lines: inliers,
    verticals,
    rays: raysFrom(img, inliers, x, y),
  };
}

/**
 * Splits lines through (x, y) into the half-lines with edges along them:
 * walks out each way, counting strong edge pixels near the line.
 */
function raysFrom(img: GrayImage, lines: Line[], x: number, y: number): Ray[] {
  const { width: w, height: h } = img;
  const { mag } = sobel(img);
  const sorted = Float32Array.from(mag).sort();
  const cut = Math.max(60, sorted[Math.floor(sorted.length * 0.9)]);
  const strong = (px: number, py: number) => {
    const ix = Math.round(px),
      iy = Math.round(py);
    if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) return false;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++)
        if (mag[(iy + oy) * w + ix + ox] >= cut) return true;
    return false;
  };
  const rays: Ray[] = [];
  for (const l of lines) {
    // Along the line: perpendicular to its normal.
    const dx = -Math.sin(l.theta),
      dy = Math.cos(l.theta);
    for (const sgn of [1, -1]) {
      let support = 0;
      for (let t = 6; ; t++) {
        const px = x + sgn * dx * t,
          py = y + sgn * dy * t;
        if (px < 0 || py < 0 || px >= w || py >= h) break;
        if (strong(px, py)) support++;
      }
      if (support >= Math.max(10, Math.min(w, h) * 0.05))
        rays.push({ dx: sgn * dx, dy: sgn * dy, support });
    }
  }
  return rays;
}
