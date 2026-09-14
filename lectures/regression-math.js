/* Pure numerical helpers shared by the interactive regression widgets. */

export function cyrb53(value, seed = 0) {
  const text = String(value);
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
    ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
    ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStreams(key) {
  const rng = mulberry32(cyrb53(String(key)));
  const uniform = () => rng();
  const normal = () => {
    const u = Math.max(rng(), Number.EPSILON);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { uniform, normal };
}

export function leastSquares(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const n = points.length;
  const xbar = points.reduce((s, p) => s + p.x, 0) / n;
  const ybar = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - xbar) ** 2, 0);
  if (!(sxx > 1e-12)) return null;
  const sxy = points.reduce((s, p) => s + (p.x - xbar) * (p.y - ybar), 0);
  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;
  const predict = (x) => intercept + slope * x;
  const residuals = points.map((p) => p.y - predict(p.x));
  const sse = residuals.reduce((s, e) => s + e * e, 0);
  const df = n - 2;
  const residualSd = df > 0 ? Math.sqrt(sse / df) : NaN;
  return { n, xbar, ybar, sxx, slope, intercept, predict, residuals, sse, df, residualSd };
}

export function meanSquaredError(points, intercept, slope) {
  if (!points || !points.length) return NaN;
  return points.reduce((sum, p) => sum + (p.y - (intercept + slope * p.x)) ** 2, 0)
    / points.length;
}

/* Lanczos approximation and continued fraction for the regularised beta. */
function logGamma(z) {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.99999999999980993;
  const z1 = z - 1;
  coefficients.forEach((coefficient, i) => { x += coefficient / (z1 + i + 1); });
  const t = z1 + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z1 + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const tiny = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    a * Math.log(x) + b * Math.log1p(-x) - logGamma(a) - logGamma(b) + logGamma(a + b),
  );
  if (x < (a + 1) / (a + b + 2)) return front * betaFraction(a, b, x) / a;
  return 1 - front * betaFraction(b, a, 1 - x) / b;
}

export function studentTCdf(value, degreesOfFreedom) {
  if (!(degreesOfFreedom > 0) || !Number.isFinite(value)) return NaN;
  if (value === 0) return 0.5;
  const x = degreesOfFreedom / (degreesOfFreedom + value * value);
  const ib = regularizedBeta(x, degreesOfFreedom / 2, 0.5);
  return value > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

export function studentTQuantile(probability, degreesOfFreedom) {
  if (!(degreesOfFreedom > 0) || probability <= 0 || probability >= 1) return NaN;
  if (probability === 0.5) return 0;
  let lo = -100;
  let hi = 100;
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, degreesOfFreedom) < probability) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function intervalAt(fit, x0, level = 0.95, type = "confidence") {
  if (!fit || !(fit.df > 0) || !(fit.sxx > 0)) return null;
  const critical = studentTQuantile(1 - (1 - level) / 2, fit.df);
  const estimate = fit.predict(x0);
  const leverage = 1 / fit.n + ((x0 - fit.xbar) ** 2) / fit.sxx;
  const se = fit.residualSd * Math.sqrt(type === "prediction" ? 1 + leverage : leverage);
  const halfWidth = critical * se;
  return { estimate, lower: estimate - halfWidth, upper: estimate + halfWidth, halfWidth, critical, se };
}


