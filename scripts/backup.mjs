import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const url =
  process.env.DATABASE_URL ??
  env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1] ??
  "file:../data/p3h.db";
if (!url.startsWith("file:"))
  throw new Error("This backup script supports SQLite only.");
const source = resolve("prisma", url.slice(5));
if (!existsSync(source))
  throw new Error("Database file does not exist. Run migrations first.");
const folder = resolve(dirname(source), "../backups");
mkdirSync(folder, { recursive: true });
const destination = resolve(
  folder,
  `p3h-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.db`,
);
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  const check = new DatabaseSync(destination, { readOnly: true });
  if (check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("Backup integrity check failed");
  check.close();
  console.log(`Verified local backup: ${destination}`);
} finally {
  db.close();
}
