import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { ncssHeaders } from "../src/lib/ncss-matched-csv";

// Use the spreadsheet authoring runtime to build the workbook. ExcelJS adds
// cell protection, which the authoring runtime API does not expose.
const dependencies = process.env.P3H_SPREADSHEET_DEPENDENCIES;
if (!dependencies)
  throw new Error(
    "Set P3H_SPREADSHEET_DEPENDENCIES to the spreadsheet runtime node directory.",
  );
const requireFromRuntime = createRequire(resolve(dependencies, "package.json"));
const { Workbook, SpreadsheetFile } = await import(
  pathToFileURL(requireFromRuntime.resolve("@oai/artifact-tool")).href
);
const book = Workbook.create();
const mapping = book.worksheets.add("CaritaHub Mapping");
const survey = book.worksheets.add("NCSS Matched Survey");
const surveyEnd = 1001;
const mappingEnd = 5001;
const surveyTitles = [
  ...ncssHeaders,
  "Member ID",
  "Suggested Member ID",
  "Manual Member ID",
  "Matching Status",
  "Clean name",
  "Exact count",
];
mapping.getRange("A1:C1").values = [["Full Name", "Member ID", "Clean name"]];
mapping.getRange("D1:D7").values = [
  ["Match NCSS survey names in Excel"],
  [
    "1. Paste Full Name and Member ID into A2:B5001 as values. Keep Member IDs as text.",
  ],
  [
    "2. On NCSS Matched Survey, paste the original CSV including headers into A1:AN1001. Keep the source columns as text.",
  ],
  [
    "3. Check the suggested IDs. Resolve initials, misspellings, duplicate names or missing matches in CaritaHub.",
  ],
  [
    "4. Enter any verified override as text in Manual Member ID (AQ). A blank final ID skips that response.",
  ],
  [
    "5. Copy A1:AO through the last response into a new workbook using Paste Values. Save as CSV UTF-8.",
  ],
  [
    "Keep this workbook on an approved organisation-managed device. Upload only the matched CSV.",
  ],
];
survey.getRange("A1:AT1").values = [surveyTitles];
for (const range of [mapping.getRange("A1:D1"), survey.getRange("A1:AT1")]) {
  range.format.fill = "#193E50";
  range.format.font.color = "#FFFFFF";
  range.format.font.bold = true;
  range.format.rowHeight = 34;
  range.format.wrapText = true;
}
mapping.getRange("A:C").format.columnWidth = 24;
mapping.getRange("D:D").format.columnWidth = 103;
mapping.getRange("D2:D7").format.wrapText = true;
mapping.getRange("D2:D7").format.rowHeight = 27;
survey.getRange("A:AT").format.columnWidth = 22;
survey.getRange("C:F").format.columnWidth = 31;
survey.getRange("AO:AR").format.columnWidth = 24;

const clean = (cell: string) =>
  `LOWER(TRIM(CLEAN(SUBSTITUTE(${cell}&"",CHAR(160)," "))))`;
mapping.getRange(`C2:C${mappingEnd}`).formulas = Array.from(
  { length: mappingEnd - 1 },
  (_, i) => [`=IF(A${i + 2}="","",${clean("A" + (i + 2))})`],
);
const lookup = "'CaritaHub Mapping'!$C$2:$C$" + mappingEnd;
const ids = "'CaritaHub Mapping'!$B$2:$B$" + mappingEnd;
const formulas = Array.from({ length: surveyEnd - 1 }, (_, i) => {
  const r = i + 2;
  const escaped = `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(AS${r},"~","~~"),"*","~*"),"?","~?")`;
  const initials = `OR(IFERROR(FIND(" ",AS${r}),0)<3,LEN(TRIM(RIGHT(SUBSTITUTE(AS${r}," ",REPT(" ",100)),100)))<2,ISNUMBER(SEARCH(".",AS${r})))`;
  const value = `INDEX(${ids},MATCH(${escaped},${lookup},0))`;
  return [
    `=IF(A${r}="","",IF(LEN(TRIM(AQ${r}&""))>0,TRIM(AQ${r}&""),AP${r}))`,
    `=IF(OR(A${r}="",AT${r}<>1,${initials}),"",IF(${value}="","",TRIM(${value}&"")))`,
    null,
    `=IF(A${r}="","",IF(LEN(TRIM(AQ${r}&""))>0,"Manually Verified",IF(AT${r}>1,"Duplicate Name",IF(OR(AS${r}="",${initials}),"Needs Review",IF(AP${r}="","No Match","Exact Match")))))`,
    `=IF(C${r}="","",${clean("C" + r)})`,
    `=IF(AS${r}="","",COUNTIF(${lookup},${escaped}))`,
  ];
});
for (const [offset, column] of [
  [0, "AO"],
  [1, "AP"],
  [3, "AR"],
  [4, "AS"],
  [5, "AT"],
] as const)
  survey.getRange(`${column}2:${column}${surveyEnd}`).formulas = formulas.map(
    (row) => [row[offset]],
  );

const output = resolve(
  process.argv[2] || "assets/ncss-member-id-template.xlsx",
);
const file = await SpreadsheetFile.exportXlsx(book);
const temp = await mkdtemp(join(tmpdir(), "p3h-workbook-"));
const intermediate = join(temp, "unprotected.xlsx");
let archive: JSZip;
try {
  await file.save(intermediate);
  archive = await JSZip.loadAsync(await readFile(intermediate));
} finally {
  await rm(temp, { recursive: true, force: true });
}
for (const name of Object.keys(archive.files)) {
  if (
    !/^xl\/(?:workbook|styles|sharedStrings|worksheets\/sheet\d+)\.xml$/.test(
      name,
    )
  )
    continue;
  const xml = await archive.file(name)!.async("string");
  archive.file(
    name,
    xml.replaceAll("xmlns:x=", "xmlns=").replace(/(<\/?)x:/g, "$1"),
  );
}
const protectedBook = new ExcelJS.Workbook();
await protectedBook.xlsx.load(
  await archive.generateAsync({ type: "arraybuffer" }),
);
protectedBook.calcProperties.fullCalcOnLoad = true;
const m = protectedBook.getWorksheet("CaritaHub Mapping")!;
const s = protectedBook.getWorksheet("NCSS Matched Survey")!;
const editable = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5F4F9" },
} as const;
for (const [sheet, columns, last] of [
  [m, [1, 2], mappingEnd],
  [s, [...Array.from({ length: 40 }, (_, i) => i + 1), 43], surveyEnd],
] as const) {
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  for (const column of columns) {
    for (let row = 2; row <= last; row++) {
      const cell = sheet.getCell(row, column);
      cell.protection = { locked: false };
      cell.numFmt = "@";
      if (sheet === m || column === 3 || column === 43) cell.fill = editable;
    }
  }
  if (sheet === s) {
    for (let column = 1; column <= 40; column++) {
      const cell = sheet.getCell(1, column);
      cell.style = {
        ...cell.style,
        protection: { locked: false },
        numFmt: "@",
      };
    }
  }
  await sheet.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });
}
m.getColumn("C").hidden = true;
s.getColumn("AS").hidden = true;
s.getColumn("AT").hidden = true;
s.getCell("AO1").note =
  "Final Member ID. Copy A:AO only and paste values into a new workbook before saving as CSV UTF-8.";
s.addConditionalFormatting({
  ref: `AO2:AO${surveyEnd}`,
  rules: [
    {
      type: "expression",
      priority: 1,
      formulae: ['AND($A2<>"",$AO2="")'],
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          bgColor: { argb: "FFFCE0DD" },
        },
      },
    },
  ],
});
s.addConditionalFormatting({
  ref: `AR2:AR${surveyEnd}`,
  rules: [
    {
      type: "expression",
      priority: 2,
      formulae: ['AR2="Duplicate Name"'],
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          bgColor: { argb: "FFFFE8AD" },
        },
      },
    },
  ],
});
await protectedBook.xlsx.writeFile(output);
