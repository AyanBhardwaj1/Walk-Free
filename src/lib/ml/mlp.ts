/**
 * A small multilayer perceptron that trains in the browser: one tanh
 * hidden layer, a linear output, Adam, L2 weight decay, inputs and target
 * standardised, and early stopping on a held-out slice. Small enough to
 * train on a person's own walks in a few milliseconds, on their device.
 */

export interface MlpOptions {
  hidden?: number;
  epochs?: number;
  learningRate?: number;
  /** L2 penalty on the weights (not the biases). */
  decay?: number;
  /** Share of samples held out to stop training before it overfits. */
  holdout?: number;
  /** Mini-batch size. */
  batch?: number;
  seed?: number;
}

export interface MlpModel {
  inputs: number;
  hidden: number;
  /** Hidden weights, row-major [hidden][inputs], and hidden biases. */
  w1: number[];
  b1: number[];
  /** Output weights [hidden] and bias. */
  w2: number[];
  b2: number;
  /** Standardisation of each input and of the target. */
  mean: number[];
  std: number[];
  yMean: number;
  yStd: number;
  /** Mean absolute error on the held-out slice, in target units. */
  holdoutMae: number;
  /** The same, for a constant guess (the training rows' median): the
   * fair baseline to compare `holdoutMae` against. */
  holdoutBaselineMae: number;
  samples: number;
}

/** A seeded generator, so a model trains the same way every time. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[], m: number) =>
  Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;

/** Trains on rows of inputs `x` and targets `y`. */
export function trainMlp(
  x: number[][],
  y: number[],
  options: MlpOptions = {},
): MlpModel {
  const {
    hidden = 8,
    epochs = 400,
    learningRate = 0.01,
    decay = 1e-3,
    holdout = 0.2,
    batch = 16,
    seed = 7,
  } = options;
  if (!x.length || x.length !== y.length)
    throw Error("trainMlp needs matching, non-empty inputs and targets.");
  const n = x[0].length;
  const rand = seeded(seed);
  // Standardise each input column and the target.
  const mu = Array.from({ length: n }, (_, j) => mean(x.map((r) => r[j])));
  const sd = Array.from({ length: n }, (_, j) =>
    std(
      x.map((r) => r[j]),
      mu[j],
    ),
  );
  const ym = mean(y),
    ys = std(y, ym);
  const xs = x.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const yt = y.map((v) => (v - ym) / ys);
  // Shuffle once, then split off the held-out slice.
  const order = xs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const cut =
    xs.length >= 10 ? Math.max(1, Math.round(xs.length * holdout)) : 0;
  const val = order.slice(0, cut),
    fit = order.slice(cut);
  // Xavier-style initialisation.
  const scale1 = Math.sqrt(1 / n),
    scale2 = Math.sqrt(1 / hidden);
  const p = {
    w1: Array.from({ length: hidden * n }, () => (rand() * 2 - 1) * scale1),
    b1: new Array(hidden).fill(0),
    w2: Array.from({ length: hidden }, () => (rand() * 2 - 1) * scale2),
    b2: 0,
  };
  // Adam moments for every parameter, flattened.
  const size = p.w1.length + hidden + hidden + 1;
  const m = new Float64Array(size),
    v = new Float64Array(size);
  const beta1 = 0.9,
    beta2 = 0.999,
    eps = 1e-8;
  let t = 0;
  const h = new Float64Array(hidden);
  const forward = (r: number[]) => {
    let out = p.b2;
    for (let k = 0; k < hidden; k++) {
      let z = p.b1[k];
      for (let j = 0; j < n; j++) z += p.w1[k * n + j] * r[j];
      h[k] = Math.tanh(z);
      out += p.w2[k] * h[k];
    }
    return out;
  };
  const valMae = () =>
    val.length
      ? val.reduce((s, i) => s + Math.abs(forward(xs[i]) - yt[i]), 0) /
        val.length
      : Infinity;
  let best = { score: Infinity, snapshot: JSON.stringify(p) };
  let stale = 0;
  const g = new Float64Array(size);
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Reshuffle the training rows each epoch.
    for (let i = fit.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [fit[i], fit[j]] = [fit[j], fit[i]];
    }
    for (let start = 0; start < fit.length; start += batch) {
      const rows = fit.slice(start, start + batch);
      g.fill(0);
      for (const i of rows) {
        const r = xs[i];
        const err = forward(r) - yt[i]; // d(½err²)/d(out)
        // Output layer.
        for (let k = 0; k < hidden; k++) {
          g[p.w1.length + hidden + k] += err * h[k];
          const dz = err * p.w2[k] * (1 - h[k] * h[k]);
          g[p.w1.length + k] += dz;
          for (let j = 0; j < n; j++) g[k * n + j] += dz * r[j];
        }
        g[size - 1] += err;
      }
      t++;
      const lr = (learningRate * Math.sqrt(1 - beta2 ** t)) / (1 - beta1 ** t);
      for (let q = 0; q < size; q++) {
        let grad = g[q] / rows.length;
        // Weight decay on weights only.
        if (q < p.w1.length) grad += decay * p.w1[q];
        else if (q >= p.w1.length + hidden && q < size - 1)
          grad += decay * p.w2[q - p.w1.length - hidden];
        m[q] = beta1 * m[q] + (1 - beta1) * grad;
        v[q] = beta2 * v[q] + (1 - beta2) * grad * grad;
        const delta = (lr * m[q]) / (Math.sqrt(v[q]) + eps);
        if (q < p.w1.length) p.w1[q] -= delta;
        else if (q < p.w1.length + hidden) p.b1[q - p.w1.length] -= delta;
        else if (q < size - 1) p.w2[q - p.w1.length - hidden] -= delta;
        else p.b2 -= delta;
      }
    }
    if (val.length) {
      const score = valMae();
      if (score < best.score - 1e-6) {
        best = { score, snapshot: JSON.stringify(p) };
        stale = 0;
      } else if (++stale > 40) break;
    }
  }
  const final = val.length ? (JSON.parse(best.snapshot) as typeof p) : p;
  Object.assign(p, final);
  return {
    inputs: n,
    hidden,
    w1: p.w1,
    b1: p.b1,
    w2: p.w2,
    b2: p.b2,
    mean: mu,
    std: sd,
    yMean: ym,
    yStd: ys,
    holdoutMae: val.length ? valMae() * ys : Number.NaN,
    holdoutBaselineMae: (() => {
      if (!val.length || !fit.length) return Number.NaN;
      const sorted = fit.map((i) => y[i]).sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      const med =
        sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return val.reduce((s, i) => s + Math.abs(y[i] - med), 0) / val.length;
    })(),
    samples: x.length,
  };
}

/** The model's prediction for one row of inputs, in target units. */
export function predictMlp(model: MlpModel, row: number[]) {
  const n = model.inputs;
  let out = model.b2;
  for (let k = 0; k < model.hidden; k++) {
    let z = model.b1[k];
    for (let j = 0; j < n; j++)
      z += (model.w1[k * n + j] * (row[j] - model.mean[j])) / model.std[j];
    out += model.w2[k] * Math.tanh(z);
  }
  return out * model.yStd + model.yMean;
}
