# 2027 plan: restructure the linear-models weeks

In 2027, Jonathan compresses weeks 1–6 into weeks 1–4, adds visual inference,
and teaches sampling, probability and the CLT in weeks 6–8. The linear-models
block moves from weeks 10–12 to weeks 9–11, in a new order:

| 2027 week | Topic | Assessment |
|-----------|-------|------------|
| 9 | Simple linear regression all the way through | Week 8 homework due |
| 10 | Multiple regression, numeric predictors only | A3 (SLR only) due |
| 11 | Factors, then numeric + factors | No homework |
| 12 | Revision | Week 10/11 homework due |

Multiple regression is assessed only in the final exam and the week 10/11
homework.

Most of the material already exists. The main change is that L12 currently
teaches inference and diagnostics after the factor models of L11, so it has to
be split. Its SLR half moves to week 9 and its factor tests move to week 11.
Week 10 is the only lecture that needs substantial new writing.

Line numbers below refer to the 2026 files at commit `5f33cf8`.

## Week 9: simple linear regression

Lecture, as three short videos:

- **9a Fitting the line:** all of `lectures/10_linear_models.qmd`.
- **9b Inference and prediction:** L12 lines 103–167 (sampling variation,
  standard error, slope test, `confint`) and 329–363 (confidence vs prediction
  intervals, `predictionIntervalLab`).
- **9c Diagnostics:** L12 lines 365–666 (L-I-N-E widgets, donkey diagnostics,
  influence, log heart girth, "Before you trust the output").

Workshop: sections 1–5 of `labs/Workshop_Week10_Relationships.qmd`, plus a new
intervals and diagnostics section on the engine model, patterned on
`labs/Workshop_Week12_Assumptions.qmd` sections 2–5. Extend the gross-mass
independent task to the full workflow (fit, CI, PI, L-I-N-E), which also gives
students practice for A3.

Gaps:

- Introduce R² in the lecture before the lab uses it (see `NOTES.txt`).
- Restore the least-squares derivation and the estimator vs estimate material
  (`2027-lecture12-rigour-plan.md`). If weeks 6–8 cover estimators and standard
  errors, keep this to a short callback.
- Rewrite L12's opening, which currently refers to age group and sex.

## Week 10: multiple regression, numeric predictors

Lecture: this is the main gap.

- Introduce a donkey model with numeric predictors only, such as
  `Bodywt ~ Heartgirth + Height` or `+ Length`. Use the raw vs adjusted Height
  slope as the numeric version of L11's 16.5 kg vs 4.05 kg breakdown.
- Reuse from L11: "holding the others fixed", "Estimates have uncertainty",
  predictions at set values, and R² vs adjusted R² (lines 485–543).
- New: the overall F test in `summary()`; a nested F test with
  `anova(reduced, full)` for adding predictors, which week 11 reuses; intervals
  from MLR `predict()`; residuals vs each predictor; a brief note on
  collinearity.
- Take every quoted estimate from the model output before writing the slides.

Workshop: `labs/Workshop_Week12_Assumptions.qmd` already fits numeric MLR to the
cancer data (poverty + incidence, then income + insurance) and covers intervals,
diagnostics, influence and a transformation. Add an overall and nested F
section, and cut the L-I-N-E explanations down to recaps.

## Week 11: factors, then numeric + factors

Lecture:

- New opener: `Bodywt ~ Sex` (the coefficient is a difference in group means,
  equivalent to a two-sample t test) and `Bodywt ~ AgeBand` (a one-way ANOVA,
  where the overall F is the factor test). Link back to Jonathan's permutation
  test between groups.
- L11 lines 132–483: Heartgirth + AgeGroup, the reference category, raw vs
  adjusted, + Sex, parallel lines, predictions and `multipleRegressionLab`.
- L12 lines 169–327: three-level AgeBand, the joint F test with
  `anova(reduced, full)`, `relevel`, and t = F for a binary factor.
- Add one slide on the sequential `anova(model)` table and why term order
  matters once two factors are in the model.
- Keep the "What have we assumed?" boundary slide. Interactions stay out.

Workshop: `labs/Workshop_Week11_Testing.qmd`, plus a factor-only model at the
start (fuel use ~ body type, compared with the group means) and a joint F test
for the five-level body type. The optional coffee extra refers to "Week 9 coffee
ratings", so reword it or drop it.

## Week 12

Jonathan runs the weeks 1–8 revision. Optionally, add a short "everything in
together" session for weeks 9–11 that works through one numeric + factor model.

## Risks

- **A3 timing:** students get one week of SLR teaching before A3 is due. Release
  A3 at the start of week 9, make it due late in week 10, and make sure week 9
  covers everything A3 needs, including diagnostics.
- **Week 9 load:** week 9 holds about 1.5 of the current lectures. That only
  works if weeks 6–8 cover sampling distributions, standard errors, confidence
  intervals and p-values.
- **Dependencies on weeks 1–4:** factors and `fct_relevel()` must stay in the
  compressed weeks, because week 11's reference category depends on them.
- **Renumbering:** every week number in titles and file names, and every
  "last week / next week" reference, needs updating.
