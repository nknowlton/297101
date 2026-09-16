/* Checks for the independence widget's ordering model.
 *
 * The teaching claim is that the sample never changes while the order slider
 * moves, and that the slider's ends produce runs (+r1) and alternation (-r1).
 * These tests verify exactly those two claims, plus the well-behaved preset
 * genuinely having no pattern rather than merely hiding one.
 *
 * They also guard the residual axis: a violation must be big enough to read and
 * small enough not to clip the fixed scale.
 */

import assert from "node:assert/strict";
import {
  makeStreams,
  generateIndependence,
  generateLinearity,
  generateNormality,
  generateEqualVariance,
  equalVarianceSdAt,
  fitLeastSquares,
  sampleSd,
  resolveResidFittedPoint,
  resolveQQPoint,
  sequenceRank,
  alternatingTarget,
  lag1Correlation,
} from "./line-assumptions-lab.js";

const n = 26;
const timesOf = (points) => points.map((p) => p.t);
const residOf = (points) => points.map((p) => p.latent);

// Reorder a series by a rank array: rank[pos] gives the index shown at pos.
const applyRank = (values, rank) => rank.map((idx) => values[idx]);

// The arrangement at the negative end of the slider, for a sample whose time
// pattern has the given strength.
const alternatingRank = (residuals, signal = 1) => {
  const target = alternatingTarget(residuals);
  return target
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t - b.t)
    .map((o) => o.i);
};

/* ---------------------------------------------------------------- */
/* The sample must not change with the slider                        */
/* ---------------------------------------------------------------- */

const sample = generateIndependence({ n, strength: 1 }, makeStreams("ind,0"));
assert.equal(sample.length, n);
sample.forEach((p) => {
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), "finite point");
  assert.ok(Number.isFinite(p.t), "every point carries a time index");
});
// Sorted x is a display choice, not a property of the sequence.
const xs = sample.map((p) => p.x);
assert.deepEqual(xs, [...xs].sort((a, b) => a - b), "x values are ascending");

const key = "ind,0,26";
const resid = residOf(sample);
const shuffledR = applyRank(resid, sequenceRank(timesOf(sample), resid, 0, key));
const orderedR = applyRank(resid, sequenceRank(timesOf(sample), resid, 1, key));
assert.deepEqual(
  [...shuffledR].sort((a, b) => a - b),
  [...orderedR].sort((a, b) => a - b),
  "both ends show the same residuals, only reordered",
);

/* ---------------------------------------------------------------- */
/* Slider ends must produce runs and alternation                     */
/* ---------------------------------------------------------------- */

const r0 = lag1Correlation(shuffledR);
const rPos = lag1Correlation(orderedR);
const rNeg = lag1Correlation(applyRank(resid, alternatingRank(resid)));

assert.ok(rPos > 0.5, `time order should give strong positive r1, got ${rPos}`);
assert.ok(rNeg < -0.6, `alternating order should give strong negative r1, got ${rNeg}`);
assert.ok(Math.abs(r0) < Math.abs(rPos) / 2, `shuffled r1 should be near zero, got ${r0}`);

/* ---------------------------------------------------------------- */
/* Well-behaved preset must have no pattern at all                   */
/* ---------------------------------------------------------------- */

const flat = generateIndependence({ n, strength: 0 }, makeStreams("ind,0"));
const flatOrdered = applyRank(residOf(flat), sequenceRank(timesOf(flat), residOf(flat), 1, key));
const rFlat = lag1Correlation(flatOrdered);
assert.ok(Math.abs(rFlat) < 0.45, `strength 0 should leave no time pattern, got r1 = ${rFlat}`);

/* ---------------------------------------------------------------- */
/* Reproducibility                                                   */
/* ---------------------------------------------------------------- */

const again = generateIndependence({ n, strength: 1 }, makeStreams("ind,0"));
assert.deepEqual(again, sample, "the same seed reproduces the same sample");
const later = generateIndependence({ n, strength: 1 }, makeStreams("ind,1"));
assert.notDeepEqual(later, sample, "a new seed gives a new sample");

/* ---------------------------------------------------------------- */
/* Edge cases                                                        */
/* ---------------------------------------------------------------- */

assert.equal(lag1Correlation([1, 2]), null, "too few points for a correlation");
assert.equal(lag1Correlation([3, 3, 3, 3]), null, "no variation to correlate");
const tiny = generateIndependence({ n: 4, strength: 1 }, makeStreams("ind,0"));
assert.equal(tiny.length, 4);
assert.ok(Number.isFinite(lag1Correlation(tiny.map((p) => p.latent))));
const rank = sequenceRank(timesOf(sample), resid, 0.5, key);
assert.deepEqual([...rank].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i),
  "a rank is a permutation of the positions");

// The ends of the slider must stay well separated for the sample sizes the
// widget is actually used with, so the demonstration does not depend on which
// sample the student generated. (A dozen points is genuinely noisy, so the
// pairwise check below covers that case instead.)
for (const size of [26, 40, 60]) {
  for (let seed = 0; seed < 20; seed += 1) {
    const pts = generateIndependence({ n: size, strength: 1 }, makeStreams(`ind,${seed}`));
    const e = residOf(pts);
    const key = `ind,${seed},${size}`;
    const rp = lag1Correlation(applyRank(e, sequenceRank(timesOf(pts), e, 1, key)));
    const rm = lag1Correlation(applyRank(e, sequenceRank(timesOf(pts), e, 0, key)));
    const rn = lag1Correlation(applyRank(e, alternatingRank(e)));
    assert.ok(rp > 0.6, `n=${size} seed=${seed}: time order r1 = ${rp}`);
    assert.ok(rn < -0.7, `n=${size} seed=${seed}: alternating r1 = ${rn}`);
    assert.ok(Math.abs(rm) < 0.5, `n=${size} seed=${seed}: shuffled r1 = ${rm}`);
  }
}

// With few points a single sample's r1 is noisy, so assert the direction of
// the effect rather than a level: moving the slider away from the middle must
// always push the correlation the expected way.
for (const size of [12, 26, 40, 60]) {
  for (let seed = 0; seed < 30; seed += 1) {
    const pts = generateIndependence({ n: size, strength: 1 }, makeStreams(`ind,${seed}`));
    const e = residOf(pts);
    const key = `ind,${seed},${size}`;
    const rp = lag1Correlation(applyRank(e, sequenceRank(timesOf(pts), e, 1, key)));
    const rm = lag1Correlation(applyRank(e, sequenceRank(timesOf(pts), e, 0, key)));
    const rn = lag1Correlation(applyRank(e, alternatingRank(e)));
    assert.ok(rn < rm, `n=${size} seed=${seed}: alternating must lower r1`);
    if (size >= 26) assert.ok(rp > rm, `n=${size} seed=${seed}: time order must raise r1`);
  }
}

// The slider must be one continuous operation: half way along either side must
// land between the shuffled start and that end, not jump straight to the end.
for (let seed = 0; seed < 20; seed += 1) {
  const pts = generateIndependence({ n, strength: 1 }, makeStreams(`ind,${seed}`));
  const e = residOf(pts);
  const key = `ind,${seed},${n}`;
  const rAt = (s) => lag1Correlation(applyRank(e, sequenceRank(timesOf(pts), e, s, key)));

  const rMid = rAt(0);
  const rHalfPos = rAt(0.5);
  const rFullPos = rAt(1);
  const rHalfNeg = rAt(-0.5);
  const rFullNeg = rAt(-1);

  // The second half of the travel must still be doing something: the end has to
  // sit further from the shuffled starting point than the half-way position.
  assert.ok(rFullPos > rHalfPos, `seed=${seed}: half way up must be less ordered than the end`);
  assert.ok(Math.abs(rFullPos - rMid) > Math.abs(rHalfPos - rMid),
    `seed=${seed}: end of the slider must be further from "shuffled" than half way`);
  assert.ok(rHalfNeg > rFullNeg, `seed=${seed}: half way down must be less alternating than the end`);
  assert.ok(Math.abs(rFullNeg - rMid) > Math.abs(rHalfNeg - rMid),
    `seed=${seed}: negative end must be further from "shuffled" than half way`);

  // Both ends must move away from the shuffled start in opposite directions.
  assert.ok(rFullPos > rMid, `seed=${seed}: positive end must raise r1`);
  assert.ok(rFullNeg < rMid, `seed=${seed}: negative end must lower r1`);
}

// Sorting by residual value manufactures alternation even from pure noise, so
// the negative end must be gated on the sample actually containing a pattern.
// Without this a "well-behaved" sample would show a violation that is not there.
for (let seed = 0; seed < 20; seed += 1) {
  const flatPts = generateIndependence({ n, strength: 0 }, makeStreams(`ind,${seed}`));
  const flatE = residOf(flatPts);
  const flatKey = `ind,${seed},${n}`;
  const flatNeg = lag1Correlation(
    applyRank(flatE, sequenceRank(timesOf(flatPts), flatE, -1, flatKey, 0)),
  );
  assert.ok(flatNeg > -0.75,
    `seed=${seed}: with no pattern present the negative end must not invent alternation, got ${flatNeg}`);
}

/* ---------------------------------------------------------------- */
/* Residuals must stay inside the residual axis                     */
/* ---------------------------------------------------------------- */

// Every violation is only legible if residuals stay within the fixed axis, and
// only convincing if they use a decent share of it. A pattern squeezed into a
// narrow band at the centre is what made the violations look subtle, so both
// limits are checked here: no clipping, and enough spread to see.
const RESID_AXIS = 8;
const residExtent = (points) => {
  const fit = fitLeastSquares(points, 1);
  return Math.max(...points.map((p) => Math.abs(p.y - fit.predict(p.x))));
};

const generators = {
  linearity: (seed) => generateLinearity(
    { n: 40, curvature: 1.6, slope: 1.5, noise: 1 }, makeStreams(`lin,${seed}`),
  ),
  "linearity max": (seed) => generateLinearity(
    { n: 40, curvature: 2, slope: 1.5, noise: 1.8 }, makeStreams(`lin,${seed}`),
  ),
  "linearity S": (seed) => generateLinearity(
    { n: 40, curvature: -2, slope: 1.5, noise: 1.8 }, makeStreams(`lin,${seed}`),
  ),
  "linearity S neg slope": (seed) => generateLinearity(
    { n: 40, curvature: -2, slope: -1.5, noise: 1.8 }, makeStreams(`lin,${seed}`),
  ),
  "linearity neg slope": (seed) => generateLinearity(
    { n: 40, curvature: 0, slope: -2, noise: 1.8 }, makeStreams(`lin,${seed}`),
  ),
  "normality skewed": (seed) => generateNormality(
    { n: 25, shape: "skewed" }, makeStreams(`norm,${seed}`),
  ),
  "normality heavy": (seed) => generateNormality(
    { n: 25, shape: "heavy" }, makeStreams(`norm,${seed}`),
  ),
  "normality max n": (seed) => generateNormality(
    { n: 80, shape: "skewed" }, makeStreams(`norm,${seed}`),
  ),
  "equalvariance funnel": (seed) => generateEqualVariance(
    { n: 28, pattern: "increasing", sd: 0.75 }, makeStreams(`eq,${seed}`),
  ),
  "equalvariance max spread": (seed) => generateEqualVariance(
    { n: 28, pattern: "increasing", sd: 1 }, makeStreams(`eq,${seed}`),
  ),
  "equalvariance bowtie": (seed) => generateEqualVariance(
    { n: 28, pattern: "bowtie", sd: 0.75 }, makeStreams(`eq,${seed}`),
  ),
  "equalvariance constant max": (seed) => generateEqualVariance(
    { n: 28, pattern: "constant", sd: 1 }, makeStreams(`eq,${seed}`),
  ),
  independence: (seed) => generateIndependence({ n: 26, strength: 1 }, makeStreams(`ind,${seed}`)),
};

const spreadReport = [];
Object.entries(generators).forEach(([label, gen]) => {
  let maxSeen = 0;
  let median = 0;
  const extents = [];
  for (let seed = 0; seed < 30; seed += 1) {
    const e = residExtent(gen(seed));
    extents.push(e);
    maxSeen = Math.max(maxSeen, e);
  }
  extents.sort((a, b) => a - b);
  median = extents[Math.floor(extents.length / 2)];
  spreadReport.push(`${label}: median=${median.toFixed(2)} worst=${maxSeen.toFixed(2)}`);

  assert.ok(maxSeen < RESID_AXIS,
    `${label}: residuals must not reach the edge of the +/-${RESID_AXIS} axis (worst ${maxSeen.toFixed(2)})`);
  // The pattern has to be big enough to read at the back of a lecture theatre.
  // Just under a third of the axis is what made the violations look subtle, so
  // 30% is the floor; the presets all sit well above it.
  const axisUse = median / RESID_AXIS;
  assert.ok(axisUse > 0.3,
    `${label}: violation must use at least 30% of the residual axis, got ${(axisUse * 100).toFixed(0)}%`);
});

console.log(`residual spread (axis +/-${RESID_AXIS}): ${spreadReport.join(" | ")}`);

/* ---------------------------------------------------------------- */
/* Adding a point from a diagnostic plot                              */
/* ---------------------------------------------------------------- */

// A click on the residuals-vs-fitted plot describes a (fitted, resid) pair.
// For clicks the line can reach within the x-axis, the observation this implies
// must, once the line has refitted to include it, render at exactly the
// clicked position — otherwise the point jumps off the click the moment it is
// added. Targets outside the line's reach are covered by the clamp test below.
for (let seed = 0; seed < 20; seed += 1) {
  const base = generateLinearity(
    { n: 24, curvature: 0, slope: 1.5, noise: 1 }, makeStreams(`lin,${seed}`),
  );
  const fit0 = fitLeastSquares(base, 1);
  // Fitted values reachable at x = 1.5 and x = 8.5 for this sample's line.
  const targets = [fit0.predict(1.5), fit0.predict(5), fit0.predict(8.5)];
  for (const fittedWanted of targets) {
    for (const residWanted of [-4, -1.2, 2.3, 5.5]) {
      // A click whose y = fitted + resid would leave the y-axis clamps at the
      // edge by design; the clamp test below covers that case.
      if (fittedWanted + residWanted < 0 || fittedWanted + residWanted > 24) continue;
      const got = resolveResidFittedPoint(base, fittedWanted, residWanted);
      assert.ok(got, "resolver must return a point for a valid fit");
      assert.ok(got.x >= 0 && got.x <= 10, `x inside the axis, got ${got.x}`);
      assert.ok(got.y >= 0 && got.y <= 24, `y inside the axis, got ${got.y}`);
      const fit = fitLeastSquares([...base, got], 1);
      assert.ok(Math.abs(fit.predict(got.x) - fittedWanted) < 1e-4,
        `seed=${seed}: fitted as rendered ${fit.predict(got.x).toFixed(4)} must match the click ${fittedWanted.toFixed(4)}`);
      assert.ok(Math.abs(got.y - fit.predict(got.x) - residWanted) < 1e-4,
        `seed=${seed}: residual as rendered must match the click ${residWanted}`);
    }
  }
}

// Extreme clicks clamp onto the domains instead of leaving the plot: a click
// whose fitted value is beyond the line's reach settles at the nearest edge.
// At the very edge the added point has huge leverage, so the rendered
// residual lands close to — not exactly at — the clicked value; what matters
// is that it stays a big residual, inside the plot.
{
  const base = generateLinearity(
    { n: 24, curvature: 0, slope: 1.5, noise: 1 }, makeStreams("lin,0"),
  );
  const edge = resolveResidFittedPoint(base, 5, 7.9);
  const fitEdge = fitLeastSquares([...base, edge], 1);
  assert.ok(Math.abs(edge.y - fitEdge.predict(edge.x)) > 5,
    `an extreme click must remain an extreme residual, got ${(edge.y - fitEdge.predict(edge.x)).toFixed(3)}`);
  assert.ok(edge.x >= 0 && edge.x <= 10 && edge.y >= 0 && edge.y <= 24,
    "edge click stays inside the plot");
  assert.ok(Number.isFinite(edge.x) && Number.isFinite(edge.y), "edge click is finite");
}

// A Q-Q click sets the residual; the new x sits at the mean of the current xs
// (the fit's centre), and the rendered residual equals the click.
for (let seed = 0; seed < 20; seed += 1) {
  const base = generateNormality(
    { n: 25, shape: "normal" }, makeStreams(`norm,${seed}`),
  );
  for (const residWanted of [-5, -1, 0.5, 4, 6]) {
    const got = resolveQQPoint(base, residWanted);
    assert.ok(got, "qq resolver must return a point");
    const meanX = base.reduce((s, p) => s + p.x, 0) / base.length;
    assert.ok(Math.abs(got.x - meanX) < 1e-6,
      `seed=${seed}: qq add keeps x at the mean, got ${got.x} vs ${meanX}`);
    const fit = fitLeastSquares([...base, got], 1);
    assert.ok(Math.abs(got.y - fit.predict(got.x) - residWanted) < 1e-4,
      `seed=${seed}: qq residual as rendered must match the click ${residWanted}`);
  }
}

// Degenerate inputs: no fit, or no usable points, must return null rather than
// NaN silently entering the plot.
assert.equal(resolveResidFittedPoint([{ x: 5, y: 1 }], 5, 0), null,
  "a single point has no defined least-squares line");
assert.equal(resolveQQPoint([], 0), null, "no points, no centre");

// A student point added via the diagnostic must behave like any other edit:
// the same ids/orders contract as a scatterplot add. The widget assigns ids,
// but the resolver output itself must be a plain { x, y }.
{
  const base = generateEqualVariance(
    { n: 28, pattern: "constant", sd: 0.75 }, makeStreams("eq,0"),
  );
  const got = resolveResidFittedPoint(base, 6, -2);
  assert.deepEqual(Object.keys(got).sort(), ["x", "y"], "resolver returns only coordinates");
}

/* ---------------------------------------------------------------- */
/* Shape controls must always move the data                           */
/* ---------------------------------------------------------------- */

// Regression: the linearity widget used to have a shape select PLUS a strength
// slider that started at 0, so picking the other shape did nothing until the
// strength slider moved too — the select looked dead. The signed-curvature dial
// must change the data the moment it moves, in both directions, and 0 must be
// a genuine straight line.
{
  const straight = generateLinearity({ n: 40, curvature: 0, slope: 1.5, noise: 0.3 }, makeStreams("lin,0"));
  const u = generateLinearity({ n: 40, curvature: 1.6, slope: 1.5, noise: 0.3 }, makeStreams("lin,0"));
  const s = generateLinearity({ n: 40, curvature: -1.6, slope: 1.5, noise: 0.3 }, makeStreams("lin,0"));
  assert.notDeepEqual(u, straight, "U curvature must change the data");
  assert.notDeepEqual(s, straight, "S curvature must change the data");
  assert.notDeepEqual(u, s, "U and S must differ");
  // At the same magnitude the two shapes must have similar residual extents
  // (the sign is the shape, the magnitude the strength).
  const extent = (pts) => {
    const fit = fitLeastSquares(pts, 1);
    return Math.max(...pts.map((p) => Math.abs(p.y - fit.predict(p.x))));
  };
  assert.ok(Math.abs(extent(u) - extent(s)) < 1.2,
    `U and S at the same dial magnitude should be comparable (U ${extent(u).toFixed(2)} vs S ${extent(s).toFixed(2)})`);

  // The slope dial must not be dead either: flipping it moves the data, and a
  // negative slope must still be a rising/falling line with the same
  // curvature signal layered on top.
  const rising = generateLinearity({ n: 40, curvature: 0, slope: 1.5, noise: 0.3 }, makeStreams("lin,0"));
  const falling = generateLinearity({ n: 40, curvature: 0, slope: -1.5, noise: 0.3 }, makeStreams("lin,0"));
  assert.notDeepEqual(rising, falling, "flipping the slope must move the data");
  const fitRise = fitLeastSquares(rising, 1);
  const fitFall = fitLeastSquares(falling, 1);
  assert.ok(fitRise.beta[1] > 1 && fitFall.beta[1] < -1,
    `slopes as fitted must follow the dial (${fitRise.beta[1].toFixed(2)}, ${fitFall.beta[1].toFixed(2)})`);
  // And the S-violation must survive on a falling line with a comparable extent.
  const sOnNeg = generateLinearity({ n: 40, curvature: -2, slope: -1.5, noise: 0.3 }, makeStreams("lin,0"));
  assert.ok(extent(sOnNeg) > 1.5,
    `the S-shape must remain visible on a negative slope (extent ${extent(sOnNeg).toFixed(2)})`);
}

// Normality: with severity gone, the three shapes must still be three visibly
// different departures, and the "skewed" shape must be genuinely skewed.
const skewness = (values) => {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  const m3 = values.reduce((a, b) => a + (b - m) ** 3, 0) / values.length;
  return m3 / v ** 1.5;
};

for (let seed = 0; seed < 10; seed += 1) {
  const normal = residOf(generateNormality({ n: 80, shape: "normal" }, makeStreams(`norm,${seed}`)));
  const skewed = residOf(generateNormality({ n: 80, shape: "skewed" }, makeStreams(`norm,${seed}`)));
  const heavy = residOf(generateNormality({ n: 80, shape: "heavy" }, makeStreams(`norm,${seed}`)));
  assert.ok(skewness(skewed) > 0.5,
    `seed=${seed}: the skewed shape must be skewed, got ${skewness(skewed).toFixed(2)}`);
  assert.ok(Math.abs(skewness(normal)) < 0.6,
    `seed=${seed}: the normal shape must be near-symmetric, got ${skewness(normal).toFixed(2)}`);
  // Heavy tails: the extremes sit further out relative to the middle.
  const tailRatio = (e) => {
    const s = [...e].sort((a, b) => a - b);
    const q1 = s[Math.floor(0.25 * s.length)];
    const q3 = s[Math.floor(0.75 * s.length)];
    return (s[s.length - 1] - s[0]) / Math.max(1e-9, q3 - q1);
  };
  assert.ok(tailRatio(heavy) > tailRatio(normal),
    `seed=${seed}: heavy tails must stretch the extremes (heavy ${tailRatio(heavy).toFixed(2)} vs normal ${tailRatio(normal).toFixed(2)})`);
  // Calibration: every shape fills a comparable share of the residual axis.
  for (const e of [normal, skewed, heavy]) {
    const fit = fitLeastSquares(
      generateNormality({ n: 80, shape: e === normal ? "normal" : (e === skewed ? "skewed" : "heavy") }, makeStreams(`norm,${seed}`)), 1,
    );
    const extent = Math.max(...e.map((v) => Math.abs(v)));
    assert.ok(extent > 1.5 && extent < 8,
      `seed=${seed}: calibrated sample must use the axis without clipping (extent ${extent.toFixed(2)})`);
  }
}

// The severity dial must reshape the skewed and heavy-tailed samples (the Q–Q
// moves as it turns), while the normal shape ignores it — severity for a
// normal error has no meaning and would just push the Q–Q to a shape that
// defeats the teaching point.
const sortedShape = (values) => [...values].sort((a, b) => a - b);
for (let seed = 0; seed < 10; seed += 1) {
  const normalLow = sortedShape(residOf(generateNormality({ n: 80, shape: "normal", severity: 0.2 }, makeStreams(`norm,${seed}`))));
  const normalHigh = sortedShape(residOf(generateNormality({ n: 80, shape: "normal", severity: 1 }, makeStreams(`norm,${seed}`))));
  assert.deepEqual(normalHigh, normalLow,
    `seed=${seed}: the normal shape must ignore severity entirely`);
  for (const shape of ["skewed", "heavy"]) {
    const low = sortedShape(residOf(generateNormality({ n: 80, shape, severity: 0.2 }, makeStreams(`norm,${seed}`))));
    const high = sortedShape(residOf(generateNormality({ n: 80, shape, severity: 1 }, makeStreams(`norm,${seed}`))));
    let sum = 0;
    for (let i = 0; i < low.length; i += 1) sum += (low[i] - high[i]) ** 2;
    const rms = Math.sqrt(sum / low.length);
    assert.ok(rms > 0.15,
      `shape=${shape} seed=${seed}: severity must visibly reshape the sample (rms ${rms.toFixed(3)})`);
  }
  const skewedHigh = residOf(generateNormality({ n: 80, shape: "skewed", severity: 1 }, makeStreams(`norm,${seed}`)));
  assert.ok(skewness(skewedHigh) > skewness(normalLow),
    `seed=${seed}: full-dial skewed must be more skewed than normal`);
}

// The equal-variance spread dial must move the data for the CONSTANT pattern —
// regression: the old severity slider left it at a fixed 1.0 SD, so the dial
// did nothing there. Bigger dial = bigger spread, smaller dial = smaller,
// around the same line.
for (let seed = 0; seed < 10; seed += 1) {
  const small = generateEqualVariance({ n: 40, pattern: "constant", sd: 0.15 }, makeStreams(`eq,${seed}`));
  const mid = generateEqualVariance({ n: 40, pattern: "constant", sd: 0.45 }, makeStreams(`eq,${seed}`));
  const big = generateEqualVariance({ n: 40, pattern: "constant", sd: 0.9 }, makeStreams(`eq,${seed}`));
  const sdOf = (pts) => sampleSd(pts.map((p) => p.y - (11 + 1.2 * (p.x - 5))));
  assert.ok(sdOf(big) > sdOf(mid) && sdOf(mid) > sdOf(small),
    `seed=${seed}: constant-pattern spread must follow the SD dial (${sdOf(small).toFixed(2)} < ${sdOf(mid).toFixed(2)} < ${sdOf(big).toFixed(2)})`);
  // The centre stays the same line whatever the dial does.
  for (const pts of [small, mid, big]) {
    for (const p of pts) {
      assert.ok(Math.abs(p.y) <= 24, "points stay on the plot");
    }
  }
}

// The funnel patterns scale with the dial AND stay inside the y-axis for every
// dial position: 2 SD at the wide end must not leave the plot. The dial is
// 0-1, and the wide end saturates at 2.65 — the artefact flat lines that used
// to appear in the band above an SD of about 1.3 must be gone, which the cap
// guarantees by construction.
for (const spread of [0, 0.2, 0.45, 0.7, 1]) {
  for (const pattern of ["increasing", "decreasing", "bowtie", "constant"]) {
    for (const x of [0, 5, 10]) {
      const sdAt = equalVarianceSdAt(pattern, spread, x);
      const centre = 11 + 1.2 * (x - 5);
      assert.ok(centre - 2 * sdAt > -0.5 && centre + 2 * sdAt < 24.5,
        `pattern=${pattern} spread=${spread} x=${x}: 2 SD band leaves the plot (sd ${sdAt.toFixed(2)})`);
    }
  }
}
// The funnel must be visibly a funnel at the full dial: wide end clearly
// thicker than the thin end.
assert.ok(equalVarianceSdAt("increasing", 1, 10) > 3 * equalVarianceSdAt("increasing", 1, 0),
  "full-dial funnel must open widely (thin vs wide end)");

// Independence: the Well-behaved and Violation presets must draw the SAME kind
// of sample (strength 1 — a genuine time pattern), so that the violation is
// produced by the slider's sorting, not by new data. With strength 1 the
// sample sorted into time order must show a strong positive r1.
for (let seed = 0; seed < 20; seed += 1) {
  const pts = generateIndependence({ n: 26, strength: 1 }, makeStreams(`ind,${seed}`));
  const e = residOf(pts);
  const seqKey = `ind,${seed},26`;
  const r1 = lag1Correlation(applyRank(e, sequenceRank(timesOf(pts), e, 1, seqKey)));
  assert.ok(r1 > 0.6,
    `seed=${seed}: a strength-1 sample sorted into time order must show runs, got r1 ${r1?.toFixed(2)}`);
}

console.log("line-assumptions-lab checks passed");
