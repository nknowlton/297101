# Workshop Week 12 - Quick Reference Guide
## Regression Diagnostics Cheat Sheet

---

## The LINE Framework

### 🔤 What LINE Stands For

| Letter | Assumption | Plot | Test |
|--------|-----------|------|------|
| **L** | **L**inearity | Residuals vs Fitted | (visual only) |
| **I** | **I**ndependence | Cook's D, Domain knowledge | Durbin-Watson |
| **N** | **N**ormality | Q-Q Plot | Shapiro-Wilk |
| **E** | **E**qual variance | Scale-Location | Breusch-Pagan |

---

## 📊 Visual Diagnostic Quick Guide

### 1. Residuals vs Fitted (Linearity)

**✅ GOOD:**
- Random scatter around zero
- No pattern
- Flat blue line

**❌ BAD:**
- U-shape or curve
- Funnel shape
- Systematic pattern

**→ If bad:** Try log transformation or add polynomial terms

---

### 2. Scale-Location (Equal Variance)

**✅ GOOD:**
- Horizontal band
- Constant vertical spread
- Flat blue line

**❌ BAD:**
- Funnel shape
- Increasing/decreasing spread
- Upward/downward trend

**→ If bad:** Try log transformation or weighted least squares

---

### 3. Q-Q Plot (Normality)

**✅ GOOD:**
- Points follow red diagonal
- Minor deviations at ends OK

**❌ BAD:**
- S-curve pattern
- Points curve away from line
- Major deviations

**→ If bad:** With large n, often not critical; consider transformation

---

### 4. Cook's Distance (Influence)

**✅ GOOD:**
- All values < 0.5
- No single dominant point

**❌ BAD:**
- Any value > 1.0 (very influential)
- Values > 0.5 (investigate)

**→ If bad:** Investigate the observation - error or genuine outlier?

---

## 🔢 Numerical Test Quick Guide

### Breusch-Pagan Test (Equal Variance)
```
H₀: Variance is constant
```
- **p > 0.05**: Variance constant ✅
- **p < 0.05**: Heteroscedasticity detected ❌

### Durbin-Watson Test (Independence)
```
Statistic ≈ 2 means independence
```
- **DW ≈ 2**: No autocorrelation ✅
- **DW << 2**: Positive autocorrelation ❌
- **DW >> 2**: Negative autocorrelation ❌

### Shapiro-Wilk Test (Normality)
```
H₀: Residuals are normal
```
- **p > 0.05**: Residuals normal ✅
- **p < 0.05**: Non-normal residuals ❌
- **Warning**: Very sensitive with large n

---

## 🔄 Transformation Guide

### When to Use Log Transform

**Use log(Y) when:**
- Residuals vs Fitted shows curve
- Variance increases with Y
- Y ranges over multiple orders of magnitude
- Want % change interpretation

**Use log(X) when:**
- Relationship appears multiplicative
- X ranges over multiple orders of magnitude
- Diminishing returns expected

**Use log-log when:**
- Both issues present
- Want elasticity interpretation

### Interpreting Transformations

| Model | Interpretation of β₁ |
|-------|---------------------|
| Y ~ X | 1 unit ↑ in X → β₁ unit ↑ in Y |
| log(Y) ~ X | 1 unit ↑ in X → β₁ × 100% change in Y |
| Y ~ log(X) | 1% ↑ in X → β₁/100 unit ↑ in Y |
| log(Y) ~ log(X) | 1% ↑ in X → β₁% change in Y (elasticity) |

---

## 📋 Diagnostic Workflow

### Step-by-Step Process

1. **Fit model** and check basic statistics (R², p-values)

2. **Visual diagnostics** (all 4 plots)
   - State what to look for
   - Examine the plot
   - Comment on observations

3. **Numerical tests** (confirm visual findings)
   - Breusch-Pagan
   - Durbin-Watson
   - Shapiro-Wilk

4. **Influential observations** (Cook's D)
   - Identify any > 0.5
   - Investigate these cases

5. **Transform if needed**
   - Re-run diagnostics
   - Compare to original

6. **Make decision**
   - Which model better?
   - Report findings

---

## 🎯 Common Patterns and Solutions

### Pattern: Funnel Shape in Residuals vs Fitted
- **Problem**: Heteroscedasticity (non-constant variance)
- **Solution**: Try log(Y) or weighted least squares
- **Why it works**: Compresses large values, stabilizes variance

### Pattern: Curved Line in Residuals vs Fitted  
- **Problem**: Non-linear relationship
- **Solution**: Add X², try log(X), or use non-linear model
- **Why it works**: Captures curvature in relationship

### Pattern: Heavy Tails in Q-Q Plot
- **Problem**: More extreme values than normal distribution
- **Solution**: Robust regression or transformation
- **Why it works**: Reduces influence of extreme observations

### Pattern: High Cook's Distance
- **Problem**: Few observations driving results
- **Solution**: Investigate - data error or genuine outlier?
- **Why it matters**: Results may not generalize

---

## 💡 Pro Tips

### Visual First, Test Second
Always look at plots before tests. Tests tell you IF there's a problem, plots tell you WHAT the problem is.

### Large Samples = Sensitive Tests
With n > 1000, tests detect tiny violations. Focus on practical significance, not just p-values.

### Don't Compare R² Across Scales
R² for Y ~ X and log(Y) ~ X measure different things. Use diagnostics instead.

### Back-Transform with Care
When using log(Y), remember to exponentiate predictions: exp(predicted_log_Y) = predicted_Y

### Document Your Decisions
Always explain which model you chose and why. "The log model had better equal variance diagnostics (flat Scale-Location vs upward trend)."

---

## ⚠️ Red Flags (When to Worry)

| Observation | Severity | Action |
|-------------|----------|--------|
| Obvious curve in Residuals vs Fitted | 🔴 High | Transform immediately |
| Systematic funnel in Scale-Location | 🟡 Medium | Try transformation |
| Major S-curve in Q-Q | 🟡 Medium | Consider transformation |
| Cook's D > 1 | 🔴 High | Investigate that observation |
| R² < 0.1 | 🟡 Medium | Need better predictors |
| Many assumptions violated | 🔴 High | Reconsider model approach |

---

## 📚 R Code Snippets

### Basic Diagnostics
```r
# Fit model
lm1 <- lm(Y ~ X, data = df)

# Get augmented data
library(broom)
aug <- augment(lm1)

# Visual diagnostics
par(mfrow = c(2, 2))
plot(lm1)
```

### Numerical Tests
```r
library(lmtest)

# Equal variance
bptest(lm1)

# Independence  
dwtest(lm1)

# Normality
shapiro.test(resid(lm1))
```

### Log Transformation
```r
# Log-log model
lm_log <- lm(log(Y) ~ log(X), data = df)

# Back-transform predictions
pred <- predict(lm_log)
pred_original_scale <- exp(pred)
```

### Find Influential Observations
```r
aug |>
  filter(.cooksd > 0.5) |>
  arrange(desc(.cooksd))
```

---

## 🎓 Study Checklist

Before the exam, ensure you can:

- [ ] Name the 4 LINE assumptions
- [ ] Explain what each diagnostic plot shows
- [ ] Identify good vs bad patterns in each plot
- [ ] Interpret Breusch-Pagan, Durbin-Watson, Shapiro-Wilk
- [ ] Explain when to use log transformation
- [ ] Interpret coefficients in log-log models
- [ ] Identify influential observations using Cook's D
- [ ] Back-transform predictions from log scale
- [ ] Compare two models using diagnostics
- [ ] Explain why normalization per 100k matters

---

**Remember:** Diagnostics aren't just a checkbox exercise - they tell you whether you can trust your model's predictions and inferences!
