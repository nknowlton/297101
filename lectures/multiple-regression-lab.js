/* Interactive Week 11 multiple-regression widget for 297.101.
 *
 * Teaching target:
 *   Bodywt ~ Heartgirth
 *   Bodywt ~ Heartgirth + AgeGroup
 *   Bodywt ~ Heartgirth + AgeGroup + Sex
 *
 * The model is additive throughout. There are no interactions, so every fitted
 * group line has the same Heartgirth slope. The factory receives the donkey CSV
 * rows from Quarto OJS and returns one self-contained DOM element.
 */

const INK = "#24313a";
const BLUE = "#0072B2";
const VERMILION = "#D55E00";
const GREEN = "#009E73";
const PURPLE = "#7A5195";
const GREY = "#6b7780";

const AGE_LEVELS = ["Under 7", "7 and over"];
const SEX_LEVELS = ["Female", "Male"];

const MODEL_LABELS = {
  heart: "Heart girth",
  age: "+ Age group",
  full: "+ Age group + Sex",
};

export function prepareDonkeyData(rows) {
  return (rows || [])
    .map((row, index) => {
      const Age = Number(row.Age);
      const Bodywt = Number(row.Bodywt);
      const Heartgirth = Number(row.Heartgirth);
      const Sex = String(row.Sex || "").trim();
      return {
        id: index,
        Age,
        Bodywt,
        Heartgirth,
        Sex,
        AgeGroup: Age < 7 ? "Under 7" : "7 and over",
      };
    })
    .filter((row) => Number.isFinite(row.Age)
      && Number.isFinite(row.Bodywt)
      && Number.isFinite(row.Heartgirth)
      && SEX_LEVELS.includes(row.Sex));
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) {
      throw new Error("Model matrix is singular.");
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const scale = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= scale;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function modelTerms(model) {
  if (model === "heart") return [];
  if (model === "age") return ["AgeGroup"];
  if (model === "sex") return ["Sex"];
  if (model === "full") return ["AgeGroup", "Sex"];
  throw new Error(`Unknown model: ${model}`);
}

function designSpec(model, references) {
  const terms = modelTerms(model);
  const columns = ["(Intercept)", "Heartgirth"];
  const encoders = [() => 1, (row) => row.Heartgirth];

  if (terms.includes("AgeGroup")) {
    const other = AGE_LEVELS.find((level) => level !== references.AgeGroup);
    columns.push(`AgeGroup: ${other} vs ${references.AgeGroup}`);
    encoders.push((row) => (row.AgeGroup === other ? 1 : 0));
  }

  if (terms.includes("Sex")) {
    const other = SEX_LEVELS.find((level) => level !== references.Sex);
    columns.push(`Sex: ${other} vs ${references.Sex}`);
    encoders.push((row) => (row.Sex === other ? 1 : 0));
  }

  return { columns, encoders };
}

export function fitDonkeyModel(rows, model, references = { AgeGroup: "Under 7", Sex: "Female" }) {
  if (!rows.length) throw new Error("No donkey observations supplied.");
  const { columns, encoders } = designSpec(model, references);
  const x = rows.map((row) => encoders.map((encode) => encode(row)));
  const y = rows.map((row) => row.Bodywt);
  const p = columns.length;

  const xtx = Array.from({ length: p }, () => Array(p).fill(0));
  const xty = Array(p).fill(0);
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = 0; j < p; j += 1) {
      xty[j] += x[i][j] * y[i];
      for (let k = 0; k < p; k += 1) xtx[j][k] += x[i][j] * x[i][k];
    }
  }

  const beta = solveLinearSystem(xtx, xty);
  const fitted = x.map((row) => row.reduce((sum, value, j) => sum + value * beta[j], 0));
  const ybar = mean(y);
  const sse = y.reduce((sum, value, i) => sum + (value - fitted[i]) ** 2, 0);
  const sst = y.reduce((sum, value) => sum + (value - ybar) ** 2, 0);
  const r2 = 1 - sse / sst;
  const n = rows.length;
  const adjR2 = 1 - (1 - r2) * (n - 1) / (n - p);

  const coefficients = columns.map((name, i) => ({ name, estimate: beta[i] }));

  const predict = (row) => encoders.reduce((sum, encode, j) => sum + encode(row) * beta[j], 0);

  return {
    model,
    references: { ...references },
    columns,
    beta,
    coefficients,
    n,
    p,
    sse,
    r2,
    adjR2,
    fitted,
    predict,
  };
}

export function fitModelSet(rows, references = { AgeGroup: "Under 7", Sex: "Female" }) {
  return {
    heart: fitDonkeyModel(rows, "heart", references),
    age: fitDonkeyModel(rows, "age", references),
    sex: fitDonkeyModel(rows, "sex", references),
    full: fitDonkeyModel(rows, "full", references),
  };
}

export function rawFactorDifference(rows, factor, reference) {
  const levels = factor === "AgeGroup" ? AGE_LEVELS : SEX_LEVELS;
  const other = levels.find((level) => level !== reference);
  const refRows = rows.filter((row) => row[factor] === reference);
  const otherRows = rows.filter((row) => row[factor] === other);
  return {
    reference,
    other,
    referenceMean: mean(refRows.map((row) => row.Bodywt)),
    otherMean: mean(otherRows.map((row) => row.Bodywt)),
    difference: mean(otherRows.map((row) => row.Bodywt)) - mean(refRows.map((row) => row.Bodywt)),
  };
}

function coefficientFor(fit, prefix) {
  return fit.coefficients.find((row) => row.name.startsWith(prefix)) || null;
}

function formatNumber(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function signed(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(digits)}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, onClick) {
  const node = el("button", "mr-btn", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function selectField(label, options, value, onInput) {
  const wrap = el("label", "mr-field");
  wrap.append(el("span", "mr-label", label));
  const select = document.createElement("select");
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.append(option);
  });
  select.value = value;
  select.addEventListener("input", () => onInput(select.value));
  wrap.append(select);
  return { wrap, select };
}

function rangeField(label, min, max, value, onInput) {
  const wrap = el("label", "mr-field");
  wrap.append(el("span", "mr-label", label));
  const row = el("div", "mr-range-row");
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = String(value);
  const readout = el("span", "mr-readout", `${value} cm`);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    readout.textContent = `${next} cm`;
    onInput(next);
  });
  row.append(input, readout);
  wrap.append(row);
  return { wrap, input, readout };
}

function segmented(options, current, onPick) {
  const wrap = el("div", "mr-segment");
  const nodes = new Map();
  options.forEach(([key, label]) => {
    const node = button(label, () => onPick(key));
    node.classList.add("mr-segment-btn");
    node.dataset.value = key;
    wrap.append(node);
    nodes.set(key, node);
  });
  const update = (value) => {
    nodes.forEach((node, key) => node.setAttribute("aria-pressed", String(key === value)));
  };
  update(current);
  return { wrap, update };
}

function groupDefinitions(model) {
  if (model === "heart") {
    return [{ key: "all", label: "All donkeys", AgeGroup: "Under 7", Sex: "Female", stroke: INK, dash: null }];
  }
  if (model === "age") {
    return [
      { key: "young", label: "Under 7", AgeGroup: "Under 7", Sex: "Female", stroke: BLUE, dash: null },
      { key: "older", label: "7 and over", AgeGroup: "7 and over", Sex: "Female", stroke: VERMILION, dash: null },
    ];
  }
  return [
    { key: "young-f", label: "Under 7, Female", AgeGroup: "Under 7", Sex: "Female", stroke: BLUE, dash: null },
    { key: "older-f", label: "7 and over, Female", AgeGroup: "7 and over", Sex: "Female", stroke: VERMILION, dash: null },
    { key: "young-m", label: "Under 7, Male", AgeGroup: "Under 7", Sex: "Male", stroke: GREEN, dash: "7,4" },
    { key: "older-m", label: "7 and over, Male", AgeGroup: "7 and over", Sex: "Male", stroke: PURPLE, dash: "7,4" },
  ];
}

function modelFormula(model) {
  if (model === "heart") return "Bodywt ~ Heartgirth";
  if (model === "age") return "Bodywt ~ Heartgirth + AgeGroup";
  return "Bodywt ~ Heartgirth + AgeGroup + Sex";
}

function table(headers, rows, className = "") {
  const node = el("table", `mr-table ${className}`.trim());
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  headers.forEach((header) => hr.append(el("th", "", header)));
  thead.append(hr);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      if (cell && typeof cell === "object" && cell.html != null) td.innerHTML = cell.html;
      else td.textContent = String(cell);
      tr.append(td);
    });
    tbody.append(tr);
  });
  node.append(thead, tbody);
  return node;
}

function statusForModel(stateModel, fits) {
  if (stateModel === "heart") {
    return {
      title: "Baseline model",
      text: "Start with Heartgirth alone. Ordinary and adjusted R-squared are the same comparison target for every model below because the response and observations are unchanged.",
      cls: "neutral",
    };
  }
  const previous = stateModel === "age" ? fits.heart : fits.age;
  const current = stateModel === "age" ? fits.age : fits.full;
  const term = stateModel === "age" ? "Age group" : "Sex";
  const delta = current.adjR2 - previous.adjR2;
  return {
    title: `${term}: adjusted R-squared ${delta >= 0 ? "increases" : "decreases"}`,
    text: `${term} changes adjusted R-squared by ${signed(delta, 4)}. ${delta > 0 ? "By this criterion, the term earns its place in the model." : "By this criterion, the extra term has not earned the added complexity."} This is a model-fit criterion, not a significance test or a claim of scientific importance.`,
    cls: delta > 0 ? "positive" : "negative",
  };
}

function contrastRows(rows, fit, model, references) {
  const output = [];
  if (["age", "full"].includes(model)) {
    const raw = rawFactorDifference(rows, "AgeGroup", references.AgeGroup);
    const adjusted = coefficientFor(fit, "AgeGroup:");
    output.push([
      `${raw.other} - ${raw.reference}`,
      signed(raw.difference),
      adjusted ? signed(adjusted.estimate) : "--",
    ]);
  }
  if (model === "full") {
    const raw = rawFactorDifference(rows, "Sex", references.Sex);
    const adjusted = coefficientFor(fit, "Sex:");
    output.push([
      `${raw.other} - ${raw.reference}`,
      signed(raw.difference),
      adjusted ? signed(adjusted.estimate) : "--",
    ]);
  }
  return output;
}

export function multipleRegressionLab({ Plot, data }) {
  const rows = prepareDonkeyData(data);
  if (rows.length < 10) {
    const problem = el("div", "multiple-regression-lab mr-error", "The donkey data could not be loaded.");
    return problem;
  }

  const minHeart = Math.floor(Math.min(...rows.map((row) => row.Heartgirth)));
  const maxHeart = Math.ceil(Math.max(...rows.map((row) => row.Heartgirth)));
  const initialHeart = Math.max(minHeart, Math.min(maxHeart, 115));
  const state = {
    model: "heart",
    heart: initialHeart,
    AgeGroup: "Under 7",
    Sex: "Female",
  };

  const root = el("div", "multiple-regression-lab");
  const controls = el("div", "mr-controls");
  const plotWrap = el("div", "mr-plot-wrap");
  const summary = el("div", "mr-summary");
  root.append(controls, plotWrap, summary);

  controls.append(el("div", "mr-kicker", "Build the model"));
  const modelControl = segmented([
    ["heart", "Heart girth"],
    ["age", "+ Age group"],
    ["full", "+ Age group + Sex"],
  ], state.model, (value) => {
    state.model = value;
    render();
  });
  controls.append(modelControl.wrap);

  const heart = rangeField("Compare at heart girth", minHeart, maxHeart, state.heart, (value) => {
    state.heart = value;
    render();
  });
  controls.append(heart.wrap);

  controls.append(el("div", "mr-kicker", "Reference categories"));
  const ageReference = selectField("Age group reference", AGE_LEVELS, state.AgeGroup, (value) => {
    state.AgeGroup = value;
    render();
  });
  const sexReference = selectField("Sex reference", SEX_LEVELS, state.Sex, (value) => {
    state.Sex = value;
    render();
  });
  controls.append(ageReference.wrap, sexReference.wrap);

  const referenceNote = el("div", "mr-note", "Change the reference, keep the predictions. The coefficient coding changes; the fitted model does not.");
  controls.append(referenceNote);

  function renderPlot(fit) {
    const groups = groupDefinitions(state.model);
    const xValues = Array.from({ length: maxHeart - minHeart + 1 }, (_, i) => minHeart + i);
    const marks = [
      Plot.dot(rows, {
        x: "Heartgirth",
        y: "Bodywt",
        r: 2.7,
        fill: GREY,
        fillOpacity: 0.32,
      }),
      Plot.ruleX([state.heart], { stroke: "#8a6d1a", strokeWidth: 1.5, strokeDasharray: "4,4" }),
    ];

    groups.forEach((group) => {
      const lineRows = xValues.map((Heartgirth) => ({
        Heartgirth,
        Bodywt: fit.predict({ Heartgirth, AgeGroup: group.AgeGroup, Sex: group.Sex }),
      }));
      marks.push(Plot.line(lineRows, {
        x: "Heartgirth",
        y: "Bodywt",
        stroke: group.stroke,
        strokeWidth: 2.7,
        ...(group.dash ? { strokeDasharray: group.dash } : {}),
      }));
      const predicted = fit.predict({ Heartgirth: state.heart, AgeGroup: group.AgeGroup, Sex: group.Sex });
      marks.push(Plot.dot([{ Heartgirth: state.heart, Bodywt: predicted }], {
        x: "Heartgirth",
        y: "Bodywt",
        r: 5.5,
        fill: group.stroke,
        stroke: "white",
        strokeWidth: 1.5,
      }));
    });

    const plot = Plot.plot({
      width: 650,
      height: 430,
      marginLeft: 58,
      marginBottom: 48,
      x: { label: "Heart girth (cm)", domain: [minHeart, maxHeart], grid: true },
      y: { label: "Body weight (kg)", grid: true },
      marks,
    });
    plot.setAttribute("role", "img");
    plot.setAttribute("aria-label", "Moroccan donkey body weight by heart girth with additive fitted regression lines");

    const legend = el("div", "mr-legend");
    groups.forEach((group) => {
      const item = el("div", "mr-legend-item");
      const swatch = el("span", "mr-legend-swatch");
      swatch.style.borderTopColor = group.stroke;
      swatch.style.borderTopStyle = group.dash ? "dashed" : "solid";
      item.append(swatch, document.createTextNode(group.label));
      legend.append(item);
    });

    const caption = el("div", "mr-caption", `${modelFormula(state.model)}. All displayed group lines share the same Heartgirth slope.`);
    plotWrap.replaceChildren(plot, legend, caption);
  }

  function renderSummary(fits, fit) {
    summary.replaceChildren();

    const fitCard = el("section", "mr-card");
    fitCard.append(el("h3", "", "R-squared and adjusted R-squared"));
    const ladderRows = [
      ["Heart girth", fits.heart],
      ["+ Age group", fits.age],
      ["+ Sex", fits.sex],
      ["+ Age group + Sex", fits.full],
    ].map(([label, modelFit]) => [
      { html: `${label}${modelFit.model === state.model ? ' <span class="mr-current">current</span>' : ""}` },
      formatNumber(modelFit.r2, 3),
      formatNumber(modelFit.adjR2, 3),
    ]);
    fitCard.append(table(["Model", "R-squared", "Adjusted"], ladderRows, "mr-fit-table"));
    const status = statusForModel(state.model, fits);
    const statusNode = el("div", `mr-status ${status.cls}`);
    statusNode.append(el("strong", "", status.title), el("p", "", status.text));
    fitCard.append(statusNode);
    summary.append(fitCard);

    const coefficientCard = el("section", "mr-card");
    coefficientCard.append(el("h3", "", "Coefficients"));
    coefficientCard.append(el("div", "mr-formula", modelFormula(state.model)));
    coefficientCard.append(table(
      ["Term", "Estimate"],
      fit.coefficients.map((coefficient) => [coefficient.name, formatNumber(coefficient.estimate, 3)]),
    ));
    summary.append(coefficientCard);

    if (state.model !== "heart") {
      const contrastCard = el("section", "mr-card");
      contrastCard.append(el("h3", "", "Raw versus adjusted comparison"));
      contrastCard.append(table(
        ["Comparison", "Raw mean diff. (kg)", "Adjusted diff. (kg)"],
        contrastRows(rows, fit, state.model, { AgeGroup: state.AgeGroup, Sex: state.Sex }),
      ));
      contrastCard.append(el("p", "mr-small", "The adjusted difference compares groups at the same Heartgirth. In the full model it also holds the other factor fixed."));
      summary.append(contrastCard);
    }

    const predictionCard = el("section", "mr-card");
    predictionCard.append(el("h3", "", `Fitted means at ${state.heart} cm`));
    const predictionRows = groupDefinitions(state.model).map((group) => [
      group.label,
      formatNumber(fit.predict({ Heartgirth: state.heart, AgeGroup: group.AgeGroup, Sex: group.Sex }), 1),
    ]);
    predictionCard.append(table(["Group", "Predicted body weight (kg)"], predictionRows));
    summary.append(predictionCard);
  }

  function render() {
    const references = { AgeGroup: state.AgeGroup, Sex: state.Sex };
    const fits = fitModelSet(rows, references);
    const fit = fits[state.model];
    modelControl.update(state.model);
    ageReference.select.disabled = state.model === "heart";
    sexReference.select.disabled = state.model !== "full";
    renderPlot(fit);
    renderSummary(fits, fit);
  }

  render();
  return root;
}
