// Isolated fictional-data benchmark. Never reads or writes the operational database.
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
const phase = process.argv[2] || "before",
  port = 3137,
  base = `http://127.0.0.1:${port}`;
const url = `file:${resolve("data", `workspace-perf-${randomUUID()}.db`).replace(/\\/g, "/")}`;
new DatabaseSync(url.slice(5)).close();
const env = {
  ...process.env,
  DATABASE_URL: url,
  P3H_SYNC_ENABLED: "false",
  EMAIL_ENABLED: "false",
  NEXT_TELEMETRY_DISABLED: "1",
  APP_ORIGIN: base,
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "pipe" },
);
const db = new PrismaClient({ datasourceUrl: url });
const password = randomBytes(24).toString("hex"),
  salt = randomBytes(16).toString("hex");
await db.user.create({
  data: {
    id: "perf-user",
    username: "performance.staff",
    name: "Fictional Benchmark Staff",
    role: "Admin",
    passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
  },
});
await db.person.createMany({
  data: Array.from({ length: 2000 }, (_, i) => ({
    id: `perf-${i}`,
    kind: i < 1500 ? "Member" : "Care Recipient",
    memberId: i < 1500 ? `PERF-${String(i).padStart(4, "0")}` : null,
    name: `Fictional ${i < 1500 ? "Caregiver" : "Recipient"} ${String(i).padStart(4, "0")}`,
    contactNumber: "00000000",
    preferredLanguage: i % 2 ? "English" : "Mandarin",
    centre: "Benchmark Centre",
    assignedId: "perf-user",
    dob: new Date("1950-11-15"),
    onboardingDate: new Date("2026-01-01"),
  })),
});
await db.careRelationship.createMany({
  data: Array.from({ length: 500 }, (_, i) => ({
    memberId: `perf-${i}`,
    recipientId: `perf-${1500 + i}`,
    relationship: "Family",
  })),
});
await db.supportScheme.create({ data: { id: "perf-scheme", name: "HCG" } });
await db.grantApplication.createMany({
  data: Array.from({ length: 500 }, (_, i) => ({
    personId: `perf-${i}`,
    schemeId: "perf-scheme",
    status: i % 3 ? "Submitted" : "Approved",
    assignedId: "perf-user",
    nextReviewDate: new Date("2026-11-04"),
    notes: "Fictional benchmark application",
  })),
});
await db.alert.createMany({
  data: Array.from({ length: 100 }, (_, i) => ({
    title: `Fictional follow-up ${i}`,
    personId: `perf-${i}`,
    assignedId: "perf-user",
    type: "Case review",
    dueDate: new Date("2026-11-04"),
  })),
});
const metadata = new DatabaseSync(url.slice(5));
if (
  metadata
    .prepare("SELECT name FROM sqlite_master WHERE name='MaintenanceState'")
    .get()
)
  metadata
    .prepare(
      "INSERT INTO MaintenanceState(id,lastCompletedDate,lastCompletedAt) VALUES(?,?,?)",
    )
    .run(
      "daily-in-app-reminders",
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      new Date().toISOString(),
    );
metadata.close();
await db.$disconnect();
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { env, stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    if (i === 199) throw Error("Benchmark server did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.request.post(`${base}/api/auth`, {
    headers: { Origin: base },
    data: { action: "login", username: "performance.staff", password },
  });
  const first = performance.now();
  await page.goto(`${base}/dashboard`);
  await page
    .getByRole("heading", { name: "My Tasks Today", exact: true })
    .waitFor();
  const initialMs = performance.now() - first;
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/"))
      requests.push(new URL(r.url()).pathname + new URL(r.url()).search);
  });
  const navigation = [];
  const destinations = [
    ["members", "Caregivers"],
    ["people/perf-0", "Person profile"],
    ["grants", "Grants & Referrals"],
    ["my-work", "My Tasks"],
    ["dashboard", "P3H Dashboard"],
    ["reports", "Reports"],
    ["settings", "Settings"],
    ["dashboard", "P3H Dashboard"],
    ["members", "Caregivers"],
  ];
  for (const [path, title] of destinations) {
    const start = performance.now();
    await page.locator(`a[href="/${path}"]`).first().click();
    await page.waitForFunction(
      (t) =>
        document.querySelector("main h1")?.textContent === t &&
        !document.querySelector("main .skeleton"),
      title,
    );
    if (path === "members")
      await page
        .getByRole("link", { name: /Fictional Caregiver 0000/ })
        .first()
        .waitFor();
    if (path.startsWith("people/"))
      await page
        .getByRole("heading", { name: "Fictional Caregiver 0000", exact: true })
        .waitFor();
    await page.waitForFunction(
      () =>
        !document.querySelector("main .inline-progress") &&
        document.querySelector("main")?.getAttribute("aria-busy") !== "true",
    );
    if (path === "reports")
      await page.getByLabel("Report", { exact: true }).waitFor();
    if (path === "my-work")
      await page
        .getByRole("heading", { name: "My follow-ups", exact: true })
        .waitFor();
    navigation.push({ path, ms: Math.round(performance.now() - start) });
  }
  const api = [];
  for (const path of [
    "/api/data?section=dashboard",
    "/api/data?section=members",
    "/api/data?section=people&id=perf-0",
    "/api/data?section=grants",
    "/api/data?section=settings",
    "/api/people?kind=Member&q=Fictional&size=20",
    "/api/search?q=Fictional",
    ...(phase === "after"
      ? [
          "/api/grants?size=20",
          "/api/reports?view=caseload",
          "/api/tasks",
          "/api/audit?size=20",
        ]
      : []),
  ]) {
    const timings = [];
    let bytes = 0;
    for (let i = 0; i < 3; i++) {
      const start = performance.now(),
        response = await context.request.get(base + path);
      const body = await response.body();
      if (!response.ok()) throw Error(`Benchmark request failed: ${path}`);
      timings.push(performance.now() - start);
      bytes = body.length;
    }
    api.push({
      path,
      medianMs: Math.round(timings.sort((a, b) => a - b)[1]),
      bytes,
    });
  }
  const profileResponse = await context.request.get(
      base + "/api/data?section=people&id=perf-0",
    ),
    profile = await profileResponse.json(),
    person = profile.people.find((p) => p.id === "perf-0");
  const saveStart = performance.now();
  const saveResponse = await context.request.post(base + "/api/action", {
    headers: { Origin: base },
    data: {
      action: "person",
      id: person.id,
      version: person.updatedAt,
      data: {
        kind: "Member",
        memberId: person.memberId,
        remarks: "Fictional benchmark note",
      },
    },
  });
  if (!saveResponse.ok()) throw Error("Benchmark edit failed");
  const saveMs = Math.round(performance.now() - saveStart);
  const output = {
    phase,
    saveMs,
    fixture: { caregivers: 1500, recipients: 500, grants: 500, alerts: 100 },
    initialMs: Math.round(initialMs),
    authRequestsDuringNavigation: requests.filter((p) =>
      p.startsWith("/api/auth"),
    ).length,
    dataRequestsDuringNavigation: requests.filter((p) =>
      p.startsWith("/api/data"),
    ).length,
    accessChecksDuringNavigation: requests.filter((p) =>
      p.includes("section=access"),
    ).length,
    navigation,
    api,
  };
  writeFileSync(
    resolve("data", `workspace-performance-${phase}.json`),
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
