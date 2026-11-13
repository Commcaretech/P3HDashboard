import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreSurvey,
  questionKeys,
  scaleFor,
  surveyAnswer,
  SURVEY_METHOD,
} from "../src/lib/survey-scoring";
import {
  cleanSurveyName,
  parseSurveyCSV,
  readSurveyCSV,
  surveyDate,
  surveyHeaders,
  surveyPhase,
} from "../src/lib/survey-parser";
const quoted = (values: string[]) =>
  values.map((s) => '"' + s.replaceAll('"', '""') + '"').join(",");
export const fakeSurvey = (overrides: Record<number, string> = {}) => {
  const row = [
    "fictional-response-1",
    "13/11/2026 10:30",
    "Fictional Initials 00000000",
    "01/01/1960",
    "At the start of / Before the programme",
    "Yes",
    ...Array(26).fill("3"),
    ...Array(6).fill("2"),
  ].map((v, i) => overrides[i] ?? v);
  return quoted(surveyHeaders) + "\r\n" + quoted(row);
};
test("every question uses its own workbook scale, including translated suffixes and zero ZBI", () => {
  for (const q of questionKeys)
    for (const [i, label] of scaleFor(q).entries()) {
      const expected = i + (q.startsWith("Z") ? 0 : 1);
      for (const suffix of ["", " ??", " (Sederhana)", " தமிழ்"])
        assert.equal(
          surveyAnswer(q, label + suffix).value,
          expected,
          `${q} ${label}`,
        );
    }
  assert.equal(surveyAnswer("Q1", "Very satisfied").value, null);
  assert.equal(surveyAnswer("Q1", "Good enough").value, null);
  for (const bad of [-1, 0, 6, 100, 2.5, "未知答案"])
    assert.equal(surveyAnswer("Q1", bad).value, null);
  for (const missing of [
    99,
    "Not applicable/ I do not wish to answer ??",
    "",
    null,
  ])
    assert.equal(surveyAnswer("Q21", missing).value, null);
});
test("independent workbook calculation: correct reverse items, two-question social domain, raw overall and ZBI", () => {
  const answers = Object.fromEntries(questionKeys.map((k) => [k, 3]));
  Object.assign(answers, {
    Q3: 1,
    Q4: 2,
    Q10: 4,
    Q15: 5,
    Q16: 2,
    Q17: 3,
    Q18: 4,
    Q5: 1,
    Q6: 2,
    Q7: 3,
    Q11: 4,
    Q19: 5,
    Q26: 1,
    Q20: 2,
    Q22: 4,
    Q8: 1,
    Q9: 2,
    Q12: 3,
    Q13: 4,
    Q14: 5,
    Q23: 1,
    Q24: 2,
    Q25: 3,
    Z1: 0,
    Z2: 1,
    Z3: 2,
    Z4: 3,
    Z5: 4,
    Z6: 2,
  });
  const r = scoreSurvey(answers);
  assert.deepEqual(
    [r.physical, r.psychological, r.social, r.environment, r.overall, r.zbi],
    [71.43, 58.33, 50, 40.63, 55.1, 12],
  );
  assert.equal(r.values.Q3, 1);
  assert.equal(r.method, SURVEY_METHOD);
  answers.Q21 = 99;
  assert.equal(scoreSurvey(answers).social, 50); // AA deliberately excluded from P3H Social Relations.
});
test("missing and unknown values never become zeros or get reverse scored; complete-domain policy is explicit", () => {
  const answers = Object.fromEntries(questionKeys.map((q) => [q, "3"]));
  answers.Q3 = "99";
  answers.Z2 = "unknown";
  const r = scoreSurvey(answers);
  assert.equal(r.physical, null);
  assert.equal(r.overall, null);
  assert.equal(r.psychological, 50);
  assert.equal(r.zbi, null);
  assert.ok(r.warnings.includes("Z2: Unknown answer label"));
});
test("validated question mapping accepts reordered questions and the actual export spelling variation", () => {
  const original = readSurveyCSV(fakeSurvey()),
    order = original[0].map((_, i) => i).reverse();
  const reordered = original
    .map((row) => quoted(order.map((i) => row[i])))
    .join("\n");
  assert.equal(parseSurveyCSV(reordered, "English")[0].scores!.overall, 50);
  const translated = fakeSurvey().replace(
    "satisfied are you with the support",
    "sastified are you with the support",
  );
  assert.equal(parseSurveyCSV(translated, "Mandarin")[0].scores!.zbi, 12);
  assert.throws(
    () =>
      parseSurveyCSV(
        fakeSurvey().replace(
          "quality of life",
          "a completely different question",
        ),
        "English",
      ),
    /Unknown survey template/,
  );
});
test("consent, tests, names, timestamps, missing phases and birth years are handled without identity guesses", () => {
  for (const consent of ["", "No", "不", "Tidak", "இல்லை", "unknown"]) {
    const row = parseSurveyCSV(fakeSurvey({ 5: consent }), "English")[0];
    assert.deepEqual(Object.keys(row).sort(), ["exclusion", "rowNumber"]);
    assert.equal(row.exclusion, "Consent not granted");
  }
  assert.equal(
    parseSurveyCSV(fakeSurvey({ 2: "  TeSt  " }), "English")[0].exclusion,
    "Test record",
  );
  assert.equal(
    cleanSurveyName("  Fictional   Alias  00000000  "),
    "Fictional Alias",
  );
  assert.equal(surveyDate("31/02/2026"), null);
  assert.equal(surveyDate("1/1/60"), null);
  assert.equal(
    surveyDate("13/11/2026 10:30", true),
    "2026-11-13T02:30:00.000Z",
  );
  assert.equal(surveyDate("13/11/2026 25:10", true), null);
  assert.equal(
    surveyPhase("At the end of / After the programme ??"),
    "Needs Review",
  );
  const row = parseSurveyCSV(
    fakeSurvey({ 1: "bad", 3: "1/1/60", 4: "" }),
    "English",
  )[0];
  assert.equal(row.surveyDate, null);
  assert.ok(row.warnings!.length >= 3);
});
test("CSV quoting, UTF-8 BOM, multiline cells and structural errors", () => {
  assert.equal(
    parseSurveyCSV(
      "\ufeff" + fakeSurvey({ 2: 'Fictional, "Alias"\nName' }),
      "English",
    )[0].cleanedName,
    'Fictional, "Alias" Name',
  );
  assert.throws(() => readSurveyCSV('one,two\n"unclosed'), /Unterminated/);
  assert.throws(
    () => parseSurveyCSV(fakeSurvey() + ",extra", "English"),
    /different number/,
  );
  assert.throws(() => readSurveyCSV("one\n\ufffd"), /UTF-8/);
});
test("duplicate keys use source IDs and timestamps, not names; identical no-ID submissions retain multiplicity", () => {
  const a = parseSurveyCSV(fakeSurvey(), "English")[0],
    b = parseSurveyCSV(fakeSurvey({ 2: "Another nickname" }), "English")[0],
    c = parseSurveyCSV(fakeSurvey({ 1: "14/11/2026 10:30" }), "English")[0];
  assert.equal(a.sourceKey, b.sourceKey);
  assert.notEqual(a.contentHash, b.contentHash);
  assert.notEqual(a.sourceKey, c.sourceKey);
  const csv = readSurveyCSV(fakeSurvey({ 0: "" }));
  csv.push(csv[1]);
  const rows = parseSurveyCSV(csv.map(quoted).join("\n"), "English");
  assert.notEqual(rows[0].sourceKey, rows[1].sourceKey);
  assert.equal(
    rows[0].sourceKey,
    parseSurveyCSV(csv.map(quoted).join("\n"), "English")[0].sourceKey,
  );
});
