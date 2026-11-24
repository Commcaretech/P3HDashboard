import { createHash } from "node:crypto";
import {
  normaliseSurveyText,
  questionKeys,
  scoreSurvey,
} from "./survey-scoring";

import {
  cleanSurveyName,
  readSurveyCSV,
  surveyDate,
  surveyHeaders,
  surveyLanguages,
  surveyPhase,
  type SurveyLanguage,
} from "./survey-csv";
export * from "./survey-csv";
export const hashSurvey = (s: string) =>
  createHash("sha256").update(s).digest("hex");

export function metadataWarnings(r: {
  cleanedName: string;
  surveyDate: unknown;
  phase: string;
  dobText: string;
  dob: unknown;
}) {
  return [
    !r.cleanedName && "Submitted name is missing",
    !r.surveyDate && "Invalid or missing timestamp",
    r.phase === "Needs Review" && "Missing or unrecognised survey phase",
    Boolean(r.dobText && !r.dob) &&
      "Birth date requires verification (two-digit years are never inferred)",
  ].filter(Boolean) as string[];
}
export type ParsedSurvey = {
  rowNumber: number;
  exclusion: string;
  sourceKey?: string;
  contentHash?: string;
  sourceResponseId?: string;
  submittedName?: string;
  cleanedName?: string;
  timestampText?: string;
  phaseText?: string;
  phase?: string;
  surveyDate?: string | null;
  dobText?: string;
  dob?: string | null;
  language?: SurveyLanguage;
  answers?: Record<string, string>;
  scores?: ReturnType<typeof scoreSurvey>;
  warnings?: string[];
};
export function parseSurveyCSV(
  content: string,
  language: SurveyLanguage,
): ParsedSurvey[] {
  if (!surveyLanguages.includes(language))
    throw new Error("Choose a supported survey language/export.");
  const csv = readSurveyCSV(content),
    headers = csv[0].map(normaliseSurveyText);
  const indices = surveyHeaders.map((h) => {
    const prefix = normaliseSurveyText(h);
    const hits = headers
      .map((text, i) =>
        text === prefix || text.startsWith(prefix + " ") ? i : -1,
      )
      .filter((i) => i >= 0);
    if (hits.length !== 1)
      throw new Error(
        `Unknown survey template: missing or ambiguous question '${h}'. No column-position guessing was used.`,
      );
    return hits[0];
  });
  const seen = new Map<string, number>();
  return csv.slice(1).map((source, i) => {
    if (source.length !== headers.length)
      throw new Error(
        `Row ${i + 2} has a different number of fields from its headers.`,
      );
    const row = indices.map((j) => source[j].trim()),
      consent = row[5].toLowerCase();
    const exclusion = !["yes", "是", "同意", "ya", "ஆம்"].includes(consent)
      ? "Consent not granted"
      : /test/i.test(row[2])
        ? "Test record"
        : "";
    // Excluded rows never leave this function with identity, birth date or answers.
    if (exclusion) return { rowNumber: i + 2, exclusion };
    const answers = Object.fromEntries(
      questionKeys.map((k, q) => [k, row[q + 6]]),
    );
    const scores = scoreSurvey(answers),
      date = surveyDate(row[1], true),
      dob = surveyDate(row[3]);
    // Scope response IDs by export language. Timestamp protects reused source IDs.
    // Missing source IDs use canonical content + occurrence ordinal, preserving
    // two identical submissions within an export without multiplying reimports.
    const canonical = JSON.stringify(row),
      base = JSON.stringify([language, row[0], date || row[1]]);
    const repeat = (seen.get(canonical) || 0) + 1;
    seen.set(canonical, repeat);
    const sourceKey = row[0]
      ? hashSurvey(base)
      : hashSurvey(`${language}:${canonical}:${repeat}`);
    const meta = {
      cleanedName: cleanSurveyName(row[2]),
      surveyDate: date,
      phase: surveyPhase(row[4]),
      dobText: row[3],
      dob,
    };
    return {
      rowNumber: i + 2,
      exclusion: "",
      sourceKey,
      contentHash: hashSurvey(canonical),
      sourceResponseId: row[0],
      submittedName: row[2],
      timestampText: row[1],
      phaseText: row[4],
      language,
      ...meta,
      answers,
      scores,
      warnings: [...metadataWarnings(meta), ...scores.warnings],
    };
  });
}
