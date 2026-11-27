import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const path = resolve("data", `checkin-${randomUUID()}.db`),
  url = `file:${path.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = url;
process.env.APP_ORIGIN = "https://p3h.example.test";
new DatabaseSync(path).close();
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const { db } = await import("../src/lib/db");
const { refreshAlerts } = await import("../src/lib/alerts");
const {
  lastContactDate,
  checkInDueDate,
  isCheckInDue,
  recordCheckIn,
  completeCheckInAlert,
} = await import("../src/lib/checkin");
const { completeFollowUp } = await import("../src/lib/follow-up-service");
const { dueItems } = await import("../src/lib/notifications");
const { today } = await import("../src/lib/domain");
const { addDays } = await import("../src/lib/follow-up");
after(() => db.$disconnect());
const date = today();
const u = await db.user.create({
  data: {
    username: "fictional.checkin-owner",
    name: "Fictional Check-in Owner",
    passwordHash: "test-only",
    email: "fictional-checkin@example.test",
    emailNotifications: true,
    allCentres: false,
    allowedCentres: { create: { centre: "Centre A" } },
  },
  include: { allowedCentres: true },
});
const makeMember = async (
  memberId: string,
  data: Record<string, unknown> = {},
) =>
  db.person.create({
    data: {
      kind: "Member",
      memberId,
      name: `Fictional ${memberId}`,
      centre: "Centre A",
      assignedId: u.id,
      ...data,
    },
  });
const checkins = (personId: string, status = "Pending") =>
  db.alert.findMany({
    where: { personId, type: "Monthly check-in", status },
  });
test("due at exactly 30 days, not due at 29 days", async () => {
  assert.equal(checkInDueDate("2026-10-28"), "2026-11-27");
  assert.equal(isCheckInDue("2026-10-28", "2026-11-27"), true);
  assert.equal(isCheckInDue("2026-10-28", "2026-11-26"), false);
  assert.equal(isCheckInDue("2026-10-29", "2026-11-27"), false);
  assert.equal(
    lastContactDate({
      onboardingDate: "2026-01-15",
      createdAt: "2026-01-01",
    }),
    "2026-01-15",
  );
  assert.equal(
    lastContactDate({
      lastContactedAt: "2026-03-01",
      onboardingDate: "2026-01-15",
      createdAt: "2026-01-01",
    }),
    "2026-03-01",
  );
  assert.equal(
    lastContactDate(
      {
        lastContactedAt: "2026-03-01",
        onboardingDate: "2026-01-15",
        createdAt: "2026-01-01",
      },
      ["2026-04-01"],
    ),
    "2026-04-01",
  );
  assert.equal(
    lastContactDate({ createdAt: "2026-02-01" }),
    "2026-02-01",
  );
  const due = await makeMember("CHECKIN-DUE", {
    onboardingDate: new Date(addDays(date, -30)),
  });
  const notDue = await makeMember("CHECKIN-NOT-DUE", {
    onboardingDate: new Date(addDays(date, -29)),
  });
  await refreshAlerts();
  const [alert] = await checkins(due.id);
  assert.ok(alert);
  assert.equal(alert.dueDate.toISOString().slice(0, 10), date);
  assert.equal(alert.sourceKey, `checkin:${due.id}:${date}`);
  assert.equal(alert.priority, "Normal");
  assert.deepEqual(await checkins(notDue.id), []);
});
test("no duplicate alert on repeated reconcile", async () => {
  const p = await makeMember("CHECKIN-DEDUP", {
    onboardingDate: new Date(addDays(date, -40)),
  });
  await refreshAlerts();
  await refreshAlerts();
  await refreshAlerts();
  assert.equal((await checkins(p.id)).length, 1);
});
test("a completed grant follow-up counts as contact", async () => {
  const p = await makeMember("CHECKIN-GRANT", {
    onboardingDate: new Date(addDays(date, -60)),
  });
  await refreshAlerts();
  assert.equal((await checkins(p.id)).length, 1);
  const scheme = await db.supportScheme.create({
    data: { name: "Fictional check-in scheme" },
  });
  const g = await db.grantApplication.create({
    data: {
      personId: p.id,
      schemeId: scheme.id,
      status: "Submitted",
      applicationDate: new Date(addDays(date, -14)),
      nextReviewDate: new Date(addDays(date, -7)),
      assignedId: u.id,
    },
  });
  await refreshAlerts();
  const review = await db.alert.findFirstOrThrow({
    where: { grantId: g.id, type: "Grant review", status: "Pending" },
  });
  await db.$transaction((tx) =>
    completeFollowUp(tx, u, review.id, {
      completedAt: date,
      outcome: "Contacted",
      notes: "Fictional grant call",
    }),
  );
  assert.deepEqual(await checkins(p.id), []);
  await refreshAlerts();
  assert.deepEqual(await checkins(p.id), []);
});
test("recording a check-in resets the 30-day clock", async () => {
  const p = await makeMember("CHECKIN-RECORD", {
    onboardingDate: new Date(addDays(date, -90)),
  });
  await refreshAlerts();
  const [alert] = await checkins(p.id);
  assert.ok(alert);
  assert.equal(alert.priority, "High");
  await db.$transaction((tx) =>
    recordCheckIn(tx, u, p.id, { date, notes: "Fictional call" }),
  );
  const updated = await db.person.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(updated.lastContactedAt?.toISOString().slice(0, 10), date);
  const done = await db.alert.findUniqueOrThrow({ where: { id: alert.id } });
  assert.equal(done.status, "Completed");
  assert.equal(done.sourceKey, `${alert.sourceKey}:completed:${alert.id}`);
  assert.equal(done.activeFollowUpKey, null);
  assert.equal(
    await db.auditLog.count({
      where: { entityId: p.id, action: "Check-in recorded" },
    }),
    1,
  );
  await refreshAlerts();
  await refreshAlerts();
  assert.deepEqual(await checkins(p.id), []);
  assert.equal((await checkins(p.id, "Completed")).length, 1);
});
test("inactive and archived caregivers are excluded, and stale reminders auto-dismiss", async () => {
  const inactive = await makeMember("CHECKIN-INACTIVE", {
    onboardingDate: new Date(addDays(date, -90)),
    status: "Inactive",
  });
  const archived = await makeMember("CHECKIN-ARCHIVED", {
    onboardingDate: new Date(addDays(date, -90)),
    status: "Archived",
  });
  const p = await makeMember("CHECKIN-STALE", {
    onboardingDate: new Date(addDays(date, -90)),
  });
  await refreshAlerts();
  assert.deepEqual(await checkins(inactive.id), []);
  assert.deepEqual(await checkins(archived.id), []);
  const [alert] = await checkins(p.id);
  assert.ok(alert);
  await db.person.update({
    where: { id: p.id },
    data: { status: "Inactive" },
  });
  await refreshAlerts();
  assert.deepEqual(await checkins(p.id), []);
  const dismissed = await db.alert.findUniqueOrThrow({
    where: { id: alert.id },
  });
  assert.equal(dismissed.status, "Dismissed");
  assert.equal(dismissed.autoDismissed, true);
});
test("completing via the alert records contact, and future dates are rejected", async () => {
  const p = await makeMember("CHECKIN-ALERT", {
    onboardingDate: new Date(addDays(date, -90)),
  });
  await refreshAlerts();
  const [alert] = await checkins(p.id);
  assert.ok(alert);
  await db.$transaction((tx) => completeCheckInAlert(tx, u, alert));
  const updated = await db.person.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(updated.lastContactedAt?.toISOString().slice(0, 10), date);
  assert.equal(
    (await db.alert.findUniqueOrThrow({ where: { id: alert.id } })).status,
    "Completed",
  );
  await refreshAlerts();
  assert.deepEqual(await checkins(p.id), []);
  await assert.rejects(
    db.$transaction((tx) =>
      recordCheckIn(tx, u, p.id, { date: addDays(date, 1), notes: "" }),
    ),
    /no later than today/,
  );
});
test("due check-ins flow into the dashboard and email digest like other tasks", async () => {
  const p = await makeMember("CHECKIN-DIGEST", {
    onboardingDate: new Date(addDays(date, -40)),
  });
  await refreshAlerts();
  const due = await dueItems(u.id, date);
  assert.ok(due?.items.some((a) => a.personId === p.id));
  const { dashboardData } = await import("../src/lib/dashboard");
  const dashboard = await dashboardData(u);
  assert.ok(
    dashboard.alerts.some(
      (a) => a.type === "Monthly check-in" && a.personId === p.id,
    ),
  );
  assert.ok((dashboard.dashboardSummary.totals?.outstanding ?? 0) >= 1);
});
