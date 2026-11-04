import { spawnSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const path = resolve("data/e2e.db");
if (existsSync(path)) unlinkSync(path);
const d = new DatabaseSync(path);
d.close();
const env = {
  ...process.env,
  DATABASE_URL: `file:${path.replace(/\\/g, "/")}`,
};
const migration = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "inherit" },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const child = spawn(
  process.execPath,
  [
    "--import",
    "./tests/e2e/programme-feed.mjs",
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { env, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
