import { describe, expect, it } from "vitest";
import {
  findVanishingPoint,
  type GrayImage,
} from "../src/lib/photo3d/vanishing";
import {
  defaultBack,
  exifFocal35,
  fitBack,
  focalFrom35mm,
  project,
  skyMask,
  tourBox,
} from "../src/lib/photo3d/tour";
import {
  SAMPLE_STREET,
  sampleStreet,
  type Shape,
} from "../src/lib/photo3d/sample-street";

/** Paints shapes into RGBA pixels (a tiny scanline rasteriser for tests). */
function paint(shapes: Shape[], w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const s of shapes) {
    const c = [1, 3, 5].map((k) => parseInt(s.color.slice(k, k + 2), 16));
    const ys = s.points.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))),
      y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < s.points.length; i++) {
        const [ax, ay] = s.points[i],
          [bx, by] = s.points[(i + 1) % s.points.length];
        if (ay <= cy !== by <= cy)
          xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (
          let x = Math.max(0, Math.ceil(xs[k] - 0.5));
          x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
          x++
        )
          data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  }
  return data;
}
function gray(rgba: Uint8ClampedArray, w: number, h: number): GrayImage {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++)
    out[i] = Math.round(
      0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2],
    );
  return { width: w, height: h, data: out };
}

describe("photo to 3D", () => {
  const W = 480,
    H = 320;
  const { shapes, setup } = sampleStreet(W, H);
  const rgba = paint(shapes, W, H);

  it("finds where the street's lines meet", () => {
    const vp = findVanishingPoint(gray(rgba, W, H));
    expect(Math.abs(vp.x - setup.vx)).toBeLessThan(W * 0.03);
    expect(Math.abs(vp.y - setup.vy)).toBeLessThan(H * 0.03);
    expect(vp.confidence).toBeGreaterThan(0.3);
    expect(vp.lines.length).toBeGreaterThanOrEqual(4);
  });

  it("falls back to eye level in a picture with no lines", () => {
    const flat: GrayImage = {
      width: 100,
      height: 80,
      data: new Uint8Array(8000).fill(128),
    };
    const vp = findVanishingPoint(flat);
    expect(vp.confidence).toBe(0);
    expect(vp.x).toBe(50);
  });

  it("rebuilds the street at its real size from eye height", () => {
    const box = tourBox(setup);
    expect(box.depth).toBeCloseTo(SAMPLE_STREET.depth, 0);
    expect(box.across).toBeCloseTo(SAMPLE_STREET.right - SAMPLE_STREET.left, 0);
    expect(box.left).toBeCloseTo(SAMPLE_STREET.left, 0);
    expect(box.tall).toBeCloseTo(12, 0);
    // Every corner of the box lands back where the photo shows it.
    const back = box.planes.find((p) => p.name === "back")!;
    const [x, y] = project(setup, back.corners[0])!;
    expect(x).toBeCloseTo(setup.back.left, 3);
    expect(y).toBeCloseTo(setup.back.bottom, 3);
  });

  it("measures the street's width and heights from its lines", () => {
    const vp = findVanishingPoint(gray(rgba, W, H));
    const mask = skyMask({ width: W, height: H, data: rgba }, vp.y);
    const back = fitBack({ ...setup, vx: vp.x, vy: vp.y }, vp.rays, {
      mask,
      width: W,
      height: H,
    });
    expect(back).not.toBeNull();
    const box = tourBox({ ...setup, vx: vp.x, vy: vp.y, back: back! });
    // 9 m to the left front and 11 m to the right, within a metre or two.
    expect(box.left).toBeGreaterThan(SAMPLE_STREET.left - 2);
    expect(box.left).toBeLessThan(SAMPLE_STREET.left + 2);
    expect(box.right).toBeGreaterThan(SAMPLE_STREET.right - 2.5);
    expect(box.right).toBeLessThan(SAMPLE_STREET.right + 2.5);
    // Tall enough for the taller side's roofs (21 m), not wildly more.
    expect(box.tall).toBeGreaterThan(15);
    expect(box.tall).toBeLessThan(40);
    expect(box.depth).toBeGreaterThan(30);
  });

  it("reads a portrait photo the same way", () => {
    const PW = 320,
      PH = 480;
    const portrait = sampleStreet(PW, PH);
    const px = paint(portrait.shapes, PW, PH);
    const vp = findVanishingPoint(gray(px, PW, PH));
    expect(Math.abs(vp.x - portrait.setup.vx)).toBeLessThan(PW * 0.03);
    expect(Math.abs(vp.y - portrait.setup.vy)).toBeLessThan(PH * 0.03);
    const back = fitBack({ ...portrait.setup, vx: vp.x, vy: vp.y }, vp.rays, {
      mask: skyMask({ width: PW, height: PH, data: px }, vp.y),
      width: PW,
      height: PH,
    })!;
    const box = tourBox({ ...portrait.setup, vx: vp.x, vy: vp.y, back });
    // The far wall sits at the same distance as in a landscape photo.
    expect(box.depth).toBeCloseTo(60, 0);
    expect(box.right).toBeGreaterThan(SAMPLE_STREET.right - 3);
  });

  it("keeps the far wall around the vanishing point", () => {
    const back = defaultBack(W, H, W / 2, H / 2);
    expect(back.left).toBeLessThan(W / 2);
    expect(back.right).toBeGreaterThan(W / 2);
    expect(back.top).toBeLessThan(H / 2);
    expect(back.bottom).toBeGreaterThan(H / 2);
    // Even when dragged across it.
    const box = tourBox({
      ...setup,
      back: { left: 300, right: 310, top: 10, bottom: 50 },
    });
    expect(box.depth).toBeGreaterThan(0);
    expect(box.left).toBeLessThan(0);
  });

  it("finds the open sky above the rooftops", () => {
    const mask = skyMask({ width: W, height: H, data: rgba }, setup.vy);
    expect(mask[5 * W + W / 2]).toBe(1); // top middle: sky
    expect(mask[(H - 5) * W + W / 2]).toBe(0); // road
    // The tall building on the right: not sky.
    const [bx, by] = project(setup, [SAMPLE_STREET.right, 10, -40])!;
    expect(mask[Math.round(by) * W + Math.round(bx)]).toBe(0);
  });

  it("reads a phone's focal length from EXIF", () => {
    // A minimal JPEG: SOI, APP1 Exif (little-endian TIFF) with an Exif IFD
    // holding FocalLengthIn35mmFilm = 26.
    const tiff = [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      // IFD0: one entry, ExifIFD pointer → offset 26
      0x01, 0x00, 0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // Exif IFD at 26: one entry, 0xA405 SHORT = 26
      0x01, 0x00, 0x05, 0xa4, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const size = app1.length + 2;
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      size >> 8,
      size & 255,
      ...app1,
      0xff,
      0xd9,
    ]);
    expect(exifFocal35(jpeg)).toBe(26);
    expect(exifFocal35(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    // 26 mm on a 4032-wide photo is about 2900 px (a 70° view).
    expect(focalFrom35mm(4032, 3024, 26)).toBeCloseTo(2912, 0);
  });
});
