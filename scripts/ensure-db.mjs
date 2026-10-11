import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const url =
  process.env.DATABASE_URL ??
  env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1] ??
  "file:../data/p3h.db";
if (url.startsWith("file:")) {
  const path = resolve("prisma", url.slice(5));
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    const db = new DatabaseSync(path);
    db.close();
  }
}
