import { DatabaseSync, backup } from "node:sqlite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
const original = process.argv[2];
if (!original)
  throw new Error("Supply the verified backup path, never the live database.");
const source = resolve(original);
if (
  !source.startsWith(resolve("backups") + "\\") &&
  !source.startsWith(resolve("backups") + "/")
)
  throw new Error("Input must be in backups/.");
mkdirSync("artifacts", { recursive: true });
const destination = resolve("data", `migration-review-${randomUUID()}.db`);
const from = new DatabaseSync(source, { readOnly: true });
await backup(from, destination);
from.close();
const snapshot = new DatabaseSync(destination);
const tables = snapshot
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name",
  )
  .all()
  .map((r) => r.name);
const originals = tables.map((name) => ({
  name,
  columns: snapshot
    .prepare(`PRAGMA table_info("${name}")`)
    .all()
    .map((c) => c.name),
  rows: snapshot.prepare(`SELECT * FROM "${name}"`).all(),
}));
assert.equal(
  snapshot.prepare("PRAGMA integrity_check").get().integrity_check,
  "ok",
);
assert.deepEqual(snapshot.prepare("PRAGMA foreign_key_check").all(), []);
snapshot.close();
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    env: {
      ...process.env,
      DATABASE_URL: `file:${destination.replace(/\\/g, "/")}`,
    },
    stdio: "pipe",
  },
);
const migrated = new DatabaseSync(destination, { readOnly: true });
for (const { name, columns, rows } of originals) {
  const after = migrated
    .prepare(`SELECT ${columns.map((c) => `"${c}"`).join(",")} FROM "${name}"`)
    .all();
  if (JSON.stringify(after) !== JSON.stringify(rows))
    throw new Error(
      `${name}: original values changed; stop deployment and inspect the isolated copy privately.`,
    );
}
assert.equal(
  migrated.prepare("PRAGMA integrity_check").get().integrity_check,
  "ok",
);
assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
migrated.close();
const summary = {
  verifiedAt: new Date().toISOString(),
  isolatedDatabase: destination,
  tables: originals.map((t) => ({
    table: t.name,
    unchangedRows: t.rows.length,
  })),
  integrity: "ok",
  foreignKeys: "ok",
  allOriginalValuesPreserved: true,
};
await import("node:fs/promises").then((fs) =>
  fs.writeFile(
    "artifacts/migration-verification.json",
    JSON.stringify(summary, null, 2),
  ),
);
console.log(JSON.stringify(summary, null, 2));
