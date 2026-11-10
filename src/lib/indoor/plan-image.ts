/**
 * Floor plan images to rooms and corridors, with classic computer vision
 * (no model download): Otsu thresholding finds the dark walls, a flood fill
 * from the edge finds the outside, connected-component labelling finds the
 * spaces, the long thin space is the corridor, Zhang-Suen thinning turns it
 * into walkable centre lines, and boundary tracing with Douglas-Peucker
 * simplification outlines each room. Coordinates are image pixels.
 */

export interface Gray {
  width: number;
  height: number;
  /** One byte per pixel, 0 = black. */
  data: Uint8Array;
}

export type Px = [number, number];

export interface PlanRoom {
  ring: Px[];
  area: number;
  centre: Px;
  label: string;
}

export interface VectorPlan {
  width: number;
  height: number;
  rooms: PlanRoom[];
  /** Corridor centre lines. */
  corridors: Px[][];
  /** Doorways: room-to-corridor links (room centre → corridor). */
  links: Px[][];
  doors: Px[];
  /** Openings in the outer wall: the ways in from outside. */
  entrances: Px[];
  /** The building's outline in the image (bounding box), for fitting. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** RGBA pixels (as from a canvas) to grey. */
export function toGray(rgba: {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}): Gray {
  const out = new Uint8Array(rgba.width * rgba.height);
  for (let i = 0; i < out.length; i++) {
    const r = rgba.data[i * 4],
      g = rgba.data[i * 4 + 1],
      b = rgba.data[i * 4 + 2],
      a = rgba.data[i * 4 + 3] / 255;
    // Transparent pixels read as white paper.
    out[i] = Math.round(
      (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a),
    );
  }
  return { width: rgba.width, height: rgba.height, data: out };
}

/** Otsu's threshold: the grey level that best splits ink from paper. */
export function otsu(img: Gray) {
  const hist = new Array(256).fill(0);
  for (const v of img.data) hist[v]++;
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0,
    wB = 0,
    best = 0,
    threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB,
      mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number) {
  // A square dilation, done as a row pass then a column pass, each with a
  // running count, so it costs the same for any radius.
  const rows = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    for (let x = 0; x < Math.min(r, w); x++) count += mask[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) count += mask[row + x + r];
      if (x - r - 1 >= 0) count -= mask[row + x - r - 1];
      rows[row + x] = count > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(r, h); y++) count += rows[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) count += rows[(y + r) * w + x];
      if (y - r - 1 >= 0) count -= rows[(y - r - 1) * w + x];
      out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

/** Labels 4-connected regions of `on` pixels; returns labels and sizes. */
function label(on: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(on.length).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || labels[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(i);
    labels[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w,
        y = (p - x) / w;
      const next = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const q of next)
        if (q >= 0 && on[q] && labels[q] < 0) {
          labels[q] = id;
          stack.push(q);
        }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/** Distance (in pixels, chessboard) from each `on` pixel to the nearest off one. */
function distanceInside(on: Uint8Array, w: number, h: number) {
  const d = new Float32Array(on.length);
  const big = w + h;
  for (let i = 0; i < on.length; i++) d[i] = on[i] ? big : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      const up = y > 0 ? d[i - w] : 0,
        left = x > 0 ? d[i - 1] : 0;
      d[i] = Math.min(d[i], up + 1, left + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      const down = y < h - 1 ? d[i + w] : 0,
        right = x < w - 1 ? d[i + 1] : 0;
      d[i] = Math.min(d[i], down + 1, right + 1);
    }
  return d;
}

/** Zhang-Suen thinning of a mask to one-pixel-wide lines (in place). */
export function thin(mask: Uint8Array, w: number, h: number) {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x];
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const remove: number[] = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (!mask[y * w + x]) continue;
          const p = [
            at(x, y - 1),
            at(x + 1, y - 1),
            at(x + 1, y),
            at(x + 1, y + 1),
            at(x, y + 1),
            at(x - 1, y + 1),
            at(x - 1, y),
            at(x - 1, y - 1),
          ];
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          if (step === 0) {
            if (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) continue;
          } else if (p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          remove.push(y * w + x);
        }
      for (const i of remove) mask[i] = 0;
      if (remove.length) changed = true;
    }
  }
  return mask;
}

/** Douglas-Peucker simplification. */
export function simplify(points: Px[], tolerance: number): Px[] {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)!];
  let far = 0,
    index = 0;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d =
      Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) /
      len;
    if (d > far) {
      far = d;
      index = i;
    }
  }
  if (far <= tolerance) return [a, b];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

/** One-pixel skeleton to polylines between junctions and ends. */
function skeletonLines(skel: Uint8Array, w: number, h: number): Px[][] {
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && skel[y * w + x] === 1;
  const neighbours = (x: number, y: number) => {
    const out: Px[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx || dy) && on(x + dx, y + dy)) out.push([x + dx, y + dy]);
    return out;
  };
  const key = (p: Px) => p[1] * w + p[0];
  const visited = new Set<string>();
  const edgeKey = (a: Px, b: Px) => {
    const [i, j] = [key(a), key(b)].sort((m, n) => m - n);
    return `${i}-${j}`;
  };
  const nodes: Px[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (on(x, y) && neighbours(x, y).length !== 2) nodes.push([x, y]);
  // A closed loop has no nodes; start it anywhere.
  if (!nodes.length)
    for (let i = 0; i < skel.length; i++)
      if (skel[i]) {
        nodes.push([i % w, Math.floor(i / w)]);
        break;
      }
  const isNode = new Set(nodes.map(key));
  const lines: Px[][] = [];
  for (const start of nodes)
    for (const first of neighbours(start[0], start[1])) {
      if (visited.has(edgeKey(start, first))) continue;
      const line: Px[] = [start];
      let prev = start,
        cur = first;
      visited.add(edgeKey(prev, cur));
      for (let guard = 0; guard < skel.length; guard++) {
        line.push(cur);
        if (isNode.has(key(cur))) break;
        const next = neighbours(cur[0], cur[1]).find(
          (n) => key(n) !== key(prev) && !visited.has(edgeKey(cur, n)),
        );
        if (!next) break;
        visited.add(edgeKey(cur, next));
        prev = cur;
        cur = next;
      }
      lines.push(line);
    }
  return lines;
}

/** The outline of one labelled region (Moore-neighbour tracing). */
function outline(labels: Int32Array, id: number, w: number, h: number): Px[] {
  let start = -1;
  for (let i = 0; i < labels.length; i++)
    if (labels[i] === id) {
      start = i;
      break;
    }
  if (start < 0) return [];
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id;
  const dirs: Px[] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const sx = start % w,
    sy = Math.floor(start / w);
  const ring: Px[] = [[sx, sy]];
  let x = sx,
    y = sy,
    dir = 7;
  for (let guard = 0; guard < 4 * labels.length; guard++) {
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8; // start left of the way we came
      const nx = x + dirs[d][0],
        ny = y + dirs[d][1];
      if (inside(nx, ny)) {
        x = nx;
        y = ny;
        dir = d;
        moved = true;
        break;
      }
    }
    if (!moved || (x === sx && y === sy)) break;
    ring.push([x, y]);
  }
  return ring;
}

/**
 * Rooms, corridors and doorways from a floor plan image (dark walls on a
 * light background). Images are best at 200-600 pixels across.
 */
export function vectorizePlan(img: Gray): VectorPlan {
  const { width: w, height: h } = img;
  const t = otsu(img);
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = img.data[i] <= t ? 1 : 0;
  // Room numbers, labels and furniture symbols are small marks standing
  // apart from the walls; left in, they read as obstacles that split rooms.
  // Walls (with the door swings drawn on them) join up into long runs.
  const marks = label(ink, w, h);
  const span = marks.sizes.map(() => [w, h, 0, 0]);
  for (let i = 0; i < ink.length; i++) {
    const id = marks.labels[i];
    if (id < 0) continue;
    const x = i % w,
      y = (i - x) / w,
      b = span[id];
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  const smallMark = Math.min(w, h) / 12;
  const isMark = span.map(
    (b) => Math.hypot(b[2] - b[0], b[3] - b[1]) < smallMark,
  );
  for (let i = 0; i < ink.length; i++)
    if (ink[i] && isMark[marks.labels[i]]) ink[i] = 0;
  // Door swings, hatching and dimension lines are hairlines drawn over the
  // walls' thicker strokes; an opening (erode, then dilate) takes them off.
  // Plans drawn entirely in hairlines would lose their walls too, so this
  // applies only when most of the ink survives it.
  const thick = Math.max(1, Math.round(Math.min(w, h) / 400));
  const notInk = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i++) notInk[i] = ink[i] ? 0 : 1;
  const eroded = dilate(notInk, w, h, thick);
  for (let i = 0; i < eroded.length; i++) eroded[i] = eroded[i] ? 0 : 1;
  const opened = dilate(eroded, w, h, thick);
  let before = 0,
    after = 0;
  for (let i = 0; i < ink.length; i++) {
    before += ink[i];
    after += opened[i] & ink[i];
  }
  if (after >= before * 0.6)
    for (let i = 0; i < ink.length; i++) ink[i] &= opened[i];
  // Close door gaps and hairline breaks so each room is its own space.
  const r = Math.max(1, Math.round(Math.min(w, h) / 150));
  const walls = dilate(ink, w, h, r);
  const free = new Uint8Array(w * h);
  for (let i = 0; i < free.length; i++) free[i] = walls[i] ? 0 : 1;
  // Outside: open space connected to the image edge, found with the walls
  // closed over wide gaps too, so entrances in the outer wall don't let the
  // outside flood the corridors. (Sealing then reaching back by the same
  // radius is a morphological closing: it ends at the walls' faces.)
  const seal = Math.max(r + 1, Math.round(Math.min(w, h) / 16));
  const sealed = dilate(ink, w, h, seal);
  const open = new Uint8Array(w * h);
  for (let i = 0; i < open.length; i++) open[i] = sealed[i] ? 0 : 1;
  const { labels: openLabels } = label(open, w, h);
  const edge = new Set<number>();
  for (let x = 0; x < w; x++) {
    edge.add(openLabels[x]);
    edge.add(openLabels[(h - 1) * w + x]);
  }
  for (let y = 0; y < h; y++) {
    edge.add(openLabels[y * w]);
    edge.add(openLabels[y * w + w - 1]);
  }
  edge.delete(-1);
  const far = new Uint8Array(w * h);
  for (let i = 0; i < far.length; i++) far[i] = edge.has(openLabels[i]) ? 1 : 0;
  const near = dilate(far, w, h, seal);
  const outsideMask = new Uint8Array(w * h);
  for (let i = 0; i < outsideMask.length; i++)
    outsideMask[i] = near[i] && free[i] ? 1 : 0;
  const indoor = new Uint8Array(w * h);
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let i = 0; i < indoor.length; i++) {
    const inside = !outsideMask[i];
    // The building: everything not outside (spaces and walls).
    if (inside) {
      const x = i % w,
        y = (i - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    indoor[i] = inside && free[i] ? 1 : 0;
  }
  // Entrances: where indoor space meets the outside directly, through a gap
  // in the outer wall. Neighbouring touch points form one entrance.
  const touching = new Uint8Array(w * h);
  for (let i = 0; i < indoor.length; i++) {
    if (!indoor[i]) continue;
    const x = i % w;
    if (
      (x > 0 && outsideMask[i - 1]) ||
      (x < w - 1 && outsideMask[i + 1]) ||
      (i >= w && outsideMask[i - w]) ||
      (i + w < indoor.length && outsideMask[i + w])
    )
      touching[i] = 1;
  }
  const gaps = label(dilate(touching, w, h, 1), w, h);
  const sums = gaps.sizes.map(() => [0, 0, 0]);
  for (let i = 0; i < touching.length; i++)
    if (touching[i]) {
      const s = sums[gaps.labels[i]],
        x = i % w;
      s[0] += x;
      s[1] += (i - x) / w;
      s[2]++;
    }
  const entrances: Px[] = sums
    .filter((s) => s[2] >= 3)
    .map((s) => [s[0] / s[2], s[1] / s[2]]);
  const dist = distanceInside(indoor, w, h);
  const buildingArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
  const minRoom = buildingArea * 0.004;
  // Doorways are narrow necks: cut the space where it's narrower than a
  // door, label the cores that remain, then grow each core back over the
  // space it came from (a geodesic reconstruction), so rooms stay apart.
  const split = (neck: number) => {
    const core = new Uint8Array(w * h);
    for (let i = 0; i < core.length; i++) core[i] = dist[i] > neck ? 1 : 0;
    const cores = label(core, w, h);
    const labels = new Int32Array(w * h).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < labels.length; i++)
      if (cores.labels[i] >= 0) {
        labels[i] = cores.labels[i];
        queue.push(i);
      }
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head];
      const x = p % w,
        y = (p - x) / w;
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ])
        if (q >= 0 && indoor[q] && labels[q] < 0) {
          labels[q] = labels[p];
          queue.push(q);
        }
    }
    const n = cores.sizes.length;
    const sizes = new Array(n).fill(0);
    const merged = new Float32Array(n);
    for (let i = 0; i < labels.length; i++) {
      const id = labels[i];
      if (id < 0) continue;
      sizes[id]++;
      if (dist[i] > merged[id]) merged[id] = dist[i];
    }
    // Real spaces are clearly thicker than the cut: a corridor whittled
    // down to slivers by a cut nearly as wide as itself doesn't count, so
    // the search keeps corridors whole while still cutting at doors.
    // Only spaces of some size vote (a scrap left at a junction doesn't).
    const spaces = sizes.filter(
      (v, id) => v >= 2 * minRoom && merged[id] >= neck * 1.2 + 2,
    ).length;
    return { labels, sizes, spaces };
  };
  // Door widths differ from plan to plan, so try a ladder of neck widths
  // and keep the one that separates the most real spaces: too narrow and
  // rooms run together through their doors; too wide and whole corridors
  // vanish into the rooms beside them. Ties keep the narrower cut.
  let maxDist = 0;
  for (const d of dist) if (d > maxDist) maxDist = d;
  let best = split(2);
  for (
    let neck = 3;
    neck < maxDist * 0.9;
    neck = Math.max(neck + 1, Math.round(neck * 1.3))
  ) {
    const next = split(neck);
    if (next.spaces > best.spaces) best = next;
  }
  const { labels, sizes } = best;
  // Per space: area, bounding box, mean half-width.
  const stats = sizes.map((size) => ({
    size,
    minX: w,
    minY: h,
    maxX: 0,
    maxY: 0,
    sumX: 0,
    sumY: 0,
    sumD: 0,
  }));
  for (let i = 0; i < labels.length; i++) {
    const id = labels[i];
    if (id < 0) continue;
    const s = stats[id];
    const x = i % w,
      y = (i - x) / w;
    s.minX = Math.min(s.minX, x);
    s.maxX = Math.max(s.maxX, x);
    s.minY = Math.min(s.minY, y);
    s.maxY = Math.max(s.maxY, y);
    s.sumX += x;
    s.sumY += y;
    s.sumD += dist[i];
  }
  // Corridor: a big space much longer than it is wide.
  const elongation = stats.map((s) => {
    const span = Math.hypot(s.maxX - s.minX, s.maxY - s.minY);
    return span / (2 * (s.sumD / s.size) + 1);
  });
  const candidates = stats
    .map((s, id) => ({ id, s, e: elongation[id] }))
    .filter((c) => c.s.size >= minRoom);
  // A long, narrow space is a corridor (a deep room is still a room: its
  // mean half-width is a third of its depth, so rooms reach ratios of 5 to
  // 7). With none that clear, the most corridor-like space is taken.
  const big = candidates.filter((c) => c.s.size >= buildingArea * 0.02);
  let corridorIds = new Set(big.filter((c) => c.e >= 8).map((c) => c.id));
  if (!corridorIds.size && big.length >= 3) {
    // Only when one space clearly stands out as long and thin: a plan of
    // rooms opening into each other, or a single hall, has no corridor.
    const sorted = [...big].sort((a, b) => b.e - a.e);
    const [most, next] = sorted;
    if (most.e >= 6 && most.e >= 1.3 * next.e) corridorIds = new Set([most.id]);
  }
  const rooms: PlanRoom[] = [];
  let n = 0;
  for (const c of candidates) {
    if (corridorIds.has(c.id)) continue;
    const ring = simplify(outline(labels, c.id, w, h), Math.max(1.5, r));
    if (ring.length < 3) continue;
    rooms.push({
      ring,
      area: c.s.size,
      centre: [c.s.sumX / c.s.size, c.s.sumY / c.s.size],
      label: `Room ${++n}`,
    });
  }
  // Corridor centre lines.
  const corridorMask = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++)
    if (labels[i] >= 0 && corridorIds.has(labels[i])) corridorMask[i] = 1;
  thin(corridorMask, w, h);
  const corridors = skeletonLines(corridorMask, w, h)
    .filter((l) => l.length >= 4)
    .map((l) => simplify(l, 1.5));
  // Doorways: where a room's pixels touch the corridor's. Each room links
  // from its centre through its doorway to the nearest corridor point.
  const skeletonPts: Px[] = corridors.flat();
  const roomIndex = new Map<number, number>();
  candidates
    .filter((c) => !corridorIds.has(c.id))
    .forEach((c, i) => roomIndex.set(c.id, i));
  const touch = new Map<number, { x: number; y: number; n: number }>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w - 1; x++)
      for (const [a, b] of [
        [y * w + x, y * w + x + 1],
        [y * w + x, y < h - 1 ? (y + 1) * w + x : -1],
      ]) {
        if (b < 0) continue;
        const la = labels[a],
          lb = labels[b];
        if (la < 0 || lb < 0 || la === lb) continue;
        const room = corridorIds.has(la) ? lb : corridorIds.has(lb) ? la : -1;
        if (room < 0 || !roomIndex.has(room)) continue;
        const t = touch.get(room) ?? { x: 0, y: 0, n: 0 };
        t.x += x;
        t.y += y;
        t.n++;
        touch.set(room, t);
      }
  const links: Px[][] = [];
  const doors: Px[] = [];
  for (const c of candidates) {
    if (corridorIds.has(c.id)) continue;
    const room = rooms.find(
      (r) =>
        Math.abs(r.centre[0] - c.s.sumX / c.s.size) < 0.01 &&
        Math.abs(r.centre[1] - c.s.sumY / c.s.size) < 0.01,
    );
    const t = touch.get(c.id);
    if (!room || !t || !skeletonPts.length) continue;
    const door: Px = [t.x / t.n, t.y / t.n];
    let best = skeletonPts[0],
      bd = Infinity;
    for (const p of skeletonPts) {
      const d = Math.hypot(p[0] - door[0], p[1] - door[1]);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    doors.push(door);
    links.push([room.centre, door, best]);
  }
  return {
    width: w,
    height: h,
    rooms,
    corridors,
    links,
    doors,
    entrances,
    bounds: { minX, minY, maxX, maxY },
  };
}
