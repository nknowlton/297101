# 297.101 Weeks 11–12 lecture alignment

This is the implementation brief for Luna. Nick has approved planning the lecture revision. All student-facing prose below is final copy written for this task. Luna may move and edit code, Quarto/OJS wiring, layout and build files, but must not invent, paraphrase or extend student-facing text. If layout needs fewer words, split a slide while retaining the text, or report the conflict.

## Source of truth and scope

- Base: `nknowlton/297101`, main commit `27feb9fc3dca1489dfa44ff8bf0354f424709fe3`. Recheck the head before editing.
- Primary target: `lectures/11_linear_models_hypoth_pred.qmd`. Replace the current Week 11 testing/prediction/log–log/MSE deck with the Week 11 material below. Retain the file path so existing site links keep working.
- Secondary target: `lectures/12_linear_models_assump_resids.qmd`. Move the relevant inference and interval methods from the old Week 11 lecture into Week 12; bring in the four existing LINE widgets and the prediction-interval widget. Remove the lengthy two-point estimator derivation to make room.
- Align to `labs/Workshop_Week11_Testing.qmd` and `labs/Workshop_Week12_Assumptions.qmd`, not their historical filenames. Do not edit the labs unless a true error prevents them running. Do not change the delivered Week 10 lecture.
- Week 11 teaches additive multiple regression only. A common slope across body types is a model assumption, not an interaction lesson. No interaction fitting, tests of parallel slopes, ANOVA or partial F tests.
- Use the supplied vehicle extract (467 unique specifications): `../labs/nz_vehicles_2025.csv` from the lecture directory. Match the factor levels and labels in the Week 11 workshop exactly. Each row is one vehicle specification, not one driver or a fuel-consumption observation in ordinary use.
- Retain the donkey data for Week 12 inference and diagnostics, with a local copy if already available or a stable download incorporated into the build. The Week 12 workshop uses county cancer data as a transfer example; do not repeat its full worked analysis in the lecture.

## Implementation to-dos

- [ ] Rebuild Week 11 in the order and with the exact slide prose below. Keep code and printed output next to the question it supports. Do not preserve old inference material in the new Week 11 deck by inertia.
- [ ] Set Week 11 title to “297.101 Week 11: Multiple Regression and Factors” and subtitle to “Adjusted comparisons and predictions”. Preserve the course logo/theme; check normal 16:9 projector layout.
- [ ] Source the vehicle data with `readr::read_csv`. Create `station_wagon` and five-level `body_type` exactly as in the Week 11 workshop. Fit `engine_model`, `power_model`, `binary_model`, `power_binary_model`, `body_model` and `power_body_model` when each first appears. Use named objects and `lm()`, `summary()`, `broom::tidy()`, `broom::glance()`, `model.matrix()` and `predict()` where the corresponding slide calls for them.
- [ ] Show raw group averages on one slide beside the model's adjusted comparison, using the same vehicle sample. Check categories remain in the specified order. Do not describe the numerical results until R has been run.
- [ ] Show one simple line and the two parallel group lines on the same axes where specified, preferably with observed-row fitted values and `geom_line()`; use colour and a legend accessible on a projector. The illustrated parallelism follows from the additive model, not a claim that the raw data prove equal slopes.
- [ ] Use `newdata` with a valid `body_type` factor for all five body types at 2.0 L, then an analogous prediction at 150 kW from `power_body_model`. Confirm those values lie within sensible support for each group or explicitly mark a group combination as extrapolation.
- [ ] Move the Week 11 coefficient interval, t test, mean-versus-individual prediction and MSE concepts to Week 12 only where the exact Week 12 text below calls for them. Leave the incorrect direct comparison of raw-response and log-response R² out of both decks.
- [ ] Integrate `predictionIntervalLab({ Inputs, Plot })` from `lectures/regression-lab.js` into Week 12, with `regression-lab.css`. Remove its instantiation from Week 11.
- [ ] Integrate `linearityLab`, `independenceLab`, `normalityLab` and `equalVarianceLab` from `lectures/line-assumptions-lab.js` into Week 12 with `line-assumptions-lab.css`. The standalone `line-assumptions-tools.qmd` remains a preview harness. Reuse its tested import and invocation syntax. Do not move these widgets to Week 11: they teach diagnostic checks that the Week 12 workshop actually practises.
- [ ] Replace the two old Shiny iframe slides in Week 12 with local widgets. Keep at least one real-model diagnostic display after the synthetic widgets, so students transfer from idealised patterns to the donkey residuals.
- [ ] Preserve functioning code and plots where reusable, but use only the replacement slide wording supplied here. Source comments aimed at maintainers may be written by Luna; student-facing captions, prompts, labels and interpretations must come from this plan or existing unchanged text.
- [ ] Render both decks and the standalone widget preview; inspect at a 16:9 projector viewport for clipping, output contrast, navigation and working OJS controls. Run the Week 11/12 workshop code or compare outputs against their answer guides after any data-processing change. Do not silently change the lab's answer key.
- [ ] Finish with a short implementation report listing changed files, render results, any observed data values used in prose, and unresolved content decisions.

## Week 11: exact student-facing slide copy

Put one numbered block on one slide unless the code/output needs a follow-on slide. A continuation slide may repeat the heading but must not add new prose. Text in square brackets is an implementation instruction, not lecture copy.

### 1. Learning outcomes

~~~markdown
## Learning outcomes

By the end of this lecture, you should be able to:

- fit a model with a numerical predictor and a categorical predictor;
- interpret an adjusted slope and a difference from a reference category;
- explain why an adjusted comparison can differ from a raw comparison;
- make predictions at a common value of the numerical predictor; and
- compare ordinary and adjusted R² across models fitted to the same response.
~~~

### 2. Return to the vehicle problem

~~~markdown
## One predictor was a start

Last week we related fuel use to engine size, power or mass, one at a time. A fitted line described the average trend, but vehicles with the same engine size can be quite different.

Does body type account for some of that difference? We can add it to the model while keeping engine size in the equation.
~~~

[Load the extract and report rows and body-type counts. Use the workshop's factor transformation without altering its levels.]

### 3. What each row represents

~~~markdown
## What are we comparing?

Each row is one 2025 petrol vehicle specification. The response is combined test-cycle fuel use in L/100 km. Engine size is measured in litres; body type is a category.

These are associations among specifications. The model does not tell us the fuel use of every driver or show that changing a vehicle's body type would change its consumption.
~~~

### 4. Simple baseline

~~~markdown
## Start with one line

Fit fuel use against engine size and draw the fitted line over the data.

The slope gives the fitted change in L/100 km for a one-litre difference in engine size. It averages across all the body types in this dataset. The intercept is the fitted value at zero litres, well outside the vehicles we observed.
~~~

[Fit and display `engine_model <- lm(fuel_use_l_per_100km ~ engine_l, data = vehicles)`, `summary(engine_model)` and a scatterplot with the line. Label both axes with units.]

### 5. Two groups

~~~markdown
## Add Station wagon or Other

First, reduce body type to two categories: Station wagon and Other. We fit one engine-size slope while allowing the groups to have different fitted heights.

The model asks how fuel use differs between these groups at the same engine size. That is a different comparison from putting all vehicles on one line.
~~~

[Fit `binary_model <- lm(fuel_use_l_per_100km ~ engine_l + station_wagon, data = vehicles)`. Plot observed points and the two fitted parallel lines. Display coefficient output.]

### 6. Read the two fitted lines

~~~markdown
## Two intercepts, one slope

For Station wagons, the fitted mean is

$$\widehat{\mathrm{fuel\ use}}=\hat\beta_0+\hat\beta_1\,\mathrm{engine\ size}.$$

For Other vehicles, it is

$$\widehat{\mathrm{fuel\ use}}=(\hat\beta_0+\hat\beta_2)+\hat\beta_1\,\mathrm{engine\ size}.$$

Station wagon is the reference category. The coefficient \(\hat\beta_2\) is the fitted Other-minus-Station-wagon difference at the same engine size. Both groups share \(\hat\beta_1\), so the fitted lines are parallel.
~~~

### 7. How R represents a factor

~~~markdown
## The reference category is coded as zero

Run `model.matrix(binary_model)` and inspect a few rows. R has made a column called `station_wagonOther`: zero for Station wagons and one for Other vehicles.

For a Station wagon, that term drops out. For an Other vehicle, its coefficient is added to the fitted value. The reference category is the first factor level we supplied; it is a coding choice, not a claim that Station wagons are the natural baseline.
~~~

### 8. Raw versus adjusted

~~~markdown
## Two different comparisons

Compare the raw mean fuel use in each group with the fitted difference at a common engine size.

The raw means combine differences in body type with differences in the kinds of engines found in each group. The factor coefficient holds engine size fixed within the additive model. Neither comparison identifies a causal effect.
~~~

[Print group means and the `station_wagonOther` coefficient together, labelled “Raw Other minus Station wagon” and “Adjusted Other minus Station wagon”. Print no unverified numerical assertion in the prose.]

### 9. Repeat the comparison with power

~~~markdown
## Keep the question, change the numerical predictor

Now fit fuel use against engine power, first alone and then with Station wagon or Other. Compare the two power slopes.

The simple slope summarises the association across all vehicles. The adjusted slope compares vehicles in the same group. The coefficient for Other compares groups at the same power, in L/100 km.
~~~

[Fit `power_model` and `power_binary_model`. Display both power slopes in L/100 km per 10 kW. Show the binary factor coefficient from `power_binary_model`.]

### 10. More than two body types

~~~markdown
## Use all five categories

Our two-group comparison hides differences among Hatchbacks, Sedans, Sports cars and Convertibles. Replace it with the full `body_type` factor.

Station wagon remains the reference. R fits one shared engine-size slope and four body-type differences. Each difference compares that category with Station wagons at the same engine size.
~~~

[Fit `body_model <- lm(fuel_use_l_per_100km ~ engine_l + body_type, data = vehicles)` and display `broom::tidy(body_model)`. Keep the workshop's exact level order.]

### 11. Interpret one row

~~~markdown
## What does the Sedan coefficient mean?

The `body_typeSedan` coefficient is the fitted Sedan-minus-Station-wagon difference in L/100 km for vehicles with the same engine size. Its sign gives the direction of that comparison.

It is not the Sedan mean minus the Station wagon mean. It is also not a separate engine-size slope: the additive model uses the same slope for every body type.
~~~

### 12. Evidence in the coefficient table

~~~markdown
## Estimates have uncertainty

`Estimate` is the fitted coefficient. `Std. Error` describes how much that estimate would vary across comparable samples under the model. The t statistic is the estimate divided by its standard error; the p-value tests a zero coefficient.

For a body-type row, the null hypothesis is a zero adjusted difference from Station wagons. A small p-value is evidence against that null under the model. It does not measure how large or useful the difference is, and a large p-value does not establish equality. We will work with confidence intervals next week.
~~~

[Show a real `summary(body_model)$coefficients` table beside this text. Do not assess “significance” from star labels alone.]

### 13. Same category, different adjustment

~~~markdown
## Hold power fixed instead

Fit fuel use against power and all five body types. Compare the Sedan coefficient with the one from the engine-size model.

These models hold different numerical characteristics fixed. If their body-type coefficients differ, that does not make one of them automatically wrong. State which comparison answers the question you actually want to ask.
~~~

[Fit `power_body_model <- lm(fuel_use_l_per_100km ~ power_kw + body_type, data = vehicles)`. Display the two Sedan coefficients, each clearly labelled by its adjustment.]

### 14. Comparable predictions

~~~markdown
## Compare body types at 2.0 L

Use `predict(body_model, newdata = ...)` to obtain a fitted mean for each body type at an engine size of 2.0 L.

Every prediction uses the same engine size, so the differences among fitted values come from the body-type coefficients. These are model-based averages, not guarantees for individual vehicles.
~~~

[Display the five-row prediction table and show the `newdata` construction. Do not hard-code numerical predictions.]

### 15. Change the comparison again

~~~markdown
## Compare body types at 150 kW

Now use the power-and-body-type model to predict each body type at 150 kW. Compare its ranking with the 2.0 L engine-size comparison.

The rankings may differ because one model holds engine size fixed and the other holds power fixed. Check that each predictor/category combination is represented by comparable vehicles before treating a prediction as a practical comparison.
~~~

### 16. Fit versus complexity

~~~markdown
## Does adding body type improve the model?

Compare the simple engine-size model, the two-group model and the five-body-type model. All three have the same response in the same units and use the same vehicle rows.

Ordinary R² cannot fall when we add terms to a model fitted on the same observations. Adjusted R² accounts for the number of fitted coefficients, so it can fall if extra terms contribute too little. Neither measure establishes causation or performance on new vehicles.
~~~

[Use a compact `broom::glance()` comparison table with model name, `nobs`, `r.squared` and `adj.r.squared`. Check identical row counts; stop rendering with an informative error if rows differ.]

### 17. The boundary of this model

~~~markdown
## What have we assumed?

The additive model lets body types have different intercepts but gives them a common numerical slope. The lines are parallel because we specified that structure.

A model with different slopes would ask another question. We are not fitting that model in 297.101. For now, interpret each body-type difference at a shared value of engine size or power.
~~~

### 18. Hand off to the workshop

~~~markdown
## Try the same reasoning with mass

In the workshop you will start with gross vehicle mass, add the two-group factor, then use all five body types. Watch what happens to the mass slope when you compare vehicles within body types.

Next week we ask how uncertain the coefficients and predictions are, and whether the residual patterns support the model we have fitted.
~~~

## Week 12: relocation and exact replacement text

Keep Week 12 as a lecture about inference, intervals, assumptions and diagnostics. Retain technical code/plots that implement these concepts, but replace student-facing prose on the affected slides with the copy below. Source material from old Week 11 can be moved as code only; its confidence-interval and model-comparison explanations are superseded by this text. Reuse the donkey `lm(Bodywt ~ Heartgirth)` model where specified. Use `confint()` or `broom::tidy(..., conf.int = TRUE)` for exact t-based intervals; do not teach estimate ± 2 SE as an exact 95% interval.

Remove from the Week 12 main sequence: the two-observation slope-through-the-origin derivation, the claim that normality is part of the Gauss–Markov assumptions, the statement that the CLT generally makes residual Q–Q departures ignorable, fixed Cook's-distance thresholds as deletion rules, and claims that a residual plot proves LINE. Do not compare R² for `Bodywt` and `log(Bodywt)` as though they explained variation on the same scale. The workshop's original-versus-log-predictor models keep the response on the same scale and can be compared descriptively.

### 1. Opening

~~~markdown
## Learning outcomes

By the end of this lecture, you should be able to:

- read uncertainty and hypothesis tests for a regression coefficient;
- distinguish an interval for a mean response from an interval for one new outcome;
- explain the assumptions behind linear-model inference;
- use residual plots to identify possible departures from those assumptions; and
- investigate influential observations and compare a reasonable alternative model.
~~~

~~~markdown
## How much can we trust the fitted model?

Last week we used vehicle models to make adjusted comparisons. A coefficient is still an estimate from a sample, and a fitted value is still a prediction from a model.

Now we need to quantify uncertainty and check whether the model's structure is credible. We will use the donkey model for the worked examples. In the workshop, you will transfer the same reasoning to county-level cancer data.
~~~

### 2. Estimate, standard error and test

~~~markdown
## A coefficient is an estimate

Fit body weight against heart girth and inspect the coefficient table. The slope is the estimated change in mean body weight, in kilograms, for a one-centimetre difference in heart girth.

The standard error describes sampling variation in that estimated slope under the model. It is not the spread of individual donkey weights around the fitted line. That spread is summarised separately by the residual standard error.
~~~

[Show `summary(mod)$coefficients` and `sigma(mod)` with `mod <- lm(Bodywt ~ Heartgirth, data = donkey)`.]

~~~markdown
## What does the slope p-value test?

For heart girth, the coefficient test starts from \(H_0:\beta_{\mathrm{girth}}=0\). The t statistic compares the estimated slope with its standard error. The p-value describes how unusual a statistic at least as extreme would be if that null hypothesis and the model assumptions held.

A small p-value is evidence against a zero slope. It does not tell us the probability that the null is true, how accurate individual predictions are, or whether heart girth causes body weight.
~~~

### 3. Coefficient intervals

~~~markdown
## A range for the population slope

Use a 95% confidence interval for the heart-girth coefficient. In repeated comparable samples, the interval procedure would contain the population coefficient about 95% of the time.

For a two-sided 5% test of a zero coefficient, an interval that excludes zero agrees with rejecting that null. Interpret the endpoints in kilograms per centimetre. We do not say that there is a 95% probability that this particular fixed coefficient lies in the calculated interval.
~~~

[Run `confint(mod, "Heartgirth")` or `broom::tidy(mod, conf.int = TRUE)`; display actual values from the current data, without typed numerical claims.]

### 4. Fitted mean versus a new observation

~~~markdown
## Two questions at the same heart girth

At a heart girth of 120 cm, what is the estimated average body weight? What range might contain the weight of one new donkey at 120 cm?

Both questions use the same fitted value. The second has an additional source of uncertainty because individual weights vary around their mean.
~~~

~~~markdown
## Ask R for the interval you mean

Set `newdata = data.frame(Heartgirth = 120)`. Use `interval = "confidence"` for uncertainty in the mean weight at 120 cm, and `interval = "prediction"` for one new donkey's weight at 120 cm.

The prediction interval is wider because it incorporates residual variation as well as uncertainty in the fitted mean. Both intervals depend on the model and its assumptions; neither is a promise about a particular donkey.
~~~

[Show the two `predict()` calls on one slide and the contrasting ranges on the next if needed. Insert `predictionIntervalLab({ Inputs, Plot })` immediately after these slides.]

Widget slide copy:

~~~markdown
## Which interval answers the question?

Choose the target first: the average outcome at a specified predictor value, or one new individual outcome. Predict which interval should be wider, then reveal both.

Move the predictor value toward the edge of the observed range. What happens to uncertainty in the fitted mean?
~~~

### 5. What least squares assumes

~~~markdown
## Why look at residuals?

Least squares chooses coefficients to minimise the sum of squared residuals, \(e_i=y_i-\hat y_i\). It will produce a fitted line whether or not a straight-line mean describes the data well.

The residuals let us look for systematic patterns that the fitted model left behind. We need separate questions about the shape of the mean, dependence between observations, the shape of residuals, and changes in spread.
~~~

~~~markdown
## Four checks: L–I–N–E

**Linearity:** Is the conditional mean adequately described by the specified straight-line terms?

**Independence:** Could knowing one observation's error help predict another's? Consider how the observations were collected.

**Normality:** Are residuals sufficiently close to a normal shape for the interval or test being used, especially in the tails?

**Equal variance:** Is the residual spread roughly constant across fitted values?

These checks probe the assumptions; a plot cannot prove that they hold.
~~~

~~~markdown
## Which assumptions support which claims?

A straight-line mean, appropriate independence and constant error variance support the familiar least-squares standard errors and their usual interpretation. Normal errors provide the exact small-sample t and F distributions used for conventional intervals and tests.

Normality is not one of the Gauss–Markov conditions for least squares to be best linear unbiased. We still inspect the residual shape because this course also uses the usual finite-sample inference and individual prediction intervals.
~~~

### 6. LINE widgets, then real residuals

Use exactly one widget per slide, ordered L, I, N, E. Copy the following text verbatim and instantiate the named widget after the prompt. Keep the local preview harness intact.

~~~markdown
## L: what pattern has the line missed?

First look at the scatterplot and fitted line. Predict what the residual-versus-fitted plot will show, then reveal it. Increase curvature while keeping the same underlying sample.

Does a high R² rule out a systematic curve in the residuals?
~~~

[Instantiate `linearityLab({ Inputs, Plot })`.]

~~~markdown
## I: does order contain information?

The same points can look unremarkable in a scatterplot while their residuals form runs when we recover the time order. Change the displayed order without changing any \(x\), \(y\), fitted value or residual.

A residual plot against fitted values cannot establish independence. We also need the sampling design and, where relevant, the meaningful order of observations.
~~~

[Instantiate `independenceLab({ Inputs, Plot })`. Check that the widget's “well-behaved” state genuinely lacks the time pattern before retaining that label; do not write new explanatory text if a widget defect is found, report it.]

~~~markdown
## N: what does a Q–Q plot compare?

Each point represents one ordered residual against a theoretical normal quantile. Small departures, especially in a small sample, can occur by chance. Look for a sustained pattern, strong asymmetry or unusually heavy tails.

Generate another sample before judging a subtle deviation. The Q–Q plot is evidence about residual shape, not a yes-or-no proof of normality.
~~~

[Instantiate `normalityLab({ Inputs, Plot })`.]

~~~markdown
## E: does the spread change?

Keep the mean relationship fixed and change how widely observations vary around it. A funnel in residuals versus fitted values suggests non-constant variance.

If the spread grows, uncertainty for an individual outcome also changes across the predictor range. A straight fitted mean does not repair that problem.
~~~

[Instantiate `equalVarianceLab({ Inputs, Plot })`.]

~~~markdown
## Return to the donkey data

Now inspect the standard diagnostic plots for the fitted donkey model. State the visible pattern first, then say which assumption it bears on and why the departure matters.

Residuals versus fitted values can show curvature or changing spread. The Q–Q plot addresses residual shape. A leverage and Cook's-distance plot flags observations whose removal could materially change the fit. None of these plots tells us how the donkeys were sampled.
~~~

[Use `plot(mod, which = c(1, 2, 3, 5))`, split across slides as needed. State no categorical verdict not supported by the visible plot.]

~~~markdown
## Investigate influence before changing the data

A point can have an unusual predictor value, a large residual, or both. Cook's distance summarises how much the fitted model would change if that observation were omitted.

Check the source record and measurement process before deciding what to do. A correct but unusual donkey is still part of the data; a data-entry error calls for correction. Report any exclusion and examine whether it changes the substantive result.
~~~

### 7. One alternative and the handoff

~~~markdown
## Could another scale help?

If the residuals show curvature or changing spread, a transformation may be worth checking. Fit a model with logged heart girth as the predictor, then compare its fitted pattern and diagnostics with the original.

Both models predict body weight in kilograms, so their in-sample R² and residual standard deviations refer to the same response scale. A small improvement in one number alone is not enough to choose a model. Check the residuals, the observed predictor range and whether the new coefficient remains useful to interpret.
~~~

[Fit `mod_log_x <- lm(Bodywt ~ log(Heartgirth), data = donkey)` and plot relevant diagnostics. Do not promise it improves this dataset; let the rendered evidence determine the discussion. Do not reuse the old `lm(log(Bodywt) ~ log(Heartgirth))` R² comparison.]

~~~markdown
## Take the workflow to county data

In the workshop you will model county lung-cancer mortality using incidence and poverty. You will interpret adjusted coefficients, calculate intervals for a mean and a single county, assess LINE and investigate influence.

Nearby counties may share exposures and health services. That concern comes from the data collection and geography, even if the residual plots look tidy. Finish by comparing an alternative model on the same mortality scale and explaining what, if anything, it changes.
~~~

## Cross-file consistency and acceptance

- [ ] Week 11 lecture and workshop agree on the factor reference (Station wagon), five body types, shared slope, coefficient units, prediction scenarios, and ordinary versus adjusted R². Existing `labs/Workshop_Week11_Testing.qmd` mentions p-values, so keep the compact coefficient-test slide in Week 11; reserve intervals and diagnostic assumptions for Week 12.
- [ ] Week 12 lecture and workshop agree on coefficient CIs, mean versus single-county prediction intervals, L–I–N–E, influence as investigation rather than deletion, and comparing models on the same response scale.
- [ ] Week 12 workshop's opening currently says that Weeks 10–11 already covered standard errors and p-values. The new Week 11 slide does. Its statement about interval teaching remains Week 12.
- [ ] Verify no broken URLs, OJS imports, missing CSS, hidden widgets, or code/output that extends off the slide. Ensure labels in plots and prose use L/100 km, litres, kW, cm and kg correctly.
- [ ] A source-level check confirms there is no Week 11 prediction-interval widget, no Week 11 LINE widget, no Week 12 statement that normality is a Gauss–Markov assumption, no unconditional “CLT means ignore Q–Q tails”, and no comparison of R² values for raw versus logged responses.
- [ ] Because this plan intentionally changes the taught sequence, review both rendered lectures as a pair before release. Keep the generated Pages navigation paths unchanged. This plan file is editorial specification; mark completed checkboxes only after implementation and verification.
