import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3100/api/auth",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: `file:${resolve("data/e2e.db").replace(/\\/g, "/")}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
  reporter: "list",
});
