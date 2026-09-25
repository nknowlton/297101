import assert from "node:assert/strict";
import {
  intervalAt,
  leastSquares,
  makeStreams,
  meanSquaredError,
  studentTQuantile,
} from "./regression-math.js";

const x = [0, 1, 2, 3, 4];
const y = [1, 2, 2, 4, 5];
const points = x.map((value, i) => ({ x: value, y: y[i] }));
const fit = leastSquares(points);
const close = (actual, expected, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

close(fit.intercept, 0.8);
close(fit.slope, 1);
close(meanSquaredError(points, fit.intercept, fit.slope), 0.16);

const ci = intervalAt(fit, 2.5, 0.95, "confidence");
const pi = intervalAt(fit, 2.5, 0.95, "prediction");
close(ci.lower, 2.520463);
close(ci.upper, 4.079537);
close(pi.lower, 1.481080);
close(pi.upper, 5.118920);
assert.ok(pi.halfWidth > ci.halfWidth);
assert.ok(intervalAt(fit, 2.5, 0.99, "confidence").halfWidth > ci.halfWidth);
assert.ok(intervalAt(fit, 0, 0.95, "confidence").halfWidth > ci.halfWidth);
const noisier = points.map((point) => ({
  x: point.x,
  y: fit.predict(point.x) + 2 * (point.y - fit.predict(point.x)),
}));
assert.ok(intervalAt(leastSquares(noisier), 2.5, 0.95, "confidence").halfWidth > ci.halfWidth);
close(studentTQuantile(0.975, 3), 3.182446, 1e-5);
close(studentTQuantile(0.975, 10), 2.228139, 1e-5);
close(studentTQuantile(0.995, 10), 3.169273, 1e-5);
close(studentTQuantile(0.95, 22), 1.717144, 1e-5);

/* Grid-versus-analytic checks mirroring the regressionLab heat map:
 * the darkest grid cell must sit at the least-squares solution, and the
 * analytic minimum MSE must never exceed any grid cell's MSE. */
const GRID_X = [-2, 12];
const GRID_Y = [-1.5, 1.5];
const NX = 31;
const NY = 31;
const cellStepX = (GRID_X[1] - GRID_X[0]) / (NX - 1);
const cellStepY = (GRID_Y[1] - GRID_Y[0]) / (NY - 1);

const checkGrid = (sample, label) => {
  const sampleFit = leastSquares(sample);
  const analyticMse = meanSquaredError(sample, sampleFit.intercept, sampleFit.slope);
  let bestCell = null;
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const b0 = GRID_X[0] + (i / (NX - 1)) * (GRID_X[1] - GRID_X[0]);
      const b1 = GRID_Y[0] + (j / (NY - 1)) * (GRID_Y[1] - GRID_Y[0]);
      const mse = meanSquaredError(sample, b0, b1);
      assert.ok(
        analyticMse <= mse + 1e-9,
        `${label}: analytic MSE ${analyticMse} exceeds grid MSE ${mse} at (${b0}, ${b1})`,
      );
      if (!bestCell || mse < bestCell.mse) bestCell = { b0, b1, mse };
    }
  }
  close(bestCell.mse, analyticMse, cellStepX + cellStepY);
  assert.ok(
    Math.abs(bestCell.b0 - sampleFit.intercept) <= cellStepX + 1e-9
      && Math.abs(bestCell.b1 - sampleFit.slope) <= cellStepY + 1e-9,
    `${label}: darkest grid cell (${bestCell.b0}, ${bestCell.b1}) is not the OLS solution (${sampleFit.intercept}, ${sampleFit.slope})`,
  );
};

checkGrid(points, "toy sample");
checkGrid(
  Array.from({ length: 24 }, (_, i) => {
    const gx = 0.75 + ((i * 7919) % 85) / 10;
    const gy = 5 + 0.78 * (gx - 5) + ((i % 5) - 2) * 0.45;
    return { x: gx, y: gy };
  }),
  "generated sample",
);

/* The display transform used by regressionLab: actual MSE remains available
 * for labels and hover text, while the colour value is excess MSE above the
 * analytic minimum and is capped at the sample-specific 90th percentile. */
const quantile = (values, probability) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const makeGeneratedSample = (kind, seed) => {
  const specs = {
    clear: { slope: 0.78, noise: 0.45, influence: false },
    noisy: { slope: 0.45, noise: 1.15, influence: false },
    influential: { slope: 0.55, noise: 0.55, influence: true },
  };
  const spec = specs[kind];
  const random = makeStreams(`regression,${kind},${seed}`);
  const count = spec.influence ? 23 : 24;
  const sample = Array.from({ length: count }, (_, i) => {
    const gx = 0.75 + random.uniform() * 8.5;
    return { x: gx, y: 5 + spec.slope * (gx - 5) + random.normal() * spec.noise };
  });
  if (spec.influence) {
    sample.push({
      x: 9.7,
      y: 5 + spec.slope * (9.7 - 5) + (random.uniform() < 0.5 ? -1 : 1) * 2.4,
    });
  }
  return sample;
};

const checkColourScale = (sample, label) => {
  const sampleFit = leastSquares(sample);
  const minimumMse = meanSquaredError(sample, sampleFit.intercept, sampleFit.slope);
  const rawMse = [];
  for (let j = 0; j < NY; j += 1) for (let i = 0; i < NX; i += 1) {
    const b0 = GRID_X[0] + (i / (NX - 1)) * (GRID_X[1] - GRID_X[0]);
    const b1 = GRID_Y[0] + (j / (NY - 1)) * (GRID_Y[1] - GRID_Y[0]);
    rawMse.push(meanSquaredError(sample, b0, b1));
  }
  const excess = rawMse.map((mse) => Math.max(0, mse - minimumMse));
  const ceiling = quantile(excess, 0.9);
  const displayed = excess.map((value) => Math.min(value, ceiling));
  assert.ok(excess.every((value) => value >= 0), `${label}: excess MSE must be non-negative`);
  assert.ok(Number.isFinite(ceiling) && ceiling > 0, `${label}: colour ceiling must be finite and positive`);
  assert.ok(displayed.every((value) => value <= ceiling), `${label}: colour values must be clipped at the ceiling`);
  assert.ok(displayed.some((value) => value === ceiling), `${label}: upper-tail cells should reach the clipped ceiling`);
};

["clear", "noisy", "influential"].forEach((kind) => {
  checkColourScale(makeGeneratedSample(kind, 0), `${kind} sample`);
  checkColourScale(makeGeneratedSample(kind, 1), `${kind} regenerated sample`);
});

console.log("regression-lab math checks passed");
