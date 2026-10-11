import JSZip from "jszip";
import { SaxesParser, SaxesTagPlain } from "saxes";
import { posix } from "node:path";
function parse(xml: string, onTag: (tag: SaxesTagPlain) => void) {
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => {
    throw new Error("Workbook XML must not contain document types.");
  });
  parser.on("opentag", onTag);
  parser.write(xml).close();
}
/** ExcelJS converts date-styled numeric cells to Date. Retain their actual source serials. */
export async function sourceNumbers(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const relations = await zip
    .file("xl/_rels/workbook.xml.rels")
    ?.async("string");
  if (!workbook || !relations) throw new Error("Workbook metadata is missing.");
  let firstId = "",
    target = "";
  parse(workbook, (t) => {
    if (t.name.split(":").pop() === "sheet" && !firstId) {
      firstId =
        Object.entries(t.attributes).find(([k]) => k.endsWith(":id"))?.[1] ??
        "";
    }
  });
  parse(relations, (t) => {
    if (
      t.name.split(":").pop() === "Relationship" &&
      t.attributes.Id === firstId
    ) {
      if (t.attributes.TargetMode === "External")
        throw new Error("External worksheets are not supported.");
      target = t.attributes.Target;
    }
  });
  const path = target.startsWith("/")
    ? target.slice(1)
    : posix.normalize("xl/" + target);
  if (!path.startsWith("xl/")) throw new Error("Invalid worksheet path.");
  const xml = await zip.file(path)?.async("string");
  if (!xml) throw new Error("Worksheet data is missing.");
  const result = new Map<string, number>();
  let cell = "",
    numeric = false,
    reading = false,
    value = "";
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => {
    throw new Error("Workbook XML must not contain document types.");
  });
  parser.on("opentag", (t) => {
    const name = t.name.split(":").pop();
    if (name === "c") {
      cell = t.attributes.r;
      numeric = !t.attributes.t || t.attributes.t === "n";
    }
    if (name === "v") {
      reading = true;
      value = "";
    }
  });
  parser.on("text", (t) => {
    if (reading) value += t;
  });
  parser.on("closetag", (t) => {
    if (t.name.split(":").pop() === "v") {
      reading = false;
      if (numeric && cell && value.trim() && Number.isFinite(Number(value)))
        result.set(cell, Number(value));
    }
  });
  parser.write(xml).close();
  return result;
}
