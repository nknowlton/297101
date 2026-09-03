export function leastSquares(points) {
  const meanX = points.reduce((sum, d) => sum + d.x, 0) / points.length;
  const meanY = points.reduce((sum, d) => sum + d.y, 0) / points.length;
  const numerator = points.reduce(
    (sum, d) => sum + (d.x - meanX) * (d.y - meanY),
    0,
  );
  const denominator = points.reduce(
    (sum, d) => sum + (d.x - meanX) ** 2,
    0,
  );
  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

export function meanSquaredError(points, intercept, slope) {
  return points.reduce(
    (sum, d) => sum + (d.y - (intercept + slope * d.x)) ** 2,
    0,
  ) / points.length;
}

export function regressionLab({ Inputs, Plot }) {
  const X_DOMAIN = [0, 10];
  const Y_DOMAIN = [-2, 12];

  const randomButton = Inputs.button("Random data");
  const revealButton = Inputs.button("Show best fit");
  const slopeInput = Inputs.range([-1.5, 1.5], {
    label: "Slope",
    value: 0,
    step: 0.01,
  });
  const interceptInput = Inputs.range([-2, 12], {
    label: "Intercept",
    value: 5,
    step: 0.01,
  });
  const fittedSlopeToggle = Inputs.toggle({
    label: "Slope",
    value: false,
  });
  const fittedInterceptToggle = Inputs.toggle({
    label: "Intercept",
    value: false,
  });
  const residualToggle = Inputs.toggle({
    label: "Show residuals",
    value: false,
  });
  const mseToggle = Inputs.toggle({
    label: "Show MSE",
    value: false,
  });

  const chartHost = document.createElement("div");
  chartHost.className = "regression-chart";
  chartHost.setAttribute("role", "img");
  chartHost.setAttribute(
    "aria-label",
    "Scatter plot with an adjustable proposed regression line",
  );

  const equationHost = document.createElement("div");
  equationHost.className = "regression-equations";
  equationHost.setAttribute("aria-live", "polite");

  const mseHost = document.createElement("div");
  mseHost.className = "regression-mse";
  mseHost.setAttribute("aria-live", "polite");

  const normalRandom = () => {
    const u = Math.max(Math.random(), Number.EPSILON);
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const between = ([low, high]) => low + Math.random() * (high - low);

  const generateData = () => {
    const patterns = [
      { slope: [0.65, 0.95], noise: [0.35, 0.65] },
      { slope: [0.25, 0.50], noise: [0.85, 1.20] },
      { slope: [-0.95, -0.65], noise: [0.35, 0.65] },
      { slope: [-0.50, -0.25], noise: [0.85, 1.20] },
      { slope: [-0.10, 0.10], noise: [0.55, 1.10] },
    ];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const trueSlope = between(pattern.slope);
    const noise = between(pattern.noise);
    const hasInfluentialPoint = Math.random() < 0.25;
    const ordinaryPoints = hasInfluentialPoint ? 23 : 24;
    const points = [];

    for (let i = 0; i < ordinaryPoints; i += 1) {
      const x = between([0.75, 9.25]);
      let y;
      do {
        y = 5 + trueSlope * (x - 5) + normalRandom() * noise;
      } while (y < -1.5 || y > 11.5);
      points.push({ x, y });
    }

    if (hasInfluentialPoint) {
      const x = Math.random() < 0.5 ? 0.35 : 9.65;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const baseline = 5 + trueSlope * (x - 5);
      const y = Math.max(
        -1.5,
        Math.min(11.5, baseline + direction * between([1.8, 2.8])),
      );
      points.push({ x, y });
    }

    return points;
  };

  const setRangeValue = (control, value) => {
    const input = control.querySelector('input[type="range"]');
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const setRangeDisabled = (control, disabled) => {
    control.querySelector('input[type="range"]').disabled = disabled;
    control.classList.toggle("coefficient-locked", disabled);
  };

  const equation = (intercept, slope) => {
    const sign = slope < 0 ? "−" : "+";
    return `ŷ = ${intercept.toFixed(2)} ${sign} ${Math.abs(slope).toFixed(2)}x`;
  };

  let data = generateData();
  let fitted = leastSquares(data);
  let showBestFit = false;

  const render = () => {
    const proposedSlope = fittedSlopeToggle.value
      ? fitted.slope
      : Number(slopeInput.value);
    const proposedIntercept = fittedInterceptToggle.value
      ? fitted.intercept
      : Number(interceptInput.value);
    const residuals = data.map((d) => ({
      ...d,
      proposedY: proposedIntercept + proposedSlope * d.x,
    }));
    const proposedLine = X_DOMAIN.map((x) => ({
      x,
      y: proposedIntercept + proposedSlope * x,
    }));
    const fittedLine = X_DOMAIN.map((x) => ({
      x,
      y: fitted.intercept + fitted.slope * x,
    }));

    const marks = [
      Plot.ruleY([0], { stroke: "#b8b8b8" }),
      ...(residualToggle.value
        ? [Plot.link(residuals, {
          x1: "x",
          y1: "y",
          x2: "x",
          y2: "proposedY",
          stroke: "#d55e00",
          strokeOpacity: 0.65,
          strokeWidth: 1.5,
        })]
        : []),
      Plot.line(proposedLine, {
        x: "x",
        y: "y",
        stroke: "#d55e00",
        strokeWidth: 3,
      }),
      ...(showBestFit
        ? [Plot.line(fittedLine, {
          x: "x",
          y: "y",
          stroke: "#0072b2",
          strokeWidth: 3,
          strokeDasharray: "8,5",
        })]
        : []),
      Plot.dot(data, {
        x: "x",
        y: "y",
        r: 5,
        fill: "#3c3c3c",
        stroke: "white",
        strokeWidth: 1,
      }),
    ];

    chartHost.replaceChildren(Plot.plot({
      width: 780,
      height: 470,
      marginLeft: 55,
      marginBottom: 45,
      x: { domain: X_DOMAIN, label: "x", grid: true, nice: false },
      y: { domain: Y_DOMAIN, label: "y", grid: true, nice: false },
      marks,
    }));

    equationHost.innerHTML = `
      <div><span class="line-key proposed"></span>
        <strong>Your line:</strong> ${
      equation(proposedIntercept, proposedSlope)
    }</div>
      ${
      showBestFit
        ? `<div><span class="line-key fitted"></span>
        <strong>Least-squares line:</strong> ${
          equation(fitted.intercept, fitted.slope)
        }</div>`
        : ""
    }
    `;

    if (mseToggle.value) {
      const proposedMse = meanSquaredError(
        data,
        proposedIntercept,
        proposedSlope,
      );
      mseHost.innerHTML = showBestFit
        ? `<strong>MSE:</strong> your line ${proposedMse.toFixed(3)}; ` +
          `least-squares line ${
            meanSquaredError(
              data,
              fitted.intercept,
              fitted.slope,
            ).toFixed(3)
          }`
        : `<strong>MSE:</strong> your line ${proposedMse.toFixed(3)}`;
      mseHost.hidden = false;
    } else {
      mseHost.replaceChildren();
      mseHost.hidden = true;
    }
  };

  const resetData = () => {
    data = generateData();
    fitted = leastSquares(data);
    showBestFit = false;
    setRangeValue(slopeInput, fittedSlopeToggle.value ? fitted.slope : 0);
    setRangeValue(
      interceptInput,
      fittedInterceptToggle.value ? fitted.intercept : 5,
    );
    render();
  };

  const updateCoefficientLocks = () => {
    if (fittedSlopeToggle.value) {
      setRangeValue(slopeInput, fitted.slope);
    }
    if (fittedInterceptToggle.value) {
      setRangeValue(interceptInput, fitted.intercept);
    }
    setRangeDisabled(slopeInput, fittedSlopeToggle.value);
    setRangeDisabled(interceptInput, fittedInterceptToggle.value);
    render();
  };

  randomButton.addEventListener("input", resetData);
  revealButton.addEventListener("input", () => {
    showBestFit = true;
    render();
  });
  slopeInput.addEventListener("input", render);
  interceptInput.addEventListener("input", render);
  fittedSlopeToggle.addEventListener("input", updateCoefficientLocks);
  fittedInterceptToggle.addEventListener("input", updateCoefficientLocks);
  residualToggle.addEventListener("input", render);
  mseToggle.addEventListener("input", render);

  const lab = document.createElement("div");
  lab.className = "regression-lab";

  const controls = document.createElement("div");
  controls.className = "regression-controls";

  const actions = document.createElement("div");
  actions.className = "regression-actions";
  actions.append(randomButton, revealButton);

  const toggles = document.createElement("div");
  toggles.className = "regression-toggles";
  toggles.append(residualToggle, mseToggle);

  const coefficientToggles = document.createElement("div");
  coefficientToggles.className = "regression-coefficient-toggles";
  const coefficientToggleLabel = document.createElement("strong");
  coefficientToggleLabel.textContent = "Set to least squares:";
  coefficientToggles.append(
    coefficientToggleLabel,
    fittedSlopeToggle,
    fittedInterceptToggle,
  );

  controls.append(
    actions,
    slopeInput,
    interceptInput,
    coefficientToggles,
    toggles,
    equationHost,
    mseHost,
  );
  lab.append(controls, chartHost);

  render();
  return lab;
}
