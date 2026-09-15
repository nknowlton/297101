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
const QUAD_STROKE = "#0072B2";
const SMOOTHER_STROKE = "#E69F00";

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
  for (let i = 0; i < p.n; i += 1) {
    const u = s.uniform();
    const z = s.normal();
    const x = X_DOMAIN[0] + (X_DOMAIN[1] - X_DOMAIN[0]) * (0.03 + 0.94 * u);
    const t = (x - 5) / 5;
    const base = 12 + 1.9 * (x - 5);
    const signal = p.curveShape === "u"
      ? p.curvature * 2.2 * t * t
      : p.curvature * 2.0 * t * t * t;
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

function generateNormality(p, s) {
  const xs = Array.from({ length: p.n }, () => 0.3 + 9.4 * s.uniform()).sort((a, b) => a - b);
  const raws = [];
  for (let i = 0; i < p.n; i += 1) {
    const u = s.uniform();
    const z = s.normal();
    let r = z;
    if (p.shape === "skewed") {
      r = Math.sign(u - 0.5) * Math.abs(z) ** (1 + 2.0 * p.severity);
    } else if (p.shape === "heavy") {
      r = Math.sign(z) * Math.abs(z) ** (1 + 2.4 * p.severity);
    }
    raws.push(r);
  }
  const sd = sampleSd(raws) || 1;
  return xs.map((x, i) => {
    const e = (raws[i] / sd) * 1.15;
    return { x, y: clamp(11 + 1.0 * (x - 5) + e, Y_DOMAIN), latent: e };
  });
}

function equalVarianceSdAt(pattern, severity, x) {
  const t = (x - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0]);
  // The narrow end is kept small and the wide end close to the y-axis limit, so
  // the funnel opens widely enough to be obvious at a glance. The ratio between
  // the ends is what students read, so a bigger contrast beats a bigger spread.
  if (pattern === "increasing") return 0.2 + 1.7 * severity * t;
  if (pattern === "decreasing") return 0.2 + 1.7 * severity * (1 - t);
  if (pattern === "bowtie") return 0.22 + 1.62 * severity * Math.abs(x - 5) / 5;
  return 1.0;
}

function generateEqualVariance(p, s) {
  const xs = Array.from({ length: p.n }, () => 0.3 + 9.4 * s.uniform()).sort((a, b) => a - b);
  return xs.map((x) => {
    const z = s.normal();
    const sd = equalVarianceSdAt(p.pattern, p.severity, x);
    const e = z * sd;
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
    showDiagnostic: false,
    smoother: false,
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

  const presetSeg = segmented(
    [["well", "Well-behaved"], ["violation", "Violation"]],
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
    // Capped at 50: a larger sample pushes the most extreme residual towards the
    // edge of the residual axis, so past this the plot would start to clip.
    input.max = "50";
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

  /* Predict / reveal */
  const revealSection = h("div", "ll-reveal");
  const predictNote = h("div", "ll-predict-note",
    "Predict the diagnostic before revealing it.");
  const revealBtn = makeButton("Reveal diagnostic", "ll-reveal-btn", () => {
    state.showDiagnostic = !state.showDiagnostic;
    render();
  });
  revealSection.append(predictNote, revealBtn);
  controlsEl.append(revealSection);

  /* Dynamic hosts */
  const optionsHost = h("div", "ll-options");
  const editHost = h("div", "ll-edits");
  controlsEl.append(optionsHost, editHost);

  /* Legend + instructions */
  const legend = h("div", "ll-legend");
  const dotGen = h("span", "ll-keydot ll-keydot-generated");
  const dotStu = h("span", "ll-keydot ll-keydot-student");
  legend.append(dotGen, document.createTextNode(" generated data  "),
    dotStu, document.createTextNode(" student-added"));
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
    const { data, fit, quadFit, hovered } = ctx;
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
    if (quadFit) {
      marks.push(Plot.line(LINE_X.map((x) => ({ x, y: quadFit.predict(x) })), {
        x: "x",
        y: "y",
        stroke: QUAD_STROKE,
        strokeWidth: 2,
        strokeDasharray: "6,4",
      }));
    }
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
    const wantsQuad = opts.assumption === "linearity"
      && state.extras.showQuad && state.showDiagnostic;
    const quadFit = wantsQuad ? fitLeastSquares(data, 2) : null;
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
      quadFit,
      hovered,
      rankOf,
      state,
      opts,
    };
  }

  /* -------- diagnostic views (each returns { title, svg, items }) --- */

  const dotOpts = {
    r: 5,
    fill: originFill,
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
    if (state.smoother && data.length >= 6) {
      marks.push(Plot.line(runningMean(data), {
        x: "fitted",
        y: "resid",
        stroke: SMOOTHER_STROKE,
        strokeWidth: 2,
      }));
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
    return { title: opts.primaryDiagLabel, svg, items };
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
    return { title: opts.primaryDiagLabel, svg, items };
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
      ...plotDefaults("Residual e", "Count", RESID_DOMAIN, undefined, { y: { label: "Count", grid: true, nice: true } }),
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
      if (state.mode !== "free" || !built.draggable || !ctx.fit) return;
      ev.preventDefault();
      const { px, py } = svgPoint(svg, ev, "diag");
      const hit = nearest(built.items, px, py, 12);
      if (!hit) return;
      state.selectedId = hit.id;
      state.runtime.diagDrag = {
        id: hit.id,
        moved: false,
        pointerId: ev.pointerId,
        fitAtStart: ctx.fit,
      };
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
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

    predictNote.style.display = state.showDiagnostic ? "none" : "";
    revealBtn.textContent = state.showDiagnostic ? "Hide diagnostic" : "Reveal diagnostic";

    // reveal options
    optionsHost.replaceChildren();
    if (state.showDiagnostic) {
      const wrap = h("div", "ll-option-list");
      if (opts.hasSmoother) {
        const label = h("label", "ll-check");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = state.smoother;
        cb.addEventListener("input", () => { state.smoother = cb.checked; render(); });
        label.append(cb, document.createTextNode(" Running-mean smoother"));
        wrap.append(label);
      }
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
      if (ctx.quadFit) {
        const r2q = rSquared(ctx.data, ctx.quadFit.predict);
        if (r2q != null) text += `   ·   quadratic R² = ${r2q.toFixed(2)}`;
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
    if (!state.showDiagnostic) {
      const title = h("div", "ll-plot-title", "Diagnostic plot");
      const placeholder = h("div", "ll-diag-hidden");
      placeholder.innerHTML = "<div class=\"ll-diag-hidden-inner\">🤔 Predict first: what pattern do you expect here?<br>Then press “Reveal diagnostic”.</div>";
      diagHost.replaceChildren(title, placeholder);
      return;
    }
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

function quadDiagOverlay(ctx, Plot, hoverRing) {
  if (!ctx.quadFit) return [];
  const qd = ctx.data.map((d) => ({
    id: d.id,
    fitted: d.fitted,
    qr: d.y - ctx.quadFit.predict(d.x),
  }));
  const marks = [Plot.dot(qd, {
    x: "fitted",
    y: "qr",
    r: 4,
    fill: QUAD_STROKE,
    fillOpacity: 0.35,
    stroke: QUAD_STROKE,
    strokeOpacity: 0.85,
  })];
  if (ctx.hovered) {
    const qh = qd.find((q) => q.id === ctx.hovered.id);
    if (qh) marks.push(hoverRing(qh.fitted, qh.qr));
  }
  return marks;
}

function equalVarianceBandMarks(ctx, Plot) {
  const { pattern, severity } = ctx.state.controls;
  const band = LINE_X.map((x) => {
    const centre = 11 + 1.2 * (x - 5);
    const sd = equalVarianceSdAt(pattern, severity, x);
    return {
      x,
      y1: clamp(centre - 2 * sd, Y_DOMAIN),
      y2: clamp(centre + 2 * sd, Y_DOMAIN),
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
    nDefault: 24,
    diagKind: "resid-fitted",
    primaryDiagLabel: "Residuals vs fitted values",
    hasSmoother: true,
    showRSquared: true,
    controlDefs: [
      {
        key: "curveShape",
        type: "select",
        label: "Curve shape",
        options: [["u", "U-shaped"], ["s", "S-shaped"]],
        default: "u",
      },
      {
        key: "curvature", type: "range", label: "Curvature strength", min: 0, max: 2, step: 0.05, default: 0,
      },
      {
        key: "noise", type: "range", label: "Noise", min: 0.3, max: 1.8, step: 0.05, default: 1,
      },
    ],
    presets: {
      well: { curveShape: "u", curvature: 0, noise: 1 },
      violation: { curveShape: "u", curvature: 1.6, noise: 1 },
    },
    extraOptionDefs: [
      { key: "showQuad", label: "Reveal quadratic fit & its residuals" },
    ],
    diagOverlay: quadDiagOverlay,
    generate: generateLinearity,
    instructions: "Free edit: click blank space in the scatterplot to add a point, drag to move, click to select, then Delete selected. Hover either plot to link points. A high R² can still hide a curve — try strong curvature.",
  });
}

export function independenceLab({ Inputs, Plot }) {
  return createLab(Inputs, Plot, {
    assumption: "independence",
    seedBase: "ind",
    nDefault: 26,
    diagKind: "order",
    primaryDiagLabel: "Residuals vs observation order",
    hasSmoother: false,
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
      well: { order: 0, strength: 0 },
      violation: { order: 1, strength: 1 },
    },
    extraViews: [
      { key: "lag", label: "Lag plot: e(i) vs e(i−1)" },
    ],
    generate: generateIndependence,
    instructions: "The sample never changes. The slider only puts the recorded sequence back into <em>time order</em>: in the middle it has been shuffled, and either end sorts the same points so their time pattern shows. Positive r\u2081 gives runs above and below zero; negative r\u2081 gives alternation.",
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
    hasSmoother: false,
    controlDefs: [
      {
        key: "shape",
        type: "select",
        label: "Error shape",
        options: [["normal", "Normal"], ["skewed", "Skewed"], ["heavy", "Heavy-tailed"]],
        default: "normal",
      },
      {
        key: "severity", type: "range", label: "Severity", min: 0, max: 1, step: 0.05, default: 0.6,
      },
    ],
    presets: {
      well: { shape: "normal", severity: 0.6 },
      violation: { shape: "skewed", severity: 0.95 },
    },
    extraViews: [
      { key: "hist", label: "Residual histogram" },
      { key: "dist", label: "Generating error distribution" },
    ],
    generate: generateNormality,
    instructions: "Hover a Q–Q point to see which observation it belongs to — its x position there is a theoretical quantile, not the original x. Add an unusual point in the scatterplot and find its residual in the Q–Q plot. Small normal samples can look imperfect.",
  });
}

export function equalVarianceLab({ Inputs, Plot }) {
  return createLab(Inputs, Plot, {
    assumption: "equalvariance",
    seedBase: "eq",
    nDefault: 28,
    diagKind: "resid-fitted",
    primaryDiagLabel: "Residuals vs fitted values",
    hasSmoother: true,
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
        key: "severity", type: "range", label: "Severity", min: 0, max: 1, step: 0.05, default: 0.6,
      },
    ],
    presets: {
      well: { pattern: "constant", severity: 0.6 },
      violation: { pattern: "increasing", severity: 1 },
    },
    extraOptionDefs: [
      { key: "band", label: "Reveal generating mean ± 2 SD band" },
    ],
    bandOverlay: equalVarianceBandMarks,
    generate: generateEqualVariance,
    instructions: "The line still passes through the middle when spread changes — what changes is prediction precision. Free edit: spread points vertically at large x while keeping their local centre unchanged.",
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
