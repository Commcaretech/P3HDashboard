// Disposable fictional workloads only. Run with node --import tsx.
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
const phase = process.argv[2] || "after",
  source = resolve(process.argv[3] || ".");
const withSurveys =
  phase === "after" || process.argv.includes("--with-surveys");
const { parseSurveyCSV } = await import(
  pathToFileURL(resolve(source, "src/lib/survey-parser.ts")).href
);
const { surveyHeaders } = await import(
  pathToFileURL(resolve(source, "src/lib/survey-parser.ts")).href
);
const { ncssHeaders, readMatchedNCSS } =
  await import("../src/lib/ncss-matched-csv.ts");
const results = [];
for (const size of [100, 1000, 5000]) {
  const file = resolve("data", `survey-benchmark-${randomUUID()}.db`),
    url = `file:${file.replaceAll("\\", "/")}`,
    port = 3143,
    base = `http://127.0.0.1:${port}`;
  new DatabaseSync(file).close();
  const env = {
    ...process.env,
    DATABASE_URL: url,
    APP_ORIGIN: base,
    NCSS_SURVEY_IMPORT_APPROVAL: "fictional-benchmark-only",
    EMAIL_ENABLED: "false",
    P3H_SYNC_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, stdio: "pipe" },
  );
  const raw = new DatabaseSync(file);
  if (
    !raw
      .prepare("SELECT name FROM sqlite_master WHERE name='SurveyResponse'")
      .get()
  )
    raw.exec(
      readFileSync(
        resolve(
          source,
          "prisma/migrations/202611130001_surveys_outcomes/migration.sql",
        ),
        "utf8",
      ),
    );
  raw.close();
  const db = new PrismaClient({ datasourceUrl: url }),
    password = randomBytes(20).toString("hex"),
    salt = randomBytes(16).toString("hex");
  await db.user.create({
    data: {
      id: "bench-staff",
      username: "fictional.benchmark",
      name: "Fictional Benchmark",
      role: "Admin",
      passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
    },
  });
  for (let i = 0; i < size; i += 200)
    await db.person.createMany({
      data: Array.from({ length: Math.min(200, size - i) }, (_, j) => ({
        id: `cg-${i + j}`,
        memberId: `FAKE-${String(i + j).padStart(5, "0")}`,
        kind: "Member",
        name: `Fictional Caregiver ${String(i + j).padStart(5, "0")}`,
        centre: "Benchmark Centre",
        remarks: "Fictional note. ".repeat(100),
        dob: new Date("1960-01-01"),
        assignedId: "bench-staff",
      })),
    });
  await db.supportScheme.create({
    data: { id: "bench-scheme", name: "CHAS card application" },
  });
  for (let i = 0; i < size; i += 200) {
    const n = Math.min(200, size - i);
    await db.person.createMany({
      data: Array.from({ length: n }, (_, j) => ({
        id: `cr-${i + j}`,
        kind: "Care Recipient",
        name: `Fictional Recipient ${i + j}`,
        centre: "Benchmark Centre",
      })),
    });
    await db.careRelationship.createMany({
      data: Array.from({ length: n }, (_, j) => ({
        memberId: `cg-${i + j}`,
        recipientId: `cr-${i + j}`,
        relationship: "Family",
      })),
    });
    await db.grantApplication.createMany({
      data: Array.from({ length: n }, (_, j) => ({
        personId: `cg-${i + j}`,
        schemeId: "bench-scheme",
        status: "Submitted",
        applicationDate: new Date("2026-01-01"),
        notes: "Fictional application",
      })),
    });
  }
  const batch = await db.surveyImportBatch.create({
    data: {
      filename: "fictional.csv",
      language: "English",
      centre: "Benchmark Centre",
      uploadedBy: "bench-staff",
      summary: { fictional: true },
    },
  });
  for (let i = 0; i < size * 2; i += 200)
    await db.surveyResponse.createMany({
      data: Array.from({ length: Math.min(200, size * 2 - i) }, (_, j) => ({
        batchId: batch.id,
        sourceKey: `fake-${i + j}`,
        contentHash: `fake-${i + j}`,
        rowNumber: i + j + 2,
        centre: "Benchmark Centre",
        language: "English",
        submittedName: "Fictional",
        cleanedName: "Fictional",
        timestampText: "2026-01-01",
        surveyDate: new Date((i + j) % 2 ? "2026-11-01" : "2026-01-01"),
        phase: (i + j) % 2 ? "Annual" : "Baseline",
        personId: `cg-${Math.floor((i + j) / 2)}`,
        confirmedMemberId: `FAKE-${String(Math.floor((i + j) / 2)).padStart(5, "0")}`,
        matchStatus: "Linked",
        rawAnswers: {},
        answers: {},
        method: "P3H_WHOQOL_ZBI6_v1_complete_domains",
        warnings: [],
        physical: 50,
        psychological: 50,
        social: 50,
        environment: 50,
        overall: 50,
        zbi: 6,
      })),
    });
  await db.maintenanceState.upsert({
    where: { id: "daily-in-app-reminders" },
    create: {
      id: "daily-in-app-reminders",
      lastCompletedDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    },
    update: {},
  });
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
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      if (i === 199) throw Error("Benchmark server failed");
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const context = await browser.newContext(),
      page = await context.newPage();
    await context.request.post(base + "/api/auth", {
      headers: { Origin: base },
      data: { action: "login", username: "fictional.benchmark", password },
    });
    const api = [];
    for (const path of [
      "/api/data?section=dashboard",
      "/api/people?kind=Member&q=Fictional&size=20",
      "/api/data?section=people&id=cg-0",
      "/api/grants?size=20",
      ...(withSurveys
        ? ["/api/surveys?view=records&size=20", "/api/surveys?view=overview"]
        : []),
    ]) {
      const times = [];
      let bytes = 0;
      for (let i = 0; i < 3; i++) {
        const at = performance.now(),
          res = await context.request.get(base + path);
        const b = await res.body();
        if (!res.ok()) throw Error(`Request failed ${path}`);
        if (
          path.startsWith("/api/surveys?view=records") &&
          JSON.parse(b.toString()).total !== size * 2
        )
          throw Error("Benchmark must include all linked survey records");
        bytes = b.length;
        times.push(performance.now() - at);
      }
      api.push({
        path,
        medianMs: Math.round(times.sort((a, b) => a - b)[1]),
        bytes,
      });
    }
    const csv = [
      surveyHeaders.join(","),
      ...Array.from({ length: size }, (_, i) =>
        [
          String(i),
          "13/11/2026 10:00",
          `Fictional ${i}`,
          "01/01/1960",
          "At the start of / Before the programme",
          "Yes",
          ...Array(26).fill("3"),
          ...Array(6).fill("1"),
        ].join(","),
      ),
    ].join("\n");
    // Properly quote headers containing commas.
    const csvText =
      surveyHeaders.map((h) => '"' + h.replaceAll('"', '""') + '"').join(",") +
      csv.slice(csv.indexOf("\n"));
    const at = performance.now();
    parseSurveyCSV(csvText, "English");
    let csvMs = Math.round(performance.now() - at);
    await page.goto(base + "/dashboard");
    await page
      .getByRole("heading", { name: "My Tasks Today", exact: true })
      .waitFor();
    const navigation = [];
    for (const [path, title] of [
      ["members", "Caregivers"],
      ["grants", "Grants & Referrals"],
      ["dashboard", "P3H Dashboard"],
      ...(withSurveys ? [["surveys", "Surveys & Outcomes"]] : []),
    ]) {
      const at = performance.now();
      await page.locator(`a[href="/${path}"]`).first().click();
      await page
        .getByRole("heading", { name: title, exact: true })
        .first()
        .waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector("main")?.getAttribute("aria-busy") !==
            "true" && !document.querySelector("main .inline-progress"),
      );
      if (path === "surveys")
        await page
          .getByRole("heading", {
            name: "Results from verified linked responses",
          })
          .waitFor();
      navigation.push({ path, ms: Math.round(performance.now() - at) });
    }
    let csvCommitMs = null;
    if (withSurveys) {
      const rows = Array.from({ length: size }, (_, i) => [
        i.toString(16).padStart(24, "0"),
        "13/11/2026 10:00",
        "Fictional name",
        "01/01/1960",
        "At the start of / Before the programme",
        "Yes",
        ...Array(26).fill("3"),
        ...Array(6).fill("1"),
        "",
        "",
        `FAKE-${String(i).padStart(5, "0")}`,
      ]);
      const matchedCsv = [[...ncssHeaders, "Member ID"], ...rows]
        .map((line) =>
          line
            .map((value) => '"' + value.replaceAll('"', '""') + '"')
            .join(","),
        )
        .join("\n");
      const parsing = performance.now();
      const matched = readMatchedNCSS(matchedCsv, "English");
      csvMs = Math.round(performance.now() - parsing);
      const intake = {
        centre: "Benchmark Centre",
        language: matched.language,
        rows: matched.rows,
        excludedConsent: 0,
        excludedTest: 0,
      };
      const headers = { Origin: base };
      const preview = await context.request.post(base + "/api/surveys", {
        headers,
        data: { ...intake, action: "preview" },
        timeout: 65000,
      });
      if (!preview.ok()) throw Error("Benchmark matched preview failed");
      const { reviewToken } = await preview.json();
      const started = performance.now();
      const response = await context.request.post(base + "/api/surveys", {
        headers,
        data: { ...intake, action: "import", reviewToken },
        timeout: 65000,
      });
      const result = await response.json();
      csvCommitMs = Math.round(performance.now() - started);
      if (!response.ok() || result.summary?.saved !== size)
        throw Error(
          "Benchmark import did not commit the complete fictional batch",
        );
    }
    results.push({
      caregivers: size,
      recipients: size,
      grants: size,
      surveys: size * 2,
      api,
      csvProcessingMs: csvMs,
      csvCommitMs,
      navigation,
    });
  } finally {
    await browser?.close();
    server.kill();
    await new Promise((r) => server.once("exit", r));
  }
}
const output = resolve("data", `survey-performance-${phase}.json`);
writeFileSync(
  output,
  JSON.stringify(
    {
      phase,
      note: "Local fictional SQLite, median of three API samples. Navigation includes browser overhead. CSV commit includes request handling, validation and transactional storage.",
      results,
    },
    null,
    2,
  ),
);
console.log(output);
console.log(JSON.stringify(results));
