# 2027 things to check

Handoff from the October 2026 restructure of the linear-models block. Read this
before teaching weeks 9–11 in 2027. The plan behind the restructure is in
`2027-weeks9-11-restructure-plan.md`.

## Where things are

- **2026 as delivered:** tag `2026` (commit `5f33cf8`). Recover any file with
  `git show 2026:<path>` or `git checkout 2026`.
- **2027 work:** branch `2027`, pushed to `origin`. `main` and the live site
  (deployed on every push to `main`) still serve 2026. Merge `2027` into `main`
  when you're ready for the 2027 site to go live.
- **Not committed:** `lectures/Notes for 2027.R` and `tts/`.

## What changed

| 2027 | Lecture | Workshop pair |
|---|---|---|
| Week 9: simple regression | `09_slr_01_fitting.qmd` (old L10 + R²), `09_slr_02_inference.qmd` (2025 least-squares derivation restored and corrected, sampling simulation, slope test, intervals), `09_slr_03_diagnostics.qmd` (L-I-N-E half of old L12) | `Workshop_Week09_SLR` (vehicles; adds slope inference, CI vs PI, L-I-N-E, influence; gross mass is the full workflow and A3 practice) |
| Week 10: numeric MLR | `10_mlr.qmd` (new: heart girth → + length → + height, collinearity, overall and nested F, F = t², adjusted R², prediction, residuals vs predictors) | `Workshop_Week10_MLR` (old cancer lab; adds raw vs adjusted slopes and nested F tests) |
| Week 11: factors | `11_factors.qmd` (factor-only opener, old L11, old L12 factor tests, sequential `anova()` slide) | `Workshop_Week11_Factors` (adds body type on its own and a joint F test of body type; coffee extra made standalone) |

The deploy workflow and `site/` landing pages already point at these files.

## Still to check

1. **Click through every slide.** All 11 files render and every quoted number
   is computed in the document, with `stopifnot` checks where it matters. Only
   about 10 dense slides and two widgets were checked visually (the
   prediction-interval and multiple-regression widgets). Not yet checked: the
   four L-I-N-E widgets in `09_slr_03`, the two widgets in `09_slr_01`, and the
   rest of the slides for overflow.
2. **Week 9 Part 2 length.** It runs to 26 slides. If Jonathan's weeks 6–8
   cover population vs sample, estimator vs estimate, standard error, CI and
   p-value meaning and the CLT, trim the estimator and sampling-variation slides
   to a recap.
3. **Link back to Jonathan's visual inference.** `11_factors.qmd` has an HTML
   comment where a link to shuffling group labels belongs. Fill it in, or
   delete the comment, once his weeks 1–4 are settled. Week 9 Part 2 could also
   call back to a permutation of the slope if he teaches one.
4. **Notation.** Week 9 uses $\alpha, \beta$ and week 11 uses
   $\beta_0, \beta_1$, as in 2026. Agree notation with Jonathan, then decide
   whether to unify it.
5. **Assessment timing.** A3 (SLR only) is due in week 10, and week 9 is the
   only SLR teaching. Confirm A3 is released at the start of week 9 and that it
   only asks for what week 9 covers.
6. **Two diagnostic tool sets.** The week 9 workshop uses `plot(model)`, to
   match the lecture, while week 10 keeps `performance::check_model()`. Decide
   whether to standardise on one.
7. **Workshop headings.** The workshops keep the 2026 "Demonstration / Your
   turn" headings. The lab-editor skill prefers question-driven headings; restyle
   only if you have time.
8. **Coffee extra.** It now reads as a standalone study and links to the
   original coffee-tasting instructions. Check that the link still works and
   that the coffee example still fits wherever coffee lands in the 2027 course.
9. **Week 12.** Jonathan suggested revision. A short "everything in together"
   session for weeks 9–11 (one numeric + factor model, full workflow) hasn't
   been written.
10. **Interactions** are still out of scope. Revisit only if Jonathan's plan
    changes.

## How to verify locally

- R is at `C:\Program Files\R\R-4.6.1\bin\Rscript.exe`; it isn't on the Git Bash PATH.
  Python isn't installed.
- Render: `quarto render lectures/<file>.qmd` and `quarto render labs/<file>.qmd`.
- OJS widgets don't run from `file://`. Serve the repo with
  `Rscript -e "servr::httd('D:/git/297101', port = 8765, browser = FALSE, daemon = FALSE)"`.
- Screenshot a slide with every fragment shown, using headless Edge:
  `msedge.exe --headless=new --window-size=1600,900 --virtual-time-budget=8000 --screenshot=<out.png> "http://127.0.0.1:8765/lectures/<deck>.html?fragments=false#/<slide-id>"`.
- Dry-run the deploy: run the "Assemble Pages site" and "Verify Pages
  artifact" steps of `.github/workflows/deploy-pages.yml` from the repo root,
  then delete `_site`.
