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
  fitLeastSquares,
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
    { n: 24, curveShape: "u", curvature: 1.6, noise: 1 }, makeStreams(`lin,${seed}`),
  ),
  "linearity max noise": (seed) => generateLinearity(
    { n: 24, curveShape: "u", curvature: 2, noise: 1.8 }, makeStreams(`lin,${seed}`),
  ),
  "linearity S": (seed) => generateLinearity(
    { n: 24, curveShape: "s", curvature: 2, noise: 1.8 }, makeStreams(`lin,${seed}`),
  ),
  "normality skewed": (seed) => generateNormality(
    { n: 25, shape: "skewed", severity: 0.95 }, makeStreams(`norm,${seed}`),
  ),
  "normality heavy": (seed) => generateNormality(
    { n: 25, shape: "heavy", severity: 0.95 }, makeStreams(`norm,${seed}`),
  ),
  "normality max n": (seed) => generateNormality(
    { n: 50, shape: "skewed", severity: 1 }, makeStreams(`norm,${seed}`),
  ),
  "equalvariance funnel": (seed) => generateEqualVariance(
    { n: 28, pattern: "increasing", severity: 1 }, makeStreams(`eq,${seed}`),
  ),
  "equalvariance bowtie": (seed) => generateEqualVariance(
    { n: 28, pattern: "bowtie", severity: 1 }, makeStreams(`eq,${seed}`),
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
console.log("line-assumptions-lab checks passed");
