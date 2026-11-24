import { normaliseSurveyText, surveyQuestions } from "./survey-scoring";

export const surveyLanguages = [
  "English",
  "Mandarin",
  "Malay / Tamil",
] as const;
export type SurveyLanguage = (typeof surveyLanguages)[number];
export const surveyPhases = [
  "Baseline",
  "Annual",
  "Follow-up",
  "Needs Review",
] as const;
const metadataHeaders = [
  "Response ID",
  "Timestamp",
  "Initials of full name (as per birth certificate/IC)",
  "What is your date of birth DD/MM/YYYY",
  "When are you completing this questionnaire",
  "Would you like to proceed with this survey",
];
export const surveyHeaders = [...metadataHeaders, ...surveyQuestions];
export function readSurveyCSV(
  text: string,
  { keepBlankRows = false } = {},
): string[][] {
  if (new TextEncoder().encode(text).length > 4 * 1024 * 1024)
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
        if (keepBlankRows || row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (c === "\r" && data[i + 1] === "\n") i++;
      }
    } else {
      if (closed && !/\s/.test(c))
        throw new Error("Unexpected text after a quoted CSV field.");
      if (!closed) cell += c;
    }
    if (cell.length > 16000 || rows.length > 5001)
      throw new Error("CSV exceeds 5,000 rows or a field is too long.");
  }
  if (quoted) throw new Error("Unterminated quoted CSV field.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length > 5001) throw new Error("CSV exceeds 5,000 responses.");
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
  if (/^At the end of\s*\/\s*After the programme(?:\s|$)/i.test(value.trim()))
    return "Follow-up";
  return "Needs Review";
}
