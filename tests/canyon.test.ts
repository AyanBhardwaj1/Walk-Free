import { describe, expect, it } from "vitest";
import {
  canyonDay,
  shadeShare,
  shadeSpans,
  shadedAt,
  strips,
  sunAt,
  type Canyon,
} from "../src/lib/photo3d/canyon";
import { readExif } from "../src/lib/photo3d/tour";

/** Guadalupe Street at UT Austin: a north-south street, 20 m between
 * fronts 15 m tall, looking north. */
const street: Canyon = {
  left: -10,
  right: 10,
  leftTall: 15,
  rightTall: 15,
  bearing: 0,
};
const AUSTIN = { lat: 30.285, lon: -97.742 };

describe("shade along a street from its cross-section", () => {
  it("puts the east sidewalk in the morning shade of its own fronts", () => {
    // Mid-morning sun in the east: the east (right) fronts shade their
    // own sidewalk; the west sidewalk is in sun. (Lower, it shades both.)
    const sun = { altitude: (50 * Math.PI) / 180, bearing: 90 };
    const at = strips(street);
    expect(shadedAt(street, at.right, sun)).toBe(true);
    expect(shadedAt(street, at.left, sun)).toBe(false);
  });

  it("leaves a north-south street in sun when the sun is high", () => {
    const noon = { altitude: (80 * Math.PI) / 180, bearing: 180 };
    for (const x of Object.values(strips(street)))
      expect(shadedAt(street, x, noon)).toBe(false);
  });

  it("shades the south side of an east-west street all day in winter", () => {
    // Looking east: right is south. A winter sun stays low in the south.
    // Two-storey fronts (8 m), so the north side gets the winter sun.
    const eastWest = { ...street, leftTall: 8, rightTall: 8, bearing: 90 };
    const day = canyonDay(
      eastWest,
      new Date("2026-12-21T12:00:00-06:00"),
      AUSTIN.lat,
      AUSTIN.lon,
    );
    expect(day.length).toBeGreaterThan(40);
    expect(shadeShare(day, "right")).toBeGreaterThan(0.9);
    expect(shadeShare(day, "left")).toBeLessThan(0.6);
  });

  it("gives each sidewalk its own runs of shade through a summer day", () => {
    const day = canyonDay(
      street,
      new Date("2026-06-21T12:00:00-05:00"),
      AUSTIN.lat,
      AUSTIN.lon,
    );
    const east = shadeSpans(day, "right"),
      west = shadeSpans(day, "left");
    // East side shaded in the morning, west side in the afternoon.
    const hour = (t: number) =>
      Number(
        new Date(t).toLocaleString("en-US", {
          hour: "numeric",
          hour12: false,
          timeZone: "America/Chicago",
        }),
      );
    expect(hour(east[0][0])).toBeLessThan(9);
    expect(hour(west.at(-1)![1])).toBeGreaterThan(17);
    expect(shadeShare(day, "middle")).toBeLessThan(shadeShare(day, "right"));
  });

  it("places the sun where SunCalc does, as a compass bearing", () => {
    // Austin solar noon in June: high in the south (or nearly overhead).
    const s = sunAt(
      Date.parse("2026-06-21T13:35:00-05:00"),
      AUSTIN.lat,
      AUSTIN.lon,
    );
    expect(s.altitude).toBeGreaterThan((75 * Math.PI) / 180);
    // Morning sun is in the east.
    const m = sunAt(
      Date.parse("2026-06-21T08:00:00-05:00"),
      AUSTIN.lat,
      AUSTIN.lon,
    );
    expect(m.bearing).toBeGreaterThan(60);
    expect(m.bearing).toBeLessThan(110);
  });
});

describe("a phone photo's EXIF", () => {
  /** A JPEG with a GPS IFD (lat, lon, image direction) and the date. */
  function jpeg() {
    const b: number[] = [];
    const u16 = (v: number) => b.push(v & 255, v >> 8);
    const u32 = (v: number) =>
      b.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24);
    // TIFF header (little-endian), IFD0 at 8.
    b.push(0x49, 0x49, 0x2a, 0x00);
    u32(8);
    // IFD0: ExifIFD (→ 38), GPS IFD (→ 56). 2 entries: 2 + 24 + 4 = 30 → ends 38.
    u16(2);
    u16(0x8769);
    u16(4);
    u32(1);
    u32(38);
    u16(0x8825);
    u16(4);
    u32(1);
    u32(56);
    u32(0);
    // Exif IFD at 38: DateTimeOriginal ASCII 20 at 140. 2 + 12 + 4 = 18 → 56.
    u16(1);
    u16(0x9003);
    u16(2);
    u32(20);
    u32(140);
    u32(0);
    // GPS IFD at 56: LatRef, Lat(→160), LonRef, Lon(→184), ImgDirection(→208).
    // 2 + 5*12 + 4 = 66 → ends 122.
    u16(5);
    u16(1);
    u16(2);
    u32(2);
    b.push(0x4e, 0, 0, 0); // "N"
    u16(2);
    u16(5);
    u32(3);
    u32(160);
    u16(3);
    u16(2);
    u32(2);
    b.push(0x57, 0, 0, 0); // "W"
    u16(4);
    u16(5);
    u32(3);
    u32(184);
    u16(0x11);
    u16(5);
    u32(1);
    u32(208);
    u32(0);
    while (b.length < 140) b.push(0);
    for (const c of "2026:11:06 08:15:00\0") b.push(c.charCodeAt(0));
    while (b.length < 160) b.push(0);
    for (const [n, d] of [
      [30, 1],
      [17, 1],
      [600, 100],
    ]) {
      u32(n);
      u32(d);
    } // 30°17'6"
    for (const [n, d] of [
      [97, 1],
      [44, 1],
      [3120, 100],
    ]) {
      u32(n);
      u32(d);
    } // 97°44'31.2"
    u32(3555);
    u32(10); // 355.5°
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...b];
    const size = app1.length + 2;
    return new Uint8Array([
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
  }

  it("reads where the photo was taken, which way it faced, and when", () => {
    const e = readExif(jpeg());
    expect(e.lat).toBeCloseTo(30.285, 3);
    expect(e.lon).toBeCloseTo(-97.742, 3);
    expect(e.direction).toBeCloseTo(355.5, 5);
    expect(e.date).toBe("2026-11-06");
  });

  it("returns nothing for a file that isn't a JPEG", () => {
    expect(readExif(new Uint8Array([1, 2, 3, 4]))).toEqual({});
  });
});

describe("the phone's compass", () => {
  it("follows the back camera, upright in portrait or landscape", async () => {
    const { cameraHeading } = await import("../src/components/StreetShade");
    // Upright portrait (beta 90), top edge to the north: camera faces north.
    expect(
      cameraHeading({ absolute: true, alpha: 0, beta: 90, gamma: 0 }),
    ).toBeCloseTo(0, 5);
    // Upright portrait turned to face east (alpha counter-clockwise).
    expect(
      cameraHeading({ absolute: true, alpha: 270, beta: 90, gamma: 0 }),
    ).toBeCloseTo(90, 5);
    // Upright landscape (gamma 90), alpha 0: the camera faces west.
    expect(
      cameraHeading({ absolute: true, alpha: 0, beta: 0, gamma: 90 }),
    ).toBeCloseTo(270, 5);
    // Flat on a table: the top edge's heading.
    expect(
      cameraHeading({ absolute: true, alpha: 30, beta: 0, gamma: 0 }),
    ).toBeCloseTo(330, 5);
    // Not absolute: no heading.
    expect(
      cameraHeading({ absolute: false, alpha: 30, beta: 0, gamma: 0 }),
    ).toBeNull();
  });
});
