import {
  normaliseSurveyText,
  questionKeys,
  surveyAnswer,
} from "./survey-scoring";
import {
  readSurveyCSV,
  surveyDate,
  surveyHeaders,
  surveyPhase,
  type SurveyLanguage,
} from "./survey-csv";

export const ncssHeaders = [
  ...surveyHeaders,
  "Please indicate your sex",
  "What racial group do you belong to",
];
export const ncssImportMode = "NCSS Excel Member ID";
export const ncssFileLimit = 4 * 1024 * 1024;
export const ncssMaxRows = 5000;
export const ncssSourceId = /^[0-9a-f]{24}$/i;
export const ncssMemberId = /^[A-Za-z0-9][A-Za-z0-9._/ -]{0,99}$/;
const consentOptions = new Set([
  "yes",
  "\u662f",
  "\u540c\u610f",
  "ya",
  "\u0b86\u0bae\u0bcd",
]);

export type NCSSRow = {
  rowNumber: number;
  sourceResponseId: string | null;
  memberId: string | null;
  surveyDate: string | null;
  phase: ReturnType<typeof surveyPhase>;
  consent: true;
  answers: (number | null | "unknown")[];
};

export function readMatchedNCSS(text: string, language: SurveyLanguage) {
  const [headers, ...rows] = readSurveyCSV(text, { keepBlankRows: true });
  if (headers.length !== 41 || headers[40].trim() !== "Member ID")
    throw new Error(
      "Export columns A to AO with Member ID as the final column. Remove Excel helper columns from the export.",
    );
  if (rows.length > ncssMaxRows)
    throw new Error("Split files with more than 5,000 responses.");
  for (const [i, header] of ncssHeaders.entries()) {
    const expected = normaliseSurveyText(header);
    const actual = normaliseSurveyText(headers[i]);
    if (actual !== expected && !actual.startsWith(expected + " "))
      throw new Error(
        `Column ${i + 1} does not match the NCSS export. Copy the original columns in their original order.`,
      );
  }
  const excluded: {
    rowNumber: number;
    status: "Consent excluded" | "Test excluded";
  }[] = [];
  const eligible: NCSSRow[] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    if (!row.some((value) => value.trim())) continue;
    if (row.length !== headers.length)
      throw new Error(
        `Row ${rowNumber} has a different number of fields from its headers.`,
      );
    const consent = row[5]
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s*[([][^)\]]*[)\]]\s*$/, "");
    if (!consentOptions.has(consent)) {
      excluded.push({ rowNumber, status: "Consent excluded" });
      continue;
    }
    if (/test/i.test(row[2])) {
      excluded.push({ rowNumber, status: "Test excluded" });
      continue;
    }
    const id = row[0].trim();
    const memberId = row[40].trim();
    eligible.push({
      rowNumber,
      sourceResponseId: ncssSourceId.test(id) ? id.toLowerCase() : null,
      memberId: !memberId ? "" : ncssMemberId.test(memberId) ? memberId : null,
      surveyDate: surveyDate(row[1], true),
      phase: surveyPhase(row[4]),
      consent: true,
      answers: questionKeys.map((key, i) => {
        const answer = surveyAnswer(key, row[6 + i]);
        return answer.issue && answer.issue !== "Missing response"
          ? "unknown"
          : answer.value;
      }),
    });
  }
  return { language, rows: eligible, excluded };
}
