import assert from "node:assert/strict";
import {
  fitDonkeyModel,
  fitModelSet,
  prepareDonkeyData,
  rawFactorDifference,
} from "./multiple-regression-lab.js";

const close = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const raw = [];
for (const Age of [4, 10]) {
  for (const Sex of ["Female", "Male"]) {
    for (const Heartgirth of [90, 100, 110, 120, 130]) {
      const ageEffect = Age < 7 ? 0 : 10;
      const sexEffect = Sex === "Female" ? 0 : -3;
      const Bodywt = -100 + 2 * Heartgirth + ageEffect + sexEffect;
      raw.push({ Age, Sex, Heartgirth, Bodywt });
    }
  }
}

const rows = prepareDonkeyData(raw);
assert.equal(rows.length, 20);
assert.equal(rows[0].AgeGroup, "Under 7");
assert.equal(rows.at(-1).AgeGroup, "7 and over");

const refs = { AgeGroup: "Under 7", Sex: "Female" };
const full = fitDonkeyModel(rows, "full", refs);
close(full.coefficients[0].estimate, -100);
close(full.coefficients[1].estimate, 2);
close(full.coefficients[2].estimate, 10);
close(full.coefficients[3].estimate, -3);
close(full.r2, 1);
close(full.adjR2, 1);

const point = { Heartgirth: 115, AgeGroup: "7 and over", Sex: "Male" };
close(full.predict(point), 137);

const reverse = fitDonkeyModel(rows, "full", { AgeGroup: "7 and over", Sex: "Male" });
close(reverse.predict(point), full.predict(point));
close(reverse.coefficients[2].estimate, -10);
close(reverse.coefficients[3].estimate, 3);

for (const AgeGroup of ["Under 7", "7 and over"]) {
  for (const Sex of ["Female", "Male"]) {
    for (const Heartgirth of [95, 115, 125]) {
      const candidate = { Heartgirth, AgeGroup, Sex };
      close(reverse.predict(candidate), full.predict(candidate));
    }
  }
}

const rawAge = rawFactorDifference(rows, "AgeGroup", "Under 7");
close(rawAge.difference, 10);
const rawSex = rawFactorDifference(rows, "Sex", "Female");
close(rawSex.difference, -3);

const fits = fitModelSet(rows, refs);
assert.ok(fits.age.r2 >= fits.heart.r2 - 1e-12);
assert.ok(fits.full.r2 >= fits.age.r2 - 1e-12);
assert.ok(fits.full.r2 >= fits.sex.r2 - 1e-12);

// The marker changes every fitted mean by the same amount, so gaps stay fixed.
for (const model of ["age", "full"]) {
  const fit = fits[model];
  const reference = { AgeGroup: "Under 7", Sex: "Female" };
  for (const group of [
    { AgeGroup: "7 and over", Sex: "Female" },
    ...(model === "full" ? [
      { AgeGroup: "Under 7", Sex: "Male" },
      { AgeGroup: "7 and over", Sex: "Male" },
    ] : []),
  ]) {
    const gapAt = (Heartgirth) => fit.predict({ ...group, Heartgirth })
      - fit.predict({ ...reference, Heartgirth });
    close(gapAt(95), gapAt(125));
    close(fit.predict({ ...group, Heartgirth: 125 })
      - fit.predict({ ...group, Heartgirth: 95 }), 30 * fit.beta[1]);
  }
}

console.log("multiple-regression-lab checks passed");
