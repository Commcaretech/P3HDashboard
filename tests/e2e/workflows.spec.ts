import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { today } from "../../src/lib/domain";
import { addDays, calculateFollowUp } from "../../src/lib/follow-up";
import { randomBytes } from "node:crypto";

const password = randomBytes(24).toString("base64url");

test.describe.configure({ mode: "serial" });
const browserIssues = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const issues: string[] = [];
  browserIssues.set(page, issues);
  page.on("pageerror", (e) => issues.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") issues.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(browserIssues.get(page) ?? [], "Unexpected browser errors").toEqual(
    [],
  );
});
test("critical local case-management workflows and server permissions", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:3100/"))
      externalRequests.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.getByLabel("Your name").fill("Fake Administrator");
  await page.getByLabel("Username", { exact: true }).fill("fake.admin");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(
    page.getByRole("heading", { name: "P3H Dashboard", exact: true }),
  ).toBeVisible();
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("Members");
  s.addRow([
    "Member ID",
    "Date of Birth",
    "Centre (as client)",
    "Gender",
    "Race",
    "Language spoken / understood",
    "Working status",
    "Other Medical Conditions",
    "Interest",
    "Remark",
    "Tags",
  ]);
  s.addRow([
    "E2E-001",
    25569,
    "Fake Centre",
    "Female",
    "Not recorded",
    "English, Mandarin",
    "",
    "CR: Dementia; ZBI = 10",
    "Exercise;Walking",
    "P3H Onboarding Date: 01/10/2026",
    "Fake",
  ]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  await page.getByRole("link", { name: "Import Data", exact: true }).click();
  await page.getByLabel("Excel workbook", { exact: true }).setInputFiles({
    name: "fake.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Parse and preview" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeVisible();
  expect(
    (await (await context.request.get("/api/data")).json()).people.length,
  ).toBe(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(
    page.getByRole("heading", { name: "Import saved" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View members", exact: true }).click();
  await page.getByRole("link", { name: "E2E-001" }).click();
  await expect(
    page.getByRole("heading", { name: "E2E-001", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "E2E-001", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Fictional Caregiver");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: /Fictional Caregiver/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Care Recipients", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add care recipient" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Fictional Recipient");
  await page
    .getByLabel("Date of birth", { exact: true })
    .fill(
      `1950-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", month: "2-digit", day: "2-digit" }).format(new Date()).replace("/", "-")}`,
    );
  await page
    .getByLabel("Assigned staff / Case owner")
    .selectOption({ label: "Fake Administrator" });
  await page.getByRole("tab", { name: "Languages & interests" }).click();
  await page.getByLabel("Other spoken / understood languages").fill("Mandarin");
  await page.getByLabel("Interests", { exact: true }).fill("Exercise, Walking");
  await page.getByRole("tab", { name: "Health", exact: true }).click();
  await page.getByLabel("Medical / mental health conditions").fill("Dementia");
  await page
    .getByRole("dialog")
    .getByLabel("Mobility", { exact: true })
    .selectOption("Assisted");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: "Fictional Recipient", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Care Relationships", exact: true })
    .click();
  await page.getByRole("button", { name: "Link care recipient" }).click();
  await page
    .getByLabel("Member / caregiver", { exact: true })
    .selectOption({ label: "Fictional Caregiver" });
  await page
    .getByLabel("Care recipient", { exact: true })
    .selectOption({ label: "Fictional Recipient" });
  await page.getByLabel("Relationship", { exact: true }).fill("Spouse");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Spouse", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Programmes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add programme" }).click();
  await page
    .getByLabel("Programme name", { exact: true })
    .fill("Fictional Exercise");
  await page.getByRole("tab", { name: "Suitability", exact: true }).click();
  await page.getByLabel("Supported languages").fill("Mandarin");
  await page.getByLabel("Suitable conditions").fill("Dementia");
  await page.getByLabel("Related interests").fill("Exercise, Walking");
  await page.getByLabel("Suitable mobility levels").fill("Assisted");
  await page
    .getByRole("tab", { name: "Schedule & availability", exact: true })
    .click();
  await page.getByLabel("Capacity (0 = unspecified)").fill("10");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByText("Fictional Exercise", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Programme Matching", exact: true })
    .click();
  await page
    .getByLabel("Member / caregiver", { exact: true })
    .selectOption({ label: "Fictional Caregiver" });
  await page
    .getByLabel("Linked care recipient", { exact: true })
    .selectOption({ label: "Fictional Recipient" });
  await page.getByRole("button", { name: "Find Suitable Programmes" }).click();
  await expect(page.getByText("100% Match", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Care recipient conditions: Dementia (+35%)"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Register participation" }).click();
  await page
    .getByRole("link", { name: "Grants & Referrals", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add grant / support" }).click();
  await page
    .getByLabel("Person", { exact: true })
    .selectOption({ label: "Fictional Caregiver · Member" });
  await page.getByLabel("Scheme name", { exact: true }).fill("HCG");
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await page.getByLabel("Application date", { exact: true }).fill(now);
  await page.getByLabel("Next review date", { exact: true }).fill(now);
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "HCG: Grant review", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /^Alerts/ }).click();
  const birthdayRow = page.getByRole("row").filter({
    hasText: "Birthday: Fictional Recipient (today)",
  });
  await expect(birthdayRow).toHaveCount(0);
  const admin = (await (await context.request.get("/api/auth")).json()).user;
  expect(
    (
      await context.request.post("/api/action", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: {
          action: "staffSettings",
          id: admin.id,
          data: {
            email: "",
            emailNotifications: "Disabled",
            recipientBirthdays: "Enabled",
            active: "Active",
            role: "Admin",
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Refresh Alerts" }).click();
  await expect(birthdayRow).toHaveCount(1);
  const alertRow = page
    .getByRole("row")
    .filter({ hasText: "HCG: Grant review" });
  await alertRow
    .getByRole("button", { name: "Mark Follow-up Done", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await expect(alertRow).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh Alerts" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "HCG: Grant review" }),
  ).toHaveCount(0);
  await page.getByLabel("Global search").fill("E2E-001");
  await page.getByLabel("Global search").press("Enter");
  await expect(
    page.getByRole("link", { name: /Fictional Caregiver/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Caregivers", exact: true }).click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Centre", { exact: true }).selectOption("Fake Centre");
  await expect(
    page.getByRole("link", { name: /Fictional Caregiver/ }),
  ).toBeVisible();
  await page.getByLabel("Search records").fill("nonexistent");
  await expect(
    page.getByText("No matching records.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear Filters" }).click();
  await page.getByRole("link", { name: "Import Data", exact: true }).click();
  await page.getByLabel("Excel workbook", { exact: true }).setInputFiles({
    name: "duplicate.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Parse and preview" }).click();
  await expect(page.getByLabel("Action for row 2")).toHaveValue("Skip");
  await expect(
    page.getByText("Existing Member ID — compare and choose update or skip"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review / correct" }).click();
  await page.getByRole("tab", { name: "Comparison", exact: true }).click();
  await expect(page.getByLabel("Existing values (reference only)")).toHaveValue(
    /Fictional Caregiver/,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Add staff account" }).click();
  await page.getByLabel("Staff name").fill("Fake Reader");
  await page.getByLabel("Username", { exact: true }).fill("fake.reader");
  await page
    .getByLabel("Initial password (at least 12 characters)")
    .fill(password);
  await page.getByLabel("Role", { exact: true }).selectOption("Read Only");
  await page
    .getByLabel("Centre access", { exact: true })
    .selectOption("All centres");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username", { exact: true }).fill("fake.reader");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "P3H Dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Caregivers", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "+ Add Caregiver" }),
  ).toHaveCount(0);
  const denied = await context.request.post("/api/action", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "person",
      data: { kind: "Member", memberId: "NOT-ALLOWED" },
    },
  });
  expect(denied.ok()).toBe(false);
  const before = (await (await context.request.get("/api/data")).json()).people
    .length;
  expect(before).toBe(2);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    page.getByRole("link", { name: /Fictional Caregiver/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
test("navigation, reports, invalid forms, confirmations, duplicate updates and responsive layouts", async ({
  page,
  context,
}) => {
  const origin = { Origin: "http://127.0.0.1:3100" };
  expect(
    (
      await context.request.post("/api/auth", {
        headers: origin,
        data: { action: "login", username: "fake.admin", password },
      })
    ).ok(),
  ).toBe(true);
  for (const [path, title] of [
    ["dashboard", "P3H Dashboard"],
    ["my-work", "My Tasks"],
    ["members", "Caregivers"],
    ["care-recipients", "Care Recipients"],
    ["programmes", "Programmes"],
    ["matching", "Programme Matching"],
    ["grants", "Grants & Referrals"],
    ["alerts", "Alerts"],
    ["import", "Import Data"],
    ["reports", "Reports"],
    ["audit", "Audit Log"],
    ["settings", "Settings"],
  ]) {
    await page.goto("/" + path);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/reports");
  for (const value of [
    "caseload",
    "conditions",
    "languages",
    "member-interests",
    "recipient-interests",
    "grant-status",
    "birthdays",
    "follow-ups",
    "participation",
  ]) {
    await page.getByLabel("Report", { exact: true }).selectOption(value);
    await expect(page.getByRole("table")).toBeVisible();
  }
  await page.goto("/members");
  await page.getByRole("button", { name: "+ Add Caregiver" }).click();
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Member ID",
  );
  await page.getByLabel("Member ID", { exact: true }).fill("E2E-002");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Second Fictional Caregiver");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: /Second Fictional Caregiver/ }),
  ).toBeVisible();
  await page.goto("/members");
  const second = page.getByRole("row").filter({ hasText: "E2E-002" });
  page.once("dialog", (d) => d.accept());
  await second.locator(".action-menu summary").click();
  await second.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(second).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Archived");
  await second.locator(".action-menu summary").click();
  await second.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Status", { exact: true })
    .selectOption("Active");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByRole("button", { name: "Clear Filters" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "E2E-002" }),
  ).toBeVisible();
  await page.goto("/grants");
  await page
    .getByRole("row")
    .filter({ hasText: "HCG" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const originalViewport = page.viewportSize()!;
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(
      Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2),
    ).toBeLessThan(2);
    expect(
      Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2),
    ).toBeLessThan(2);
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height - 32);
    await page.screenshot({
      path: `test-results/centered-grant-${viewport.width}.png`,
    });
  }
  await page.setViewportSize(originalViewport);
  await page.getByLabel("Amount (SGD)").fill("100");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("S$100.00", { exact: true })).toBeVisible();
  await page.goto("/alerts");
  await page.getByRole("button", { name: "+ Create reminder" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Fictional case review");
  await page.getByLabel("Due date", { exact: true }).fill(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await page.getByRole("button", { name: "Save record" }).click();
  const manual = page
    .getByRole("row")
    .filter({ hasText: "Fictional case review" });
  await manual.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Dismissed");
  await manual.getByRole("button", { name: "Reopen", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Pending");
  await expect(manual).toBeVisible();
  const preview = await context.request.post("/api/import", {
    headers: origin,
    data: {
      action: "preview",
      filename: "fake-update.xlsx",
      mapping: {
        "Member ID": "Member ID",
        "Centre (as client)": "Centre (as client)",
      },
      rawRows: [
        {
          "Member ID": "E2E-001",
          "Centre (as client)": "Updated Fake Centre",
          "Extra original field": "Preserve me",
        },
      ],
    },
  });
  const { rows } = await preview.json();
  expect(rows[0].action).toBe("Skip");
  expect(rows[0].raw["Extra original field"]).toBe("Preserve me");
  rows[0].action = "Update existing";
  const committed = await context.request.post("/api/import", {
    headers: origin,
    data: { action: "commit", filename: "fake-update.xlsx", rows },
  });
  expect(committed.ok()).toBe(true);
  expect((await committed.json()).updated).toBe(1);
  const snapshot = await (await context.request.get("/api/data")).json();
  const changed = snapshot.people.find(
    (p: { memberId: string }) => p.memberId === "E2E-001",
  );
  expect(changed.name).toBe("Fictional Caregiver");
  expect(changed.centre).toBe("Updated Fake Centre");
  expect(changed.rawImport["Extra original field"]).toBe("Preserve me");
  const rollback = await context.request.post("/api/import", {
    headers: origin,
    data: {
      action: "commit",
      filename: "rollback.xlsx",
      rows: [
        { rowNumber: 2, raw: {}, memberId: "ROLLBACK-API", action: "Import" },
        { rowNumber: 3, raw: {}, memberId: "E2E-001", action: "Import" },
      ],
    },
  });
  expect(rollback.ok()).toBe(false);
  expect(
    (await (await context.request.get("/api/data")).json()).people.some(
      (p: { memberId: string }) => p.memberId === "ROLLBACK-API",
    ),
  ).toBe(false);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "My Tasks Today", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    page.getByRole("heading", { name: "P3H Dashboard", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(
    page.getByRole("link", { name: "Caregivers", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Caregivers", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Caregivers", exact: true }),
  ).toBeVisible();
});
test("fictional sample workbook parses, commits and detects reimport locally", async ({
  request,
}) => {
  const sample = new ExcelJS.Workbook();
  const sheet = sample.addWorksheet("Members");
  sheet.addRow([
    "Member ID",
    "Other Medical Conditions",
    "Language spoken / understood",
  ]);
  sheet.addRow(["FICTIONAL-SAMPLE-001", "CR: Dementia; ZBI = 10", "English"]);
  const sampleBytes = Buffer.from(await sample.xlsx.writeBuffer());
  const origin = { Origin: "http://127.0.0.1:3100" };
  await request.post("/api/auth", {
    headers: origin,
    data: { action: "login", username: "fake.admin", password },
  });
  const upload = await request.post("/api/import", {
    headers: origin,
    multipart: {
      file: {
        name: "sample.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: sampleBytes,
      },
    },
  });
  expect(upload.ok()).toBe(true);
  const book = await upload.json();
  const mapping = Object.fromEntries(book.headers.map((h: string) => [h, h]));
  const preview = await request.post("/api/import", {
    headers: origin,
    data: { ...book, mapping, action: "preview" },
  });
  expect(preview.ok()).toBe(true);
  const { rows } = await preview.json();
  expect(rows.length).toBe(1);
  expect(rows[0].errors.length).toBe(0);
  expect(rows[0].recipientConditions.length).toBeGreaterThan(0);
  const commit = await request.post("/api/import", {
    headers: origin,
    data: { action: "commit", filename: "sample.xlsx", rows },
  });
  expect(commit.ok()).toBe(true);
  expect((await commit.json()).created).toBe(1);
  const repeated = await request.post("/api/import", {
    headers: origin,
    data: { ...book, mapping, action: "preview" },
  });
  expect((await repeated.json()).rows[0].action).toBe("Skip");
});

test("review member-note extraction, duplicate prevention, stale notes and server permissions", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  const login = await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.admin", password },
  });
  expect(login.ok()).toBe(true);
  const remarks =
    "Receiving HCG, SSS, PioneerDAS, Home Therapy\nReceived South West $250 and $1000\nCompleted EASE";
  const created = await context.request.post("/api/action", {
    headers,
    data: {
      action: "person",
      data: {
        kind: "Member",
        memberId: "NOTE-EXTRACTION-FAKE",
        name: "Fictional Support Member",
        remarks,
      },
    },
  });
  expect(created.ok()).toBe(true);
  const person = (await created.json()).result;
  await page.goto("/grants");
  await page
    .getByRole("button", { name: "Extract from member notes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review support found in member notes" }),
  ).toBeVisible();
  const snapshot = await (await context.request.get("/api/data")).json();
  expect(
    snapshot.grants.filter(
      (g: { personId: string }) => g.personId === person.id,
    ),
  ).toHaveLength(0);
  for (const scheme of [
    "HCG",
    "SSS",
    "PioneerDAS",
    "Home Therapy",
    "South West",
    "EASE",
  ])
    await expect(
      page.getByLabel(`Extract ${scheme} for Fictional Support Member`, {
        exact: true,
      }),
    ).toBeChecked();
  await page
    .getByRole("button", { name: "Confirm extraction", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "support records created" }),
  ).toBeVisible();
  const data = await (await context.request.get("/api/data")).json();
  const support = data.grants.filter(
    (g: { personId: string }) => g.personId === person.id,
  );
  expect(support).toHaveLength(6);
  expect(
    data.people.find((p: { id: string }) => p.id === person.id).remarks,
  ).toBe(remarks);
  await page
    .getByRole("button", { name: "Extract from member notes", exact: true })
    .click();
  await expect(
    page.getByLabel("Extract HCG for Fictional Support Member", {
      exact: true,
    }),
  ).toBeDisabled();
  const duplicate = await context.request.post("/api/support-extraction", {
    headers,
    data: {
      action: "commit",
      selections: [
        { personId: person.id, version: person.updatedAt, scheme: "HCG" },
      ],
    },
  });
  expect(await duplicate.json()).toEqual({ created: 0, skipped: 1 });
  const stale = await context.request.post("/api/support-extraction", {
    headers,
    data: {
      action: "commit",
      selections: [{ personId: person.id, version: "stale", scheme: "SSS" }],
    },
  });
  expect(stale.status()).toBe(400);
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.reader", password },
  });
  for (const action of ["preview", "commit"]) {
    const denied = await context.request.post("/api/support-extraction", {
      headers,
      data: { action },
    });
    expect(denied.status()).toBe(403);
  }
});

test("synthetic namespace-prefixed workbook uploads and previews all 18 rows", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.admin", password },
  });
  const path =
    process.env.SYNTHETIC_WORKBOOK ??
    "C:/Users/CHANYULE/Downloads/P3H_Synthetic_Test_Data.xlsx";
  const original = await readFile(path);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/import");
  await page.getByLabel("Excel workbook", { exact: true }).setInputFiles(path);
  await page.getByRole("button", { name: "Parse and preview" }).click();
  await expect(
    page.getByLabel("Action for row 19", { exact: true }),
  ).toBeVisible();
  expect(await page.getByLabel(/^Action for row /).count()).toBe(18);
  expect(await readFile(path)).toEqual(original);
  expect(errors).toEqual([]);
});

test("case assignment, snoozing, scoped search and direct API centre restrictions", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.admin", password },
  });
  const snapshot = await (await context.request.get("/api/data")).json();
  const admin = snapshot.staff.find(
    (s: { username: string }) => s.username === "fake.admin",
  );
  const create = async (action: string, data: Record<string, unknown>) => {
    const r = await context.request.post("/api/action", {
      headers,
      data: { action, data },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return (await r.json()).result;
  };
  const owner = await create("person", {
    kind: "Member",
    memberId: "OWNER-FAKE",
    name: "Fictional Owned Case",
    centre: "Centre A",
    assignedId: admin.id,
    languages: "English",
    interests: "Music",
  });
  const outside = await create("person", {
    kind: "Member",
    memberId: "OUTSIDE-FAKE",
    name: "Fictional Other Centre",
    centre: "Centre B",
  });
  const recipient = await create("person", {
    kind: "Care Recipient",
    name: "Fictional Other Recipient",
    centre: "Centre B",
  });
  const programme = await create("programme", {
    name: "Fictional Restricted Programme",
    centre: "Centre B",
    status: "Active",
    registrationStatus: "Open",
    capacity: "5",
  });
  const grant = await create("grant", {
    personId: outside.id,
    scheme: "HCG",
    status: "Approved",
    applicationDate: today(),
    nextReviewDate: today(),
    assignedId: admin.id,
  });
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const alert = await create("alert", {
    title: "Fictional owned follow-up",
    personId: owner.id,
    type: "Case review",
    dueDate: now,
    priority: "High",
    assignedId: admin.id,
  });
  const otherAlert = await create("alert", {
    title: "Fictional restricted follow-up",
    personId: outside.id,
    type: "Case review",
    dueDate: now,
    priority: "High",
    assignedId: admin.id,
  });
  await page.goto("/my-work");
  await expect(
    page
      .getByRole("link", { name: "Fictional Owned Case", exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/alerts?q=Fictional%20owned%20follow-up");
  const row = page
    .getByRole("row")
    .filter({ hasText: "Fictional owned follow-up" });
  await row.getByRole("button", { name: "Snooze", exact: true }).click();
  await page.getByRole("button", { name: "Next Week", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toContainText("Snoozed");
  await page
    .getByRole("button", { name: "Refresh Alerts", exact: true })
    .click();
  const updated = (
    await (await context.request.get("/api/data")).json()
  ).alerts.find((a: { id: string }) => a.id === alert.id);
  expect(updated.dueDate.slice(0, 10)).toBe(now);
  expect(updated.snoozedUntil.slice(0, 10)).toBe(
    new Date(Date.parse(now) + 7 * 86400000).toISOString().slice(0, 10),
  );
  await page.goto(`/people/${owner.id}`);
  await expect(
    page.getByText("Profile completeness", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fake Administrator", { exact: true }).first(),
  ).toBeVisible();
  const staff = await create("user", {
    username: "scoped.staff",
    name: "Fictional Scoped Staff",
    password,
    role: "Staff",
    allCentres: "Selected centres",
    centres: "Centre A",
  });
  expect(
    (
      await context.request.post("/api/action", {
        headers,
        data: {
          action: "userAccess",
          id: staff.id,
          data: { allCentres: "Selected centres", centres: "Centre A" },
        },
      })
    ).ok(),
  ).toBe(true);
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "scoped.staff", password },
  });
  const scoped = await (await context.request.get("/api/data")).json();
  expect(scoped.people.map((p: { id: string }) => p.id)).toContain(owner.id);
  expect(scoped.people.map((p: { id: string }) => p.id)).not.toContain(
    outside.id,
  );
  expect(scoped.programmes.map((p: { id: string }) => p.id)).not.toContain(
    programme.id,
  );
  expect(scoped.grants.map((g: { id: string }) => g.id)).not.toContain(
    grant.id,
  );
  expect(scoped.alerts.map((a: { id: string }) => a.id)).not.toContain(
    otherAlert.id,
  );
  expect(
    (
      await (
        await context.request.get("/api/search?q=Fictional%20Other")
      ).json()
    ).results,
  ).toEqual([]);
  for (const [action, id, data] of [
    [
      "person",
      outside.id,
      { kind: "Member", memberId: "OUTSIDE-FAKE", centre: "Centre A" },
    ],
    ["archive", outside.id, { type: "person" }],
    ["programme", programme.id, { name: "Changed", centre: "Centre A" }],
    [
      "grant",
      grant.id,
      { personId: owner.id, scheme: "HCG", status: "Approved" },
    ],
    ["alertStatus", otherAlert.id, { status: "Completed" }],
    ["snooze", otherAlert.id, { date: "2099-01-01" }],
    [
      "relationship",
      undefined,
      { memberId: owner.id, recipientId: recipient.id, relationship: "Mother" },
    ],
    [
      "participation",
      undefined,
      { personId: owner.id, programmeId: programme.id, status: "Registered" },
    ],
  ] as const) {
    const denied = await context.request.post("/api/action", {
      headers,
      data: { action, id, data },
    });
    expect(denied.status(), action).toBe(403);
  }
  const extraction = await context.request.post("/api/support-extraction", {
    headers,
    data: {
      action: "commit",
      selections: [
        { personId: outside.id, version: outside.updatedAt, scheme: "HCG" },
      ],
    },
  });
  expect(extraction.status()).toBe(403);
  const preview = await context.request.post("/api/import", {
    headers,
    data: {
      action: "preview",
      filename: "restricted.xlsx",
      mapping: {
        "Member ID": "Member ID",
        "Centre (as client)": "Centre (as client)",
      },
      rawRows: [
        { "Member ID": "OUTSIDE-FAKE", "Centre (as client)": "Centre A" },
      ],
    },
  });
  const previewRow = (await preview.json()).rows[0];
  expect(previewRow.action).toBe("Skip");
  expect(previewRow.existing).toBeUndefined();
  expect(previewRow.errors).toContain(
    "Row is outside your authorised centres.",
  );
  const table = await (
    await context.request.get(
      "/api/people?kind=Member&centre=Centre%20A&size=20",
    )
  ).json();
  expect(table.total).toBe(1);
  expect(table.people[0].id).toBe(owner.id);
  const beyondLastPage = await (
    await context.request.get(
      "/api/people?kind=Member&centre=Centre%20A&size=20&page=9999",
    )
  ).json();
  expect(beyondLastPage.page).toBe(1);
  expect(beyondLastPage.people[0].id).toBe(owner.id);
  const lean = await (
    await context.request.get("/api/data?section=members")
  ).json();
  expect(lean.people).toEqual([]);
  expect(lean.grants).toEqual([]);
  await page.goto(`/people/${outside.id}`);
  await expect(
    page.getByText("Record not found.", { exact: false }),
  ).toBeVisible();
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.admin", password },
  });
  await page.goto("/import");
  await expect(
    page.getByRole("heading", { name: "Import history", exact: true }),
  ).toBeVisible();
  expect(
    (await (await context.request.get("/api/import-history")).json()).batches
      .length,
  ).toBeGreaterThan(0);
});

test("bulk import review, field decisions and audited import history", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.admin", password },
  });
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Members");
  sheet.addRow([
    "Member ID",
    "Centre (as client)",
    "Language spoken / understood",
    "Interest",
  ]);
  sheet.addRow([
    "OWNER-FAKE",
    "Replacement Centre",
    "English, Mandarin",
    "Walking; Music",
  ]);
  sheet.addRow(["BULK-FAKE-A", "Centre A", "English", "Music"]);
  sheet.addRow(["", "Centre A", "English", "Music"]);
  sheet.addRow(["BULK-DUP", "Centre A"]);
  sheet.addRow(["BULK-DUP", "Centre A"]);
  await page.goto("/import");
  await page.getByLabel("Excel workbook", { exact: true }).setInputFiles({
    name: "fictional-bulk.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  await page
    .getByRole("button", { name: "Parse and preview", exact: true })
    .click();
  await page.getByRole("button", { name: /^Errors \d+$/ }).click();
  await expect(page.getByLabel(/^Action for row /)).toHaveCount(3);
  await page.getByRole("button", { name: /^All \d+$/ }).click();
  await page
    .getByRole("button", { name: "Import all valid new records", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip all errors", exact: true })
    .click();
  await expect(
    page.getByLabel("Action for row 3", { exact: true }),
  ).toHaveValue("Import");
  const existing = page.getByRole("row").filter({ hasText: "OWNER-FAKE" });
  await existing.getByText("Compare changed fields", { exact: true }).click();
  const centre = existing
    .locator(".comparison tbody tr")
    .filter({ hasText: "Replacement Centre" });
  await centre
    .getByRole("button", { name: "Keep Current", exact: true })
    .click();
  await expect(centre).toContainText("Reviewed: Centre A");
  await page.getByLabel("Select row 2", { exact: true }).check();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Update selected existing records",
      exact: true,
    })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import saved", exact: true }),
  ).toBeVisible();
  const snapshot = await (await context.request.get("/api/data")).json();
  const owner = snapshot.people.find(
    (p: { memberId: string }) => p.memberId === "OWNER-FAKE",
  );
  expect(owner.centre).toBe("Centre A");
  expect(
    owner.languages
      .map((l: { language: { name: string } }) => l.language.name)
      .sort(),
  ).toEqual(["English", "Mandarin"]);
  const batches = (
    await (await context.request.get("/api/import-history")).json()
  ).batches;
  const batch = batches.find(
    (b: { filename: string }) => b.filename === "fictional-bulk.xlsx",
  );
  expect(batch.createdCount).toBe(1);
  expect(batch.updatedCount).toBe(1);
  expect(batch.skippedCount).toBe(3);
  expect(batch.errorCount).toBe(3);
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "fictional-bulk.xlsx" })
    .getByRole("button", { name: "Inspect import", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("OWNER-FAKE", { exact: true }),
  ).toBeVisible();
});

test("unsaved edits stay open on cancelled discard and search supports keyboard navigation", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.admin", password },
  });
  await page.goto("/members?q=OWNER-FAKE");
  const row = page.getByRole("row").filter({ hasText: "OWNER-FAKE" });
  await row.locator(".action-menu summary").click();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Discard this fictional edit");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toContainText("Fictional Owned Case");
  await page.getByLabel("Global search", { exact: true }).fill("OWNER-FAKE");
  await expect(
    page.getByRole("option", { name: /Fictional Owned Case/ }),
  ).toBeVisible();
  await page.getByLabel("Global search", { exact: true }).press("ArrowDown");
  await page.getByLabel("Global search", { exact: true }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Fictional Owned Case", exact: true }),
  ).toBeVisible();
});

test("restricted manager and read-only accounts have scoped server access", async ({
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  await context.request.post("/api/auth", {
    headers,
    data: { action: "login", username: "fake.admin", password },
  });
  for (const [username, role] of [
    ["scoped.manager", "Manager"],
    ["scoped.reader", "Read Only"],
  ]) {
    const created = await context.request.post("/api/action", {
      headers,
      data: {
        action: "user",
        data: {
          username,
          name: `Fictional ${role}`,
          password,
          role,
          allCentres: "Selected centres",
          centres: "Centre A",
        },
      },
    });
    expect(created.ok()).toBe(true);
  }
  const adminData = await (await context.request.get("/api/data")).json();
  const outside = adminData.people.find(
    (p: { memberId: string }) => p.memberId === "OUTSIDE-FAKE",
  );
  for (const username of ["scoped.manager", "scoped.reader"]) {
    await context.request.post("/api/auth", {
      headers,
      data: { action: "login", username, password },
    });
    const data = await (await context.request.get("/api/data")).json();
    expect(
      data.people.every((p: { centre: string }) => p.centre === "Centre A"),
    ).toBe(true);
    expect(data.people.length).toBeGreaterThan(0);
    if (username === "scoped.manager") {
      expect(data.audit.length).toBeGreaterThan(0);
      expect(
        data.audit.some((a: { entityId: string }) => a.entityId === outside.id),
      ).toBe(false);
    } else expect(data.audit).toEqual([]);
    const denied = await context.request.post("/api/action", {
      headers,
      data: { action: "archive", id: outside.id, data: { type: "person" } },
    });
    expect(denied.status()).toBe(403);
    const adminOnly = await context.request.post("/api/action", {
      headers,
      data: {
        action: "userAccess",
        id: outside.id,
        data: { allCentres: "All centres", centres: "" },
      },
    });
    expect(adminOnly.status()).toBe(403);
  }
});

test("signing out allows the same account to sign back in repeatedly", async ({
  page,
  context,
}) => {
  const login = await context.request.post("/api/auth", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { action: "login", username: "fake.admin", password },
  });
  // This scenario runs after the existing setup workflow below.
  expect(login.ok()).toBe(true);
  await page.goto("/dashboard");
  for (let repeat = 0; repeat < 2; repeat++) {
    await expect(
      page.getByRole("heading", { name: "P3H Dashboard", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Use your account username, which may differ from your display name.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Use your account password. The setup token is only for creating the first administrator.",
      ),
    ).toBeVisible();
    expect(
      (await (await context.request.get("/api/auth")).json()).user,
    ).toBeNull();
    await page.getByLabel("Username", { exact: true }).fill("fake.admin");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "P3H Dashboard", exact: true }),
  ).toBeVisible();
});

test("automatic referral workflow, manual date review, resolution, history and notification security", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  expect(
    (
      await context.request.post("/api/auth", {
        headers,
        data: { action: "login", username: "fake.admin", password },
      })
    ).ok(),
  ).toBe(true);
  const auth = await (await context.request.get("/api/auth")).json();
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "Add Grant/Referral", exact: true })
    .click();
  const data = await (await context.request.get("/api/data")).json();
  const person = data.people.find(
    (p: { memberId: string }) => p.memberId === "E2E-001",
  );
  await page.getByLabel("Person", { exact: true }).selectOption(person.id);
  await page.getByLabel("Scheme name", { exact: true }).fill("HPC+ referral");
  await page
    .getByLabel("Application date", { exact: true })
    .fill(addDays(today(), -7));
  await expect(
    page.getByLabel("Next review date", { exact: true }),
  ).toHaveValue(today());
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Weekly referral rule",
  );
  await page
    .getByLabel("Assigned staff", { exact: true })
    .selectOption(auth.user.id);
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/alerts");
  const row = page
    .getByRole("row")
    .filter({ hasText: "HPC+ referral: Grant review" });
  await row
    .getByRole("button", { name: "Mark Follow-up Done", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    addDays(today(), 7),
  );
  await page
    .getByLabel("Outcome", { exact: true })
    .selectOption("Pending Response");
  await page.getByLabel("Notes (optional)").fill("Fictional follow-up outcome");
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await expect(row).toContainText(addDays(today(), 7));
  await row
    .getByRole("button", { name: "Mark Follow-up Done", exact: true })
    .click();
  await page.getByLabel("Resolution", { exact: true }).selectOption("Resolved");
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  const refreshed = await (await context.request.get("/api/data")).json();
  const grant = refreshed.grants.find(
    (g: { scheme: { name: string } }) => g.scheme.name === "HPC+ referral",
  );
  expect(grant.followUps).toHaveLength(2);
  expect(grant.resolvedAt).toBeTruthy();
  await page.goto(`/people/${person.id}`);
  await page
    .getByRole("button", { name: "Follow-up History", exact: true })
    .click();
  await expect(
    page.getByText("Fictional follow-up outcome", { exact: true }),
  ).toBeVisible();
  await page.goto("/grants");
  await page
    .getByRole("row")
    .filter({ hasText: "HPC+ referral" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Follow-up resolution").selectOption("Open");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await context.request.get("/api/data")).json()).alerts.filter(
      (a: { grantId: string; status: string }) =>
        a.grantId === grant.id && a.status === "Pending",
    ),
  ).toHaveLength(1);
  const create = await context.request.post("/api/action", {
    headers,
    data: {
      action: "grant",
      data: {
        personId: person.id,
        scheme: "South West CDC $1,000",
        status: "Submitted",
        applicationDate: "2026-11-05",
        assignedId: auth.user.id,
      },
    },
  });
  expect(create.ok()).toBe(true);
  const south = (await create.json()).result;
  expect(south.nextReviewDate.slice(0, 10)).toBe(
    calculateFollowUp("South West CDC", "2026-11-05").date,
  );
  expect(
    (await (await context.request.get("/api/data")).json()).alerts.some(
      (a: { grantId: string; status: string }) =>
        a.grantId === south.id && a.status === "Pending",
    ),
  ).toBe(true);
  const changed = await context.request.post("/api/action", {
    headers,
    data: {
      action: "grant",
      id: south.id,
      data: { submissionDate: "2026-11-07" },
    },
  });
  expect(changed.ok()).toBe(true);
  const changedGrant = (await changed.json()).result;
  expect(changedGrant.nextReviewDate.slice(0, 10)).toBe("2027-01-07");
  expect(changedGrant.applicationDate.slice(0, 10)).toBe("2026-11-05");
  const override = await context.request.post("/api/action", {
    headers,
    data: {
      action: "grant",
      id: south.id,
      data: {
        nextReviewDate: "2027-02-02",
        overrideReason: "Fictional staff decision",
      },
    },
  });
  expect(override.ok()).toBe(true);
  expect((await override.json()).result.overrideReason).toBe(
    "Fictional staff decision",
  );
  const amount = await context.request.post("/api/action", {
    headers,
    data: { action: "grant", id: south.id, data: { amount: "250" } },
  });
  expect(amount.ok()).toBe(true);
  expect((await amount.json()).result.nextReviewDate.slice(0, 10)).toBe(
    "2027-02-02",
  );
  const missing = await context.request.post("/api/action", {
    headers,
    data: {
      action: "grant",
      data: {
        personId: person.id,
        scheme: "CHAS renewal",
        status: "Submitted",
      },
    },
  });
  expect(missing.status()).toBe(400);
  const unauth = await context.request.post("/api/jobs/notifications");
  expect(unauth.status()).toBe(401);
  const disabled = await context.request.post("/api/jobs/notifications", {
    headers: {
      Authorization:
        "Bearer fictional-notification-job-token-at-least-32-characters",
    },
  });
  expect(disabled.ok()).toBe(true);
  expect((await disabled.json()).configured).toBe(false);
  await page.goto("/settings");
  await expect(
    page.getByText("Email notifications are not configured.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send Test Email", exact: true }),
  ).toBeDisabled();
  await context.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  expect((await context.request.get("/api/notifications")).status()).toBe(401);
  for (const username of ["scoped.staff", "scoped.manager", "scoped.reader"]) {
    await context.request.post("/api/auth", {
      headers,
      data: { action: "login", username, password },
    });
    expect((await context.request.get("/api/notifications")).status()).toBe(
      403,
    );
  }
});

test("dashboard and follow-up dialogs fit desktop, tablet and phone screens", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  expect(
    (
      await context.request.post("/api/auth", {
        headers,
        data: { action: "login", username: "fake.admin", password },
      })
    ).ok(),
  ).toBe(true);
  for (const width of [1440, 1024, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "P3H Dashboard", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "My Tasks Today", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/upgrade-dashboard-${width}.png`,
      fullPage: true,
    });
    const complete = page
      .getByRole("button", { name: "Mark Follow-up Done", exact: true })
      .first();
    await expect(complete).toBeVisible();
    await complete.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width - 20);
    expect(bounds!.height).toBeLessThanOrEqual(900 - 32);
    await page.getByLabel("Outcome", { exact: true }).selectOption("Other");
    await page.getByLabel("Notes (optional)").fill("Fictional tablet review");
    await page.screenshot({
      path: `test-results/upgrade-follow-up-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});
