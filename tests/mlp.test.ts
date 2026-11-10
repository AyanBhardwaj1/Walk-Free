import { describe, expect, it } from "vitest";
import { predictMlp, seeded, trainMlp } from "../src/lib/ml/mlp";

describe("on-device neural network", () => {
  it("learns a non-linear function well beyond a constant guess", () => {
    const rand = seeded(3);
    const x: number[][] = [],
      y: number[] = [];
    for (let i = 0; i < 300; i++) {
      const a = rand() * 4 - 2,
        b = rand() * 4 - 2;
      x.push([a, b]);
      y.push(Math.sin(a) + 0.5 * b * b + (rand() - 0.5) * 0.05);
    }
    const model = trainMlp(x, y, { hidden: 12, epochs: 600 });
    const baseline =
      y.reduce(
        (s, v) => s + Math.abs(v - y.reduce((a, b) => a + b) / y.length),
        0,
      ) / y.length;
    expect(model.holdoutMae).toBeLessThan(baseline * 0.25);
    // The constant-guess baseline is measured on the same held-out rows.
    expect(model.holdoutBaselineMae).toBeGreaterThan(model.holdoutMae * 2);
    expect(predictMlp(model, [1, 1])).toBeCloseTo(Math.sin(1) + 0.5, 0);
  });

  it("trains the same way every time with the same seed", () => {
    const x = [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9], [10], [11]];
    const y = x.map(([v]) => v * 2 + 1);
    const a = trainMlp(x, y, { seed: 5, epochs: 50 });
    const b = trainMlp(x, y, { seed: 5, epochs: 50 });
    expect(predictMlp(a, [4])).toBe(predictMlp(b, [4]));
  });

  it("refuses mismatched data", () => {
    expect(() => trainMlp([[1]], [1, 2])).toThrow();
  });
});
