import assert from "node:assert/strict";
import {
  intervalAt,
  leastSquares,
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

console.log("regression-lab math checks passed");
