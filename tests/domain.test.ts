import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categories,
  parseDate,
  medical,
  remarks,
  can,
  personSchema,
  programmeSchema,
  grantSchema,
  match,
  birthday,
} from "../src/lib/domain";
import { parseRow, duplicates, readWorkbook } from "../src/lib/importer";
import { birthdayPlans } from "../src/lib/alerts";
import ExcelJS from "exceljs";
test("Excel serial dates handle both epochs and the fictitious leap day", () => {
  assert.equal(parseDate(1), "1900-01-01");
  assert.equal(parseDate(59), "1900-02-28");
  assert.equal(parseDate(60), "");
  assert.equal(parseDate(61), "1900-03-01");
  assert.equal(parseDate(25569), "1970-01-01");
  assert.equal(parseDate(0, true), "1904-01-01");
  assert.equal(parseDate("31/02/2026"), "");
  assert.equal(parseDate("11/10/2026"), "2026-10-11");
});
test("languages normalize and deduplicate", () =>
  assert.deepEqual(categories(" English, english , MANDARIN "), [
    "English",
    "Mandarin",
  ]));
test("interests split on semicolons preserving categories", () =>
  assert.deepEqual(
    categories("Walking; Stretchband Exercise;Walking", /[;\n]/),
    ["Walking", "Stretchband Exercise"],
  ));
test("medical conditions separate CR and ZBI", () =>
  assert.deepEqual(
    medical("High Blood Pressure; CR: Dementia; CR: Mental Disorder; ZBI = 10"),
    {
      member: ["High Blood Pressure"],
      recipient: ["Dementia", "Mental Disorder"],
      zbi: 10,
    },
  ));
test("remarks extract labelled lines only", () => {
  assert.deepEqual(
    remarks(
      "P3H Onboarding Date: 01/10/2026\nCR: Dementia\nReceiving: HCG\nCompleted: Exercise\npossibly receiving help",
    ),
    {
      "p3h onboarding date": "01/10/2026",
      cr: "Dementia",
      receiving: "HCG",
      completed: "Exercise",
    },
  );
  assert.deepEqual(remarks("maybe onboarded yesterday"), {});
});
test("row parser retains original values and flags suggestions", () => {
  const raw = {
    "Member ID": "FAKE-1",
    "Date of Birth": 25569,
    "Other Medical Conditions": "CR: Dementia;ZBI = 10",
    Remark: "P3H Onboarding Date: 01/10/2026",
    Interest: "Music;Games",
  };
  const row = parseRow(raw, 2);
  assert.deepEqual(row.raw, raw);
  assert.equal(row.dob, "1970-01-01");
  assert.equal(row.conditions, "");
  assert.equal(row.recipientConditions, "Dementia");
  assert.equal(row.onboardingDate, "2026-10-01");
  assert.equal(row.warnings.length, 2);
});
test("duplicates are visible and skipped by default", () => {
  const rows = duplicates([
    parseRow({ "Member ID": "A" }, 2),
    parseRow({ "Member ID": "A" }, 3),
  ]);
  assert.ok(
    rows.every(
      (r) =>
        r.action === "Skip" && r.errors.some((e) => e.includes("Duplicate")),
    ),
  );
});
test("workbook parser supports hundreds of rows", async () => {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("Members");
  s.addRow(["Member ID", "Date of Birth"]);
  for (let i = 0; i < 550; i++) s.addRow([`FAKE-${i}`, 25569]);
  const book = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(book.rawRows.length, 550);
  assert.equal(book.headers[0], "Member ID");
});
test("malformed spreadsheets rejected", async () =>
  await assert.rejects(readWorkbook(Buffer.from("invalid"))));
test("permissions", () => {
  assert.equal(can("Read Only", "write"), false);
  assert.equal(can("Staff", "admin"), false);
  assert.equal(can("Staff", "audit"), false);
  assert.equal(can("Manager", "audit"), true);
  assert.equal(can("Admin", "admin"), true);
});
test("input schemas reject missing, impossible and invalid data", () => {
  assert.equal(personSchema.safeParse({ kind: "Member" }).success, false);
  assert.equal(
    personSchema.safeParse({
      kind: "Care Recipient",
      name: "Fake",
      dob: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(
    personSchema.safeParse({ kind: "Care Recipient", alias: "Fake", zbi: "99" })
      .success,
    false,
  );
  assert.equal(
    personSchema.safeParse({ kind: "Care Recipient", alias: "Fake" }).success,
    true,
  );
  assert.equal(
    grantSchema.safeParse({
      personId: "A",
      scheme: "HCG",
      status: "Approved",
      amount: "-10",
    }).success,
    false,
  );
  assert.equal(
    programmeSchema.safeParse({
      name: "Exercise",
      capacity: 2,
      startTime: "11:00",
      endTime: "10:00",
      status: "Active",
      registrationStatus: "Open",
    }).success,
    false,
  );
});
const m = {
  languages: ["Mandarin"],
  interests: ["Exercise"],
  conditions: [],
  mobility: "",
};
const cr = {
  languages: ["Mandarin"],
  interests: ["Walking"],
  conditions: ["Dementia"],
  mobility: "Assisted",
};
const p = {
  languages: ["Mandarin"],
  interests: ["Exercise", "Walking"],
  conditions: ["Dementia"],
  mobility: "Assisted",
};
test("matching weights and explanations", () => {
  const result = match(m, cr, p);
  assert.equal(result.score, 100);
  assert.equal(result.reasons.length, 5);
  assert.ok(result.reasons.every((r) => r.includes("+")));
  assert.equal(
    match(
      { languages: [], interests: [], conditions: [], mobility: "" },
      undefined,
      p,
    ).score,
    0,
  );
  assert.equal(match(m, undefined, p).score, 40);
});
test("birthday windows, year rollover and leap birthdays", () => {
  assert.equal(birthday(new Date("1950-01-01"), "2026-12-31").days, 1);
  assert.equal(
    birthday(new Date("1960-02-29"), "2026-02-27").date,
    "2026-02-28",
  );
  assert.equal(
    birthdayPlans("p", "Fake", new Date("1950-10-12"), "2026-10-11").length,
    1,
  );
  assert.equal(
    birthdayPlans("p", "Fake", new Date("1950-10-11"), "2026-10-11").length,
    1,
  );
  assert.equal(
    birthdayPlans("p", "Fake", new Date("1950-12-11"), "2026-10-11").length,
    0,
  );
  for (const days of [30, 7, 2, 1, 0]) {
    const now = new Date(Date.parse("2026-10-31") - days * 86400000)
      .toISOString()
      .slice(0, 10);
    const plans = birthdayPlans("p", "Fake", new Date("1950-10-31"), now);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].sourceKey, "birthday:p:2026-10-31");
    assert.equal(plans[0].dueDate.toISOString().slice(0, 10), "2026-10-31");
    assert.equal(
      plans[0].title,
      `Birthday: Fake (${days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"} away`})`,
    );
    assert.equal(plans[0].priority, days <= 1 ? "High" : "Normal");
  }
});
test("short category names normalize without duplicating uppercase entries", () =>
  assert.deepEqual(categories("ARTS, Arts, arts, THAI, Thai, ADHD, adhd"), [
    "Arts",
    "Thai",
    "ADHD",
  ]));
test("date-styled cells preserve original serials, including invalid Excel leap day", async () => {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("Dates");
  s.addRow(["Member ID", "Date of Birth"]);
  s.addRow(["FAKE-1900", 60]);
  s.getCell("B2").numFmt = "dd/mm/yyyy";
  s.addRow(["FAKE-DATE", 25569]);
  s.getCell("B3").numFmt = "dd/mm/yyyy";
  const book = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(book.rawRows[0]["Date of Birth"], 60);
  assert.equal(book.rawRows[1]["Date of Birth"], 25569);
  assert.ok(
    parseRow(book.rawRows[0], 2).errors.includes("Invalid date of birth"),
  );
  assert.equal(parseRow(book.rawRows[1], 3).dob, "1970-01-01");
});
