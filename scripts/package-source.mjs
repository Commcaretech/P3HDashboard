import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import JSZip from "jszip";
const root = resolve("."),
  zip = new JSZip();
const files = [
  "package.json",
  "package-lock.json",
  "README.md",
  ".env.example",
  ".gitignore",
  "next-env.d.ts",
  "next.config.ts",
  "tsconfig.json",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "playwright.config.ts",
  "data/.gitkeep",
  "assets/ncss-member-id-template.xlsx",
];
async function add(path) {
  const name = relative(root, path).replaceAll("\\", "/");
  if (
    name.startsWith("../") ||
    (/^\.env(?:\.|$)/.test(name.split("/").at(-1) ?? "") &&
      name !== ".env.example") ||
    (/\.(db|xlsx|xls|csv|zip)$/.test(name) &&
      name !== "assets/ncss-member-id-template.xlsx")
  )
    throw new Error("Source package contains an unsupported file.");
  zip.file(name, await readFile(path));
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) await add(path);
  }
}
for (const file of files) await add(resolve(root, file));
for (const directory of ["src", "prisma", "scripts", "tests", "docs"])
  await walk(resolve(root, directory));
await mkdir(resolve(root, "artifacts"), { recursive: true });
const content = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});
await writeFile(resolve(root, "artifacts/p3h-render-source.zip"), content);
console.log(
  `Source-only package created: artifacts/p3h-render-source.zip (${content.length} bytes).`,
);
