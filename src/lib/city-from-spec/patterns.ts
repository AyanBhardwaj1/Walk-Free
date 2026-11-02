/**
 * Street patterns for one district inside its rectangle: grid, organic
 * lanes, radial rings and spokes, a turned (diagonal) grid, or a park. Each
 * returns free polylines; geometry.joinLines makes their junctions later.
 */
import type { Point } from "../../../shared/types.js";
import type { CityDistrict } from "../../../shared/city-spec.js";
import {
  between,
  lines as spacedLines,
  round,
  type Rng,
  type StreetStyle,
} from "../fiction-cities/kit.js";
import { boxCorners, dist, ellipse, lineInBox, type Box } from "./geometry.js";
import type { KindLook, StyleLook } from "./styles.js";

export type LineRole =
  "arterial" | "local" | "perimeter" | "promenade" | "plaza" | "spur" | "park";
export interface PlanLine {
  points: Point[];
  name: string;
  style: StreetStyle;
  role: LineRole;
  /** Owning district index, or -1. */
  district: number;
  /** Chance that this line bridges a river or canal it meets. */
  bridgeChance: number;
}
export interface DistrictPlan {
  index: number;
  spec: CityDistrict;
  box: Box;
  centre: Point;
  kind: KindLook;
  look: StyleLook;
  palette: string[];
}
export interface PatternContext {
  rng: Rng;
  blockScale: number;
  street: (d: DistrictPlan, suffix: string) => string;
  place: (d: DistrictPlan, nouns: readonly string[]) => string;
}
export interface PatternResult {
  lines: PlanLine[];
  parks: { name: string; polygon: Point[]; district: number; big: boolean }[];
  /** Points worth naming: squares, circuses and park hearts. */
  places: { name: string; at: Point }[];
}

function styles(ctx: PatternContext, d: DistrictPlan) {
  const { rng } = ctx;
  const k = d.kind,
    trees = d.spec.trees;
  const treeSpacing = trees >= 0.12 ? round(36 - 26 * trees) : undefined;
  const lane = k.lanes === true;
  const local = (): StreetStyle => ({
    roadClass: lane ? "path" : "street",
    lit: rng() < d.look.lit,
    scenic: k.scenic,
    width: k.street,
    kind: lane ? "footway" : "road",
    covered: k.covered ? rng() < 0.45 : false,
    trees: treeSpacing,
  });
  const perimeter = (): StreetStyle => ({
    roadClass: "street",
    lit: rng() < Math.max(d.look.lit, 0.7),
    scenic: Math.min(1, k.scenic + 0.1),
    width: Math.max(k.street, 8),
    kind: "road",
    trees: treeSpacing,
  });
  const alley = (): StreetStyle => ({
    roadClass: "service",
    lit: rng() < d.look.lit * 0.75,
    scenic: 0.12,
    width: k.alley || 3.5,
    kind: "footway",
    covered: k.covered ? rng() < 0.3 : false,
  });
  return { local, perimeter, alley };
}

const line = (
  d: DistrictPlan,
  points: Point[],
  name: string,
  style: StreetStyle,
  role: LineRole,
  bridgeChance = 0,
): PlanLine => ({ points, name, style, role, district: d.index, bridgeChance });

/** The district's rectangle as four named perimeter streets. */
function perimeter(ctx: PatternContext, d: DistrictPlan, out: PlanLine[]) {
  const s = styles(ctx, d);
  const c = boxCorners(d.box);
  const suffixes = ["Road", "Street", "Road", "Street"];
  for (let i = 0; i < 4; i++)
    out.push(
      line(
        d,
        [c[i], c[(i + 1) % 4]],
        ctx.street(d, suffixes[i]),
        s.perimeter(),
        "perimeter",
        0.45,
      ),
    );
}

export function gridPattern(
  ctx: PatternContext,
  d: DistrictPlan,
): PatternResult {
  const { rng } = ctx;
  const [x0, x1, z0, z1] = d.box;
  const k = d.kind,
    s = styles(ctx, d);
  const bs = k.block * ctx.blockScale;
  const nx = Math.max(2, Math.round((x1 - x0) / bs) + 1),
    nz = Math.max(2, Math.round((z1 - z0) / bs) + 1);
  const xs = spacedLines(rng, x0, x1, nx, bs * 0.08),
    zs = spacedLines(rng, z0, z1, nz, bs * 0.08);
  const out: PlanLine[] = [];
  const parks: PatternResult["parks"] = [];
  const places: PatternResult["places"] = [];

  // A square near the middle, and a few pocket parks where trees are wanted.
  const parkCells = new Set<string>();
  if (nx >= 3 && nz >= 3) {
    const ci = Math.floor((nx - 1) / 2),
      cj = Math.floor((nz - 1) / 2);
    if (d.spec.kind !== "industrial") parkCells.add(`${ci},${cj}`);
    const extra = Math.round(d.spec.trees * 3 * rng());
    for (let n = 0; n < extra; n++) {
      const i = 1 + Math.floor(rng() * Math.max(1, nx - 3)),
        j = 1 + Math.floor(rng() * Math.max(1, nz - 3));
      if (i < nx - 1 && j < nz - 1) parkCells.add(`${i},${j}`);
    }
  }
  [...parkCells].forEach((key, n) => {
    const [i, j] = key.split(",").map(Number);
    const inset = Math.max(k.street, 8) / 2 + 4;
    const polygon: Point[] = [
      [xs[i] + inset, zs[j] + inset],
      [xs[i + 1] - inset, zs[j] + inset],
      [xs[i + 1] - inset, zs[j + 1] - inset],
      [xs[i] + inset, zs[j + 1] - inset],
    ];
    if (
      polygon[1][0] - polygon[0][0] < 16 ||
      polygon[2][1] - polygon[1][1] < 16
    )
      return;
    const name = ctx.place(
      d,
      n === 0 ? ["Square", "Plaza", "Green"] : ["Gardens", "Green", "Park"],
    );
    parks.push({ name, polygon, district: d.index, big: false });
    places.push({
      name,
      at: [(xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2],
    });
  });

  xs.forEach((x, i) => {
    const edge = i === 0 || i === nx - 1;
    out.push(
      line(
        d,
        zs.map((z) => [x, z] as Point),
        ctx.street(d, edge ? "Road" : i % 2 ? "Street" : "Avenue"),
        edge ? s.perimeter() : s.local(),
        edge ? "perimeter" : "local",
        edge ? 0.45 : 0.3,
      ),
    );
  });
  zs.forEach((z, j) => {
    const edge = j === 0 || j === nz - 1;
    out.push(
      line(
        d,
        xs.map((x) => [x, z] as Point),
        ctx.street(d, edge ? "Road" : j % 2 ? "Avenue" : "Street"),
        edge ? s.perimeter() : s.local(),
        edge ? "perimeter" : "local",
        edge ? 0.45 : 0.3,
      ),
    );
  });
  // Alleys halfway between the x-lines, one block at a time.
  if (k.alley > 0)
    for (let i = 0; i < nx - 1; i++) {
      const x = round((xs[i] + xs[i + 1]) / 2 + between(rng, -3, 3));
      const name = ctx.street(d, "Alley");
      const style = s.alley();
      for (let j = 0; j < nz - 1; j++) {
        if (parkCells.has(`${i},${j}`) || rng() > 0.7) continue;
        out.push(
          line(
            d,
            [
              [x, zs[j]],
              [x, zs[j + 1]],
            ],
            name,
            style,
            "local",
            0.1,
          ),
        );
      }
    }
  return { lines: out, parks, places };
}

export function diagonalPattern(
  ctx: PatternContext,
  d: DistrictPlan,
): PatternResult {
  const { rng } = ctx;
  const out: PlanLine[] = [];
  const places: PatternResult["places"] = [];
  const s = styles(ctx, d);
  perimeter(ctx, d, out);
  const [x0, x1, z0, z1] = d.box;
  const c = d.centre;
  const theta = (between(rng, 28, 42) * Math.PI) / 180;
  const u: Point = [Math.cos(theta), Math.sin(theta)],
    v: Point = [-Math.sin(theta), Math.cos(theta)];
  const bs = d.kind.block * ctx.blockScale;
  const reach = Math.hypot(x1 - x0, z1 - z0) / 2;
  const families: [Point, Point, string, string][] = [
    [u, v, "Street", "Diagonal"],
    [v, u, "Avenue", "Way"],
  ];
  for (const [dir, across, suffix, alt] of families) {
    const start = -Math.floor(reach / bs) * bs;
    for (let o = start; o <= reach; o += bs) {
      const p: Point = [c[0] + across[0] * o, c[1] + across[1] * o];
      const seg = lineInBox(p, dir, d.box);
      if (!seg || dist(seg[0], seg[1]) < 30) continue;
      const major = Math.abs(o) < bs / 2;
      out.push(
        line(
          d,
          seg,
          ctx.street(d, major ? alt : suffix),
          major
            ? { ...s.perimeter(), width: Math.max(12, d.kind.street) }
            : s.local(),
          "local",
          0.3,
        ),
      );
    }
  }
  // A small circus where the two grand diagonals cross.
  const r = Math.min(bs * 0.32, 26);
  if (r > 14 && d.spec.kind !== "industrial") {
    const name = ctx.place(d, ["Circus", "Star", "Plaza"]);
    out.push(
      line(
        d,
        [...ellipse(c, r, r, 16), [c[0] + r, c[1]]],
        `${name} Walk`,
        s.alley(),
        "plaza",
        0,
      ),
    );
    places.push({ name, at: c });
  }
  return { lines: out, parks: [], places };
}

export function organicPattern(
  ctx: PatternContext,
  d: DistrictPlan,
): PatternResult {
  const { rng } = ctx;
  const [x0, x1, z0, z1] = d.box;
  const s = styles(ctx, d);
  const bs = d.kind.block * 0.85 * ctx.blockScale;
  const cols = Math.max(3, Math.round((x1 - x0) / bs) + 1),
    rows = Math.max(3, Math.round((z1 - z0) / bs) + 1);
  const xs = spacedLines(rng, x0, x1, cols, 0),
    zs = spacedLines(rng, z0, z1, rows, 0);
  const jitter = bs * 0.2;
  const P: Point[][] = xs.map((x, i) =>
    zs.map((z, j) => {
      const fx = i === 0 || i === cols - 1,
        fz = j === 0 || j === rows - 1;
      return [
        round(fx ? x : x + between(rng, -jitter, jitter)),
        round(fz ? z : z + between(rng, -jitter, jitter)),
      ];
    }),
  );
  const out: PlanLine[] = [];
  const bend = (a: Point, b: Point, w: number): Point => {
    const len = dist(a, b) || 1,
      off = between(rng, -w, w) * len;
    return [
      (a[0] + b[0]) / 2 - ((b[1] - a[1]) / len) * off,
      (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * off,
    ];
  };
  const run = (pts: Point[], edge: boolean, keep: number, suffix: string) => {
    const name = ctx.street(d, edge ? "Road" : suffix);
    const style = edge ? s.perimeter() : s.local();
    let current: Point[] = [];
    const flush = () => {
      if (current.length >= 2)
        out.push(
          line(
            d,
            current,
            name,
            style,
            edge ? "perimeter" : "local",
            edge ? 0.45 : 0.2,
          ),
        );
      current = [];
    };
    for (let m = 1; m < pts.length; m++) {
      if (!edge && rng() > keep) {
        flush();
        continue;
      }
      if (!current.length) current.push(pts[m - 1]);
      if (!edge) current.push(bend(pts[m - 1], pts[m], 0.12));
      current.push(pts[m]);
    }
    flush();
  };
  P.forEach((column, i) =>
    run(column, i === 0 || i === cols - 1, 0.88, "Lane"),
  );
  for (let j = 0; j < rows; j++)
    run(
      P.map((c) => c[j]),
      j === 0 || j === rows - 1,
      0.7,
      j % 2 ? "Row" : "Way",
    );
  const places: PatternResult["places"] = [];
  const mid = P[Math.floor(cols / 2)][Math.floor(rows / 2)];
  places.push({ name: ctx.place(d, d.kind.places), at: mid });
  return { lines: out, parks: [], places };
}

export function radialPattern(
  ctx: PatternContext,
  d: DistrictPlan,
): PatternResult {
  const { rng } = ctx;
  const out: PlanLine[] = [];
  const s = styles(ctx, d);
  perimeter(ctx, d, out);
  const [x0, x1, z0, z1] = d.box;
  const c = d.centre;
  const rMax = Math.min(x1 - x0, z1 - z0) / 2 - 8;
  const bs = d.kind.block * ctx.blockScale;
  const r0 = Math.max(18, Math.min(60, rMax * 0.2));
  const rings = [r0];
  const count = Math.max(1, Math.floor((rMax - r0) / (bs * 0.9)));
  for (let k = 1; k <= count; k++)
    rings.push(r0 + ((rMax - r0) * k) / (count + 0.25));
  const spokes = rMax > 260 ? 12 : 8;
  const phase = between(rng, 0, Math.PI / spokes);
  const angleOf = (i: number, n = spokes) => phase + (2 * Math.PI * i) / n;
  const SUB = 4;
  rings.forEach((r, k) => {
    const n = spokes * SUB * (k > 1 ? 2 : 1);
    const pts = Array.from({ length: n + 1 }, (_, i) => {
      const a = phase + (2 * Math.PI * (i % n)) / n;
      return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Point;
    });
    const inner = k === 0;
    out.push(
      line(
        d,
        pts,
        inner
          ? `${ctx.place(d, ["Circus", "Crescent", "Round"])}`
          : ctx.street(d, k % 2 ? "Crescent" : "Ring"),
        inner ? { ...s.perimeter(), width: 9 } : s.local(),
        "local",
        0.35,
      ),
    );
  });
  const exit = (a: number) => {
    const seg = lineInBox(c, [Math.cos(a), Math.sin(a)], d.box)!;
    const forward = [seg[0], seg[1]].find(
      (p) => (p[0] - c[0]) * Math.cos(a) + (p[1] - c[1]) * Math.sin(a) > 0,
    )!;
    return forward;
  };
  for (let i = 0; i < spokes; i++) {
    const a = angleOf(i);
    out.push(
      line(
        d,
        [[c[0] + r0 * Math.cos(a), c[1] + r0 * Math.sin(a)], exit(a)],
        ctx.street(d, i % 2 ? "Way" : "Avenue"),
        i % 2
          ? s.local()
          : { ...s.perimeter(), width: Math.max(11, d.kind.street) },
        "local",
        0.4,
      ),
    );
  }
  // Secondary spokes once the outer rings grow long.
  rings.forEach((r, k) => {
    if (k === 0 || (2 * Math.PI * r) / spokes < bs * 1.7) return;
    if (rings[k - 1] && (2 * Math.PI * rings[k - 1]) / spokes >= bs * 1.7)
      return;
    for (let i = 0; i < spokes; i++) {
      const a = angleOf(i + 0.5);
      out.push(
        line(
          d,
          [[c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)], exit(a)],
          ctx.street(d, "Lane"),
          s.local(),
          "local",
          0.25,
        ),
      );
    }
  });
  const plaza = ellipse(c, r0 - 7, r0 - 7, 16);
  const name = ctx.place(d, ["Circus", "Star", "Rotunda", "Plaza"]);
  return {
    lines: out,
    parks:
      r0 - 7 > 9
        ? [{ name, polygon: plaza, district: d.index, big: false }]
        : [],
    places: [{ name, at: [c[0] + r0, c[1]] }],
  };
}

export function parkPattern(
  ctx: PatternContext,
  d: DistrictPlan,
): PatternResult {
  const { rng } = ctx;
  const out: PlanLine[] = [];
  perimeter(ctx, d, out);
  const [x0, x1, z0, z1] = d.box;
  const c = d.centre;
  const hw = (x1 - x0) / 2,
    hd = (z1 - z0) / 2;
  const path = (): StreetStyle => ({
    roadClass: "path",
    lit: rng() < 0.5,
    scenic: 0.95,
    width: 4,
    kind: "footway",
  });
  const loopName = ctx.street(d, "Loop");
  out.push(
    line(
      d,
      (() => {
        const pts = ellipse(
          c,
          hw * 0.62,
          hd * 0.62,
          28,
          between(rng, 0, 1),
        ).map(
          (p, i) =>
            [
              p[0] + Math.sin(i * 1.7) * 4,
              p[1] + Math.cos(i * 1.3) * 4,
            ] as Point,
        );
        return [...pts, pts[0]];
      })(),
      loopName,
      path(),
      "park",
      0,
    ),
  );
  const wiggle = (a: Point, b: Point, n: number): Point[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const off =
        i && i < n ? between(rng, -1, 1) * Math.min(hw, hd) * 0.08 : 0;
      const len = dist(a, b) || 1;
      return [
        a[0] + (b[0] - a[0]) * t - ((b[1] - a[1]) / len) * off,
        a[1] + (b[1] - a[1]) * t + ((b[0] - a[0]) / len) * off,
      ] as Point;
    });
  out.push(
    line(
      d,
      wiggle([x0, c[1]], [x1, c[1]], 6),
      ctx.street(d, "Walk"),
      path(),
      "park",
      0.2,
    ),
    line(
      d,
      wiggle([c[0], z0], [c[0], z1], 6),
      ctx.street(d, "Walk"),
      path(),
      "park",
      0.2,
    ),
  );
  if (rng() < 0.7)
    out.push(
      line(
        d,
        wiggle([x0, z0], [x1, z1], 8),
        ctx.street(d, "Path"),
        path(),
        "park",
        0.1,
      ),
    );
  const inset = 9;
  const polygon: Point[] = [
    [x0 + inset, z0 + inset],
    [x1 - inset, z0 + inset],
    [x1 - inset, z1 - inset],
    [x0 + inset, z1 - inset],
  ];
  const places: PatternResult["places"] = [
    { name: ctx.place(d, ["Fountain", "Bandstand", "Meadow"]), at: c },
    { name: ctx.place(d, ["Gate", "Lodge", "Entrance"]), at: [x0, c[1]] },
  ];
  return {
    lines: out,
    parks: [{ name: d.spec.name, polygon, district: d.index, big: true }],
    places,
  };
}
