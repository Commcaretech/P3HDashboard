import JSZip from "jszip";
import { SaxesParser } from "saxes";

const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const packageRelations =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const documentRelations =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const escapeText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#13;");
const escapeAttribute = (value: string) =>
  escapeText(value)
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#9;");

/** ExcelJS expects unprefixed spreadsheet tags. Canonicalise a private in-memory copy. */
export async function compatibleWorkbook(bytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  let changed = false;
  for (const entry of Object.values(zip.files)) {
    if (
      entry.dir ||
      !entry.name.startsWith("xl/") ||
      !/\.(xml|rels)$/.test(entry.name)
    )
      continue;
    const xml = await entry.async("string");
    const parser = new SaxesParser({ xmlns: true });
    let needsRewrite = false;
    const parts: string[] = [];
    const names: { name: string; defaultNamespace: string }[] = [];
    parser.on("doctype", () => {
      throw new Error("Workbook XML must not contain document types.");
    });
    parser.on("opentag", (tag) => {
      const known = tag.uri === spreadsheet || tag.uri === packageRelations;
      const name = known ? tag.local : tag.name;
      if (name !== tag.name) needsRewrite = true;
      const attributes = new Map<string, string>();
      for (const attribute of Object.values(tag.attributes)) {
        const key =
          attribute.uri === documentRelations
            ? `r:${attribute.local}`
            : attribute.name;
        if (key !== attribute.name) needsRewrite = true;
        attributes.set(key, attribute.value);
        if (attribute.uri === documentRelations)
          attributes.set("xmlns:r", documentRelations);
      }
      // Preserve the original namespace even when changing an element's prefix.
      const inheritedNamespace = names.at(-1)?.defaultNamespace ?? "";
      let defaultNamespace = attributes.get("xmlns") ?? inheritedNamespace;
      if (!name.includes(":") && defaultNamespace !== tag.uri) {
        attributes.set("xmlns", tag.uri);
        defaultNamespace = tag.uri;
      }
      names.push({ name, defaultNamespace });
      parts.push(
        `<${name}${[...attributes].map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join("")}>`,
      );
    });
    parser.on("text", (value) => parts.push(escapeText(value)));
    parser.on("cdata", (value) => parts.push(escapeText(value)));
    parser.on("closetag", () => parts.push(`</${names.pop()!.name}>`));
    parser.write(xml).close();
    if (needsRewrite) {
      zip.file(entry.name, parts.join(""));
      changed = true;
    }
  }
  return changed
    ? zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    : bytes;
}
