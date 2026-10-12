import { spawn } from "node:child_process";

if (!process.env.DATABASE_URL?.startsWith("postgres"))
  throw new Error("Cloud deployment requires a PostgreSQL DATABASE_URL.");
if (process.env.COOKIE_SECURE !== "true")
  throw new Error("Cloud deployment requires COOKIE_SECURE=true and HTTPS.");
const origin = process.env.APP_ORIGIN ?? process.env.RENDER_EXTERNAL_URL;
if (!origin || new URL(origin).protocol !== "https:")
  throw new Error("Configure an HTTPS APP_ORIGIN or Render external URL.");
const port = process.env.PORT ?? "10000";
if (!/^\d+$/.test(port)) throw new Error("PORT must be numeric.");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    port,
  ],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
