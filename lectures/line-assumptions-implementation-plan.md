# Build Interactive LINE Assumption Widgets

## Summary

Create reusable draft widgets for Linearity, Independence, Normality, and Equal variance, plus a RevealJS QMD for rapid iteration. Implement the checklist below, then review the diff, render the QMD, and assess every acceptance criterion.

## Public Interfaces

Create three new files:

- `lectures/line-assumptions-lab.js`
- `lectures/line-assumptions-lab.css`
- `lectures/line-assumptions-tools.qmd`

Export these functions from the JavaScript module:

```js
linearityLab({ Inputs, Plot })
independenceLab({ Inputs, Plot })
normalityLab({ Inputs, Plot })
equalVarianceLab({ Inputs, Plot })
```

Each function returns one self-contained DOM element and must work with Quarto’s bundled Observable Plot 0.6.11 without external dependencies.

## Implementation TODOs

- [ ] Build a shared widget factory with the same layout for all four tools: controls above or beside a left scatterplot and right diagnostic plot.
- [ ] Give every observation a stable `id`, `order`, and `origin` (`generated` or `student`) so identity survives fitting, sorting, diagnostics, and edits.
- [ ] Use fixed seeded latent random draws. Moving a guided slider away and back must reproduce the exact same observations; “Generate another sample” advances to a new seed.
- [ ] Keep ordinary plot domains fixed during slider changes and free edits. Clamp pointer-created values to those domains.
- [ ] Refit least squares after every applicable edit and retain a graceful empty/error state when fewer than two distinct predictor values remain.
- [ ] Add a shared “Well-behaved / Violation” preset toggle, assumption-specific controls, “Generate another sample,” “Predict first / Reveal diagnostic,” Guided/Free edit mode, Undo, Reset, and Delete selected.
- [ ] In Guided mode, enable presets and generating controls. Entering Free edit freezes the displayed sample and disables those controls.
- [ ] In Free edit mode, support blank-area click to add, point drag to move, click to select, Delete selected, Undo, and Reset edits. Returning to Guided mode discards free edits and regenerates the current seed from the guided controls.
- [ ] Render generated points in dark grey and student-added points in accessible vermilion (`#D55E00`) in both scatter and diagnostic plots.
- [ ] Implement linked hovering through stable IDs. Hovering either plot must add a blue outer ring without replacing the point’s origin color, highlight the corresponding point in the other plot, draw its vertical residual segment in the scatterplot, and display x_i, y_i, y-hat_i, and e_i. Include observation order where relevant.
- [ ] Add an origin-color legend and concise pointer instructions.

### Linearity

- [ ] Generate a linear baseline plus fixed noise, with curve-shape control for U-shaped or S-shaped departures, a curvature-strength slider, and a noise slider.
- [ ] Show residuals versus fitted values with a zero line and an optional running-mean smoother.
- [ ] Display R-squared, including for strongly curved samples.
- [ ] Add a quadratic comparison reveal: overlay the quadratic fit on the scatterplot and its separately styled residuals in the diagnostic while retaining ID-linked highlighting.

### Independence

- [x] Generate one fixed sample carrying a time index, with a real time pattern baked in. The sample itself never changes when the order slider moves.
- [x] Replace the AR(1) correlation slider with an order slider: the middle is a fixed shuffle of the recorded sequence, `+1` sorts the same points into time order (runs) and `-1` sorts them into an alternating order. `x`, `y`, the fitted line and every residual value stay identical throughout.
- [x] Default to residuals versus observation order, connect neighbouring residuals, and show observation numbers taken from the displayed sequence.
- [x] Report the lag-1 correlation of the displayed sequence, since the widget is about correlation and the number makes it explicit.
- [x] Treat the time index as independent of `x`, so the violation is invisible in the scatterplot and only appears once order is known.
- [x] Let "Well-behaved" genuinely remove the time pattern, rather than merely hiding it.
- [x] Provide an optional lag view plotting e_i against e_(i-1); associate each lag point with observation i for linked highlighting.
- [x] In Free edit mode, permit vertical dragging in the ordered residual plot, update the corresponding y_i, and refit the model.
- [x] Ensure every newly added point receives the next visible observation number, and freeze the shuffled arrangement while editing so the order plot does not reshuffle underneath the student.

### Normality

- [ ] Provide normal, skewed, and heavy-tailed error shapes, a severity slider, and an integer sample-size control.
- [ ] Show a normal Q–Q plot with theoretical quantiles and a quartile-based reference line. Preserve observation IDs when residuals are rank-sorted.
- [ ] Keep the Q–Q plot as the linked diagnostic and optionally reveal a compact residual histogram and a larger simulated view of the generating error distribution.
- [ ] Recompute ranks after additions, movement, or deletion without losing scatter-to-Q–Q identity.

### Equal Variance

- [ ] Generate constant variance, increasing funnel, decreasing funnel, and bow-tie patterns with a severity slider.
- [ ] Show residuals versus fitted values with a zero line and optional running-mean smoother.
- [ ] Add a reveal for the generating mean ± two standard-deviation band on the scatterplot.
- [ ] Keep residuals centred around zero as spread severity changes.

### RevealJS Preview

- [ ] Configure `line-assumptions-tools.qmd` as a 16:9 RevealJS deck using the new CSS and `embed-resources: true`.
- [ ] Import all four exports once from `./line-assumptions-lab.js` in a hidden `{ojs}` cell.
- [ ] Add one slide per widget, instantiated through calls such as `linearityLab({Inputs, Plot})`.
- [ ] Add a short introductory slide explaining Guided mode, Free edit mode, point colors, linked hover, and diagnostic reveal.
- [ ] Make the CSS responsive while prioritising a normal lecture projector viewport.

## Verification and Assessment

- [ ] Render with `quarto render lectures/line-assumptions-tools.qmd`; require a successful render with no missing local assets or OJS compilation errors.
- [ ] Inspect each slide at a 16:9 desktop viewport and a narrow viewport for clipping, illegible controls, or overlapping plots.
- [ ] Verify slider reproducibility, new-sample behavior, preset behavior, diagnostic hide/reveal, and stable axes.
- [ ] For every widget, add, drag, select, delete, undo, and reset points; confirm student-added color persists in both plots.
- [ ] Hover from both scatter and diagnostic views; confirm the same ID, highlight ring, information display, and residual segment appear without masking the orange added-point fill.
- [ ] Verify linearity curvature and quadratic comparison, independence positive/negative runs and order-only shuffling, normality Q–Q identity after rank changes, and all equal-variance patterns.
- [ ] Delete points until regression is undefined and confirm the widget displays a useful message instead of producing `NaN` marks or JavaScript errors.
- [ ] After implementation, review the diff, confirm that only the planned new files were changed, rerun the render, assess the interaction checklist, and report defects or acceptance.

## Assumptions

- This iteration is a standalone preview harness; do not modify `12_linear_models_assump_resids.qmd` or replace its current Shiny embeds.
- Include the full teaching feature set from `Untitled-1.md`, but omit formal assumption-test statistics.
- Existing unrelated working-tree changes must remain untouched.
