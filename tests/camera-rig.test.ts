import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bearingOf, clampToArea } from "../src/components/scene/CameraRig";

const v = (x: number, z: number) => new THREE.Vector3(x, 50, z);

describe("map camera helpers", () => {
  it("reads the compass bearing the camera faces (north is -z)", () => {
    const target = new THREE.Vector3(0, 0, 0);
    expect(bearingOf(v(0, 100), target)).toBeCloseTo(0); // south of it: north
    expect(bearingOf(v(-100, 0), target)).toBeCloseTo(90); // west: east
    expect(bearingOf(v(0, -100), target)).toBeCloseTo(180);
    expect(bearingOf(v(100, 0), target)).toBeCloseTo(270);
    expect(bearingOf(v(100, 100), target)).toBeCloseTo(315); // the default view
    // Straight overhead has no heading; call it north.
    expect(bearingOf(new THREE.Vector3(0, 80, 0), target)).toBe(0);
  });
  it("pulls a target outside the area back to its edge", () => {
    expect(clampToArea(new THREE.Vector3(100, 0, 0), 500)).toBeNull();
    const shift = clampToArea(new THREE.Vector3(600, 0, 800), 500)!;
    const back = new THREE.Vector3(600, 0, 800).add(shift);
    expect(Math.hypot(back.x, back.z)).toBeCloseTo(500);
    expect(back.x / back.z).toBeCloseTo(600 / 800);
  });
});
