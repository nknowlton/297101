/* line-assumptions-lab.js
 * Interactive LINE assumption widgets for simple linear regression.
 * Exports: linearityLab, independenceLab, normalityLab, equalVarianceLab.
 * Each function receives { Inputs, Plot } (Observable runtime + Plot 0.6.x)
 * and returns a self-contained DOM element.
 *
 * Stable identities: every observation carries { id, order, origin },
 * where origin is "generated" or "student". Ids survive fitting, ranking,
 * shuffling and edits, which powers linked hovering between the scatterplot
 * and the diagnostic plot.
 */

const GENERATED_FILL = "#4d4d4d";
const STUDENT_FILL = "#D55E00";
const HOVER_STROKE = "#0072B2";
// Diagnostic plots redraw the same observations in a different coordinate
// space (residuals, quantiles, sequence positions). Each plot is tinted slightly
// there — a step lighter for generated data, a step softer for student points —
// so the reader can tell which canvas they are looking at without losing the
// two-family colour story. The scatterplot keeps the full-strength colours, so
// the hover ring (HOVER_STROKE) and selected outline still read against both.
const DIAG_GENERATED_FILL = "#79848e";
const DIAG_STUDENT_FILL = "#e08757";

const X_DOMAIN = [0, 10];
const Y_DOMAIN = [0, 24];
// Residuals from these generators rarely exceed about +/-5 at the settings the
// widgets use. A wide axis would squash every pattern into a narrow band in the
// middle of the plot and make each violation look subtle, so the axis is kept
// snug while still leaving room at the extremes of the sliders.
const RESID_DOMAIN = [-8, 8];

const PLOT_W = 470;
const PLOT_H = 400;
const M_LEFT = 48;
const M_RIGHT = 14;
const M_TOP = 14;
const M_BOTTOM = 40;
const INNER_W = PLOT_W - M_LEFT - M_RIGHT;
const INNER_H = PLOT_H - M_TOP - M_BOTTOM;

const LINE_X = Array.from({ length: 61 }, (_, i) => X_DOMAIN[0] + (i * (X_DOMAIN[1] - X_DOMAIN[0])) / 60);

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                    */
/* ------------------------------------------------------------------ */

// cyrb53 hash -> string to a 53-bit seed
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i += 1) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic streams for a labelled seed, e.g. "lin,2".
// Sliders do not consume these streams, so slider changes reproduce
// identical latent draws; only "Generate another sample" advances the seed.
function makeStreams(key) {
  const rng = mulberry32(cyrb53(String(key)));
  const uniform = () => rng();
  const normal = () => {
    const u = Math.max(rng(), 1e-12);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { uniform, normal };
}

/* ------------------------------------------------------------------ */
/* Ordering, for the independence widget                               */
/* ------------------------------------------------------------------ */

// A fixed random permutation of 0..n-1, drawn from the seeded stream.
function randomPermutation(n, s) {
  const draws = Array.from({ length: n }, () => s.uniform());
  return draws
    .map((u, i) => ({ u, i }))
    .sort((a, b) => a.u - b.u)
    .map((o) => o.i);
}

// A smooth wave along the sequence: neighbouring values stay similar, which is
// what a run of residuals looks like. Two slow components keep it from looking
// like a textbook sine. Standardised to unit spread, so mixing it with noise is
// a simple weighted average.
//
// A random wave is used rather than a true AR(1) realisation because with only
// a couple of dozen points an AR(1) sample can occasionally look flat, and a
// teaching example that sometimes shows no pattern undercuts the point.
function timePattern(n, s) {
  const f1 = 0.75 + 1.0 * s.uniform();
  const f2 = 3 + 3 * s.uniform();
  const p1 = 2 * Math.PI * s.uniform();
  const p2 = 2 * Math.PI * s.uniform();
  const w2 = 0.25 + 0.25 * s.uniform();
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    out.push(Math.sin(2 * Math.PI * f1 * u + p1) + w2 * Math.sin(2 * Math.PI * f2 * u + p2));
  }
  const mean = out.reduce((a, b) => a + b, 0) / n;
  const sd = sampleSd(out) || 1;
  return out.map((v) => (v - mean) / sd);
}

// Sort part way towards a target arrangement. Each position is scored as a
// blend of its target position and a random draw, weighted by progress. At 0
// the random draw dominates and the result is an unbiased shuffle; at 1 the
// target dominates and the result is exactly the target. Small slider moves
// therefore make small changes rather than sudden jumps.
function towardOrder(target, progress, key) {
  const n = target.length;
  const rng = mulberry32(cyrb53(`order,${key}`));
  return target
    .map((t, i) => ({ i, k: progress * t + (1 - progress) * n * rng() }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.i);
}

// Where each observation belongs when sorted into time order, spread over the
// same 0..n-1 range as the alternation target so both ends sort comparably.
function timeTarget(times) {
  const n = times.length;
  const lo = Math.min(...times);
  const span = (Math.max(...times) - lo) || 1;
  return times.map((t) => ((t - lo) / span) * (n - 1));
}

// Where each observation belongs in the alternating arrangement: smallest
// residual, largest, next smallest, next largest, and so on. It is the same set
// of points rearranged to zigzag, which is what negative autocorrelation looks
// like.
function alternatingTarget(residuals) {
  const n = residuals.length;
  const byValue = residuals
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v)
    .map((o) => o.i);
  const half = Math.ceil(n / 2);
  const low = byValue.slice(0, half);
  const high = byValue.slice(half).reverse();
  const target = new Array(n);
  let pos = 0;
  for (let i = 0; i < half; i += 1) {
    target[low[i]] = pos;
    pos += 1;
    if (high[i] != null) {
      target[high[i]] = pos;
      pos += 1;
    }
  }
  return target;
}

// Which sequence position 0..n-1 each observation occupies, for a slider value
// s in [-1, 1]. Zero is the shuffled starting point; +1 sorts into time order
// giving runs; -1 sorts into alternation. Values in between sort part way, so
// the slider reads as one continuous operation in either direction.
//
// `signal` is how much time pattern the sample actually contains. The time-order
// end reveals a pattern that must already be there, so it needs no help. The
// alternation end rearranges the points by value, which would manufacture
// alternation even from pure noise, so it is scaled back when there is no
// pattern to show.
function sequenceRank(times, residuals, s, key, signal = 1) {
  if (!times.length) return [];
  if (s >= 0) return towardOrder(timeTarget(times), Math.min(1, s), key);
  const gate = Math.min(1, Math.max(0, signal));
  return towardOrder(alternatingTarget(residuals), Math.min(1, -s) * gate, key);
}

// Lag-1 correlation of a sequence: the single number the widget reports.
function lag1Correlation(values) {
  const n = values.length;
  if (n < 3) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) den += (values[i] - mean) ** 2;
  for (let i = 1; i < n; i += 1) num += (values[i] - mean) * (values[i - 1] - mean);
  if (den < 1e-12) return null;
  return num / den;
}

/* ------------------------------------------------------------------ */
/* Statistics                                                           */
/* ------------------------------------------------------------------ */

function solveLinear(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= n; c += 1) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / a[i][i]);
}

// Ordinary least squares for degree 1 (default) or 2.
// Returns { beta, predict } or null when the fit is undefined.
function fitLeastSquares(points, degree = 1) {
  const n = points.length;
  if (n < degree + 1) return null;
  let sx = 0;
  let sxx = 0;
  let sxxx = 0;
  let sxxxx = 0;
  let sy = 0;
  let sxy = 0;
  let sxxy = 0;
  points.forEach((p) => {
    const x2 = p.x * p.x;
    sx += p.x;
    sxx += x2;
    sxxx += x2 * p.x;
    sxxxx += x2 * x2;
    sy += p.y;
    sxy += p.x * p.y;
    sxxy += x2 * p.y;
  });
  const matrix = degree === 1
    ? [[n, sx], [sx, sxx]]
    : [[n, sx, sxx], [sx, sxx, sxxx], [sxx, sxxx, sxxxx]];
  const rhs = degree === 1 ? [sy, sxy] : [sy, sxy, sxxy];
  const beta = solveLinear(matrix, rhs);
  if (!beta) return null;
  const predict = degree === 1
    ? (x) => beta[0] + beta[1] * x
    : (x) => beta[0] + beta[1] * x + beta[2] * x * x;
  return { beta, predict };
}

function rSquared(points, predict) {
  const n = points.length;
  if (n < 2) return null;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let sst = 0;
  let sse = 0;
  points.forEach((p) => {
    sst += (p.y - meanY) ** 2;
    sse += (p.y - predict(p.x)) ** 2;
  });
  if (sst < 1e-12) return null;
  return 1 - sse / sst;
}

function sampleSd(values) {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

function runningMean(data) {
  const sorted = [...data].sort((a, b) => a.fitted - b.fitted);
  const window = Math.max(3, Math.round(sorted.length * 0.3));
  const half = Math.floor(window / 2);
  return sorted.map((d, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(sorted.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j += 1) sum += sorted[j].resid;
    return { fitted: d.fitted, resid: sum / (hi - lo + 1) };
  });
}

// Rational approximation to the standard normal quantile function
// (Acklam's algorithm), accurate to ~1e-9.
function invNorm(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function normalPdf(x, sd) {
  return Math.exp(-0.5 * (x / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

const fmt = (v) => {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

// data value -> svg pixel (viewBox coordinates)
const pxX = (v) => M_LEFT + ((v - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0])) * INNER_W;
const pxDomain = (v, domain) => M_LEFT + ((v - domain[0]) / (domain[1] - domain[0])) * INNER_W;
const pxY = (v, domain) => M_TOP + (1 - (v - domain[0]) / (domain[1] - domain[0])) * INNER_H;

const invX = (px) => X_DOMAIN[0] + ((px - M_LEFT) / INNER_W) * (X_DOMAIN[1] - X_DOMAIN[0]);
const invDomain = (px, domain) => domain[0] + ((px - M_LEFT) / INNER_W) * (domain[1] - domain[0]);
const invY = (py, domain) => domain[0] + (1 - (py - M_TOP) / INNER_H) * (domain[1] - domain[0]);

function originFill(d) {
  return d.origin === "student" ? STUDENT_FILL : GENERATED_FILL;
}

// Same split as originFill, in the diagnostic tints.
function diagFill(d) {
  return d.origin === "student" ? DIAG_STUDENT_FILL : DIAG_GENERATED_FILL;
}

/* Free edit lets a student add a point by clicking a diagnostic plot, where the
 * axes are fitted values, residuals or quantiles — none of which are the (x, y)
 * a scatterplot needs. The least-squares line refits the moment the new point
 * joins, so the clicked position also moves. Each resolver below therefore
 * iterates a few rounds against refits until the point as rendered lands on the
 * position the student actually clicked. Pure functions, exported for tests. */

// Settle one point against refits. `aim` receives the fit that includes the
// candidate and returns the next candidate: a fixed point of "add the point,
// refit, re-aim". The refit always pulls the fitted value towards the
// candidate (by its leverage, strictly below 1), so the iteration contracts
// geometrically and a couple of dozen rounds is far more than enough. The
// widget clamps candidates to the plot axes, so clicks the fit cannot produce
// (e.g. a fitted value beyond the line's range) settle onto the nearest edge.
function settleDiagPoint(points, aim) {
  const fit = fitLeastSquares(points, 1);
  if (!fit) return null;
  const first = aim(fit);
  let x = clamp(first.x, X_DOMAIN);
  let y = clamp(first.y, Y_DOMAIN);
  for (let round = 0; round < 24; round += 1) {
    const fitWith = fitLeastSquares([...points, { x, y }], 1);
    if (!fitWith) return null;
    const next = aim(fitWith);
    const nextX = clamp(next.x, X_DOMAIN);
    const nextY = clamp(next.y, Y_DOMAIN);
    const settled = Math.abs(nextX - x) < 1e-7 && Math.abs(nextY - y) < 1e-7;
    x = nextX;
    y = nextY;
    if (settled) break;
  }
  return { x, y };
}

// Click on the residuals-vs-fitted plot at (fitted, resid): solve for the
// observation x whose fitted value (under successive refits) equals the clicked
// fitted value, with y = fitted + resid. The y is anchored to the current
// line's fitted value at the candidate x rather than to the clicked fitted
// value, so when the click's fitted value is out of the line's reach the
// residual the student asked for is still the one that renders.
function resolveResidFittedPoint(points, fittedWanted, residWanted) {
  return settleDiagPoint(points, (fit) => {
    const b0 = fit.beta[0];
    const b1 = fit.beta[1];
    // x that makes the current fit pass through fittedWanted at that x; a flat
    // line has no such x, so fall back to the clicked value as a position.
    const x = Math.abs(b1) > 1e-9 ? (fittedWanted - b0) / b1 : fittedWanted;
    return { x, y: fit.predict(x) + residWanted };
  });
}

// Click on the Q–Q plot at residual e0. A Q–Q point's horizontal position is
// its rank among the residuals, which the data cannot choose, so the new
// observation's x is taken as the mean of the current xs (the centre of the
// fit) and only the residual is placed as clicked.
function resolveQQPoint(points, residWanted) {
  const usable = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!usable.length) return null;
  const meanX = usable.reduce((s, p) => s + p.x, 0) / usable.length;
  return settleDiagPoint(points, (fit) => ({
    x: meanX,
    y: fit.predict(meanX) + residWanted,
  }));
}

function nearest(items, x, y, tol) {
  let best = null;
  let bestD = tol;
  items.forEach((it) => {
    const d = Math.hypot(it.px - x, it.py - y);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  });
  return best;
}

/* ------------------------------------------------------------------ */
/* Generators: return raw { x, y, latent?, trueSd? } arrays             */
/* ------------------------------------------------------------------ */

function generateLinearity(p, s) {
  const points = [];
  // Signed curvature: negative curls one way (S-shaped), positive the other
  // (U-shaped). The magnitude scales the departure; the sign picks the shape.
  // A smooth blend of |t|^3 and t^2 keeps the curve continuous through zero,
  // so small dial moves make small changes and 0 is a genuine straight line.
  const curv = Number.isFinite(p.curvature) ? p.curvature : 0;
  const w = clamp(Math.abs(curv) / 2, [0, 1]);
  const shapeExponent = 3 - w; // 3 = S-like cubic, 2 = U-like quadratic
  // The underlying line's slope is itself a dial: the diagnostic story must
  // hold for rising, falling, and flat lines alike.
  const slope = Number.isFinite(p.slope) ? p.slope : 1.5;
  for (let i = 0; i < p.n; i += 1) {
    const u = s.uniform();
    const z = s.normal();
    const x = X_DOMAIN[0] + (X_DOMAIN[1] - X_DOMAIN[0]) * (0.03 + 0.94 * u);
    const t = (x - 5) / 5;
    const base = 12 + slope * (x - 5);
    const magnitude = Math.abs(curv) * 2.2;
    const shapeTerm = (1 - w) * Math.sign(t) * Math.abs(t) ** shapeExponent
      + w * t * t;
    const signal = magnitude * (curv >= 0 ? shapeTerm : -shapeTerm);
    const noise = z * p.noise;
    points.push({ x, y: clamp(base + signal + noise, Y_DOMAIN), latent: noise });
  }
  return points;
}

// One fixed sample with an explicit time index. The slider reorders this
// sample; it never changes x, y, the fitted line or any residual value.
// `strength` (set by the presets) controls how much of the time pattern is
// present; when it is 0 only noise remains, so the sequence genuinely has
// nothing to find rather than merely hiding a pattern.
function generateIndependence(p, s) {
  const n = p.n;
  const strength = typeof p.strength === "number" ? p.strength : 1;
  const xs = Array.from({ length: n }, () => 0.3 + 9.4 * s.uniform()).sort((a, b) => a - b);

  // Which moment each observation was recorded at, as a fixed permutation. It
  // is deliberately independent of x: the time pattern is then invisible in the
  // scatterplot and only shows up once the sequence is put back into time order.
  const times = randomPermutation(n, s).map((slot) => slot / n);

  // Build the series in time order, then hand each element to the observation
  // recorded at that moment, so the pattern is a property of the sequence.
  const pattern = timePattern(n, s);
  const noise = Array.from({ length: n }, () => s.normal());
  const mix = Math.sqrt(Math.max(0, 1 - strength * strength));
  const series = pattern.map((z, k) => strength * z + mix * noise[k]);

  const timeRank = times
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t - b.t)
    .map((o) => o.i);
  const raw = new Array(n);
  timeRank.forEach((pointIndex, k) => {
    raw[pointIndex] = series[k];
  });

  // The fitted line is the least-squares line through these points. Remove any
  // slope this error series happens to have, so the scatterplot stays a clean
  // cloud and the whole story lives in the sequence.
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanE = raw.reduce((a, b) => a + b, 0) / n;
  let sxe = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxe += (x - meanX) * raw[i];
    sxx += (x - meanX) ** 2;
  });
  const slope = sxx > 1e-12 ? sxe / sxx : 0;
  const errors = raw.map((e, i) => e - (meanE + slope * (xs[i] - meanX)));
  const sd = sampleSd(errors) || 1;

  return xs.map((x, i) => {
    // Scaled so the runs and swings use a good share of the residual axis; the
    // shape of the sequence, not its raw size, is what the widget teaches.
    const e = (errors[i] / sd) * 1.7;
    return { x, y: clamp(11 + 1.3 * (x - 5) + e, Y_DOMAIN), latent: e, t: times[i] };
  });
}

// The severity sliders now reach 2. Past 1 the extra strength is compressed,
// so the dial keeps moving the data without blowing the fixed residual axis:
// linear to 1 (where the presets sit), then progressively gentler.
function effectiveSeverity(sev) {
  const v = Number.isFinite(sev) ? sev : 0;
  return v <= 1 ? v : 1 + (v - 1) * 0.35;
}

// A fixed-point normaliser: given a departure family and its raw output, find
// the scalar c that makes the mean |c·f(z)| land on the target scale. Applied
// per sample, so every shape and dial position fills the same share of the
// residual axis and severity changes shape rather than overall size.
function calibrateScale(family, n, s) {
  const draws = Array.from({ length: n }, () => family(s.normal()));
  // Calibrate on RMS rather than mean |.|: the families reshape the tails, so
  // mean |.| drifts with the dial while RMS (what the sample SD tracks) stays
  // comparable across dial positions.
  const meanSquare = draws.reduce((a, b) => a + b * b, 0) / n;
  const rms = Math.sqrt(meanSquare);
  return rms > 1e-9 ? 1 / rms : 1;
}

function generateNormality(p, s) {
  const xs = Array.from({ length: p.n }, () => 0.3 + 9.4 * s.uniform()).sort((a, b) => a - b);
  // Shape picks the departure family; the severity dial scales the departure
  // for the skewed and heavy-tailed families. For the normal shape severity
  // has no meaning — the widget greys the dial out — and the family ignores
  // it, so the Q–Q cannot drift into a shape that defeats the teaching point.
  // Each family is calibrated so the sample fills a similar share of the
  // residual axis whatever the dial does.
  const shape = p.shape || "normal";
  const sev = effectiveSeverity(Number.isFinite(p.severity) ? p.severity : 1);
  const k = 0.5 * sev;
  const families = {
    normal: (z) => z,
    skewed: (z) => {
      // Lognormal-style stretch: negative draws are shrunk towards zero,
      // positive ones stretched, giving genuine right skew. Soft-clipped
      // (tanh) against the residual axis so even a worst-case n=80 sample
      // stays on the plot.
      const stretch = Math.exp(k * z - (k * k) / 2) * z;
      return 7.4 * Math.tanh((0.1 * z + 0.9 * stretch) / 7.4);
    },
    heavy: (z) => {
      // Symmetric heavy tails with a soft clip for the worst-case sample.
      const tail = Math.sign(z) * Math.abs(z) ** (1 + 1.2 * sev);
      const mixed = (1 - Math.min(1, sev)) * z + Math.min(1, sev) * tail;
      return 7.4 * Math.tanh(mixed / 7.4);
    },
  };
  const family = families[shape] || families.normal;
  // The calibration stream is fixed per shape (severity does not feed it for
  // the normal family), so the normal sample is bit-for-bit identical whatever
  // the dial does — the dial is greyed out for that shape anyway.
  const scale = calibrateScale(family, 60, makeStreams(shape === "normal"
    ? "normscale,normal"
    : `normscale,${shape},${sev.toFixed(3)}`));
  const raws = [];
  for (let i = 0; i < p.n; i += 1) {
    raws.push(scale * family(s.normal()));
  }
  const sd = sampleSd(raws) || 1;
  return xs.map((x, i) => {
    const e = (raws[i] / sd) * 1.15;
    return { x, y: clamp(11 + 1.0 * (x - 5) + e, Y_DOMAIN), latent: e };
  });
}

function equalVarianceSdAt(pattern, spreadDial, x) {
  const t = (x - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0]);
  // The dial is a 0–1 spread fraction; it maps to the funnel's wide-end SD.
  // At 1 the wide end reaches 2.65 (its 2 SD band just inside the y-axis); the
  // mapping is linear below so small dial moves make small changes. Constant
  // spreads a smaller multiple of the same dial everywhere, which is what
  // keeps a full-dial constant pattern on the plot. The funnel's thin end
  // stays thin, so the wide end does most of the work and the pattern reads.
  // The preset 0.45 sits where the funnel is unmistakable without crowding.
  const spread = clamp(Number.isFinite(spreadDial) ? spreadDial : 0.75, [0, 1]);
  const wideSd = 0.35 + 2.3 * spread;
  const constantSd = 0.4 + 1.9 * spread;
  if (pattern === "increasing") return wideSd * (0.12 + 0.88 * t);
  if (pattern === "decreasing") return wideSd * (0.12 + 0.88 * (1 - t));
  if (pattern === "bowtie") return wideSd * (0.15 + 0.85 * Math.abs(x - 5) / 5);
  return constantSd;
}

function generateEqualVariance(p, s) {
  const xs = Array.from({ length: p.n }, () => 0.3 + 9.4 * s.uniform()).sort((a, b) => a - b);
  return xs.map((x) => {
    const z = s.normal();
    const sd = equalVarianceSdAt(p.pattern, p.sd, x);
    // The draw itself is soft-clipped: an outlier at the wide end of a
    // full-dial funnel would otherwise land outside the y-axis. The clip
    // keeps the extreme tail visible at the plot edge instead of off-plot.
    const e = 6.9 * Math.tanh((z * sd) / 6.9);
    return {
      x,
      y: clamp(11 + 1.2 * (x - 5) + e, Y_DOMAIN),
      latent: e,
      trueSd: sd,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Shared widget factory                                                */
/* ------------------------------------------------------------------ */

function createLab(Inputs, Plot, opts) {
  const state = {
    mode: "guided",
    preset: "well",
    controls: {},
    seedOffset: 0,
    sampleSize: opts.nDefault,
    freeSnapshot: null,
    freeOrder: null,
    edits: { past: [], present: [], future: [] },
    idCounter: 1,
    selectedId: null,
    hoveredId: null,
    diagView: "primary",
    extras: {},
    cacheKey: null,
    cache: null,
    runtime: { scatterDrag: null, diagDrag: null },
  };
  opts.controlDefs.forEach((d) => {
    state.controls[d.key] = d.default;
  });
  (opts.extraOptionDefs || []).forEach((d) => {
    state.extras[d.key] = false;
  });

  /* ---------------------------- DOM shell --------------------------- */

  const lab = h("div", "line-lab");
  lab.dataset.assumption = opts.assumption;

  const controlsEl = h("div", "line-lab-controls");
  const vizEl = h("div", "line-lab-viz");
  const scatterHost = h("div", "line-lab-scatter ll-plot");
  const diagHost = h("div", "line-lab-diag ll-plot");
  vizEl.append(scatterHost, diagHost);
  lab.append(controlsEl, vizEl);

  function segmented(pairs, getCurrent, onPick, className) {
    const wrap = h("div", `ll-segment ${className || ""}`);
    const buttons = pairs.map(([value, label]) => {
      const btn = h("button", "ll-segment-btn", label);
      btn.type = "button";
      btn.dataset.value = value;
      btn.setAttribute("aria-pressed", String(getCurrent() === value));
      btn.addEventListener("click", () => onPick(value));
      wrap.append(btn);
      return btn;
    });
    return {
      el: wrap,
      update() {
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(getCurrent() === b.dataset.value)));
      },
    };
  }

  function makeButton(label, className, onClick) {
    const btn = h("button", `ll-btn ${className || ""}`, label);
    btn.type = "button";
    btn.addEventListener("click", onClick);
    return btn;
  }

  /* Mode + preset toggles */
  const modeSeg = segmented(
    [["guided", "Guided"], ["free", "Free edit"]],
    () => state.mode,
    (value) => setMode(value),
    "ll-mode",
  );
  controlsEl.append(h("div", "ll-section-label", "Mode"), modeSeg.el);

  const presetOptions = opts.assumption === "independence"
    ? [["well", "Shuffled order"], ["violation", "Time order"]]
    : [["well", "Well-behaved"], ["violation", "Violation"]];
  const presetSeg = segmented(
    presetOptions,
    () => state.preset,
    (value) => applyPreset(value),
    "ll-preset",
  );
  controlsEl.append(h("div", "ll-section-label", "Example"), presetSeg.el);

  /* Guided controls (disabled in free edit) */
  const guidedWrap = h("div", "ll-guided");
  const guidedFields = [];

  const newSampleBtn = makeButton("Generate another sample", "ll-new-sample", () => {
    state.seedOffset += 1;
    render();
  });
  guidedWrap.append(newSampleBtn);

  if (opts.hasNControl) {
    const field = h("div", "ll-field");
    field.append(h("label", "ll-field-label", "Sample size (n)"));
    const row = h("div", "ll-range-row");
    const input = document.createElement("input");
    input.type = "range";
    input.min = "12";
    // 80 keeps the histogram counts readable (max bin about 30) and the plots
    // uncluttered at lecture-hall resolution; 100 was too dense.
    input.max = "80";
    input.step = "1";
    input.value = String(state.sampleSize);
    const readout = h("span", "ll-readout", String(state.sampleSize));
    input.addEventListener("input", () => {
      state.sampleSize = Number(input.value);
      readout.textContent = input.value;
      render();
    });
    row.append(input, readout);
    field.append(row);
    guidedWrap.append(field);
    guidedFields.push({ input, readout, kind: "n" });
  }

  opts.controlDefs.forEach((def) => {
    const field = h("div", "ll-field");
    field.append(h("label", "ll-field-label", def.label));
    const readText = (v) => (typeof def.format === "function" ? def.format(v) : fmt(v));
    let input;
    let readout = null;
    if (def.type === "range") {
      const row = h("div", "ll-range-row");
      input = document.createElement("input");
      input.type = "range";
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(state.controls[def.key]);
      readout = h("span", "ll-readout", readText(Number(def.default)));
      input.addEventListener("input", () => {
        state.controls[def.key] = Number(input.value);
        readout.textContent = readText(Number(input.value));
        render();
      });
      row.append(input, readout);
      field.append(row);
    } else {
      input = document.createElement("select");
      def.options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        input.append(option);
      });
      input.value = state.controls[def.key];
      input.addEventListener("input", () => {
        state.controls[def.key] = def.numeric ? Number(input.value) : input.value;
        render();
      });
      field.append(input);
    }
    guidedWrap.append(field);
    guidedFields.push({ def, input, readout, kind: "control" });
  });
  controlsEl.append(guidedWrap);

  /* Dynamic hosts */
  const optionsHost = h("div", "ll-options");
  const editHost = h("div", "ll-edits");
  controlsEl.append(optionsHost, editHost);

  /* Legend + instructions */
  const legend = h("div", "ll-legend");
  const dotGen = h("span", "ll-keydot ll-keydot-generated");
  const dotStu = h("span", "ll-keydot ll-keydot-student");
  const dotGenDiag = h("span", "ll-keydot ll-keydot-diag-generated");
  const dotStuDiag = h("span", "ll-keydot ll-keydot-diag-student");
  legend.append(dotGen, document.createTextNode(" generated data  "),
    dotStu, document.createTextNode(" student-added"));
  legend.append(
    dotGenDiag, document.createTextNode(" generated, diagnostic"),
    document.createTextNode("  "),
    dotStuDiag, document.createTextNode(" student, diagnostic"),
  );
  const instructions = h("div", "ll-instructions");
  instructions.innerHTML = opts.instructions;
  controlsEl.append(legend, instructions);

  /* ---------------------------- state logic -------------------------- */

  function applyPreset(name, { silent = false } = {}) {
    state.preset = name;
    const values = opts.presets[name];
    Object.entries(values).forEach(([key, value]) => {
      state.controls[key] = value;
    });
    guidedFields.forEach((f) => {
      if (f.kind !== "control" || !(f.def.key in values)) return;
      f.input.value = String(values[f.def.key]);
      if (f.readout) {
        const v = Number(values[f.def.key]);
        f.readout.textContent = typeof f.def.format === "function" ? f.def.format(v) : fmt(v);
      }
    });
    if (!silent) render();
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    if (mode === "free") {
      const current = getActivePoints().map((p) => ({ ...p }));
      state.freeSnapshot = current.map((p) => ({ ...p }));
      state.edits = { past: [], present: current, future: [] };
      state.freeOrder = null;
      state.mode = "free";
    } else {
      state.mode = "guided";
      state.freeSnapshot = null;
      state.freeOrder = null;
      state.edits = { past: [], present: [], future: [] };
      state.selectedId = null;
      state.runtime.scatterDrag = null;
      state.runtime.diagDrag = null;
    }
    render();
  }

  function generationParams() {
    const params = { n: opts.hasNControl ? state.sampleSize : opts.nDefault };
    // Controls that only steer how the sample is displayed (e.g. the order
    // slider) must stay out of the seeded draws, so the dataset itself is
    // unaffected by them.
    const displayOnly = opts.displayOnlyKeys || [];
    Object.entries(state.controls).forEach(([key, value]) => {
      if (!displayOnly.includes(key)) params[key] = value;
    });
    return params;
  }

  function generatedPoints() {
    const key = JSON.stringify([generationParams(), state.seedOffset]);
    if (key !== state.cacheKey) {
      const streams = makeStreams(`${opts.seedBase},${state.seedOffset}`);
      state.cache = opts.generate(generationParams(), streams).map((p, i) => ({
        ...p,
        id: `g${i}`,
        origin: "generated",
        order: i,
      }));
      state.cacheKey = key;
    }
    return state.cache;
  }

  function getActivePoints() {
    if (state.mode === "free") return state.edits.present;
    return generatedPoints().map((p) => ({ ...p }));
  }

  function beginEdit() {
    state.edits.past.push(state.edits.present.map((p) => ({ ...p })));
    if (state.edits.past.length > 60) state.edits.past.shift();
    state.edits.future = [];
  }

  function nextOrder(points) {
    return points.reduce((m, p) => Math.max(m, p.order), -1) + 1;
  }

  /* ---------------------------- rendering ---------------------------- */

  function plotDefaults(xLabel, yLabel, xDomain = X_DOMAIN, yDomain = Y_DOMAIN) {
    return {
      width: PLOT_W,
      height: PLOT_H,
      marginLeft: M_LEFT,
      marginRight: M_RIGHT,
      marginTop: M_TOP,
      marginBottom: M_BOTTOM,
      x: { domain: xDomain, label: xLabel, grid: true, nice: false },
      y: { domain: yDomain, label: yLabel, grid: true, nice: false },
    };
  }

  function finalizeSvg(svg) {
    svg.setAttribute("viewBox", `0 0 ${PLOT_W} ${PLOT_H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return svg;
  }

  function emptyMarks(message, yMid = 12) {
    return [Plot.text([{ x: 5, y: yMid }], {
      x: "x",
      y: "y",
      text: [message],
      fontSize: 13,
      fill: "#666",
    })];
  }

  function buildScatter(ctx) {
    const { data, fit, hovered } = ctx;
    const marks = [Plot.ruleY([0], { stroke: "#d0d0d0" })];
    if (!fit) {
      marks.push(...emptyMarks("Add at least two points with distinct x-values"));
      marks.push(Plot.dot(data, {
        x: "x",
        y: "y",
        r: 5,
        fill: originFill,
        stroke: "#fff",
        strokeWidth: 1,
      }));
      return finalizeSvg(Plot.plot({ ...plotDefaults("x", "y"), marks }));
    }

    if (opts.scatterOverlay && state.extras[opts.scatterOverlay.key]) {
      marks.push(...opts.scatterOverlay.marks(ctx, Plot));
    }
    if (state.extras.band && opts.bandOverlay) {
      marks.push(...opts.bandOverlay(ctx, Plot));
    }
    marks.push(Plot.line(LINE_X.map((x) => ({ x, y: fit.predict(x) })), {
      x: "x",
      y: "y",
      stroke: "#24313a",
      strokeWidth: 2.5,
    }));
    marks.push(Plot.dot(data, {
      x: "x",
      y: "y",
      r: 5,
      fill: originFill,
      stroke: (d) => (d.id === state.selectedId ? "#111" : "#fff"),
      strokeWidth: (d) => (d.id === state.selectedId ? 2 : 1),
    }));
    if (hovered) {
      marks.push(Plot.dot([hovered], {
        x: "x",
        y: "y",
        r: 9,
        stroke: HOVER_STROKE,
        strokeWidth: 2.5,
        fillOpacity: 0,
      }));
      marks.push(Plot.link([hovered], {
        x1: "x",
        y1: "y",
        x2: "x",
        y2: "fitted",
        stroke: HOVER_STROKE,
        strokeWidth: 2,
      }));
    }
    return finalizeSvg(Plot.plot({ ...plotDefaults("x", "y"), marks }));
  }

  // Which row of the sequence plot each independence observation occupies.
  // Midpoint of the order slider is a fixed shuffle of the recorded sequence;
  // either end sorts that same sequence back into time (giving runs) or into
  // the folded order (giving alternation). The data itself never move.
  function independenceOrder(points, times) {
    const n = points.length;
    const s = clamp(state.controls.order, [-1, 1]);
    const key = `${opts.seedBase},${state.seedOffset},${n}`;

    // Free edit changes n while the student works. Freeze the arrangement taken
    // when the mode was entered, and append added points after it, so the order
    // plot does not reshuffle underneath them.
    if (state.mode === "free") {
      if (!state.freeOrder) state.freeOrder = new Map();
      let next = n + 1;
      state.freeOrder.forEach((v) => {
        if (v >= next) next = v + 1;
      });
      return points.map((p) => {
        if (!state.freeOrder.has(p.id)) state.freeOrder.set(p.id, next);
        return state.freeOrder.get(p.id);
      });
    }

    // `points` and `times` arrive in the same (recorded) order, so the k-th
    // residual belongs to the k-th time index.
    const signal = typeof state.controls.strength === "number" ? state.controls.strength : 1;
    const rank = sequenceRank(times, points.map((p) => p.resid), s, key, signal);
    const out = new Array(n);
    rank.forEach((idx, pos) => {
      out[idx] = pos;
    });
    return out;
  }

  function makeCtx() {
    const data = getActivePoints();
    const fit = fitLeastSquares(data, 1);
    const withStats = data.map((p) => {
      const fitted = fit ? fit.predict(p.x) : NaN;
      return { ...p, fitted, resid: fit ? p.y - fitted : NaN };
    });
    if (opts.assumption === "independence") {
      const sorted = [...withStats].sort((a, b) => a.order - b.order);
      const times = sorted.map((p) => (Number.isFinite(p.t) ? p.t : p.order));
      const positions = independenceOrder(sorted, times);
      sorted.forEach((p, i) => {
        p.displayOrder = positions[i];
      });
    }
    // residual rank (stable by id) for the normality widget
    const rankOf = new Map();
    [...withStats]
      .filter((d) => Number.isFinite(d.resid))
      .sort((a, b) => a.resid - b.resid)
      .forEach((d, i) => rankOf.set(d.id, i + 1));
    const hovered = withStats.find((d) => d.id === state.hoveredId) || null;
    return {
      data: withStats,
      fit,
      hovered,
      rankOf,
      state,
      opts,
    };
  }

  /* -------- diagnostic views (each returns { title, svg, items }) --- */

  const dotOpts = {
    r: 5,
    fill: diagFill,
    stroke: "#fff",
    strokeWidth: 1,
  };

  function hoverRing(x, y) {
    return Plot.dot([{ x, y }], {
      x: "x",
      y: "y",
      r: 9,
      stroke: HOVER_STROKE,
      strokeWidth: 2.5,
      fillOpacity: 0,
    });
  }

  function residFittedView(ctx) {
    const { data, fit, hovered } = ctx;
    const marks = [Plot.ruleY([0], { stroke: "#666" })];
    if (!fit) {
      marks.push(Plot.text([{ x: 0, y: 0 }], {
        x: "x",
        y: "y",
        text: ["Fit unavailable"],
        fontSize: 13,
        fill: "#666",
      }));
      return { title: opts.primaryDiagLabel, svg: finalizeSvg(Plot.plot({ ...plotDefaults("Fitted value ŷ", "Residual e", Y_DOMAIN, RESID_DOMAIN), marks })), items: [] };
    }
    if (opts.diagOverlay) marks.push(...opts.diagOverlay(ctx, Plot, hoverRing));
    marks.push(Plot.dot(data, { x: "fitted", y: "resid", ...dotOpts }));
    if (hovered) marks.push(hoverRing(hovered.fitted, hovered.resid));
    const svg = finalizeSvg(Plot.plot({
      ...plotDefaults("Fitted value ŷ", "Residual e", Y_DOMAIN, RESID_DOMAIN),
      marks,
    }));
    const items = data.map((d) => ({
      id: d.id,
      px: pxDomain(d.fitted, Y_DOMAIN),
      py: pxY(d.resid, RESID_DOMAIN),
    }));
    return {
      title: opts.primaryDiagLabel,
      svg,
      items,
      // Blank-space clicks add a student point whose rendered (fitted, resid)
      // equals the click position; see resolveResidFittedPoint.
      addable: {
        kind: "residFitted",
        xDomain: Y_DOMAIN,
        yDomain: RESID_DOMAIN,
        invX: (px) => invDomain(px, Y_DOMAIN),
        invY: (py) => invY(py, RESID_DOMAIN),
      },
    };
  }

  function orderView(ctx) {
    const { data, fit, hovered } = ctx;
    const sorted = [...data].sort((a, b) => a.displayOrder - b.displayOrder);
    const n = sorted.length;
    const xDomain = [-0.6, Math.max(1, n) - 0.4];
    // The number shown to students is the position in the sequence on display,
    // so it matches the axis and the labels.
    const sequenceNumber = (d) => d.displayOrder;
    const marks = [Plot.ruleY([0], { stroke: "#666" })];
    if (!fit) {
      marks.push(Plot.text([{ x: (xDomain[0] + xDomain[1]) / 2, y: 0 }], {
        x: "x",
        y: "y",
        text: ["Fit unavailable"],
        fontSize: 13,
        fill: "#666",
      }));
      return { title: opts.primaryDiagLabel, svg: finalizeSvg(Plot.plot({ ...plotDefaults("Observation order", "Residual e", xDomain, RESID_DOMAIN), marks })), items: [] };
    }
    marks.push(Plot.line(sorted, {
      x: "displayOrder",
      y: "resid",
      stroke: "#999",
      strokeWidth: 1.2,
    }));
    marks.push(Plot.dot(sorted, { x: "displayOrder", y: "resid", ...dotOpts }));
    if (n <= 40) {
      marks.push(Plot.text(sorted, {
        x: "displayOrder",
        y: "resid",
        // Number the point by where it sits in the sequence being shown, so the
        // label agrees with the axis and with the hover panel.
        text: (d) => String(sequenceNumber(d) + 1),
        dy: -11,
        fontSize: 9,
        fill: "#777",
      }));
    }
    if (hovered) marks.push(hoverRing(hovered.displayOrder, hovered.resid));
    const svg = finalizeSvg(Plot.plot({
      ...plotDefaults("Observation order", "Residual e", xDomain, RESID_DOMAIN),
      marks,
    }));
    const items = sorted.map((d) => ({
      id: d.id,
      px: pxDomain(d.displayOrder, xDomain),
      py: pxY(d.resid, RESID_DOMAIN),
    }));
    const r1 = lag1Correlation(sorted.map((d) => d.resid));
    return {
      title: opts.primaryDiagLabel,
      svg,
      items,
      invertY: (py) => invY(py, RESID_DOMAIN),
      draggable: true,
      // No `addable` here: the order plot's click x is a sequence position, and
      // the teaching story for this widget is drag + reorder, not add.
      stats: r1 == null ? [] : [{
        label: "Correlation with the previous residual",
        value: `r\u2081 = ${fmt(r1)}`,
        tone: r1 > 0.25 ? "positive" : (r1 < -0.25 ? "negative" : "neutral"),
      }],
    };
  }

  function qqView(ctx) {
    const { data, fit, hovered } = ctx;
    const sorted = [...data]
      .filter((d) => Number.isFinite(d.resid))
      .sort((a, b) => a.resid - b.resid);
    const n = sorted.length;
    const maxTheo = n > 1 ? invNorm(1 - 0.5 / n) : 1.5;
    const xDomain = [-maxTheo * 1.15, maxTheo * 1.15];
    const marks = [];
    if (!fit || n < 2) {
      marks.push(Plot.text([{ x: 0, y: 0 }], {
        x: "x",
        y: "y",
        text: ["Q–Q plot unavailable"],
        fontSize: 13,
        fill: "#666",
      }));
      return { title: opts.primaryDiagLabel, svg: finalizeSvg(Plot.plot({ ...plotDefaults("Theoretical normal quantile", "Residual e", xDomain, RESID_DOMAIN), marks })), items: [] };
    }
    const qq = sorted.map((d, i) => ({
      ...d,
      theo: invNorm(((i + 1) - 0.5) / n),
    }));
    // quartile-based reference line
    const i1 = Math.max(0, Math.floor(0.25 * (n - 1)));
    const i3 = Math.min(n - 1, Math.ceil(0.75 * (n - 1)));
    const q1 = qq[i1];
    const q3 = qq[i3];
    if (Math.abs(q3.theo - q1.theo) > 1e-9) {
      const slope = (q3.resid - q1.resid) / (q3.theo - q1.theo);
      const intercept = q1.resid - slope * q1.theo;
      marks.push(Plot.line(
        xDomain.map((x) => ({ x, y: intercept + slope * x })),
        { x: "x", y: "y", stroke: "#888", strokeDasharray: "4,4", strokeWidth: 1.5 },
      ));
    }
    marks.push(Plot.dot(qq, { x: "theo", y: "resid", ...dotOpts }));
    if (hovered && Number.isFinite(hovered.resid)) {
      const qh = qq.find((d) => d.id === hovered.id);
      if (qh) marks.push(hoverRing(qh.theo, qh.resid));
    }
    const svg = finalizeSvg(Plot.plot({
      ...plotDefaults("Theoretical normal quantile", "Residual e", xDomain, RESID_DOMAIN),
      marks,
    }));
    const items = qq.map((d) => ({
      id: d.id,
      px: pxDomain(d.theo, xDomain),
      py: pxY(d.resid, RESID_DOMAIN),
    }));
    return {
      title: opts.primaryDiagLabel,
      svg,
      items,
      // Blank-space clicks add a student point at the clicked residual; the
      // horizontal spot is the point's rank quantile, so it may land away from
      // the click. See resolveQQPoint.
      addable: {
        kind: "qq",
        xDomain,
        yDomain: RESID_DOMAIN,
        invY: (py) => invY(py, RESID_DOMAIN),
      },
    };
  }

  function lagView(ctx) {
    const { data, fit, hovered } = ctx;
    const sorted = [...data]
      .filter((d) => Number.isFinite(d.resid))
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const pairs = sorted.slice(1).map((d, i) => ({
      id: d.id,
      origin: d.origin,
      ePrev: sorted[i].resid,
      e: d.resid,
    }));
    const maxAbs = Math.max(1, ...pairs.map((p) => Math.max(Math.abs(p.e), Math.abs(p.ePrev)))) * 1.15;
    const domain = [-maxAbs, maxAbs];
    const marks = [
      Plot.ruleX([0], { stroke: "#bbb" }),
      Plot.ruleY([0], { stroke: "#bbb" }),
      Plot.dot(pairs, { x: "ePrev", y: "e", ...dotOpts }),
    ];
    if (hovered) {
      const ph = pairs.find((p) => p.id === hovered.id);
      if (ph) marks.push(hoverRing(ph.ePrev, ph.e));
    }
    const svg = finalizeSvg(Plot.plot({
      ...plotDefaults("Previous residual e(i−1)", "Residual e(i)", domain, domain),
      marks,
    }));
    const items = pairs.map((p) => ({
      id: p.id,
      px: pxDomain(p.ePrev, domain),
      py: pxY(p.e, domain),
    }));
    return { title: "Lag plot: e(i) against e(i−1)", svg, items };
  }

  function histView(ctx) {
    const { data } = ctx;
    const values = data.filter((d) => Number.isFinite(d.resid));
    const marks = [
      Plot.ruleY([0], { stroke: "#666" }),
      Plot.rectY(values, Plot.binX(
        { y: "count" },
        { x: "resid", thresholds: 14, fill: "#9ecae1", stroke: "#3182bd" },
      )),
    ];
    const svg = finalizeSvg(Plot.plot({
      ...plotDefaults("Residual e", "Count", RESID_DOMAIN, [0, 30], { y: { label: "Count", grid: true, nice: true } }),
      marks,
    }));
    return { title: "Residual histogram", svg, items: [] };
  }

  function distView(ctx) {
    const { data } = ctx;
    const latents = data.map((d) => (Number.isFinite(d.latent) ? d.latent : d.resid))
      .filter(Number.isFinite);
    const sd = sampleSd(latents) || 1;
    const grid = Array.from({ length: 200 }, (_, i) => RESID_DOMAIN[0]
      + (i * (RESID_DOMAIN[1] - RESID_DOMAIN[0])) / 199);
    const density = grid.map((x) => ({ x, d: normalPdf(x, sd) }));
    const yMax = Math.max(...density.map((d) => d.d)) * 1.3;
    const marks = [
      Plot.areaY(density, { x: "x", y: "d", fill: "#9ecae1", fillOpacity: 0.45 }),
      Plot.line(density, { x: "x", y: "d", stroke: "#3182bd", strokeWidth: 1.5 }),
      Plot.tickX(latents.map((e) => ({ e })), { x: "e", strokeOpacity: 0.35 }),
    ];
    const svg = finalizeSvg(Plot.plot({
      width: PLOT_W,
      height: PLOT_H,
      marginLeft: M_LEFT,
      marginRight: M_RIGHT,
      marginTop: M_TOP,
      marginBottom: M_BOTTOM,
      x: { domain: RESID_DOMAIN, label: "Error value", grid: true, nice: false },
      y: { domain: [0, yMax], label: "Density", grid: true },
      marks,
    }));
    return { title: "Generating error distribution (fitted normal curve + draws)", svg, items: [] };
  }

  const extraViewDefs = {
    lag: lagView,
    hist: histView,
    dist: distView,
  };

  const primaryBuilders = {
    "resid-fitted": residFittedView,
    order: orderView,
    qq: qqView,
  };

  function buildDiagView(ctx) {
    const defKey = state.diagView;
    const builder = defKey === "primary"
      ? primaryBuilders[opts.diagKind]
      : extraViewDefs[defKey];
    return builder(ctx);
  }

  /* ------------------------------ pointer ---------------------------- */

  // Geometry snapshot taken at render time (after layout). getBoundingClientRect
  // during a pointer event fired while the slide is being rebuilt can momentarily
  // return a 0x0 rect, yielding NaN projection and losing the hit-test.
  state.geom = { scatter: null, diag: null };

  function snapGeometry(svg, kind) {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      state.geom[kind] = {
        left: rect.left,
        top: rect.top,
        sx: rect.width / PLOT_W,
        sy: rect.height / PLOT_H,
      };
    }
  }

  function svgPoint(svg, ev, kind) {
    const geom = state.geom[kind];
    if (geom && geom.sx > 0 && geom.sy > 0) {
      return {
        px: (ev.clientX - geom.left) / geom.sx,
        py: (ev.clientY - geom.top) / geom.sy,
      };
    }
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { px: NaN, py: NaN };
    return {
      px: ((ev.clientX - rect.left) / rect.width) * PLOT_W,
      py: ((ev.clientY - rect.top) / rect.height) * PLOT_H,
    };
  }

  function updateHover(id) {
    if (state.hoveredId === id) return;
    state.hoveredId = id;
    render();
  }

  function wireScatter(svg, ctx) {
    svg.addEventListener("pointerdown", (ev) => {
      if (state.mode !== "free") return;
      ev.preventDefault();
      const { px, py } = svgPoint(svg, ev, "scatter");
      const items = ctx.data.map((d) => ({ id: d.id, px: pxX(d.x), py: pxY(d.y, Y_DOMAIN) }));
      const hit = nearest(items, px, py, 12);
      if (hit) {
        state.selectedId = hit.id;
        state.runtime.scatterDrag = { id: hit.id, moved: false, pointerId: ev.pointerId };
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
        render();
      } else {
        beginEdit();
        const point = {
          id: `u${state.idCounter += 1}`,
          origin: "student",
          order: nextOrder(state.edits.present),
          x: clamp(invX(px), X_DOMAIN),
          y: clamp(invY(py, Y_DOMAIN), Y_DOMAIN),
        };
        state.edits.present = [...state.edits.present, point];
        state.selectedId = point.id;
        render();
      }
    });

    svg.addEventListener("pointermove", (ev) => {
      const drag = state.runtime.scatterDrag;
      const { px, py } = svgPoint(svg, ev, "scatter");
      if (drag && state.mode === "free") {
        if (!drag.moved) {
          beginEdit();
          drag.moved = true;
        }
        state.edits.present = state.edits.present.map((p) => (p.id === drag.id
          ? { ...p, x: clamp(invX(px), X_DOMAIN), y: clamp(invY(py, Y_DOMAIN), Y_DOMAIN) }
          : p));
        render();
        return;
      }
      const items = ctx.data.map((d) => ({ id: d.id, px: pxX(d.x), py: pxY(d.y, Y_DOMAIN) }));
      const hit = Number.isFinite(px) && Number.isFinite(py)
        ? nearest(items, px, py, 14)
        : null;
      updateHover(hit ? hit.id : null);
    });

    svg.addEventListener("pointerup", (ev) => {
      const drag = state.runtime.scatterDrag;
      if (drag && drag.pointerId === ev.pointerId) {
        state.runtime.scatterDrag = null;
        if (!drag.moved) render();
      }
    });

    svg.addEventListener("pointerleave", () => {
      if (!state.runtime.scatterDrag) updateHover(null);
    });
  }

  function wireDiag(svg, built, ctx) {
    svg.addEventListener("pointerdown", (ev) => {
      if (state.mode !== "free" || !ctx.fit) return;
      ev.preventDefault();
      const { px, py } = svgPoint(svg, ev, "diag");
      const hit = nearest(built.items, px, py, 12);
      if (hit && built.draggable) {
        state.selectedId = hit.id;
        state.runtime.diagDrag = {
          id: hit.id,
          moved: false,
          pointerId: ev.pointerId,
          fitAtStart: ctx.fit,
        };
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
        render();
        return;
      }
      if (hit || !built.addable) return;
      // Blank space in an addable diagnostic: create the observation the click
      // describes. The resolver turns (fitted, resid) — or a clicked residual
      // in the Q–Q — into the (x, y) that renders there once the line refits.
      const target = built.addable.kind === "qq"
        ? { resid: built.addable.invY(py) }
        : {
          fitted: built.addable.invX(px),
          resid: built.addable.invY(py),
        };
      const resolved = built.addable.kind === "qq"
        ? resolveQQPoint(ctx.data, clamp(target.resid, RESID_DOMAIN))
        : resolveResidFittedPoint(
          ctx.data,
          clamp(target.fitted, Y_DOMAIN),
          clamp(target.resid, RESID_DOMAIN),
        );
      if (!resolved) return;
      beginEdit();
      const point = {
        id: `u${state.idCounter += 1}`,
        origin: "student",
        order: nextOrder(state.edits.present),
        x: resolved.x,
        y: resolved.y,
      };
      state.edits.present = [...state.edits.present, point];
      state.selectedId = point.id;
      render();
    });

    svg.addEventListener("pointermove", (ev) => {
      const drag = state.runtime.diagDrag;
      const { px, py } = svgPoint(svg, ev, "diag");
      if (drag && state.mode === "free" && built.invertY) {
        if (!drag.moved) {
          beginEdit();
          drag.moved = true;
        }
        const residVal = built.invertY(py);
        state.edits.present = state.edits.present.map((p) => {
          if (p.id !== drag.id) return p;
          const fittedAt = drag.fitAtStart.predict(p.x);
          return { ...p, y: clamp(fittedAt + residVal, Y_DOMAIN) };
        });
        render();
        return;
      }
      const hit = Number.isFinite(px) && Number.isFinite(py)
        ? nearest(built.items, px, py, 14)
        : null;
      updateHover(hit ? hit.id : null);
    });

    svg.addEventListener("pointerup", (ev) => {
      const drag = state.runtime.diagDrag;
      if (drag && drag.pointerId === ev.pointerId) {
        state.runtime.diagDrag = null;
        if (!drag.moved) render();
      }
    });

    svg.addEventListener("pointerleave", () => {
      if (!state.runtime.diagDrag) updateHover(null);
    });
  }

  /* ------------------------------ render ----------------------------- */

  function renderDynamicControls() {
    modeSeg.update();
    presetSeg.update();

    const free = state.mode === "free";
    guidedWrap.classList.toggle("ll-disabled", free);
    guidedWrap.querySelectorAll("input, select, button").forEach((el) => {
      el.disabled = free;
    });
    presetSeg.el.querySelectorAll("button").forEach((el) => {
      el.disabled = free;
    });
    // Controls whose meaning depends on another control (e.g. Severity is
    // meaningless for the normal error shape) grey out when not applicable.
    guidedFields.forEach((f) => {
      if (f.kind !== "control" || !f.def.enabledWhen) return;
      f.input.disabled = free || !f.def.enabledWhen(state);
    });

    // display options (always shown)
    optionsHost.replaceChildren();
    {
      const wrap = h("div", "ll-option-list");
      (opts.extraOptionDefs || []).forEach((def) => {
        const label = h("label", "ll-check");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!state.extras[def.key];
        cb.addEventListener("input", () => { state.extras[def.key] = cb.checked; render(); });
        label.append(cb, document.createTextNode(` ${def.label}`));
        wrap.append(label);
      });
      if ((opts.extraViews || []).length) {
        const field = h("div", "ll-field ll-view-field");
        field.append(h("label", "ll-field-label", "Diagnostic view"));
        const select = document.createElement("select");
        const views = [
          ["primary", opts.primaryDiagLabel],
          ...opts.extraViews.map((v) => [v.key, v.label]),
        ];
        views.forEach(([value, label]) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          select.append(option);
        });
        select.value = state.diagView;
        select.addEventListener("input", () => { state.diagView = select.value; render(); });
        field.append(select);
        wrap.append(field);
      }
      optionsHost.append(wrap);
    }

    // free-edit controls
    editHost.replaceChildren();
    if (free) {
      const wrap = h("div", "ll-edit-buttons");
      const deleteBtn = makeButton("Delete selected", "", () => {
        if (!state.selectedId) return;
        if (!state.edits.present.some((p) => p.id === state.selectedId)) return;
        beginEdit();
        state.edits.present = state.edits.present.filter((p) => p.id !== state.selectedId);
        state.selectedId = null;
        render();
      });
      deleteBtn.disabled = !state.selectedId;
      const undoBtn = makeButton("Undo", "", () => {
        if (!state.edits.past.length) return;
        state.edits.future.push(state.edits.present);
        state.edits.present = state.edits.past.pop();
        state.selectedId = null;
        render();
      });
      undoBtn.disabled = !state.edits.past.length;
      const redoBtn = makeButton("Redo", "", () => {
        if (!state.edits.future.length) return;
        state.edits.past.push(state.edits.present);
        state.edits.present = state.edits.future.pop();
        state.selectedId = null;
        render();
      });
      redoBtn.disabled = !state.edits.future.length;
      const resetBtn = makeButton("Reset edits", "", () => {
        beginEdit();
        state.edits.present = state.freeSnapshot.map((p) => ({ ...p }));
        state.selectedId = null;
        render();
      });
      wrap.append(deleteBtn, undoBtn, redoBtn, resetBtn);
      editHost.append(wrap);
    }
  }

  function renderViz() {
    const ctx = makeCtx();

    // scatter
    const scatterTitle = h("div", "ll-plot-title", "Observed data & least-squares line");
    const scatterBody = h("div", "ll-plot-body");
    const scatterSvg = buildScatter(ctx);
    scatterBody.append(scatterSvg);
    wireScatter(scatterSvg, ctx);

    const stats = h("div", "ll-stats");
    if (ctx.fit) {
      const [b0, b1] = ctx.fit.beta;
      const sign = b1 < 0 ? "−" : "+";
      let text = `ŷ = ${fmt(b0)} ${sign} ${fmt(Math.abs(b1))}x`;
      if (opts.showRSquared) {
        const r2 = rSquared(ctx.data, ctx.fit.predict);
        if (r2 != null) text += `   ·   R² = ${r2.toFixed(2)}`;
      }
      stats.textContent = text;
    } else {
      stats.textContent = "Fit unavailable — add at least two points with distinct x-values.";
    }
    scatterHost.replaceChildren(scatterTitle, scatterBody, stats);

    // hover info panel (over scatter)
    if (ctx.hovered) {
      const info = h("div", "ll-hover-info");
      const d = ctx.hovered;
      // For independence, "observation number" means its place in the sequence
      // currently on display, so it agrees with the diagnostic plot.
      const heading = opts.assumption === "independence" && Number.isFinite(d.displayOrder)
        ? `Observation ${d.displayOrder + 1} of ${ctx.data.length}`
        : `Observation ${d.order + 1}`;
      const rows = [
        `<strong>${heading}</strong>${d.origin === "student" ? ' <span class="ll-tag">added</span>' : ""}`,
        `x<sub>i</sub> = ${fmt(d.x)}   y<sub>i</sub> = ${fmt(d.y)}`,
      ];
      if (ctx.fit) {
        rows.push(`ŷ<sub>i</sub> = ${fmt(d.fitted)}   e<sub>i</sub> = ${fmt(d.resid)}`);
        if (opts.assumption === "normality" && ctx.rankOf.has(d.id)) {
          rows.push(`residual rank ${ctx.rankOf.get(d.id)} of ${ctx.rankOf.size}`);
        }
      } else {
        rows.push("fit unavailable");
      }
      info.innerHTML = rows.map((r) => `<div>${r}</div>`).join("");
      scatterBody.style.position = "relative";
      const rect = scatterSvg.getBoundingClientRect();
      const geom = state.geom.scatter;
      const dispW = rect.width > 0 ? rect.width : (geom ? geom.sx * PLOT_W : 0);
      const dispH = rect.height > 0 ? rect.height : (geom ? geom.sy * PLOT_H : 0);
      if (dispW > 0 && dispH > 0) {
        const scale = dispW / PLOT_W;
        const left = clamp(pxX(d.x) * scale + 14, [4, Math.max(4, dispW - 180)]);
        const top = clamp(pxY(d.y, Y_DOMAIN) * (dispH / PLOT_H) - 10, [4, Math.max(4, dispH - 90)]);
        info.style.left = `${left}px`;
        info.style.top = `${top}px`;
      }
      scatterBody.append(info);
    }

    // diagnostic
    const built = buildDiagView(ctx);
    const title = h("div", "ll-plot-title", built.title);
    const body = h("div", "ll-plot-body");
    body.append(built.svg);
    wireDiag(built.svg, built, ctx);
    const diagStats = h("div", "ll-diag-stats");
    (built.stats || []).forEach((s) => {
      const chip = h("span", `ll-chip ll-chip-${s.tone || "neutral"}`);
      chip.innerHTML = `${s.label} <strong>${s.value}</strong>`;
      diagStats.append(chip);
    });
    // Only occupy the space when there is something to report, so the other
    // three widgets keep their original layout.
    diagHost.replaceChildren(title, body, ...(built.stats && built.stats.length ? [diagStats] : []));

    // Cache geometry after layout so pointer projection stays correct even when
    // a later pointer event fires while the slide is being rebuilt.
    requestAnimationFrame(() => {
      if (scatterSvg.isConnected) snapGeometry(scatterSvg, "scatter");
      const diagSvg = diagHost.querySelector("svg");
      if (diagSvg && diagSvg.isConnected) snapGeometry(diagSvg, "diag");
    });
  }

  function render() {
    try {
      renderDynamicControls();
      renderViz();
    } catch (err) {
      // Never leave a lab in a broken state mid-slide; surface the cause for dev.
      if (typeof console !== "undefined" && console.error) {
        console.error(`[line-assumptions-lab] ${opts.assumption} render error:`, err);
      }
    }
  }

  applyPreset("well", { silent: true });
  render();
  return lab;
}

/* ------------------------------------------------------------------ */
/* Widget-specific overlays                                             */
/* ------------------------------------------------------------------ */

function equalVarianceBandMarks(ctx, Plot) {
  const { pattern, sd } = ctx.state.controls;
  // Centre the band on the least-squares line the plot actually draws. The
  // sample line differs from the generating mean by ordinary sampling noise,
  // and a band pinned to the generating mean floats visibly off the regression
  // line — which reads as a bug to students. Free-edit mode can lose the fit
  // entirely, so fall back to the generating mean there.
  const fit = ctx.fit;
  const centreAt = fit
    ? (x) => fit.predict(x)
    : (x) => 11 + 1.2 * (x - 5);
  const band = LINE_X.map((x) => {
    const sdAt = equalVarianceSdAt(pattern, sd, x);
    const centre = centreAt(x);
    return {
      x,
      y1: clamp(centre - 2 * sdAt, Y_DOMAIN),
      y2: clamp(centre + 2 * sdAt, Y_DOMAIN),
    };
  });
  return [
    Plot.areaY(band, { x: "x", y1: "y1", y2: "y2", fill: "#888", fillOpacity: 0.14 }),
    Plot.line(band.map((d) => ({ x: d.x, y: d.y1 })), {
      x: "x", y: "y", stroke: "#777", strokeDasharray: "3,3", strokeWidth: 1,
    }),
    Plot.line(band.map((d) => ({ x: d.x, y: d.y2 })), {
      x: "x", y: "y", stroke: "#777", strokeDasharray: "3,3", strokeWidth: 1,
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Public widget factories                                              */
/* ------------------------------------------------------------------ */

export function linearityLab({ Inputs, Plot }) {
  return createLab(Inputs, Plot, {
    assumption: "linearity",
    seedBase: "lin",
    nDefault: 40,
    diagKind: "resid-fitted",
    primaryDiagLabel: "Residuals vs fitted values",
    showRSquared: true,
    controlDefs: [
      {
        // One dial, two shapes: negative curls the curve one way (S-shaped),
        // positive the other (U-shaped), zero is a genuine straight line. A
        // separate shape select plus a strength slider left one of them dead.
        key: "curvature", type: "range", label: "Curvature", min: -2, max: 2, step: 0.05, default: 0,
        format: (v) => {
          const a = Math.abs(v);
          if (a < 0.025) return "straight line";
          const level = a >= 0.99 ? fmt(a) : `gentle ${fmt(a)}`;
          return v > 0 ? `U-shaped, curvature ${level}` : `S-shaped, curvature ${level}`;
        },
      },
      {
        // The slope of the underlying line. Students should see that the
        // diagnostic patterns mean the same thing whatever the line is doing,
        // so negative slopes are one press away.
        key: "slope", type: "range", label: "Line slope", min: -2, max: 2, step: 0.1, default: 1.5,
        format: (v) => (Math.abs(v) < 0.05 ? "flat" : fmt(v)),
      },
      {
        key: "noise", type: "range", label: "Noise", min: 0.3, max: 1.8, step: 0.05, default: 1,
      },
    ],
    presets: {
      well: { curvature: 0, slope: 1.5, noise: 1 },
      violation: { curvature: 1.6, slope: 1.5, noise: 1 },
    },
    generate: generateLinearity,
    instructions: "Free edit: click blank space in either plot to add a point (in the diagnostic the click sets the residual and fitted value), drag to move, click to select, then Delete selected. Hover either plot to link points. A high R² can still hide a curve — try strong curvature, and flip the slope negative to see the same patterns.",
  });
}

export function independenceLab({ Inputs, Plot }) {
  return createLab(Inputs, Plot, {
    assumption: "independence",
    seedBase: "ind",
    nDefault: 26,
    diagKind: "order",
    primaryDiagLabel: "Residuals vs observation order",
    // Only affects how the sample is displayed, never how it is generated.
    displayOnlyKeys: ["order"],
    controlDefs: [
      {
        key: "order", type: "range", label: "Sequence order", min: -1, max: 1, step: 0.05, default: 0,
        // Plain words rather than a bare number: the middle is the shuffled
        // starting point, and the two ends sort the same points two different
        // ways, so the readout has to say which way and how far.
        format: (v) => {
          if (Math.abs(v) < 0.025) return "shuffled";
          const level = fmt(Math.abs(v));
          if (v > 0) return v >= 0.99 ? "time order" : `sorting into time order ${level}`;
          return v <= -0.99 ? "alternation" : `sorting into alternation ${level}`;
        },
      },
    ],
    presets: {
      // Both buttons show the same strength-1 time-structured sample.
      // Shuffled order hides its temporal pattern; Time order reveals runs.
      // The slider can then move through stronger time ordering and alternation
      // without changing the sample or its residual values.
      well: { order: 0, strength: 1 },
      violation: { order: 1, strength: 1 },
    },
    extraViews: [
      { key: "lag", label: "Lag plot: e(i) vs e(i−1)" },
    ],
    generate: generateIndependence,
    instructions: "The sample never changes. In the middle, its residuals are shown in shuffled order; toward the positive end, the same sequence returns to time order and shows runs. Toward the negative end, the display arranges residuals in alternation. Shuffling hides temporal dependence; it does not make the observations independent, and alternation is not a plausible time order.",
  });
}

export function normalityLab({ Inputs, Plot }) {
  return createLab(Inputs, Plot, {
    assumption: "normality",
    seedBase: "norm",
    nDefault: 25,
    hasNControl: true,
    diagKind: "qq",
    primaryDiagLabel: "Normal Q–Q plot of residuals",
    controlDefs: [
      {
        key: "shape",
        type: "select",
        label: "Error shape",
        options: [["normal", "Normal"], ["skewed", "Skewed"], ["heavy", "Heavy-tailed"]],
        default: "normal",
      },
      {
        // Severity scales the departure for the skewed and heavy-tailed
        // shapes. For the normal shape it has no meaning — the dial is greyed
        // out (see enabledWhen) — because an ever-more-extreme "normal" Q–Q
        // would defeat the teaching point. 0–1 is enough now that the
        // generators themselves are tuned.
        key: "severity", type: "range", label: "Severity", min: 0, max: 1, step: 0.05, default: 1,
        enabledWhen: (state) => state.controls.shape !== "normal",
      },
    ],
    presets: {
      well: { shape: "normal", severity: 1 },
      violation: { shape: "skewed", severity: 1 },
    },
    extraViews: [
      { key: "hist", label: "Residual histogram" },
      { key: "dist", label: "Generating error distribution" },
    ],
    generate: generateNormality,
    instructions: "Hover a Q–Q point to see which observation it belongs to — its x position there is a theoretical quantile, not the original x. Free edit: click blank space in either plot to add a point (in the Q–Q the click sets the residual; its horizontal spot is its rank). Small normal samples can look imperfect.",
  });
}

export function equalVarianceLab({ Inputs, Plot }) {
  return createLab(Inputs, Plot, {
    assumption: "equalvariance",
    seedBase: "eq",
    nDefault: 28,
    diagKind: "resid-fitted",
    primaryDiagLabel: "Residuals vs fitted values",
    controlDefs: [
      {
        key: "pattern",
        type: "select",
        label: "Variance pattern",
        options: [
          ["constant", "Constant"],
          ["increasing", "Increasing funnel"],
          ["decreasing", "Decreasing funnel"],
          ["bowtie", "Bow-tie"],
        ],
        default: "constant",
      },
      {
        // Spread dial, 0–1. The displayed number is a fraction of the SD that
        // fills a good share of the residual axis at the funnel's wide end;
        // the mapping to the actual SD lives in equalVarianceSdAt. Above the
        // old raw-SD 1.3 the soft-clipped funnel ends drew flat artefact
        // lines into the ±2 SD band, so the dial stops where the plot stays
        // honest. It still moves the data for the Constant pattern.
        key: "sd", type: "range", label: "Spread", min: 0, max: 1, step: 0.01, default: 0.75,
      },
    ],
    presets: {
      well: { pattern: "constant", sd: 0.75 },
      violation: { pattern: "increasing", sd: 0.75 },
    },
    extraOptionDefs: [
      { key: "band", label: "Show fitted line ± 2 SD band" },
    ],
    bandOverlay: equalVarianceBandMarks,
    generate: generateEqualVariance,
    instructions: "The line still passes through the middle when spread changes — what changes is prediction precision. The spread dial rescales the spread around the same line, for the constant pattern too. Free edit: click blank space in either plot to add a point (in the diagnostic the click sets the residual and fitted value), then spread points vertically at large x while keeping their local centre unchanged.",
  });
}

/* ------------------------------------------------------------------ */
/* Pure helpers exported for unit testing                               */
/* (see line-assumptions-lab.test.mjs)                                  */
/* ------------------------------------------------------------------ */

export {
  makeStreams,
  generateLinearity,
  generateIndependence,
  generateNormality,
  generateEqualVariance,
  equalVarianceSdAt,
  fitLeastSquares,
  sampleSd,
  resolveResidFittedPoint,
  resolveQQPoint,
  timePattern,
  randomPermutation,
  sequenceRank,
  towardOrder,
  timeTarget,
  alternatingTarget,
  lag1Correlation,
};

/* ------------------------------------------------------------------ */
/* Plain <script> fallback (double-instantiation guarded)               */
/* ------------------------------------------------------------------ */

if (typeof window !== "undefined") {
  window.LINEAssumptionLabs = {
    linearityLab,
    independenceLab,
    normalityLab,
    equalVarianceLab,
  };
  const boot = () => {
    document.querySelectorAll("[data-line-lab]").forEach((el) => {
      if (el.dataset.instantiated === "true") return;
      el.dataset.instantiated = "true";
      if (!window.Plot || !window.Inputs) return;
      const factory = window.LINEAssumptionLabs[`${el.dataset.lineLab}Lab`];
      if (factory) el.replaceChildren(factory({ Inputs: window.Inputs, Plot: window.Plot }));
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
