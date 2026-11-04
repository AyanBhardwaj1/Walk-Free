import { describe, expect, it } from "vitest";
import { crownsOnPath, distanceToLine } from "../src/lib/polyline";

describe("crowns on a street walk", () => {
  it("measures distance to the nearest segment", () => {
    expect(
      distanceToLine(
        [5, 3],
        [
          [0, 0],
          [10, 0],
        ],
      ),
    ).toBe(3);
    expect(
      distanceToLine(
        [-4, 3],
        [
          [0, 0],
          [10, 0],
        ],
      ),
    ).toBe(5);
  });
  it("hides only the crowns the walker would pass through", () => {
    const tree = (id: string, x: number, z: number) => ({
      id,
      position: [x, z] as [number, number],
      width: 8,
      depth: 8,
    });
    const hit = crownsOnPath(
      [tree("over", 20, 2), tree("beside", 20, 12)],
      [
        [0, 0],
        [40, 0],
      ],
    );
    expect([...hit]).toEqual(["over"]);
  });
});
