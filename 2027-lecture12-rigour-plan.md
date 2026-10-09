# 2027 plan: restore lecture 12's mathematical rigour

For 2027, restore the mathematical rigour that lecture 12 had in 2025.
Previously, students saw how least-squares estimation was derived and why it
worked. The 2026 lecture skips that derivation and treats the assumptions less
mathematically. Bring that material back alongside the worked examples and
diagnostics.

## What to restore

- Derive the least-squares estimator from the squared-error objective and
  demonstrate its calculation with a small worked example.
- Explain estimator versus estimate, and show how random errors produce
  sampling variation in the fitted coefficients.
- State the linear model and its assumptions mathematically: conditional
  mean, independence, constant error variance, and normal errors for exact
  small-sample inference.
- Connect those assumptions to standard errors, confidence intervals, t tests
  and F tests, then to residual diagnostics.
- Retain the useful 2026 donkey examples, factor tests and interactive
  diagnostics.

## Recovery source: the 2025 lecture

Retrieve the previous lecture from commit `7a20a70`:

```sh
git show 7a20a70:lectures/12_linear_models_assump_resids.qmd
```

Revisit its least-squares estimation section, the "Estimators vs Estimates"
examples, "Estimator as a random variable", the formal linear-model assumptions,
and "Sampling distribution of our estimators".

Restore their mathematical substance while correcting the historical wording:

- Distinguish unobserved model errors from fitted residuals.
- Separate the Gauss-Markov conditions from the additional normality
  assumption used for exact small-sample inference.

## Preparation for 2027

Review the lecture sequence so the derivation and formal assumptions have time
alongside inference, prediction and diagnostics. Use the recovered material to
explain why the methods work, then connect it to the current worked examples.

This is a planning note for the 2027 revision; the 2026 lecture remains as
delivered.
