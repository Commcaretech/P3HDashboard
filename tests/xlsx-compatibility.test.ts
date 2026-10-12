import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readWorkbook, parseRow } from "../src/lib/importer";
import { compatibleWorkbook } from "../src/lib/xlsx-compatibility";

test("prefixed OpenXML preserves cell text, serial dates, namespace aliases and sheet order", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Members");
  sheet.addRow(["Member ID", "Date of Birth", "Remark", "Interest"]);
  const note = 'Receiving HCG\nText & < > "quotes" 中文';
  sheet.addRow(["SYNTHETIC-PREFIX-1", 61, note, "Music; Games"]);
  sheet.getCell("B2").numFmt = "dd/mm/yyyy";
  wb.addWorksheet("Test Guide").addRow(["Guide text, not a member"]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const zip = await JSZip.loadAsync(bytes);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.endsWith(".xml")) continue;
    const xml = await entry.async("string");
    if (
      !xml.includes(
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
      )
    )
      continue;
    const prefixed = xml
      .replace(/<(\/?)([A-Za-z][\w-]*)(?=[\s/>])/g, "<$1x:$2")
      .replace(
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
      )
      .replace(/xmlns:r=/g, "xmlns:rel=")
      .replace(/ r:id=/g, " rel:id=");
    zip.file(entry.name, prefixed);
  }
  const prefixedBytes = await zip.generateAsync({ type: "nodebuffer" });
  const book = await readWorkbook(prefixedBytes);
  assert.equal(book.rawRows.length, 1);
  assert.equal(book.rawRows[0].Remark, note);
  assert.equal(book.rawRows[0]["Date of Birth"], 61);
  assert.equal(parseRow(book.rawRows[0], 2).dob, "1900-03-01");
  assert.equal(book.rawRows[0]["Member ID"], "SYNTHETIC-PREFIX-1");
  assert.equal(await compatibleWorkbook(bytes), bytes);
});

test("compatibility rejects document types rather than weakening XML validation", async () => {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    '<!DOCTYPE workbook [<!ENTITY value "unsafe">]><workbook/>',
  );
  await assert.rejects(
    compatibleWorkbook(await zip.generateAsync({ type: "nodebuffer" })),
    /document types/,
  );
});
