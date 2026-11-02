import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { LandmarkShape, SceneObject } from "../../../shared/types";
import { sc } from "../../lib/scene-theme";
import { hash } from "./geometry";

/*
 * Signature silhouettes for shaped landmarks, composed from a few shared unit
 * primitives. Every geometry here is built once, centred on the origin with
 * a 1 m extent, and scaled per part; materials are cached by colour. Nothing
 * runs per frame and no shape draws more than about thirty meshes.
 *
 * Local frame: width along x, depth along z, height up y from the ground.
 * Fronts (portals, porches, colonnades) face +z.
 */

type V3 = [number, number, number];
type GeoKey =
  | "box"
  | "cyl"
  | "oct"
  | "taper"
  | "cone"
  | "needle"
  | "pyramid"
  | "sphere"
  | "dome"
  | "prism"
  | "capsule"
  | "ring"
  | "arch"
  | "vault"
  | "halfDisc"
  | "disc"
  | "beam"
  | "bowlWall"
  | "bowlSeats"
  | "bowlRoof";

/** Tube radius of the unit arch; scale z by thickness / (2 × this). */
const ARCH_TUBE = 0.025;
/** Unit arch spans ±(0.5 + tube) and rises to 0.5 + tube. */
const ARCH_SPAN = 1 + ARCH_TUBE * 2;
const ARCH_RISE = 0.5 + ARCH_TUBE;

function prism() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5);
  s.lineTo(0.5, -0.5);
  s.lineTo(0, 0.5);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 1,
    bevelEnabled: false,
  }).translate(0, 0, -0.5);
}
const builders: Record<GeoKey, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  oct: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  taper: () => new THREE.CylinderGeometry(0.38, 0.5, 1, 14),
  cone: () => new THREE.ConeGeometry(0.5, 1, 20),
  needle: () => new THREE.ConeGeometry(0.5, 1, 8),
  // A square pyramid with a 1 × 1 base.
  pyramid: () =>
    new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 20),
  // Upper hemisphere stretched to a unit box: scale y by its rise.
  dome: () =>
    new THREE.SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      .translate(0, -0.25, 0)
      .scale(1, 2, 1),
  // Triangular prism, ridge along z, apex up.
  prism,
  capsule: () => new THREE.CapsuleGeometry(0.25, 0.5, 4, 10).scale(2, 1, 2),
  // A flat ring in the xz plane.
  ring: () => new THREE.TorusGeometry(0.5, 0.025, 8, 56).rotateX(Math.PI / 2),
  // A half ring in the xy plane, feet on y = 0.
  arch: () => new THREE.TorusGeometry(0.5, ARCH_TUBE, 8, 44, Math.PI),
  // A half cylinder along x, open, upper half stretched to a unit box.
  vault: () =>
    new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1, true, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .translate(0, -0.25, 0)
      .scale(1, 2, 1),
  halfDisc: () =>
    new THREE.CircleGeometry(0.5, 28, 0, Math.PI)
      .translate(0, -0.25, 0)
      .scale(1, 2, 1),
  disc: () => new THREE.CircleGeometry(0.5, 40),
  // An open cone with its apex at the origin, opening up to y = 1.
  beam: () =>
    new THREE.ConeGeometry(0.5, 1, 28, 1, true)
      .rotateX(Math.PI)
      .translate(0, 0.5, 0),
  bowlWall: () => new THREE.CylinderGeometry(0.5, 0.46, 1, 48, 1, true),
  bowlSeats: () => new THREE.CylinderGeometry(0.47, 0.29, 1, 48, 1, true),
  bowlRoof: () => new THREE.CylinderGeometry(0.39, 0.5, 1, 48, 1, true),
};
const geometries = new Map<GeoKey, THREE.BufferGeometry>();
function geometry(key: GeoKey) {
  let g = geometries.get(key);
  if (!g) {
    g = builders[key]();
    geometries.set(key, g);
  }
  return g;
}

interface Finish {
  rough?: number;
  metal?: number;
  /** Self-lit colour (windows, lamps, beams). */
  glow?: string;
  glowStrength?: number;
  opacity?: number;
  double?: boolean;
}
const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, f: Finish = {}) {
  const key = [
    color,
    f.rough ?? 0.8,
    f.metal ?? 0,
    f.glow ?? "",
    f.glowStrength ?? 1,
    f.opacity ?? 1,
    f.double ? 1 : 0,
  ].join("|");
  let m = materials.get(key);
  if (!m) {
    const transparent = (f.opacity ?? 1) < 1;
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: f.rough ?? 0.8,
      metalness: f.metal ?? 0,
      emissive: f.glow ?? "#000000",
      emissiveIntensity: f.glow ? (f.glowStrength ?? 1) : 0,
      transparent,
      opacity: f.opacity ?? 1,
      depthWrite: !transparent,
      side: f.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    materials.set(key, m);
  }
  return m;
}
const lineMaterials = new Map<string, THREE.LineBasicMaterial>();
function lineMat(color: string) {
  let m = lineMaterials.get(color);
  if (!m) {
    m = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
    });
    lineMaterials.set(color, m);
  }
  return m;
}
/** Mix two colours; t = 0 keeps `a`. */
function mix(a: string, b: string, t: number) {
  return "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
const lighter = (c: string, t: number) => mix(c, "#ffffff", t);
/** Dark façades (a noir or neon city) get lit openings and bands. */
const isDim = (c: string) => {
  const { r, g, b } = new THREE.Color(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.06;
};
const WARM = "#f2c46b";
const darker = (c: string, t: number) => mix(c, "#000000", t);
const noRaycast = () => {};

interface PartProps {
  g: GeoKey;
  m: THREE.Material;
  /** Centre of the part. */
  p: V3;
  /** Size of the part (the unit geometry's scale). */
  s: V3;
  r?: V3;
  /** Light and glass: no shadow, no picking. */
  ghost?: boolean;
  shadow?: boolean;
}
function Part({ g, m, p, s, r, ghost = false, shadow = !ghost }: PartProps) {
  return (
    <mesh
      geometry={geometry(g)}
      material={m}
      position={p}
      scale={s}
      rotation={r}
      castShadow={shadow}
      receiveShadow={!ghost}
      {...(ghost ? { raycast: noRaycast } : {})}
    />
  );
}
/** A box from `y0` up `height`, centred on x/z. */
function Block({
  m,
  x = 0,
  z = 0,
  y0,
  height,
  w,
  d,
}: {
  m: THREE.Material;
  x?: number;
  z?: number;
  y0: number;
  height: number;
  w: number;
  d: number;
}) {
  return <Part g="box" m={m} p={[x, y0 + height / 2, z]} s={[w, height, d]} />;
}

interface Ctx {
  w: number;
  d: number;
  h: number;
  /** Main colour: the object's, its fallback, or the selection tint. */
  body: string;
  seed: number;
  /** Named landmarks get a little more detail than shaped city fill. */
  hero: boolean;
  name: string;
}

/* ------------------------------------------------------------------ */

function Spire({ w, d, h, body, hero }: Ctx) {
  const stone = mat(body, { rough: 0.9 });
  const dark = mat(darker(body, 0.3), { rough: 0.9 });
  const trim = mat(lighter(body, 0.18), { rough: 0.85 });
  const slate = mat(mix(body, sc("#4a5262"), 0.55), { rough: 0.6, metal: 0.2 });
  const opening = mat(darker(body, 0.7), {
    glow: sc(WARM),
    glowStrength: isDim(body) ? 0.6 : 0.3,
  });
  const base = h * 0.1,
    shaftTop = h * 0.58,
    belfryTop = h * 0.7;
  const pierH = (shaftTop - base) * 0.82,
    pinnacle = h * 0.08;
  const slit = shaftTop - base;
  const corners: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  return (
    <>
      <Block m={stone} y0={0} height={base} w={w} d={d} />
      <Block
        m={stone}
        y0={base}
        height={shaftTop - base}
        w={w * 0.62}
        d={d * 0.62}
      />
      {/* A tall lit lancet up the middle of every face. */}
      <Block
        m={opening}
        y0={base + slit * 0.08}
        height={slit * 0.84}
        w={w * 0.64}
        d={d * 0.07}
      />
      <Block
        m={opening}
        y0={base + slit * 0.08}
        height={slit * 0.84}
        w={w * 0.07}
        d={d * 0.64}
      />
      {corners.map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <Block
            m={dark}
            x={sx * w * 0.41}
            z={sz * d * 0.41}
            y0={base}
            height={pierH}
            w={w * 0.16}
            d={d * 0.16}
          />
          <Part
            g="needle"
            m={slate}
            p={[sx * w * 0.41, base + pierH + pinnacle / 2, sz * d * 0.41]}
            s={[w * 0.17, pinnacle, d * 0.17]}
          />
          {hero && (
            // A flying buttress leaning from the pier onto the shaft.
            <group
              position={[sx * w * 0.35, base + pierH * 0.94, sz * d * 0.35]}
              rotation={[0, Math.atan2(-sz * d, sx * w), 0]}
            >
              <Part
                g="box"
                m={dark}
                p={[0, 0, 0]}
                s={[Math.hypot(w, d) * 0.1, h * 0.012, Math.min(w, d) * 0.05]}
                r={[0, 0, -0.5]}
              />
            </group>
          )}
        </group>
      ))}
      <Block
        m={trim}
        y0={shaftTop}
        height={belfryTop - shaftTop}
        w={w * 0.48}
        d={d * 0.48}
      />
      {/* Lancet openings through the belfry on all four faces. */}
      <Block
        m={opening}
        y0={shaftTop + (belfryTop - shaftTop) * 0.2}
        height={(belfryTop - shaftTop) * 0.6}
        w={w * 0.5}
        d={d * 0.16}
      />
      <Block
        m={opening}
        y0={shaftTop + (belfryTop - shaftTop) * 0.2}
        height={(belfryTop - shaftTop) * 0.6}
        w={w * 0.16}
        d={d * 0.5}
      />
      <Part
        g="needle"
        m={slate}
        p={[0, belfryTop + (h - belfryTop) / 2, 0]}
        s={[w * 0.44, h - belfryTop, d * 0.44]}
      />
    </>
  );
}

function Stepped({ w, d, h, body }: Ctx) {
  const wall = mat(body, { rough: 0.7, metal: 0.05 });
  const band = isDim(body)
    ? mat(lighter(body, 0.15), { glow: sc(WARM), glowStrength: 0.45 })
    : mat(lighter(body, 0.3), { rough: 0.6 });
  const crown = mat(mix(body, sc("#d8bd73"), 0.5), {
    rough: 0.4,
    metal: 0.3,
  });
  const tiers: [number, number][] =
    h > 110
      ? [
          [1, 0.42],
          [0.8, 0.64],
          [0.6, 0.8],
          [0.42, 0.9],
        ]
      : [
          [1, 0.5],
          [0.74, 0.74],
          [0.5, 0.88],
        ];
  let y = 0;
  const parts = tiers.map(([k, top], i) => {
    const y0 = y;
    y = top * h;
    const tierH = y - y0;
    return (
      <group key={i}>
        <Block m={wall} y0={y0} height={tierH} w={w * k} d={d * k} />
        <Block
          m={band}
          y0={y - h * 0.012}
          height={h * 0.014}
          w={w * k * 1.01}
          d={d * k * 1.01}
        />
        {i === 1 && (
          // Deco piers rising up the middle of each face.
          <>
            <Block
              m={band}
              y0={y0}
              height={tierH}
              w={w * k * 0.1}
              d={d * k * 1.03}
            />
            <Block
              m={band}
              y0={y0}
              height={tierH}
              w={w * k * 1.03}
              d={d * k * 0.1}
            />
          </>
        )}
      </group>
    );
  });
  const k = tiers.at(-1)![0];
  const capH = (h - y) * 0.55;
  return (
    <>
      {parts}
      <Part
        g="pyramid"
        m={crown}
        p={[0, y + capH / 2, 0]}
        s={[w * k * 0.86, capH, d * k * 0.86]}
      />
      <Part
        g="cyl"
        m={crown}
        p={[0, y + capH + (h - y - capH) / 2, 0]}
        s={[Math.min(w, d) * 0.035, h - y - capH, Math.min(w, d) * 0.035]}
      />
    </>
  );
}

function Globe({ w, d, h, body }: Ctx) {
  const wall = mat(body, { rough: 0.6, metal: 0.05 });
  const trim = mat(lighter(body, 0.3), { rough: 0.5 });
  const gold = mat(mix(body, sc("#e7c35c"), 0.65), {
    rough: 0.35,
    metal: 0.35,
  });
  const m = Math.min(w, d);
  const R = Math.min(m * 0.5, h * 0.14);
  const cy = h - R;
  const neck = cy - R * 0.8;
  const podium = h * 0.08;
  const t1 = podium + (neck - podium) * 0.62;
  const t2 = neck - R * 0.25;
  return (
    <>
      <Block m={wall} y0={0} height={podium} w={w} d={d} />
      <Block
        m={wall}
        y0={podium}
        height={t1 - podium}
        w={w * 0.78}
        d={d * 0.78}
      />
      <Block
        m={trim}
        y0={podium}
        height={(t1 - podium) * 0.96}
        w={w * 0.86}
        d={d * 0.1}
      />
      <Block
        m={trim}
        y0={podium}
        height={(t1 - podium) * 0.96}
        w={w * 0.1}
        d={d * 0.86}
      />
      <Block m={wall} y0={t1} height={t2 - t1} w={w * 0.58} d={d * 0.58} />
      <Part
        g="cyl"
        m={trim}
        p={[0, (t2 + cy) / 2, 0]}
        s={[R * 1.1, cy - t2, R * 1.1]}
      />
      <Part g="sphere" m={gold} p={[0, cy, 0]} s={[R * 2, R * 2, R * 2]} />
      <Part
        g="ring"
        m={trim}
        p={[0, cy, 0]}
        s={[R * 2.7, R * 3, R * 2.7]}
        r={[0.38, 0, 0.22]}
      />
      <Part
        g="ring"
        m={gold}
        p={[0, cy, 0]}
        s={[R * 2.06, R * 1.2, R * 2.06]}
        r={[Math.PI / 2, 0.5, 0]}
      />
    </>
  );
}

function Dome({ w, d, h, body }: Ctx) {
  const wall = mat(body, { rough: 0.85 });
  const trim = mat(lighter(body, 0.25), { rough: 0.75 });
  const roof = mat(mix(body, sc("#7fa797"), 0.55), {
    rough: 0.45,
    metal: 0.35,
  });
  const D = Math.min(w, d) * 0.72;
  const podium = h * 0.14,
    drumTop = h * 0.5,
    cornice = h * 0.025,
    domeTop = h * 0.9;
  const columns = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  return (
    <>
      <Block m={wall} y0={0} height={podium} w={w} d={d} />
      <Part
        g="cyl"
        m={wall}
        p={[0, (podium + drumTop) / 2, 0]}
        s={[D, drumTop - podium, D]}
      />
      {columns.map((a) => (
        <Part
          key={a}
          g="cyl"
          m={trim}
          p={[
            Math.cos(a) * D * 0.53,
            (podium + drumTop) / 2,
            Math.sin(a) * D * 0.53,
          ]}
          s={[D * 0.07, drumTop - podium, D * 0.07]}
        />
      ))}
      <Part
        g="cyl"
        m={trim}
        p={[0, drumTop + cornice / 2, 0]}
        s={[D * 1.16, cornice, D * 1.16]}
      />
      <Part
        g="dome"
        m={roof}
        p={[0, (drumTop + cornice + domeTop) / 2, 0]}
        s={[D, domeTop - drumTop - cornice, D]}
      />
      <Part
        g="oct"
        m={trim}
        p={[0, domeTop + (h - domeTop) * 0.3, 0]}
        s={[D * 0.14, (h - domeTop) * 0.6, D * 0.14]}
      />
      <Part
        g="cone"
        m={roof}
        p={[0, domeTop + (h - domeTop) * 0.8, 0]}
        s={[D * 0.17, (h - domeTop) * 0.4, D * 0.17]}
      />
    </>
  );
}

function Smokestacks({ w, d, h, body, seed }: Ctx) {
  const wall = mat(body, { rough: 0.95 });
  const roof = mat(darker(body, 0.35), { rough: 0.8 });
  const brick = mat(sc("#7a4a3a"), { rough: 0.95 });
  const band = mat(sc("#c9c2b4"), { rough: 0.8 });
  const n = 2 + (seed % 3);
  const hallH = h * 0.3,
    hallD = d * 0.62,
    hallZ = -d / 2 + hallD / 2;
  const saw = hallD / 3;
  const sd = Math.min(Math.min(w, d) * 0.16, d * 0.3, w / (n * 1.6));
  return (
    <>
      <Block m={wall} z={hallZ} y0={0} height={hallH} w={w} d={hallD} />
      {[0, 1, 2].map((i) => (
        <Part
          key={i}
          g="prism"
          m={roof}
          p={[0, hallH + h * 0.03, -d / 2 + saw * (i + 0.5)]}
          s={[saw, h * 0.06, w]}
          r={[0, Math.PI / 2, 0]}
        />
      ))}
      <Block
        m={roof}
        x={-w * 0.3}
        z={d * 0.3}
        y0={0}
        height={hallH * 0.6}
        w={w * 0.36}
        d={d * 0.3}
      />
      <Block
        m={roof}
        x={w * 0.22}
        z={d * 0.06}
        y0={hallH * 0.55}
        height={sd * 0.25}
        w={w * 0.5}
        d={sd * 0.25}
      />
      {Array.from({ length: n }, (_, i) => {
        const x = w * (-0.02 + (0.48 * (i + 0.5)) / n);
        const H = h * (1 - 0.07 * i);
        return (
          <group key={i}>
            <Part g="taper" m={brick} p={[x, H / 2, d * 0.3]} s={[sd, H, sd]} />
            <Part
              g="cyl"
              m={band}
              p={[x, H * 0.9, d * 0.3]}
              s={[sd * 0.86, H * 0.035, sd * 0.86]}
            />
          </group>
        );
      })}
    </>
  );
}

function Tanks({ w, d, h, body, seed }: Ctx) {
  const shell = mat(body, { rough: 0.55, metal: 0.25 });
  const cap = mat(lighter(body, 0.2), { rough: 0.5, metal: 0.25 });
  const steel = mat(sc("#4d5157"), { rough: 0.6, metal: 0.5 });
  const cols = w >= d * 1.6 ? 3 : 2,
    rows = d >= w * 1.6 ? 3 : 2;
  const D = Math.min(w / cols, d / rows) * 0.84;
  const tanks: [number, number, number][] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const k = i * rows + j;
      const H = k === 0 ? h : h * (0.62 + 0.12 * ((seed + k * 7) % 4));
      tanks.push([
        w * ((i + 0.5) / cols - 0.5),
        d * ((j + 0.5) / rows - 0.5),
        H,
      ]);
    }
  return (
    <>
      {tanks.map(([x, z, H], k) => {
        const capH = Math.min(H * 0.08, D * 0.22);
        return (
          <group key={k}>
            <Part
              g="cyl"
              m={shell}
              p={[x, (H - capH) / 2, z]}
              s={[D, H - capH, D]}
            />
            <Part g="dome" m={cap} p={[x, H - capH / 2, z]} s={[D, capH, D]} />
            <Part
              g="ring"
              m={steel}
              p={[x, H - capH, z]}
              s={[D * 1.08, Math.max(1, D * 0.04), D * 1.08]}
            />
          </group>
        );
      })}
      <Block
        m={steel}
        y0={h * 0.22}
        height={h * 0.03}
        w={w * 0.9}
        d={Math.min(w, d) * 0.04}
      />
      <Block
        m={steel}
        y0={h * 0.26}
        height={h * 0.03}
        w={Math.min(w, d) * 0.04}
        d={d * 0.9}
      />
    </>
  );
}

function Manor({ w, d, h, body }: Ctx) {
  const wall = mat(body, { rough: 0.9 });
  const trim = mat(lighter(body, 0.3), { rough: 0.85 });
  const roof = mat(mix(body, sc("#3a3f4a"), 0.65), { rough: 0.7, metal: 0.1 });
  const brick = mat(darker(body, 0.3), { rough: 0.95 });
  const lit = mat(sc("#2b2418"), { glow: sc("#ffc874"), glowStrength: 0.55 });
  const mainW = w * 0.48,
    mainD = d * 0.56,
    mainH = h * 0.42,
    mainZ = -d * 0.06;
  const front = mainZ + mainD / 2;
  const wingW = w * 0.26,
    wingD = d * 0.86,
    wingH = h * 0.34;
  const T = Math.min(w, d) * 0.2;
  return (
    <>
      <Block m={wall} z={mainZ} y0={0} height={mainH} w={mainW} d={mainD} />
      <Part
        g="prism"
        m={roof}
        p={[0, mainH + h * 0.15, mainZ]}
        s={[mainD * 1.04, h * 0.3, mainW * 1.04]}
        r={[0, Math.PI / 2, 0]}
      />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Block
            m={wall}
            x={sx * (w / 2 - wingW / 2)}
            y0={0}
            height={wingH}
            w={wingW}
            d={wingD}
          />
          <Part
            g="prism"
            m={roof}
            p={[sx * (w / 2 - wingW / 2), wingH + h * 0.12, 0]}
            s={[wingW * 1.06, h * 0.24, wingD * 1.02]}
          />
          <Block
            m={brick}
            x={sx * (w / 2 - wingW / 2)}
            z={-wingD * 0.3}
            y0={wingH}
            height={h * 0.3}
            w={wingW * 0.12}
            d={wingD * 0.06}
          />
          <Block
            m={brick}
            x={sx * mainW * 0.3}
            z={mainZ}
            y0={mainH}
            height={h * 0.38}
            w={mainW * 0.06}
            d={mainD * 0.08}
          />
          <Block
            m={lit}
            x={sx * (w / 2 - wingW / 2)}
            z={wingD / 2}
            y0={wingH * 0.45}
            height={wingH * 0.14}
            w={wingW * 0.7}
            d={0.3}
          />
        </group>
      ))}
      <Block
        m={lit}
        z={front}
        y0={mainH * 0.55}
        height={mainH * 0.1}
        w={mainW * 0.78}
        d={0.3}
      />
      <Block
        m={trim}
        z={front + d * 0.04}
        y0={0}
        height={mainH * 0.62}
        w={mainW * 0.36}
        d={d * 0.08}
      />
      <Part
        g="prism"
        m={trim}
        p={[0, mainH * 0.62 + h * 0.04, front + d * 0.04]}
        s={[mainW * 0.4, h * 0.08, d * 0.09]}
      />
      {/* The corner tower where the west wing meets the house. */}
      <Part
        g="oct"
        m={wall}
        p={[-mainW / 2, (h * 0.76) / 2, front - T * 0.3]}
        s={[T, h * 0.76, T]}
      />
      <Part
        g="needle"
        m={roof}
        p={[-mainW / 2, h * 0.76 + (h * 0.24) / 2, front - T * 0.3]}
        s={[T * 1.18, h * 0.24, T * 1.18]}
      />
    </>
  );
}

function Cathedral({ w, d, h, body }: Ctx) {
  const stone = mat(body, { rough: 0.92 });
  const dark = mat(darker(body, 0.25), { rough: 0.92 });
  const roof = mat(mix(body, sc("#465062"), 0.6), { rough: 0.6, metal: 0.15 });
  const rose = mat(sc("#3a2a1c"), {
    glow: sc("#ffb85c"),
    glowStrength: 0.7,
    double: true,
  });
  const portal = mat(darker(body, 0.65), { rough: 1 });
  const towerS = Math.min(w * 0.22, d * 0.14);
  const naveW = w * 0.4,
    naveH = h * 0.36,
    naveZ0 = -d * 0.4,
    naveZ1 = d / 2 - towerS * 0.35;
  const naveD = naveZ1 - naveZ0,
    naveZ = (naveZ0 + naveZ1) / 2;
  const crossZ = -d * 0.18,
    transD = d * 0.16;
  const apseR = Math.min(naveW / 2, d * 0.1);
  const towerH = h * 0.6;
  return (
    <>
      <Block m={stone} z={naveZ} y0={0} height={naveH} w={naveW} d={naveD} />
      <Part
        g="prism"
        m={roof}
        p={[0, naveH + h * 0.08, naveZ]}
        s={[naveW * 1.06, h * 0.16, naveD]}
      />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Block
            m={dark}
            x={sx * (naveW / 2 + w * 0.08)}
            z={naveZ}
            y0={0}
            height={h * 0.22}
            w={w * 0.16}
            d={naveD * 0.86}
          />
          {[0.05, 0.3].map((f) => (
            <Part
              key={f}
              g="needle"
              m={roof}
              p={[sx * (naveW / 2 + w * 0.15), h * 0.22 + h * 0.06, d * f]}
              s={[w * 0.035, h * 0.12, w * 0.035]}
            />
          ))}
          <Block
            m={stone}
            x={sx * (naveW / 2)}
            z={d / 2 - towerS / 2}
            y0={0}
            height={towerH}
            w={towerS}
            d={towerS}
          />
          <Part
            g="needle"
            m={roof}
            p={[
              sx * (naveW / 2),
              towerH + (h - towerH) / 2,
              d / 2 - towerS / 2,
            ]}
            s={[towerS * 0.92, h - towerH, towerS * 0.92]}
          />
        </group>
      ))}
      <Block
        m={stone}
        z={crossZ}
        y0={0}
        height={naveH * 0.95}
        w={w}
        d={transD}
      />
      <Part
        g="prism"
        m={roof}
        p={[0, naveH * 0.95 + h * 0.07, crossZ]}
        s={[transD * 1.06, h * 0.14, w]}
        r={[0, Math.PI / 2, 0]}
      />
      <Part
        g="cyl"
        m={stone}
        p={[0, (naveH * 0.9) / 2, naveZ0]}
        s={[apseR * 2, naveH * 0.9, apseR * 2]}
      />
      <Part
        g="cone"
        m={roof}
        p={[0, naveH * 0.9 + h * 0.06, naveZ0]}
        s={[apseR * 2.1, h * 0.12, apseR * 2.1]}
      />
      <Part
        g="needle"
        m={roof}
        p={[0, naveH + h * 0.16 + h * 0.17, crossZ]}
        s={[w * 0.08, h * 0.34, w * 0.08]}
      />
      <Part
        g="disc"
        m={rose}
        p={[0, naveH * 0.72, naveZ1 + 0.06]}
        s={[naveW * 0.46, naveW * 0.46, 1]}
        shadow={false}
      />
      <Block
        m={portal}
        z={naveZ1}
        y0={0}
        height={naveH * 0.38}
        w={naveW * 0.3}
        d={0.5}
      />
    </>
  );
}

function Signal({ w, d, h, body }: Ctx) {
  const wall = mat(body, { rough: 0.85 });
  const trim = mat(lighter(body, 0.22), { rough: 0.7 });
  const steel = mat(sc("#3b3f46"), { rough: 0.45, metal: 0.6 });
  const door = mat(darker(body, 0.6), { rough: 1 });
  const lamp = mat(sc("#20301f"), { glow: sc("#7dff8a"), glowStrength: 1.2 });
  const face = mat(sc("#fff6d8"), { glow: sc("#fff1c2"), glowStrength: 2 });
  const beam = mat(sc("#000000"), {
    glow: sc("#ffe9a8"),
    glowStrength: 1,
    opacity: 0.16,
    double: true,
  });
  const halo = mat(sc("#000000"), {
    glow: sc("#ffe9a8"),
    glowStrength: 1,
    opacity: 0.1,
    double: true,
  });
  const m = Math.min(w, d);
  const baseH = h * 0.62,
    upperTop = h * 0.88;
  const L = Math.max(h * 4, 140),
    spread = L * 0.13;
  const lampD = m * 0.18,
    lampLen = m * 0.14;
  return (
    <>
      <Block m={wall} y0={0} height={baseH} w={w} d={d} />
      <Block
        m={trim}
        y0={baseH - h * 0.03}
        height={h * 0.04}
        w={w * 1.01}
        d={d * 1.01}
      />
      <Block
        m={wall}
        y0={baseH}
        height={upperTop - baseH}
        w={w * 0.66}
        d={d * 0.66}
      />
      <Block m={door} z={d / 2} y0={0} height={h * 0.2} w={w * 0.22} d={0.6} />
      {[-1, 1].map((sx) => (
        <Part
          key={sx}
          g="sphere"
          m={lamp}
          p={[sx * w * 0.16, h * 0.16, d / 2 + 0.6]}
          s={[m * 0.05, m * 0.05, m * 0.05]}
          shadow={false}
        />
      ))}
      <Part
        g="cyl"
        m={steel}
        p={[w * 0.1, h * 0.9, d * 0.08]}
        s={[m * 0.1, h * 0.04, m * 0.1]}
      />
      <Part
        g="cyl"
        m={steel}
        p={[-w * 0.22, upperTop + h * 0.14, -d * 0.18]}
        s={[m * 0.015, h * 0.28, m * 0.015]}
      />
      {/* The searchlight, tipped back and aside, its beam up into the sky. */}
      <group
        position={[w * 0.1, h * 0.92 + lampD / 2, d * 0.08]}
        rotation={[-0.32, 0, 0.2]}
      >
        <Part g="cyl" m={steel} p={[0, 0, 0]} s={[lampD, lampLen, lampD]} />
        <Part
          g="disc"
          m={face}
          p={[0, lampLen / 2 + 0.05, 0]}
          s={[lampD * 0.86, lampD * 0.86, 1]}
          r={[-Math.PI / 2, 0, 0]}
          shadow={false}
        />
        <Part
          g="beam"
          m={beam}
          p={[0, lampLen / 2, 0]}
          s={[spread * 2, L, spread * 2]}
          ghost
        />
        <Part
          g="disc"
          m={halo}
          p={[0, lampLen / 2 + L, 0]}
          s={[spread * 2.3, spread * 2.3, 1]}
          r={[-Math.PI / 2, 0, 0]}
          ghost
        />
      </group>
    </>
  );
}

function Hall({ w, d, h, body }: Ctx) {
  const marble = mat(body, { rough: 0.6 });
  const trim = mat(lighter(body, 0.35), { rough: 0.5 });
  const dome = mat(mix(body, sc("#d9b866"), 0.6), { rough: 0.35, metal: 0.3 });
  const plinth = h * 0.08,
    colH = h * 0.36,
    lintel = h * 0.05;
  const top = plinth + colH + lintel;
  const D = Math.min(w, d) * 0.42;
  const n = Math.max(6, Math.min(10, Math.round(w / Math.max(4, h * 0.1))));
  const colD = Math.min(w * 0.045, (w * 0.84) / n / 2);
  return (
    <>
      <Block m={trim} y0={0} height={plinth / 2} w={w} d={d} />
      <Block
        m={trim}
        y0={plinth / 2}
        height={plinth / 2}
        w={w * 0.95}
        d={d * 0.95}
      />
      <Block
        m={marble}
        z={-d * 0.08}
        y0={plinth}
        height={colH}
        w={w * 0.78}
        d={d * 0.66}
      />
      {Array.from({ length: n }, (_, i) => (
        <Part
          key={i}
          g="cyl"
          m={trim}
          p={[w * (-0.42 + (0.84 * i) / (n - 1)), plinth + colH / 2, d * 0.4]}
          s={[colD, colH, colD]}
        />
      ))}
      <Block
        m={trim}
        y0={plinth + colH}
        height={lintel}
        w={w * 0.9}
        d={d * 0.86}
      />
      <Part
        g="prism"
        m={marble}
        p={[0, top + h * 0.055, 0]}
        s={[w * 0.9, h * 0.11, d * 0.86]}
      />
      <Part
        g="cyl"
        m={marble}
        p={[0, (top + h * 0.66) / 2, -d * 0.05]}
        s={[D, h * 0.66 - top, D]}
      />
      <Part
        g="dome"
        m={dome}
        p={[0, h * 0.66 + (h * 0.28) / 2, -d * 0.05]}
        s={[D * 0.98, h * 0.28, D * 0.98]}
      />
      <Part
        g="oct"
        m={trim}
        p={[0, h * 0.97, -d * 0.05]}
        s={[D * 0.12, h * 0.06, D * 0.12]}
      />
    </>
  );
}

function Arena({ w, d, h, body }: Ctx) {
  const shell = mat(body, { rough: 0.7, double: true });
  const seats = mat(darker(body, 0.25), { rough: 0.9, double: true });
  const roof = mat(lighter(body, 0.35), {
    rough: 0.5,
    metal: 0.2,
    double: true,
  });
  const pitch = mat(sc("#5f8f52"), { rough: 0.95 });
  const steel = mat(sc("#4d5157"), { rough: 0.5, metal: 0.5 });
  const lamp = mat(sc("#fffbe8"), { glow: sc("#fffbe8"), glowStrength: 1.4 });
  const corners: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const trim = mat(lighter(body, 0.22), { rough: 0.6 });
  const m = Math.min(w, d);
  const bays = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
  return (
    <>
      <Part g="bowlWall" m={shell} p={[0, h * 0.42, 0]} s={[w, h * 0.84, d]} />
      {/* Pilasters round the shell and a cornice ring on top. */}
      {bays.map((a) => (
        <Part
          key={a}
          g="box"
          m={trim}
          p={[Math.cos(a) * w * 0.483, h * 0.42, Math.sin(a) * d * 0.483]}
          s={[m * 0.035, h * 0.84, m * 0.035]}
          r={[0, -Math.atan2(Math.sin(a) * w, Math.cos(a) * d), 0]}
        />
      ))}
      <Part
        g="ring"
        m={trim}
        p={[0, h * 0.84, 0]}
        s={[w * 0.98, h * 0.6, d * 0.98]}
      />
      <Part g="bowlSeats" m={seats} p={[0, h * 0.45, 0]} s={[w, h * 0.8, d]} />
      <Part
        g="cyl"
        m={pitch}
        p={[0, h * 0.06, 0]}
        s={[w * 0.6, h * 0.02, d * 0.6]}
      />
      <Part g="bowlRoof" m={roof} p={[0, h * 0.89, 0]} s={[w, h * 0.1, d]} />
      {corners.map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <Part
            g="cyl"
            m={steel}
            p={[sx * w * 0.3, h * 0.48, sz * d * 0.3]}
            s={[m * 0.02, h * 0.96, m * 0.02]}
          />
          <Part
            g="box"
            m={lamp}
            p={[sx * w * 0.3, h * 0.97, sz * d * 0.3]}
            s={[m * 0.07, h * 0.05, m * 0.03]}
            r={[0, Math.atan2(sx * w, sz * d), 0]}
            shadow={false}
          />
        </group>
      ))}
    </>
  );
}

function Statue({ w, d, h, body }: Ctx) {
  const bronze = mat(body, { rough: 0.4, metal: 0.35 });
  const stone = mat(sc("#d8d2c4"), { rough: 0.85 });
  const stoneDark = mat(sc("#b9b2a2"), { rough: 0.85 });
  const y0 = h * 0.44;
  const F = Math.min(h * 0.5, Math.min(w, d) * 1.8);
  return (
    <>
      <Block m={stoneDark} y0={0} height={h * 0.1} w={w * 0.92} d={d * 0.92} />
      <Block
        m={stone}
        y0={h * 0.1}
        height={h * 0.32}
        w={w * 0.58}
        d={d * 0.58}
      />
      <Block
        m={stoneDark}
        y0={h * 0.42}
        height={h * 0.02}
        w={w * 0.66}
        d={d * 0.66}
      />
      {[-1, 1].map((sx) => (
        <Part
          key={sx}
          g="capsule"
          m={bronze}
          p={[sx * F * 0.07, y0 + F * 0.24, 0]}
          s={[F * 0.11, F * 0.5, F * 0.12]}
          r={[0, 0, sx * 0.07]}
        />
      ))}
      <Part
        g="capsule"
        m={bronze}
        p={[0, y0 + F * 0.64, 0]}
        s={[F * 0.27, F * 0.38, F * 0.16]}
      />
      <Part
        g="sphere"
        m={bronze}
        p={[0, y0 + F * 0.88, 0]}
        s={[F * 0.13, F * 0.15, F * 0.13]}
      />
      {/* One fist raised to the sky, the other on the hip. */}
      <Part
        g="capsule"
        m={bronze}
        p={[F * 0.17, y0 + F * 0.92, 0]}
        s={[F * 0.08, F * 0.36, F * 0.08]}
        r={[0, 0, -0.18]}
      />
      <Part
        g="sphere"
        m={bronze}
        p={[F * 0.2, y0 + F * 1.08, 0]}
        s={[F * 0.09, F * 0.09, F * 0.09]}
      />
      <Part
        g="capsule"
        m={bronze}
        p={[-F * 0.17, y0 + F * 0.6, F * 0.02]}
        s={[F * 0.08, F * 0.3, F * 0.08]}
        r={[0, 0, 0.55]}
      />
      <Part
        g="box"
        m={bronze}
        p={[0, y0 + F * 0.5, -F * 0.13]}
        s={[F * 0.34, F * 0.56, F * 0.025]}
        r={[0.2, 0, 0]}
      />
    </>
  );
}

const RAINBOW = [
  "#ff4b4b",
  "#ff9a3c",
  "#ffe14d",
  "#5fd068",
  "#4fb4ff",
  "#5b6cff",
  "#b06bff",
];
/**
 * Three bridges by proportion, the span along the longer side: a tall
 * suspension bridge, a mid arch bridge and a low viaduct (an elevated rail).
 * Names with "rainbow" draw a rainbow arch bridge.
 */
function Bridge({ w, d, h, body, seed, name }: Ctx) {
  const L = Math.max(w, d),
    B = Math.min(w, d);
  const ratio = h / L;
  const kind = ratio >= 0.25 ? "suspension" : ratio >= 0.1 ? "arch" : "viaduct";
  const rainbow = /rainbow/i.test(name);
  const deck = mat(body, { rough: 0.7, metal: 0.15 });
  const steel = mat(darker(body, 0.3), { rough: 0.5, metal: 0.45 });
  const trim = mat(lighter(body, 0.3), { rough: 0.5, metal: 0.2 });
  const cable = darker(body, 0.15);
  const deckT = Math.min(2.5, Math.max(0.8, h * 0.03));
  const deckY =
    kind === "viaduct" ? h * 0.86 : Math.min(14, Math.max(3, h * 0.2));
  const n = Math.max(2, Math.min(9, Math.round(L / 22)));

  const lines = useMemo(() => {
    const pts: number[] = [];
    const seg = (a: V3, b: V3) => pts.push(...a, ...b);
    const top = deckY + deckT / 2;
    if (kind === "suspension") {
      const tx = L * 0.3,
        peak = h * 0.97,
        sag = top + h * 0.06;
      const y = (x: number) =>
        Math.abs(x) <= tx
          ? sag + (peak - sag) * (x / tx) ** 2
          : peak + ((top - peak) * (Math.abs(x) - tx)) / (L / 2 - tx);
      for (const z of [-B * 0.42, B * 0.42]) {
        const steps = 40;
        for (let i = 0; i < steps; i++) {
          const x0 = -L / 2 + (L * i) / steps,
            x1 = -L / 2 + (L * (i + 1)) / steps;
          seg([x0, y(x0), z], [x1, y(x1), z]);
        }
        for (let x = -tx + L / 40; x < tx; x += L / 40)
          seg([x, top, z], [x, y(x), z]);
      }
    } else if (kind === "arch" && !rainbow) {
      // Hangers from the arch's centre line down to the deck.
      const a = (0.5 * L) / ARCH_SPAN,
        b = (0.5 * h) / ARCH_RISE;
      for (const z of [-B * 0.38, B * 0.38])
        for (let x = -a * 0.9; x <= a * 0.9; x += L / 18) {
          const ay = b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2));
          if (ay > top + 1) seg([x, top, z], [x, ay, z]);
        }
    } else if (kind === "viaduct") {
      // Lattice girders: a cross in every bay on both sides.
      const bottom = deckY - deckT * 1.6;
      for (const z of [-B * 0.46, B * 0.46])
        for (let i = 0; i < n * 2; i++) {
          const x0 = -L / 2 + (L * i) / (n * 2),
            x1 = -L / 2 + (L * (i + 1)) / (n * 2);
          seg([x0, bottom, z], [x1, top, z]);
          seg([x0, top, z], [x1, bottom, z]);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [kind, rainbow, L, B, h, deckY, deckT, n]);
  useEffect(() => () => lines.dispose(), [lines]);

  let parts: ReactNode;
  if (kind === "suspension") {
    parts = (
      <>
        <Part g="box" m={deck} p={[0, deckY, 0]} s={[L, deckT, B * 0.8]} />
        {[-1, 1].map((sz) => (
          <Part
            key={sz}
            g="box"
            m={trim}
            p={[0, deckY + deckT, sz * B * 0.4]}
            s={[L, deckT * 0.7, B * 0.04]}
          />
        ))}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * L * 0.3, 0, 0]}>
            {[-1, 1].map((sz) => (
              <group key={sz}>
                <Part
                  g="box"
                  m={steel}
                  p={[0, h * 0.47, sz * B * 0.42]}
                  s={[B * 0.13, h * 0.94, B * 0.13]}
                />
                <Part
                  g="pyramid"
                  m={trim}
                  p={[0, h * 0.97, sz * B * 0.42]}
                  s={[B * 0.15, h * 0.06, B * 0.15]}
                />
              </group>
            ))}
            {[0.6, 0.9].map((f) => (
              <Part
                key={f}
                g="box"
                m={steel}
                p={[0, h * f, 0]}
                s={[B * 0.1, h * 0.045, B * 0.84]}
              />
            ))}
          </group>
        ))}
      </>
    );
  } else if (kind === "arch") {
    const band = (B * 0.8) / RAINBOW.length;
    parts = rainbow ? (
      <>
        {RAINBOW.map((c, i) => {
          const z = -B * 0.4 + band * (i + 0.5);
          const glow = mat(c, { rough: 0.4, glow: c, glowStrength: 0.35 });
          return (
            <group key={c}>
              <Part g="box" m={glow} p={[0, deckY, z]} s={[L, deckT, band]} />
              {/* Concentric bands, red outermost, so it reads from the side. */}
              <Part
                g="arch"
                m={glow}
                p={[0, 0, 0]}
                s={[
                  (L * (1 - i * 0.075)) / ARCH_SPAN,
                  (h * (1 - i * 0.085)) / ARCH_RISE,
                  (B * 0.8 * (1 - i * 0.03)) / (ARCH_TUBE * 2),
                ]}
              />
            </group>
          );
        })}
        {[-1, 1].map((sx) => (
          <Part
            key={sx}
            g="box"
            m={deck}
            p={[sx * (L / 2 - B * 0.15), deckY / 2 + deckT, 0]}
            s={[B * 0.3, deckY + deckT * 2, B * 0.92]}
          />
        ))}
      </>
    ) : (
      <>
        <Part g="box" m={deck} p={[0, deckY, 0]} s={[L, deckT, B * 0.8]} />
        {[-1, 1].map((sz) => (
          <group key={sz}>
            <Part
              g="arch"
              m={steel}
              p={[0, 0, sz * B * 0.38]}
              s={[L / ARCH_SPAN, h / ARCH_RISE, (B * 0.1) / (ARCH_TUBE * 2)]}
            />
            <Part
              g="box"
              m={trim}
              p={[0, deckY + deckT, sz * B * 0.4]}
              s={[L, deckT * 0.7, B * 0.04]}
            />
          </group>
        ))}
        {[-1, 1].map((sx) => (
          <Part
            key={sx}
            g="box"
            m={steel}
            p={[sx * (L / 2 - B * 0.1), deckY / 2, 0]}
            s={[B * 0.2, deckY, B * 0.9]}
          />
        ))}
      </>
    );
  } else {
    const pierW = Math.min(2.2, (L / n) * 0.12);
    const car = mat(sc("#5d6168"), { rough: 0.5, metal: 0.4 });
    const windows = mat(sc("#2a2418"), {
      glow: sc("#ffd27a"),
      glowStrength: 0.8,
    });
    const carL = Math.min(18, L * 0.22),
      carH = Math.max(2.6, h * 0.18);
    parts = (
      <>
        <Part g="box" m={deck} p={[0, deckY, 0]} s={[L, deckT, B * 0.9]} />
        {[-1, 1].map((sz) => (
          <group key={sz}>
            <Part
              g="box"
              m={steel}
              p={[0, deckY - deckT * 0.6, sz * B * 0.46]}
              s={[L, deckT * 1.4, B * 0.05]}
            />
            <Part
              g="box"
              m={trim}
              p={[0, deckY + deckT * 0.6, sz * B * 0.18]}
              s={[L, deckT * 0.25, B * 0.05]}
            />
          </group>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <Part
            key={i}
            g="box"
            m={steel}
            p={[-L / 2 + (L * (i + 0.5)) / n, (deckY - deckT / 2) / 2, 0]}
            s={[pierW, deckY - deckT / 2, B * 0.72]}
          />
        ))}
        {seed % 3 === 0 &&
          [0, 1].map((k) => {
            const x = -L * 0.25 + k * (carL + 1);
            const y = deckY + deckT / 2 + carH / 2 + deckT * 0.25;
            return (
              <group key={k}>
                <Part g="box" m={car} p={[x, y, 0]} s={[carL, carH, B * 0.5]} />
                <Part
                  g="box"
                  m={windows}
                  p={[x, y + carH * 0.12, 0]}
                  s={[carL * 0.9, carH * 0.25, B * 0.52]}
                  shadow={false}
                />
              </group>
            );
          })}
      </>
    );
  }
  return (
    <group rotation={[0, d > w ? Math.PI / 2 : 0, 0]}>
      {parts}
      <lineSegments
        geometry={lines}
        material={lineMat(cable)}
        raycast={noRaycast}
      />
    </group>
  );
}

function Pyramid({ w, d, h, body }: Ctx) {
  const stone = mat(body, { rough: 0.75, metal: 0.05 });
  const trim = mat(darker(body, 0.15), { rough: 0.9 });
  const cap = mat(mix(body, sc("#e7c35c"), 0.7), { rough: 0.35, metal: 0.35 });
  const door = mat(darker(body, 0.6), { rough: 1 });
  const base = h * 0.03;
  const capH = h * 0.1;
  const k = capH / (h - base);
  return (
    <>
      <Block m={trim} y0={0} height={base} w={w} d={d} />
      <Part
        g="pyramid"
        m={stone}
        p={[0, base + (h - base) / 2, 0]}
        s={[w * 0.96, h - base, d * 0.96]}
      />
      <Part
        g="pyramid"
        m={cap}
        p={[0, h - capH / 2 + 0.05, 0]}
        s={[w * 0.96 * k * 1.06, capH, d * 0.96 * k * 1.06]}
      />
      <Block
        m={door}
        z={d * 0.4}
        y0={base}
        height={h * 0.1}
        w={w * 0.1}
        d={d * 0.1}
      />
    </>
  );
}

function WindTower({ w, d, h, body }: Ctx) {
  const wall = mat(body, { rough: 0.95 });
  const trim = mat(lighter(body, 0.18), { rough: 0.9 });
  const vent = mat(darker(body, 0.65), { rough: 1 });
  const shaftTop = h * 0.8,
    headTop = h * 0.95;
  const slotY = shaftTop + (headTop - shaftTop) * 0.15,
    slotH = (headTop - shaftTop) * 0.7;
  return (
    <>
      <Block m={wall} y0={0} height={h * 0.08} w={w} d={d} />
      <Block
        m={wall}
        y0={h * 0.08}
        height={shaftTop - h * 0.08}
        w={w * 0.7}
        d={d * 0.7}
      />
      <Block
        m={trim}
        y0={shaftTop}
        height={headTop - shaftTop}
        w={w * 0.84}
        d={d * 0.84}
      />
      {[-0.26, 0, 0.26].map((f) => (
        <group key={f}>
          <Block
            m={vent}
            x={w * f}
            y0={slotY}
            height={slotH}
            w={w * 0.08}
            d={d * 0.88}
          />
          <Block
            m={vent}
            z={d * f}
            y0={slotY}
            height={slotH}
            w={w * 0.88}
            d={d * 0.08}
          />
        </group>
      ))}
      <Block
        m={trim}
        y0={headTop}
        height={h * 0.025}
        w={w * 0.94}
        d={d * 0.94}
      />
      <Part
        g="pyramid"
        m={wall}
        p={[0, headTop + h * 0.025 + (h * 0.025) / 2, 0]}
        s={[w * 0.6, h * 0.025, d * 0.6]}
      />
    </>
  );
}

function Glasshouse({ w, d, h, body }: Ctx) {
  const L = Math.max(w, d),
    B = Math.min(w, d);
  const glass = mat(lighter(body, 0.2), {
    rough: 0.08,
    metal: 0.2,
    opacity: 0.34,
    double: true,
  });
  const rib = mat(sc("#f4f6f2"), { rough: 0.5, metal: 0.3 });
  const stone = mat(sc("#d8d2c4"), { rough: 0.85 });
  const leaf = mat(sc("#3f8f45"), { rough: 0.9 });
  const base = h * 0.06,
    rise = h * 0.6,
    domeRise = h * 0.86;
  const VB = B * 0.9,
    VL = L * 0.96,
    DD = B * 0.84;
  const ribs = Math.max(4, Math.min(9, Math.round(VL / (VB * 0.35))));
  const ribT = Math.max(0.4, B * 0.012);
  return (
    <group rotation={[0, d > w ? Math.PI / 2 : 0, 0]}>
      <Block m={stone} y0={0} height={base} w={L} d={B} />
      <Part
        g="vault"
        m={glass}
        p={[0, base + rise / 2, 0]}
        s={[VL, rise, VB]}
        ghost
      />
      {[-1, 1].map((sx) => (
        <Part
          key={sx}
          g="halfDisc"
          m={glass}
          p={[(sx * VL) / 2, base + rise / 2, 0]}
          s={[VB, rise, 1]}
          r={[0, Math.PI / 2, 0]}
          ghost
        />
      ))}
      <Part
        g="dome"
        m={glass}
        p={[0, base + domeRise / 2, 0]}
        s={[DD, domeRise, DD]}
        ghost
      />
      {Array.from({ length: ribs }, (_, i) => (
        <Part
          key={i}
          g="arch"
          m={rib}
          p={[-VL / 2 + (VL * i) / (ribs - 1), base, 0]}
          s={[VB / ARCH_SPAN, rise / ARCH_RISE, ribT / (ARCH_TUBE * 2)]}
          r={[0, Math.PI / 2, 0]}
        />
      ))}
      {[0, Math.PI / 2].map((a) => (
        <Part
          key={a}
          g="arch"
          m={rib}
          p={[0, base, 0]}
          s={[DD / ARCH_SPAN, domeRise / ARCH_RISE, ribT / (ARCH_TUBE * 2)]}
          r={[0, a, 0]}
        />
      ))}
      <Part
        g="oct"
        m={rib}
        p={[0, base + domeRise + (h - base - domeRise) / 2, 0]}
        s={[B * 0.08, Math.max(0.5, h - base - domeRise), B * 0.08]}
      />
      {[-0.3, 0, 0.3].map((f) => (
        <Part
          key={f}
          g="sphere"
          m={leaf}
          p={[VL * f, base + rise * 0.3, f ? B * 0.12 : -B * 0.1]}
          s={[B * 0.34, rise * 0.55, B * 0.34]}
        />
      ))}
    </group>
  );
}

const DRAW: Record<LandmarkShape, (ctx: Ctx) => ReactNode> = {
  spire: Spire,
  dome: Dome,
  globe: Globe,
  stepped: Stepped,
  smokestacks: Smokestacks,
  tanks: Tanks,
  manor: Manor,
  cathedral: Cathedral,
  signal: Signal,
  hall: Hall,
  arena: Arena,
  statue: Statue,
  bridge: Bridge,
  pyramid: Pyramid,
  "wind-tower": WindTower,
  glasshouse: Glasshouse,
};
/** Colours for shaped objects that bring none of their own. */
const FALLBACK: Record<LandmarkShape, string> = {
  spire: "#45434a",
  dome: "#e6dccb",
  globe: "#e9d9a6",
  stepped: "#e3d6bd",
  smokestacks: "#6b5a4e",
  tanks: "#c9c7bd",
  manor: "#6d6258",
  cathedral: "#5b5650",
  signal: "#4c5058",
  hall: "#efe8d8",
  arena: "#d9d3c4",
  statue: "#b08d57",
  bridge: "#8c8f94",
  pyramid: "#d8c08c",
  "wind-tower": "#c99a62",
  glasshouse: "#d8efe6",
};

/** The silhouette for an object's `shape`, in the object's local frame. */
export default function LandmarkShapeModel({
  object,
  shape,
  selected,
}: {
  object: SceneObject;
  shape: LandmarkShape;
  selected: boolean;
}) {
  const Draw = DRAW[shape];
  return (
    // Geometries and materials are shared across landmarks: never dispose.
    <group dispose={null}>
      <Draw
        w={object.width}
        d={object.depth}
        h={object.height}
        body={selected ? sc("#b4c2a9") : object.color || sc(FALLBACK[shape])}
        seed={hash(object.id)}
        hero={object.kind === "landmark"}
        name={object.name}
      />
    </group>
  );
}
