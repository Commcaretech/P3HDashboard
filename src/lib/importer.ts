import ExcelJS from "exceljs";
import { sourceNumbers } from "./xlsx-source";
import {
  categories,
  medical,
  remarks,
  parseDate,
  clean,
  today,
} from "./domain";
export { columns } from "./import-fields";
export type ImportRow = {
  rowNumber: number;
  raw: Record<string, string | number>;
  memberId: string;
  name: string;
  dob: string;
  centre: string;
  gender: string;
  race: string;
  workingStatus: string;
  languages: string;
  interests: string;
  conditions: string;
  remarks: string;
  tags: string;
  onboardingDate: string;
  suggested: Record<string, string>;
  zbi: string;
  recipientConditions: string;
  errors: string[];
  warnings: string[];
  existingId?: string;
  existing?: Record<string, string>;
  action: "Import" | "Skip" | "Update existing";
};
export function parseRow(
  raw: Record<string, string | number>,
  rowNumber: number,
  date1904 = false,
): ImportRow {
  const health = medical(String(raw["Other Medical Conditions"] ?? ""));
  const note = String(raw.Remark ?? "");
  const suggested = remarks(note);
  const dob = parseDate(raw["Date of Birth"], date1904);
  const id = clean(raw["Member ID"]);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!id) errors.push("Member ID is required");
  if (raw["Date of Birth"] && !dob) errors.push("Invalid date of birth");
  if (dob > today()) errors.push("Date of birth is in the future");
  if (health.recipient.length)
    warnings.push("Care-recipient conditions need a confirmed profile");
  if (health.zbi !== undefined)
    warnings.push("Confirm the assessment owner before assigning ZBI");
  if (note && !Object.keys(suggested).length)
    warnings.push("Remarks retained; no reliable structured fields found");
  const onboarding = parseDate(suggested["p3h onboarding date"]);
  if (suggested["p3h onboarding date"] && !onboarding)
    warnings.push("Onboarding date needs review");
  return {
    rowNumber,
    raw,
    memberId: id,
    name: clean(raw.Name),
    dob,
    centre: clean(raw["Centre (as client)"]),
    gender: clean(raw.Gender),
    race: clean(raw.Race),
    workingStatus: clean(raw["Working status"]),
    languages: categories(
      String(raw["Language spoken / understood"] ?? ""),
    ).join(", "),
    interests: categories(String(raw.Interest ?? ""), /[;\n]/).join(", "),
    conditions: health.member.join(", "),
    remarks: note,
    tags: String(raw.Tags ?? ""),
    onboardingDate: onboarding,
    suggested,
    zbi: health.zbi === undefined ? "" : String(health.zbi),
    recipientConditions: health.recipient.join(", "),
    errors,
    warnings,
    action: errors.length ? "Skip" : "Import",
  };
}
export function duplicates(rows: ImportRow[]) {
  const counts = new Map<string, number>();
  for (const r of rows)
    counts.set(r.memberId, (counts.get(r.memberId) ?? 0) + 1);
  return rows.map((r) =>
    counts.get(r.memberId)! > 1
      ? {
          ...r,
          errors: [
            ...r.errors,
            "Duplicate Member ID within this file; skip extra rows or correct their ID",
          ],
          action: "Skip" as const,
        }
      : r,
  );
}
export function validateArchive(bytes: Buffer) {
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Upload exceeds 10 MB.");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("Invalid .xlsx archive.");
  const count = bytes.readUInt16LE(end + 10);
  let pos = bytes.readUInt32LE(end + 16),
    size = 0;
  if (count === 65535 || count > 20000)
    throw new Error("Workbook archive is too complex.");
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== 0x02014b50)
      throw new Error("Invalid workbook archive.");
    size += bytes.readUInt32LE(pos + 24);
    if (size > 50 * 1024 * 1024)
      throw new Error("Expanded workbook exceeds 50 MB.");
    if (bytes.readUInt16LE(pos + 8) & 1)
      throw new Error("Encrypted workbooks are not supported.");
    pos +=
      46 +
      bytes.readUInt16LE(pos + 28) +
      bytes.readUInt16LE(pos + 30) +
      bytes.readUInt16LE(pos + 32);
  }
}
export async function readWorkbook(bytes: Buffer) {
  validateArchive(bytes);
  const wb = new ExcelJS.Workbook();
  let numericSource: Map<string, number>;
  try {
    numericSource = await sourceNumbers(bytes);
    await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    throw new Error(
      "Unable to read this workbook. Select a valid, unencrypted .xlsx file.",
    );
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("The workbook contains no worksheet.");
  if (sheet.rowCount > 10001 || sheet.columnCount > 100)
    throw new Error("Limit: 10,000 rows and 100 columns per workbook.");
  const headers = Array.from({ length: sheet.columnCount }, (_, i) =>
    clean(sheet.getRow(1).getCell(i + 1).text),
  );
  if (headers.filter(Boolean).length !== new Set(headers.filter(Boolean)).size)
    throw new Error("Duplicate column headers must be renamed.");
  const rawRows: Record<string, string | number>[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const raw: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const c = row.getCell(i + 1);
      raw[h] =
        c.value instanceof Date
          ? (numericSource.get(c.address) ?? c.value.toISOString().slice(0, 10))
          : typeof c.value === "number"
            ? c.value
            : c.text;
    });
    if (Object.values(raw).some((v) => String(v).trim())) rawRows.push(raw);
  });
  return { headers, rawRows, date1904: wb.properties.date1904 ?? false };
}
