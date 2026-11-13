import { createHash } from "node:crypto";
import {
  normaliseSurveyText,
  questionKeys,
  scoreSurvey,
  surveyQuestions,
} from "./survey-scoring";

export const surveyLanguages = [
  "English",
  "Mandarin",
  "Malay / Tamil",
] as const;
export type SurveyLanguage = (typeof surveyLanguages)[number];
export const surveyPhases = ["Baseline", "Annual", "Needs Review"] as const;
const metadataHeaders = [
  "Response ID",
  "Timestamp",
  "Initials of full name (as per birth certificate/IC)",
  "What is your date of birth DD/MM/YYYY",
  "When are you completing this questionnaire",
  "Would you like to proceed with this survey",
];
export const surveyHeaders = [...metadataHeaders, ...surveyQuestions];
export const hashSurvey = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function readSurveyCSV(text: string): string[][] {
  if (Buffer.byteLength(text, "utf8") > 4 * 1024 * 1024)
    throw new Error("Each CSV must be at most 4 MB.");
  if (text.includes("\ufffd"))
    throw new Error(
      "Invalid UTF-8 text. Export the CSV as UTF-8 and try again.",
    );
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const data = text.replace(/^\ufeff/, "");
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (quoted) {
      if (c === '"' && data[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("Malformed CSV quoting.");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (c === "\r" && data[i + 1] === "\n") i++;
      }
    } else {
      if (closed && !/\s/.test(c))
        throw new Error("Unexpected text after a quoted CSV field.");
      if (!closed) cell += c;
    }
    if (cell.length > 16000 || rows.length > 5000)
      throw new Error("CSV exceeds 5,000 rows or a field is too long.");
  }
  if (quoted) throw new Error("Unterminated quoted CSV field.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2)
    throw new Error("The CSV needs headers and at least one response.");
  return rows;
}
export const cleanSurveyName = (s: string) =>
  s.normalize("NFKC").replace(/\p{N}/gu, "").replace(/\s+/g, " ").trim();
export const normaliseAlias = (s: string) =>
  normaliseSurveyText(cleanSurveyName(s));
export function surveyDate(value: string, timestamp = false): string | null {
  const s = value.trim();
  if (
    timestamp &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      s,
    )
  ) {
    const prefix = s.slice(0, 10);
    if (!surveyDate(prefix)) return null;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const local =
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      s,
    );
  if (!iso && !local) return null;
  const year = Number(iso?.[1] || local?.[3]),
    month = Number(iso?.[2] || local?.[2]),
    day = Number(iso?.[3] || local?.[1]);
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (
    year < 1900 ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    return null;
  if (!timestamp) return date;
  const hour = Number(local?.[4] || 0),
    minute = Number(local?.[5] || 0),
    second = Number(local?.[6] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+08:00`,
  ).toISOString();
}
export function surveyPhase(value: string) {
  if (
    /^At the start of\s*\/\s*Before the programme(?:\s|$)/i.test(value.trim())
  )
    return "Baseline";
  if (
    /^During the annual data collection period\s*\/\s*While I am in the programme(?:\s|$)/i.test(
      value.trim(),
    )
  )
    return "Annual";
  return "Needs Review";
}
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
