/**
 * "Tour into the picture" (Horry, Anjyo and Arai, SIGGRAPH 1997): one photo
 * becomes a 3D box you can walk into. Its floor, side walls, sky and far
 * wall meet along lines through the vanishing point, and the photo is
 * projected back onto them from where it was taken. With the camera at eye
 * height, the box comes out in real metres.
 */

export type Vec3 = [number, number, number];

export interface TourSetup {
  width: number;
  height: number;
  /** Vanishing point, pixels. */
  vx: number;
  vy: number;
  /** The far wall's edges in the image, pixels. */
  back: { left: number; top: number; right: number; bottom: number };
  /** Focal length, pixels. */
  focal: number;
  /** Camera height above the ground, metres. */
  eye: number;
}

export interface TourPlane {
  name: "floor" | "left" | "right" | "sky" | "back";
  /** Corners, metres, counter-clockwise from the camera's side. */
  corners: [Vec3, Vec3, Vec3, Vec3];
}

export interface TourBox {
  planes: TourPlane[];
  /** Distance to the far wall, metres. */
  depth: number;
  /** Street or room width between the side walls, metres. */
  across: number;
  /** Height of the side walls (cornice or ceiling), metres. */
  tall: number;
  /** Side walls' positions, metres from the camera (left negative). */
  left: number;
  right: number;
}

/** Average adult eye height, metres. */
export const EYE_M = 1.6;
/** A phone's main camera sees about this wide (horizontal, degrees). */
export const DEFAULT_FOV = 66;

export function focalFromFov(width: number, fovDegrees = DEFAULT_FOV) {
  return width / 2 / Math.tan((fovDegrees * Math.PI) / 360);
}

/** A 35 mm-equivalent focal length (from a photo's EXIF) in pixels. */
export function focalFrom35mm(width: number, height: number, mm: number) {
  // 35 mm film is 36 × 24 mm; its long side spans the image's long side.
  return (mm / 36) * Math.max(width, height);
}

/** The far wall's default outline: a frame around the vanishing point. */
export function defaultBack(
  width: number,
  height: number,
  vx: number,
  vy: number,
) {
  const left = Math.max(1, vx - width * 0.16),
    right = Math.min(width - 1, vx + width * 0.16);
  const top = Math.max(1, vy - height * 0.22),
    bottom = Math.min(height - 1, vy + height * 0.1);
  return { left, top, right, bottom };
}

/** Street fronts this far out at most are believed, metres. */
const MAX_SIDE_M = 40;
/** Where the far wall is set when the photo can't say, metres. */
const FAR_WALL_M = 60;

/**
 * The box fitted to a photo's converging lines. A line on the ground
 * through the vanishing point falls eye/X pixels per pixel across, for a
 * ground line X metres to the side, so the outermost ground lines (kerbs
 * and building bases) say how wide the street is, in metres. Lines above
 * the horizon on those fronts (rooflines, cornices) give their heights.
 * Returns null when the photo doesn't show enough to tell.
 */
export function fitBack(
  s: Omit<TourSetup, "back">,
  rays: { dx: number; dy: number; support: number }[],
  /** The sky mask, at any scale, to read the fronts' heights from. */
  sky?: { mask: Uint8Array; width: number; height: number },
): TourSetup["back"] | null {
  const ground = rays.filter((r) => r.dy > 0.05 && Math.abs(r.dx) > 0.05);
  const across = ground.map((r) => (s.eye * r.dx) / r.dy);
  const lefts = across.filter((x) => x < 0 && x > -MAX_SIDE_M);
  const rights = across.filter((x) => x > 0 && x < MAX_SIDE_M);
  if (!lefts.length && !rights.length) return null;
  // One side unseen: assume the street is symmetric about the camera.
  const left = lefts.length ? Math.min(...lefts) : -Math.max(...rights);
  const right = rights.length ? Math.max(...rights) : -left;
  const heights: number[] = [];
  for (const r of rays) {
    if (r.dy >= -0.02 || Math.abs(r.dx) < 0.05) continue;
    const side = r.dx < 0 ? left : right;
    const y = s.eye - (r.dy / r.dx) * side;
    if (y > s.eye + 1 && y < 300) heights.push(y);
  }
  // Rooflines step from building to building, so the sky says more: in
  // each column over a front, where the sky starts gives that front's
  // height there (or a least height, where it runs out of the picture).
  if (sky) {
    const k = sky.width / s.width;
    for (let u = 0; u < s.width; u += Math.max(1, s.width / 120)) {
      const side = u < s.vx ? left : right;
      if (Math.abs(u - s.vx) < s.width * 0.04) continue;
      const dz = (s.focal * side) / (u - s.vx);
      if (!(dz > 0)) continue;
      const col = Math.min(sky.width - 1, Math.round(u * k));
      let row = 0;
      while (row < sky.height && sky.mask[row * sky.width + col]) row++;
      const top = row / k;
      if (top >= s.vy) continue;
      heights.push(s.eye + ((s.vy - top) * dz) / s.focal);
    }
  }
  heights.sort((a, b) => a - b);
  // Generous: anything above the real roofs is sky, cut away anyway.
  const tall = heights.length
    ? Math.min(150, heights[Math.floor(heights.length * 0.97)])
    : s.eye + 8;
  // The far wall: well down the street (a fixed distance, so portrait and
  // landscape photos agree), but at least a few pixels below the horizon
  // so it can be dragged.
  const depth = Math.min(FAR_WALL_M, (s.focal * s.eye) / 3);
  return {
    left: s.vx + (s.focal * left) / depth,
    right: s.vx + (s.focal * right) / depth,
    top: s.vy - (s.focal * (tall - s.eye)) / depth,
    bottom: s.vy + (s.focal * s.eye) / depth,
  };
}

/**
 * Each side's front height, from where the sky starts above it (column by
 * column, as fitBack does for the box), a generous 90th percentile per
 * side. Null for a side the sky never shows over.
 */
export function sideHeights(
  s: Omit<TourSetup, "back">,
  left: number,
  right: number,
  /** The far wall's distance: columns past it look down the street. */
  depth: number,
  sky: { mask: Uint8Array; width: number; height: number },
): { left: number | null; right: number | null } {
  const k = sky.width / s.width;
  const per = { left: [] as number[], right: [] as number[] };
  for (let u = 0; u < s.width; u += Math.max(1, s.width / 160)) {
    if (Math.abs(u - s.vx) < s.width * 0.04) continue;
    const isLeft = u < s.vx;
    const dz = (s.focal * (isLeft ? left : right)) / (u - s.vx);
    if (!(dz > 0) || dz > depth) continue;
    const col = Math.min(sky.width - 1, Math.round(u * k));
    let row = 0;
    while (row < sky.height && sky.mask[row * sky.width + col]) row++;
    const top = row / k;
    if (top >= s.vy) continue;
    per[isLeft ? "left" : "right"].push(s.eye + ((s.vy - top) * dz) / s.focal);
  }
  const pick = (v: number[]) => {
    if (v.length < 3) return null;
    v.sort((a, b) => a - b);
    return Math.min(150, v[Math.floor(v.length * 0.9)]);
  };
  return { left: pick(per.left), right: pick(per.right) };
}

/** Keeps the far wall around the vanishing point (it must contain it). */
export function clampBack(s: TourSetup): TourSetup["back"] {
  const { left, top, right, bottom } = s.back;
  return {
    left: Math.min(left, s.vx - 2),
    right: Math.max(right, s.vx + 2),
    top: Math.min(top, s.vy - 2),
    bottom: Math.max(bottom, s.vy + 2),
  };
}

/**
 * The box in metres, the camera at (0, eye, 0) looking along −z. A floor
 * point seen r pixels below the horizon is f·eye/r metres away; the far
 * wall stands where its bottom edge meets the floor, and the side walls and
 * sky sit where the far wall's other edges say.
 */
export function tourBox(s: TourSetup): TourBox {
  const b = clampBack(s);
  const f = s.focal;
  const depth = (f * s.eye) / (b.bottom - s.vy);
  const left = ((b.left - s.vx) * depth) / f,
    right = ((b.right - s.vx) * depth) / f;
  const tall = s.eye + ((s.vy - b.top) * depth) / f;
  // The box starts just in front of the camera; anything the photo didn't
  // see there is left out by the projection.
  const near = -0.2;
  const z = -depth;
  return {
    depth,
    across: right - left,
    tall,
    left,
    right,
    planes: [
      {
        name: "floor",
        corners: [
          [left, 0, near],
          [right, 0, near],
          [right, 0, z],
          [left, 0, z],
        ],
      },
      {
        name: "left",
        corners: [
          [left, 0, near],
          [left, 0, z],
          [left, tall, z],
          [left, tall, near],
        ],
      },
      {
        name: "right",
        corners: [
          [right, 0, z],
          [right, 0, near],
          [right, tall, near],
          [right, tall, z],
        ],
      },
      {
        name: "sky",
        corners: [
          [left, tall, near],
          [left, tall, z],
          [right, tall, z],
          [right, tall, near],
        ],
      },
      {
        name: "back",
        corners: [
          [left, 0, z],
          [right, 0, z],
          [right, tall, z],
          [left, tall, z],
        ],
      },
    ],
  };
}

/** Where a point in the box appears in the photo, pixels (null if behind). */
export function project(s: TourSetup, p: Vec3): [number, number] | null {
  const dz = -p[2];
  if (dz <= 1e-6) return null;
  return [s.vx + (s.focal * p[0]) / dz, s.vy - (s.focal * (p[1] - s.eye)) / dz];
}

/** What a phone photo's EXIF says about how and where it was taken. */
export interface PhotoExif {
  /** 35 mm-equivalent focal length, mm. */
  focal35?: number;
  /** Where it was taken (GPS), degrees. */
  lat?: number;
  lon?: number;
  /** The way the camera faced, degrees clockwise from (true or magnetic) north. */
  direction?: number;
  /** The direction is magnetic (GPSImgDirectionRef "M"), not true north. */
  magnetic?: boolean;
  /** When it was taken, "YYYY-MM-DD" (the camera's local date). */
  date?: string;
}

/**
 * Reads the parts of a JPEG's EXIF a street photo needs: the lens, the GPS
 * position, the compass direction (GPSImgDirection) and the date. Reads
 * only the bytes it needs; anything odd gives an empty result.
 */
export function readExif(bytes: Uint8Array): PhotoExif {
  const out: PhotoExif = {};
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(0) !== 0xffd8) return out;
    let at = 2;
    while (at + 4 < bytes.length) {
      const marker = view.getUint16(at);
      const size = view.getUint16(at + 2);
      if (marker === 0xffe1 && view.getUint32(at + 4) === 0x45786966) {
        const tiff = at + 10;
        const little = view.getUint16(tiff) === 0x4949;
        const u16 = (o: number) => view.getUint16(tiff + o, little);
        const u32 = (o: number) => view.getUint32(tiff + o, little);
        const find = (ifd: number, tag: number) => {
          const n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === tag) return e;
          }
          return -1;
        };
        const rational = (o: number) => {
          const den = u32(o + 4);
          return den ? u32(o) / den : NaN;
        };
        const ascii = (e: number) => {
          const count = u32(e + 4);
          const from = count <= 4 ? e + 8 : u32(e + 8);
          let text = "";
          for (let i = 0; i < count - 1; i++)
            text += String.fromCharCode(view.getUint8(tiff + from + i));
          return text;
        };
        const ifd0 = u32(4);
        const exifPtr = find(ifd0, 0x8769);
        if (exifPtr >= 0) {
          const exif = u32(exifPtr + 8);
          const focal = find(exif, 0xa405);
          if (focal >= 0) {
            const mm = u16(focal + 8);
            if (mm > 0 && mm < 1000) out.focal35 = mm;
          }
          const taken = find(exif, 0x9003);
          if (taken >= 0) {
            const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(ascii(taken));
            if (m) out.date = `${m[1]}-${m[2]}-${m[3]}`;
          }
        }
        const gpsPtr = find(ifd0, 0x8825);
        if (gpsPtr >= 0) {
          const gps = u32(gpsPtr + 8);
          const degrees = (tag: number, refTag: number, negative: string) => {
            const e = find(gps, tag),
              r = find(gps, refTag);
            if (e < 0) return undefined;
            const o = u32(e + 8);
            const v =
              rational(o) + rational(o + 8) / 60 + rational(o + 16) / 3600;
            const ref =
              r >= 0 ? String.fromCharCode(view.getUint8(tiff + r + 8)) : "";
            return Number.isFinite(v) ? (ref === negative ? -v : v) : undefined;
          };
          const lat = degrees(2, 1, "S"),
            lon = degrees(4, 3, "W");
          if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90) {
            out.lat = lat;
            out.lon = lon;
          }
          const dir = find(gps, 0x11);
          if (dir >= 0) {
            const d = rational(u32(dir + 8));
            if (Number.isFinite(d)) out.direction = ((d % 360) + 360) % 360;
            const ref = find(gps, 0x10);
            if (
              ref >= 0 &&
              String.fromCharCode(view.getUint8(tiff + ref + 8)) === "M"
            )
              out.magnetic = true;
          }
        }
        return out;
      }
      if ((marker & 0xff00) !== 0xff00) return out;
      at += 2 + size;
    }
  } catch {
    return out;
  }
  return out;
}

/** The 35 mm-equivalent focal length a JPEG's EXIF records, or null. */
export function exifFocal35(bytes: Uint8Array): number | null {
  return readExif(bytes).focal35 ?? null;
}

/**
 * Open sky in a photo, as a coarse mask (1 = sky): bright pixels joined to
 * the top edge whose colour stays close to the sky seen there. Above the
 * horizon only, so a pale road far off isn't taken for sky.
 */
export function skyMask(
  rgba: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  horizon: number,
) {
  const { width: w, height: h, data } = rgba;
  const mask = new Uint8Array(w * h);
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const bright = (c: number[]) => (c[0] + c[1] + c[2]) / 3;
  // The sky's colour: the brighter half of the top row.
  const top = Array.from({ length: w }, (_, x) => px(x)).sort(
    (a, b) => bright(b) - bright(a),
  );
  const half = top.slice(0, Math.max(1, Math.floor(w / 2)));
  const sky = [0, 1, 2].map(
    (k) => half.reduce((s, c) => s + c[k], 0) / half.length,
  );
  if (bright(sky) < 90) return mask; // night, or no sky in view
  const limit = Math.min(h, Math.max(0, Math.round(horizon)));
  const near = (c: number[], ref: number[]) =>
    Math.abs(c[0] - ref[0]) +
      Math.abs(c[1] - ref[1]) +
      Math.abs(c[2] - ref[2]) <
    70;
  const stack: number[] = [];
  for (let x = 0; x < w; x++)
    if (near(px(x), sky)) {
      mask[x] = 1;
      stack.push(x);
    }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w,
      y = (i - x) / w;
    const c = px(i);
    for (const q of [
      x > 0 ? i - 1 : -1,
      x < w - 1 ? i + 1 : -1,
      y > 0 ? i - w : -1,
      y + 1 < limit ? i + w : -1,
    ]) {
      if (q < 0 || mask[q]) continue;
      const d = px(q);
      // Follow gentle gradients across the sky, not the jump to a roof.
      if (
        near(d, c) &&
        near(
          d,
          sky.map((v, k) => (v + c[k]) / 2),
        )
      ) {
        mask[q] = 1;
        stack.push(q);
      }
    }
  }
  return mask;
}
