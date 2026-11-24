// Reads supplied CSVs in memory. Prints aggregate compatibility only; never identities.
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { readMatchedNCSS } from "../src/lib/ncss-matched-csv";
import { readSurveyCSV, parseSurveyCSV } from "../src/lib/survey-parser";
const path = process.argv[2];
if (!path) throw new Error("Supply the path to the original survey ZIP.");
const zip = await JSZip.loadAsync(await readFile(path));
for (const [filename, language] of [
  ["English Survey Data.csv", "English"],
  ["Mandarin Survey Data.csv", "Mandarin"],
  ["Malay and Tamil Survey Data.csv", "Malay / Tamil"],
] as const) {
  const file = zip.file(filename);
  if (!file) throw new Error(`Missing source: ${filename}`);
  const bytes = await file.async("uint8array"),
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const rows = parseSurveyCSV(text, language),
    eligible = rows.filter((r) => !r.exclusion);
  // Append a fictional ID in memory to exercise the new path without matching
  // or disclosing any respondent's identity.
  const csv = readSurveyCSV(text);
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const matched = readMatchedNCSS(
    csv
      .map((row, i) =>
        [...row, i === 0 ? "Member ID" : "FICTIONAL-0001"].map(quote).join(","),
      )
      .join("\n"),
    language,
  );
  if (
    matched.rows.length !== eligible.length ||
    matched.rows.some((row) => !row.sourceResponseId || !row.surveyDate)
  )
    throw new Error(
      `Matched workflow did not accept the approved source shape: ${filename}`,
    );
  console.log(
    JSON.stringify({
      filename,
      submitted: rows.length,
      eligible: eligible.length,
      consentExcluded: rows.filter((r) => r.exclusion === "Consent not granted")
        .length,
      testExcluded: rows.filter((r) => r.exclusion === "Test record").length,
      unknownAnswers: eligible.reduce(
        (n, r) =>
          n + r.scores!.warnings.filter((w) => w.includes("Unknown")).length,
        0,
      ),
      completeWHOQOL: eligible.filter((r) => r.scores!.overall !== null).length,
      completeZBI: eligible.filter((r) => r.scores!.zbi !== null).length,
      matchedPreviewEligible: matched.rows.length,
      matchedFollowUp: matched.rows.filter((row) => row.phase === "Follow-up")
        .length,
      phaseReview: eligible.filter((r) => r.phase === "Needs Review").length,
      dateReview: eligible.filter((r) => !r.surveyDate).length,
      birthDateReview: eligible.filter((r) => r.dobText && !r.dob).length,
      damagedTranslationText: text.includes("???"),
    }),
  );
}
