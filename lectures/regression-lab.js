/* Interactive simple-regression widgets for Weeks 10–11.
 * The public factories deliberately mirror the Week 12 LINE widgets:
 * each receives {Inputs, Plot} and returns one self-contained DOM element.
 */

import {
  intervalAt,
  leastSquares,
  makeStreams,
  meanSquaredError,
} from "./regression-math.js";

export { leastSquares, meanSquaredError };

const GENERATED = "#4d4d4d";
const VERMILION = "#D55E00";
const BLUE = "#0072B2";
const GREEN = "#009E73";
const ORANGE = "#E69F00";
const PLOT_W = 470;
const PLOT_H = 400;
const ML = 52;
const MR = 16;
const MT = 14;
const MB = 44;
const INNER_W = PLOT_W - ML - MR;
const INNER_H = PLOT_H - MT - MB;

const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const html = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function button(label, className, onClick) {
  const node = html("button", `rl-btn ${className || ""}`, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function rangeField(label, min, max, step, value, onInput) {
  const field = html("div", "rl-field");
  field.append(html("label", "rl-field-label", label));
  const row = html("div", "rl-range-row");
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const readout = html("span", "rl-readout", fmt(value));
  input.addEventListener("input", () => {
    const next = Number(input.value);
    readout.textContent = fmt(next);
    onInput(next, input, readout);
  });
  row.append(input, readout);
  field.append(row);
  return { field, input, readout };
}

function selectField(label, options, value, onInput) {
  const field = html("div", "rl-field");
  field.append(html("label", "rl-field-label", label));
  const select = document.createElement("select");
  options.forEach(([key, text]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = text;
    select.append(option);
  });
  select.value = value;
  select.addEventListener("input", () => onInput(select.value));
  field.append(select);
  return { field, input: select };
}

function segmented(options, value, onPick) {
  const wrap = html("div", "rl-segment");
  const buttons = options.map(([key, text]) => {
    const node = button(text, "rl-segment-btn", () => onPick(key));
    node.dataset.value = key;
    wrap.append(node);
    return node;
  });
  const update = (current) => buttons.forEach((node) => {
    node.setAttribute("aria-pressed", String(node.dataset.value === current));
  });
  update(value);
  return { wrap, update };
}

function checkbox(label, checked, onInput) {
  const node = html("label", "rl-check");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("input", () => onInput(input.checked));
  node.append(input, document.createTextNode(` ${label}`));
  return { node, input };
}

function svgPlot(Plot, options) {
  const svg = Plot.plot({ width: PLOT_W, height: PLOT_H, ...options });
  svg.setAttribute("viewBox", `0 0 ${PLOT_W} ${PLOT_H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Interactive regression plot");
  svg.style.touchAction = "none";
  return svg;
}

function xPx(x, domain) {
  return ML + ((x - domain[0]) / (domain[1] - domain[0])) * INNER_W;
}

function yPx(y, domain) {
  return MT + (1 - (y - domain[0]) / (domain[1] - domain[0])) * INNER_H;
}

function nearest(items, px, py, tolerance = 16) {
  let best = null;
  let distance = tolerance;
  items.forEach((item) => {
    const d = Math.hypot(item.px - px, item.py - py);
    if (d < distance) { distance = d; best = item; }
  });
  return best;
}

function attachPointHover(svg, items, onHover) {
  const point = (event) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      px: ((event.clientX - rect.left) / rect.width) * PLOT_W,
      py: ((event.clientY - rect.top) / rect.height) * PLOT_H,
    };
  };
  svg.addEventListener("pointermove", (event) => {
    const p = point(event);
    const hit = p ? nearest(items, p.px, p.py) : null;
    onHover(hit ? hit.id : null);
  });
  svg.addEventListener("pointerleave", () => onHover(null));
}

function panel(title, content, stats = "") {
  const node = html("div", "rl-panel");
  node.append(html("div", "rl-panel-title", title));
  const body = html("div", "rl-panel-body");
  body.append(content);
  node.append(body);
  if (stats) {
    if (typeof Node !== "undefined" && stats instanceof Node) node.append(stats);
    else node.append(html("div", "rl-stats", stats));
  }
  return node;
}

function shell(assumption) {
  const root = html("div", "regression-lab");
  root.dataset.regressionWidget = assumption;
  const controls = html("div", "rl-controls");
  const visual = html("div", "rl-viz");
  root.append(controls, visual);
  return { root, controls, visual };
}

function lineMarks(Plot, line, domain, color, width = 2.5, dash = null) {
  return Plot.line(domain.map((x) => ({ x, y: line(x) })), {
    x: "x", y: "y", stroke: color, strokeWidth: width,
    ...(dash ? { strokeDasharray: dash } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Week 10: coefficient anatomy                                      */
/* ------------------------------------------------------------------ */

export function coefficientLab({ Inputs, Plot }) {
  void Inputs;
  const { root, controls, visual } = shell("coefficient");
  const state = { intercept: 5, slope: 0.4, seed: 0 };
  const X = [0, 10];
  const Y = [-4, 14];

  const preset = segmented([
    ["positive", "Positive"], ["negative", "Negative"], ["flat", "Flat"],
  ], "positive", (key) => {
    const values = {
      positive: [5, 0.4], negative: [7, -0.4], flat: [6, 0],
    }[key];
    state.intercept = values[0];
    state.slope = values[1];
    intercept.input.value = String(state.intercept);
    slope.input.value = String(state.slope);
    intercept.readout.textContent = fmt(state.intercept);
    slope.readout.textContent = fmt(state.slope);
    render();
  });
  controls.append(html("div", "rl-section-label", "Example"), preset.wrap);
  const challenge = button("New challenge", "rl-new-sample", () => {
    state.seed += 1;
    const random = makeStreams(`coefficient,${state.seed}`);
    state.intercept = 2 + random.uniform() * 6;
    state.slope = -0.6 + random.uniform() * 1.2;
    intercept.input.value = String(state.intercept);
    slope.input.value = String(state.slope);
    intercept.readout.textContent = fmt(state.intercept);
    slope.readout.textContent = fmt(state.slope);
    render();
  });
  controls.append(challenge);
  const intercept = rangeField("Intercept (α)", 2, 8, 0.05, state.intercept, (v) => {
    state.intercept = v; render();
  });
  const slope = rangeField("Slope (β)", -0.6, 0.6, 0.01, state.slope, (v) => {
    state.slope = v; render();
  });
  controls.append(intercept.field, slope.field);
  function render() {
    preset.update(state.slope > 0.03 ? "positive" : state.slope < -0.03 ? "negative" : "flat");
    const line = (x) => state.intercept + state.slope * x;
    const run = [{ x1: 4, y1: line(4), x2: 5, y2: line(4) }];
    const rise = [{ x1: 5, y1: line(4), x2: 5, y2: line(5) }];
    const marks = [
      Plot.ruleY([0], { stroke: "#c7d0d6" }),
      lineMarks(Plot, line, X, "#24313a", 3),
      Plot.link(run, { x1: "x1", y1: "y1", x2: "x2", y2: "y2", stroke: ORANGE, strokeWidth: 3 }),
      Plot.link(rise, { x1: "x1", y1: "y1", x2: "x2", y2: "y2", stroke: ORANGE, strokeWidth: 3 }),
      Plot.dot([{ x: 0, y: state.intercept }], { x: "x", y: "y", r: 6, fill: BLUE }),
      Plot.text([{ x: 0.35, y: state.intercept, label: "α" }], { x: "x", y: "y", text: "label", dy: -10, fill: BLUE, fontSize: 15 }),
      Plot.text([{ x: 4.5, y: line(4), label: "run = 1" }], { x: "x", y: "y", text: "label", dy: 16, fill: ORANGE, fontSize: 12 }),
      Plot.text([{ x: 5.15, y: (line(4) + line(5)) / 2, label: "rise = β" }], { x: "x", y: "y", text: "label", dx: 4, fill: ORANGE, fontSize: 12 }),
    ];
    const equation = `ŷ = ${fmt(state.intercept)} ${state.slope < 0 ? "−" : "+"} ${fmt(Math.abs(state.slope))}x`;
    const left = panel("The line and its coefficients", svgPlot(Plot, {
      marginLeft: ML, marginRight: MR, marginTop: MT, marginBottom: MB,
      x: { domain: X, label: "x", grid: true, nice: false },
      y: { domain: Y, label: "predicted mean y", grid: true, nice: false }, marks,
    }), equation);
    const rightBody = html("div", "rl-interpretation");
    const change = Math.abs(state.slope) < 0.005
      ? "does not change"
      : `${state.slope > 0 ? "increases" : "decreases"} by ${fmt(Math.abs(state.slope))}`;
    rightBody.innerHTML = `<div class="rl-equation">${equation}</div><p>When <strong>x = 0</strong>, the predicted mean of y is <strong>α = ${fmt(state.intercept)}</strong>.</p><p>For each one-unit increase in x, the predicted mean <strong>${change}</strong>.</p><p class="rl-muted">The orange run is one x-unit; the orange rise is β.</p>`;
    visual.replaceChildren(left, panel("Reading the coefficients", rightBody));
  }
  render();
  return root;
}

/* ------------------------------------------------------------------ */
/* Week 10: least squares and MSE landscape                           */
/* ------------------------------------------------------------------ */

function generateRegressionData(preset, seed) {
  const specs = {
    clear: { slope: 0.78, noise: 0.45, influence: false },
    noisy: { slope: 0.45, noise: 1.15, influence: false },
    influential: { slope: 0.55, noise: 0.55, influence: true },
  };
  const spec = specs[preset];
  const random = makeStreams(`regression,${preset},${seed}`);
  const points = [];
  const count = spec.influence ? 23 : 24;
  for (let i = 0; i < count; i += 1) {
    const x = 0.75 + random.uniform() * 8.5;
    const y = 5 + spec.slope * (x - 5) + random.normal() * spec.noise;
    points.push({ id: `g${i}`, order: i, origin: "generated", x, y });
  }
  if (spec.influence) {
    const x = 9.7;
    points.push({
      id: "g23", order: 23, origin: "generated", x,
      y: 5 + spec.slope * (x - 5) + (random.uniform() < 0.5 ? -1 : 1) * 2.4,
    });
  }
  return points;
}

export function regressionLab({ Inputs, Plot }) {
  void Inputs;
  const { root, controls, visual } = shell("least-squares");
  const state = {
    preset: "clear", seed: 0, intercept: 5, slope: 0,
    showBest: false, showResiduals: false, hovered: null,
  };
  const X = [0, 10];
  const Y = [-2, 12];
  let data = generateRegressionData(state.preset, state.seed);
  const preset = segmented([
    ["clear", "Clear trend"], ["noisy", "Noisy trend"], ["influential", "Influential point"],
  ], state.preset, (key) => {
    state.preset = key; state.seed = 0; state.showBest = false;
    data = generateRegressionData(state.preset, state.seed); render();
  });
  controls.append(html("div", "rl-section-label", "Example"), preset.wrap);
  controls.append(button("Generate another sample", "rl-new-sample", () => {
    state.seed += 1; state.showBest = false;
    data = generateRegressionData(state.preset, state.seed); render();
  }));
  const intercept = rangeField("Proposed intercept", -2, 12, 0.01, state.intercept, (v) => { state.intercept = v; render(); });
  const slope = rangeField("Proposed slope", -1.5, 1.5, 0.01, state.slope, (v) => { state.slope = v; render(); });
  controls.append(intercept.field, slope.field);
  const reveal = button("Show best fit", "rl-reveal-btn", () => { state.showBest = !state.showBest; render(); });
  controls.append(html("div", "rl-reveal-note", "Adjust your line, then reveal the least-squares solution."), reveal);
  const residualCheck = checkbox("Show residuals", false, (v) => { state.showResiduals = v; render(); });
  controls.append(residualCheck.node);
  const snapWrap = html("div", "rl-option-list");
  const snapSlope = button("Snap slope to least squares", "", () => { const fit = leastSquares(data); if (fit) { state.slope = fit.slope; slope.input.value = String(fit.slope); slope.readout.textContent = fmt(fit.slope); render(); } });
  const snapIntercept = button("Snap intercept to least squares", "", () => { const fit = leastSquares(data); if (fit) { state.intercept = fit.intercept; intercept.input.value = String(fit.intercept); intercept.readout.textContent = fmt(fit.intercept); render(); } });
  snapWrap.append(snapSlope, snapIntercept);
  controls.append(snapWrap);

  function render() {
    preset.update(state.preset);
    reveal.textContent = state.showBest ? "Hide best fit" : "Show best fit";
    snapWrap.hidden = !state.showBest;
    const fit = leastSquares(data);
    const proposed = (x) => state.intercept + state.slope * x;
    const rows = data.map((p) => ({ ...p, fitted: proposed(p.x), resid: p.y - proposed(p.x) }));
    const marks = [Plot.ruleY([0], { stroke: "#c7d0d6" })];
    if (state.showResiduals) marks.push(Plot.link(rows, { x1: "x", y1: "y", x2: "x", y2: "fitted", stroke: VERMILION, strokeOpacity: 0.55, strokeWidth: 1.3 }));
    marks.push(lineMarks(Plot, proposed, X, VERMILION, 3));
    if (state.showBest && fit) marks.push(lineMarks(Plot, fit.predict, X, BLUE, 2.5, "8,5"));
    marks.push(Plot.dot(data, { x: "x", y: "y", r: 5, fill: GENERATED, stroke: "#fff", strokeWidth: 1 }));
    const hovered = rows.find((p) => p.id === state.hovered);
    if (hovered) {
      marks.push(Plot.dot([hovered], { x: "x", y: "y", r: 9, fillOpacity: 0, stroke: BLUE, strokeWidth: 2.5 }));
      marks.push(Plot.link([hovered], { x1: "x", y1: "y", x2: "x", y2: "fitted", stroke: BLUE, strokeWidth: 2 }));
    }
    const scatter = svgPlot(Plot, {
      marginLeft: ML, marginRight: MR, marginTop: MT, marginBottom: MB,
      x: { domain: X, label: "x", grid: true, nice: false },
      y: { domain: Y, label: "y", grid: true, nice: false }, marks,
    });
    attachPointHover(scatter, rows.map((p) => ({ id: p.id, px: xPx(p.x, X), py: yPx(p.y, Y) })), (id) => { if (!state.dragging && id !== state.hovered) { state.hovered = id; render(); } });
    const proposedMse = meanSquaredError(data, state.intercept, state.slope);
    const stats = `ŷ = ${fmt(state.intercept)} ${state.slope < 0 ? "−" : "+"} ${fmt(Math.abs(state.slope))}x · proposed MSE = ${fmt(proposedMse, 3)}${fit ? ` · least-squares MSE = ${fmt(meanSquaredError(data, fit.intercept, fit.slope), 3)}` : ""}`;
    const left = panel("Observed data and proposed line", scatter, stats);
    const grid = [];
    const nx = 31; const ny = 31;
    const b0Min = -2; const b0Max = 12; const b1Min = -1.5; const b1Max = 1.5;
    for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
      const b0 = b0Min + (i / (nx - 1)) * (b0Max - b0Min);
      const b1 = b1Min + (j / (ny - 1)) * (b1Max - b1Min);
      grid.push({ x1: b0 - (b0Max - b0Min) / (nx - 1) / 2, x2: b0 + (b0Max - b0Min) / (nx - 1) / 2, y1: b1 - (b1Max - b1Min) / (ny - 1) / 2, y2: b1 + (b1Max - b1Min) / (ny - 1) / 2, b0, b1, mse: meanSquaredError(data, b0, b1) });
    }
    const minMse = Math.min(...grid.map((d) => d.mse));
    const heat = svgPlot(Plot, {
      marginLeft: ML, marginRight: MR, marginTop: MT, marginBottom: MB,
      x: { domain: [b0Min, b0Max], label: "intercept", grid: true, nice: false },
      y: { domain: [b1Min, b1Max], label: "slope", grid: true, nice: false },
      color: { scheme: "Blues", reverse: true, label: "MSE" },
      marks: [
        Plot.rect(grid, { x1: "x1", x2: "x2", y1: "y1", y2: "y2", fill: "mse", inset: 0, fillOpacity: 0.9 }),
        Plot.dot([{ x: state.intercept, y: state.slope }], { x: "x", y: "y", r: 6, fill: VERMILION, stroke: "white", strokeWidth: 1.5 }),
        ...(state.showBest && fit ? [Plot.dot([{ x: fit.intercept, y: fit.slope }], { x: "x", y: "y", r: 7, fill: BLUE, stroke: "white", strokeWidth: 2 }), Plot.text([{ x: fit.intercept, y: fit.slope, label: "least squares" }], { x: "x", y: "y", text: "label", dy: -12, fill: BLUE, fontSize: 11 })] : []),
      ],
    });
    const rightStats = `Dark basin = smaller MSE · grid minimum ${fmt(minMse, 3)}${state.showBest && fit ? ` · optimum = (${fmt(fit.intercept)}, ${fmt(fit.slope)})` : ""}`;
    const info = html("div", "rl-hover-info");
    if (hovered) info.innerHTML = `<strong>Observation ${hovered.order + 1}</strong><br>xᵢ = ${fmt(hovered.x)} · yᵢ = ${fmt(hovered.y)}<br>ŷᵢ = ${fmt(hovered.fitted)} · eᵢ = ${fmt(hovered.resid)} · eᵢ² = ${fmt(hovered.resid ** 2)}`;
    else info.textContent = "Hover a point to inspect its squared residual.";
    visual.replaceChildren(panel("Data and residuals", scatter, stats), panel("MSE for every possible line", heat, rightStats), info);
  }
  render();
  return root;
}

/* ------------------------------------------------------------------ */
/* Week 11: confidence and prediction intervals                       */
/* ------------------------------------------------------------------ */

function generateIntervalData(n, noise, seed) {
  const random = makeStreams(`interval,${seed}`);
  const all = Array.from({ length: 80 }, (_, i) => ({
    x: 1 + random.uniform() * 8,
    z: random.normal(),
    id: `g${i}`,
  })).sort((a, b) => a.x - b.x);
  const alpha = 2.5;
  const beta = 0.75;
  const data = all.slice(0, n).map((p, i) => ({
    id: p.id, order: i, origin: "generated", x: p.x,
    y: alpha + beta * p.x + noise * p.z,
  }));
  const future = makeStreams(`interval-future,${seed}`).normal();
  return { data, alpha, beta, futureZ: future };
}

export function predictionIntervalLab({ Inputs, Plot }) {
  void Inputs;
  const { root, controls, visual } = shell("prediction-interval");
  const state = { target: "mean", example: "middle", x0: 5, level: 0.95, n: 24, noise: 1, seed: 0, reveal: false, targetReveal: false, dragging: false, hovered: null };
  const X = [0, 10];
  const Y = [-3, 14];
  let generated = generateIntervalData(state.n, state.noise, state.seed);
  const target = segmented([["mean", "Mean response"], ["individual", "One new outcome"]], state.target, (key) => { state.target = key; render(); });
  controls.append(html("div", "rl-section-label", "Target"), target.wrap);
  const example = segmented([["middle", "Middle"], ["edge", "Edge"], ["extra", "Extrapolation"]], state.example, (key) => {
    state.example = key; state.x0 = key === "middle" ? 5 : key === "edge" ? 8.5 : 9.7; x0.input.value = String(state.x0); x0.readout.textContent = fmt(state.x0); render();
  });
  controls.append(html("div", "rl-section-label", "Example x₀"), example.wrap);
  controls.append(button("Generate another sample", "rl-new-sample", () => { state.seed += 1; generated = generateIntervalData(state.n, state.noise, state.seed); state.reveal = false; state.targetReveal = false; render(); }));
  const x0 = rangeField("Selected x₀", 0, 10, 0.05, state.x0, (v) => { state.x0 = v; render(); });
  const level = selectField("Confidence level", [["0.8", "80%"], ["0.9", "90%"], ["0.95", "95%"], ["0.99", "99%"]], String(state.level), (v) => { state.level = Number(v); render(); });
  const n = rangeField("Sample size (n)", 12, 80, 1, state.n, (v) => { state.n = v; generated = generateIntervalData(state.n, state.noise, state.seed); render(); });
  const noise = rangeField("Residual noise", 0.3, 2.2, 0.05, state.noise, (v) => { state.noise = v; generated = generateIntervalData(state.n, state.noise, state.seed); render(); });
  controls.append(x0.field, level.field, n.field, noise.field);
  const reveal = button("Reveal intervals", "rl-reveal-btn", () => { state.reveal = !state.reveal; if (!state.reveal) state.targetReveal = false; render(); });
  const revealTarget = button("Reveal target", "", () => { if (state.reveal) state.targetReveal = !state.targetReveal; render(); });
  controls.append(html("div", "rl-reveal-note", "Choose mean or individual, then predict which interval is appropriate."), reveal, revealTarget);

  function render() {
    target.update(state.target); example.update(state.example);
    reveal.textContent = state.reveal ? "Hide intervals" : "Reveal intervals";
    revealTarget.disabled = !state.reveal;
    const fit = leastSquares(generated.data);
    const ci = fit ? intervalAt(fit, state.x0, state.level, "confidence") : null;
    const pi = fit ? intervalAt(fit, state.x0, state.level, "prediction") : null;
    const truthMean = generated.alpha + generated.beta * state.x0;
    const future = truthMean + state.noise * generated.futureZ;
    const rows = generated.data.map((p) => ({ ...p, fitted: fit.predict(p.x), resid: p.y - fit.predict(p.x) }));
    const bands = Array.from({ length: 81 }, (_, i) => {
      const x = i / 8;
      const c = intervalAt(fit, x, state.level, "confidence");
      const p = intervalAt(fit, x, state.level, "prediction");
      return { x, ciLower: c.lower, ciUpper: c.upper, piLower: p.lower, piUpper: p.upper };
    });
    const marks = [Plot.ruleY([0], { stroke: "#c7d0d6" }), Plot.ruleX([state.x0], { stroke: VERMILION, strokeDasharray: "5,4", strokeWidth: 2 })];
    if (state.reveal) {
      marks.push(Plot.areaY(bands, { x: "x", y1: "piLower", y2: "piUpper", fill: ORANGE, fillOpacity: state.target === "individual" ? 0.20 : 0.10 }));
      marks.push(Plot.areaY(bands, { x: "x", y1: "ciLower", y2: "ciUpper", fill: BLUE, fillOpacity: state.target === "mean" ? 0.25 : 0.12 }));
    }
    marks.push(lineMarks(Plot, fit.predict, X, "#24313a", 2.5));
    marks.push(Plot.dot(generated.data, { x: "x", y: "y", r: 5, fill: GENERATED, stroke: "white", strokeWidth: 1 }));
    if (state.targetReveal) marks.push(Plot.dot([{ x: state.x0, y: state.target === "mean" ? truthMean : future }], { x: "x", y: "y", r: 7, fill: state.target === "mean" ? GREEN : VERMILION, stroke: "white", strokeWidth: 2 }));
    const hovered = rows.find((p) => p.id === state.hovered);
    if (hovered) { marks.push(Plot.dot([hovered], { x: "x", y: "y", r: 9, fillOpacity: 0, stroke: BLUE, strokeWidth: 2.5 })); marks.push(Plot.link([hovered], { x1: "x", y1: "y", x2: "x", y2: "fitted", stroke: BLUE, strokeWidth: 2 })); }
    const scatter = svgPlot(Plot, {
      marginLeft: ML, marginRight: MR, marginTop: MT, marginBottom: MB,
      x: { domain: X, label: "x", grid: true, nice: false }, y: { domain: Y, label: "y", grid: true, nice: false }, marks,
    });
    attachPointHover(scatter, rows.map((p) => ({ id: p.id, px: xPx(p.x, X), py: yPx(p.y, Y) })), (id) => { if (id !== state.hovered) { state.hovered = id; render(); } });
    let drag = false;
    const updateX0 = (event, shouldRender = false) => {
      const rect = scatter.getBoundingClientRect();
      if (!rect.width) return;
      const px = ((event.clientX - rect.left) / rect.width) * PLOT_W;
      state.x0 = clamp((px - ML) / INNER_W * 10, 0, 10);
      x0.input.value = String(state.x0); x0.readout.textContent = fmt(state.x0);
      if (shouldRender) render();
    };
    scatter.addEventListener("pointerdown", (event) => { drag = true; state.dragging = true; scatter.setPointerCapture?.(event.pointerId); updateX0(event); });
    scatter.addEventListener("pointermove", (event) => { if (drag) updateX0(event); });
    scatter.addEventListener("pointerup", () => { drag = false; state.dragging = false; render(); });
    const outside = state.x0 < Math.min(...generated.data.map((p) => p.x)) || state.x0 > Math.max(...generated.data.map((p) => p.x));
    const selected = state.target === "mean" ? ci : pi;
    const stats = fit ? `x₀ = ${fmt(state.x0)} · fitted mean = ${fmt(fit.predict(state.x0))} · CI width = ${fmt(ci.upper - ci.lower)} · PI width = ${fmt(pi.upper - pi.lower)}` : "Fit unavailable";
    const warning = outside ? " ⚠ x₀ is outside the observed predictor range (extrapolation)." : "";
    const left = panel("Sample, fitted line and interval bands", scatter, stats + warning);
    let right;
    if (!state.reveal) {
      right = panel("At the selected x₀", html("div", "rl-hidden-panel", "🤔 Predict first: will the interval for one new outcome be wider or narrower than the interval for the mean?"));
    } else {
      const sliceData = [
        { kind: "CI", lower: ci.lower, upper: ci.upper, estimate: ci.estimate, color: BLUE },
        { kind: "PI", lower: pi.lower, upper: pi.upper, estimate: pi.estimate, color: ORANGE },
      ];
      const slice = svgPlot(Plot, {
        marginLeft: ML, marginRight: MR, marginTop: MT, marginBottom: MB,
        x: { domain: ["CI", "PI"], label: "interval type" }, y: { domain: Y, label: "response y", grid: true, nice: false },
        marks: [
          Plot.link(sliceData, { x1: "kind", y1: "lower", x2: "kind", y2: "upper", stroke: (d) => d.color, strokeWidth: 8, strokeOpacity: (d) => d.kind === (state.target === "mean" ? "CI" : "PI") ? 0.9 : 0.45 }),
          Plot.dot(sliceData, { x: "kind", y: "estimate", fill: (d) => d.color, r: 6, stroke: "white", strokeWidth: 1.5 }),
          ...(state.targetReveal ? [Plot.ruleY([state.target === "mean" ? truthMean : future], { stroke: state.target === "mean" ? GREEN : VERMILION, strokeWidth: 2, strokeDasharray: "5,4" }), Plot.text([{ x: "PI", y: state.target === "mean" ? truthMean : future, label: state.target === "mean" ? "true mean" : "new outcome" }], { x: "x", y: "y", text: "label", dx: 28, fill: state.target === "mean" ? GREEN : VERMILION, fontSize: 11 })] : []),
        ],
      });
      const captured = selected.lower <= (state.target === "mean" ? truthMean : future) && (state.target === "mean" ? truthMean : future) <= selected.upper;
      const note = html("div", "rl-interval-note");
      note.innerHTML = `<strong>${state.target === "mean" ? "Confidence interval" : "Prediction interval"} selected.</strong><br>${state.target === "mean" ? "It quantifies uncertainty in the population mean." : "It includes both line uncertainty and individual residual variation."}${state.targetReveal ? `<br><span class="${captured ? "rl-captured" : "rl-missed"}">${captured ? "Captured" : "Missed"} the revealed target.</span>` : ""}`;
      right = panel("Confidence interval versus prediction interval", slice, note);
    }
    const info = html("div", "rl-hover-info");
    if (hovered) info.innerHTML = `<strong>Observation ${hovered.order + 1}</strong><br>xᵢ = ${fmt(hovered.x)} · yᵢ = ${fmt(hovered.y)}<br>ŷᵢ = ${fmt(hovered.fitted)} · eᵢ = ${fmt(hovered.resid)}`;
    visual.replaceChildren(left, right, info);
  }
  render();
  return root;
}

if (typeof window !== "undefined") {
  window.RegressionLabs = { coefficientLab, regressionLab, predictionIntervalLab };
  const boot = () => {
    document.querySelectorAll("[data-regression-lab]").forEach((element) => {
      if (element.dataset.instantiated === "true") return;
      element.dataset.instantiated = "true";
      const factory = window.RegressionLabs[`${element.dataset.regressionLab}Lab`];
      if (factory && window.Plot) element.replaceChildren(factory({ Inputs: window.Inputs, Plot: window.Plot }));
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
