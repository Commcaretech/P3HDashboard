import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const path = resolve("data", `automation-${randomUUID()}.db`),
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
const { completeFollowUp } = await import("../src/lib/follow-up-service");
const { sendDigest, dueItems, runNotifications } =
  await import("../src/lib/notifications");
const { mockSender, productionSender } = await import("../src/lib/email");
const { savePerson } = await import("../src/lib/records");
const { today } = await import("../src/lib/domain");
const { addDays } = await import("../src/lib/follow-up");
after(() => db.$disconnect());
const date = today();
const u = await db.user.create({
  data: {
    username: "fictional.owner",
    name: "Fictional Owner",
    passwordHash: "test-only",
    email: "fictional@example.test",
    emailNotifications: true,
    allCentres: false,
    allowedCentres: { create: { centre: "Centre A" } },
  },
  include: { allowedCentres: true },
});
const p = await db.person.create({
  data: {
    kind: "Member",
    memberId: "FAKE-AUTO",
    name: "Fictional Person",
    dob: new Date(`1950-${date.slice(5)}`),
    centre: "Centre A",
    assignedId: u.id,
    remarks: "Keep these notes",
  },
});
const scheme = await db.supportScheme.create({
  data: { name: "HPC+ referral" },
});
const g = await db.grantApplication.create({
  data: {
    personId: p.id,
    schemeId: scheme.id,
    status: "Approved",
    applicationDate: new Date(addDays(date, -14)),
    nextReviewDate: new Date(addDays(date, -7)),
    followUpDays: 7,
    recurring: true,
    assignedId: u.id,
  },
});
test("partial person edits preserve all omitted data and relationships", async () => {
  const condition = await db.medicalCondition.create({
    data: { name: "Fictional condition note" },
  });
  await db.personCondition.create({
    data: {
      personId: p.id,
      conditionId: condition.id,
      notes: "Preserve fictional clinical context",
    },
  });
  await db.$transaction((tx) =>
    savePerson(tx, u.id, { name: "Updated fictional name" }, p.id),
  );
  const updated = await db.person.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(updated.remarks, "Keep these notes");
  assert.equal(
    (
      await db.personCondition.findUniqueOrThrow({
        where: {
          personId_conditionId: { personId: p.id, conditionId: condition.id },
        },
      })
    ).notes,
    "Preserve fictional clinical context",
  );
  assert.equal(updated.memberId, p.memberId);
  assert.equal(updated.dob?.toISOString(), p.dob?.toISOString());
  assert.equal(
    await db.grantApplication.count({ where: { personId: p.id } }),
    1,
  );
});
test("automatic reminders preserve snooze, reschedule changes, retain history, recur and resolve", async () => {
  await refreshAlerts();
  await refreshAlerts();
  let a = await db.alert.findFirstOrThrow({
    where: { grantId: g.id, status: "Pending" },
  });
  assert.equal(
    await db.alert.count({ where: { grantId: g.id, status: "Pending" } }),
    1,
  );
  await db.alert.update({
    where: { id: a.id },
    data: { snoozedUntil: new Date(addDays(date, 1)) },
  });
  await refreshAlerts();
  assert.ok(
    (await db.alert.findUniqueOrThrow({ where: { id: a.id } })).snoozedUntil,
  );
  await db.grantApplication.update({
    where: { id: g.id },
    data: { nextReviewDate: new Date(addDays(date, -1)) },
  });
  await refreshAlerts();
  a = await db.alert.findFirstOrThrow({
    where: { grantId: g.id, status: "Pending" },
  });
  assert.equal(a.snoozedUntil, null);
  const result = await db.$transaction((tx) =>
    completeFollowUp(tx, u, a.id, {
      completedAt: date,
      outcome: "Pending Response",
      notes: "Fictional note",
    }),
  );
  assert.equal(result.nextDate?.toISOString().slice(0, 10), addDays(date, 7));
  await db.$transaction((tx) =>
    completeFollowUp(tx, u, a.id, {
      completedAt: date,
      outcome: "Pending Response",
    }),
  );
  assert.equal(await db.followUp.count({ where: { grantId: g.id } }), 1);
  const next = await db.alert.findFirstOrThrow({
    where: { grantId: g.id, status: "Pending" },
  });
  await db.$transaction((tx) =>
    completeFollowUp(tx, u, next.id, {
      completedAt: date,
      outcome: "Approved",
      resolution: "Resolved",
    }),
  );
  await refreshAlerts();
  assert.equal(
    await db.alert.count({ where: { grantId: g.id, status: "Pending" } }),
    0,
  );
  assert.equal(
    await db.alert.count({ where: { grantId: g.id, status: "Completed" } }),
    2,
  );
  const custom = await db.alert.create({
    data: {
      title: "Unrelated",
      type: "Custom reminder",
      sourceKey: "custom:keep",
      dueDate: new Date(date),
    },
  });
  await refreshAlerts();
  assert.equal(
    (await db.alert.findUniqueOrThrow({ where: { id: custom.id } })).status,
    "Pending",
  );
});
test("digest is minimal, assigned, centre scoped, concurrent and duplicate runs send once", async () => {
  const messages: import("../src/lib/email").EmailMessage[] = [];
  const sender = mockSender(messages);
  const outside = await db.person.create({
    data: { kind: "Member", centre: "Centre B", assignedId: u.id },
  });
  await db.alert.create({
    data: {
      title: "Sensitive outside case",
      type: "Case review",
      personId: outside.id,
      assignedId: u.id,
      dueDate: new Date(date),
    },
  });
  const eligible = await dueItems(u.id, date);
  assert.ok(eligible);
  assert.equal(
    eligible.items.some((a) => a.personId === outside.id),
    false,
  );
  await Promise.all([
    sendDigest(u.id, date, sender),
    sendDigest(u.id, date, sender),
  ]);
  await sendDigest(u.id, date, sender);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, u.email);
  assert.equal(messages[0].text.includes("Fictional"), false);
  assert.equal(messages[0].text.includes("1950"), false);
  assert.equal(
    await db.notificationDelivery.count({
      where: { userId: u.id, type: "Daily digest" },
    }),
    1,
  );
  assert.equal(
    (await db.notificationDelivery.findFirstOrThrow()).status,
    "Mock accepted",
  );
});
test("inactive, invalid, missing email, disabled preferences and revoked access prevent notifications", async () => {
  for (const data of [
    { active: false },
    { email: null },
    { email: "invalid" },
    { emailNotifications: false },
  ]) {
    await db.user.update({ where: { id: u.id }, data });
    assert.equal(await dueItems(u.id, date), null);
    await db.user.update({
      where: { id: u.id },
      data: {
        active: true,
        email: "fictional@example.test",
        emailNotifications: true,
      },
    });
  }
  await db.userCentre.deleteMany({ where: { userId: u.id } });
  assert.equal((await dueItems(u.id, date))?.items.length, 0);
  await db.userCentre.create({ data: { userId: u.id, centre: "Centre A" } });
  const other = await db.user.create({
    data: {
      username: "new.owner",
      name: "New Owner",
      passwordHash: "test",
      email: "new@example.test",
      emailNotifications: true,
    },
  });
  await db.person.update({
    where: { id: p.id },
    data: { assignedId: other.id },
  });
  await refreshAlerts();
  assert.equal(
    (await dueItems(u.id, date))?.items.some((a) => a.type === "Birthday"),
    false,
  );
  await db.person.update({ where: { id: p.id }, data: { assignedId: u.id } });
  await refreshAlerts();
});
test("provider failure is logged, bounded retries retain in-app alerts, disabled config never sends", async () => {
  await db.notificationDelivery.deleteMany();
  let attempts = 0;
  const sender = {
    async send() {
      attempts++;
      throw new Error("secret provider details must not persist");
    },
  };
  assert.equal(await sendDigest(u.id, date, sender), "Failed");
  let row = await db.notificationDelivery.findFirstOrThrow();
  assert.equal(row.failureReason?.includes("secret"), false);
  assert.equal(
    await sendDigest(u.id, date, sender),
    "Busy or waiting for retry",
  );
  for (let i = 0; i < 3; i++) {
    await db.notificationDelivery.update({
      where: { id: row.id },
      data: { lastAttempt: new Date(Date.now() - 120000) },
    });
    await sendDigest(u.id, date, sender);
  }
  row = await db.notificationDelivery.findFirstOrThrow();
  assert.equal(attempts, 3);
  assert.equal(row.attempts, 3);
  assert.ok(
    await db.alert.count({ where: { status: "Pending", personId: p.id } }),
  );
  process.env.EMAIL_ENABLED = "false";
  assert.equal(productionSender(), null);
  assert.equal((await runNotifications(null)).configured, false);
});
test("care recipient birthday opt-in, archived records, completed birthdays stay completed", async () => {
  const cr = await db.person.create({
    data: {
      kind: "Care Recipient",
      name: "Fictional recipient",
      centre: "Centre A",
      assignedId: u.id,
      dob: new Date(`1940-${date.slice(5)}`),
    },
  });
  await refreshAlerts();
  assert.equal(await db.alert.count({ where: { personId: cr.id } }), 0);
  await db.user.update({
    where: { id: u.id },
    data: { recipientBirthdays: true },
  });
  await refreshAlerts();
  assert.equal(
    await db.alert.count({ where: { personId: cr.id, status: "Pending" } }),
    1,
  );
  await db.person.update({
    where: { id: cr.id },
    data: { status: "Archived" },
  });
  await refreshAlerts();
  assert.equal(
    await db.alert.count({ where: { personId: cr.id, status: "Pending" } }),
    0,
  );
  const b = await db.alert.findFirstOrThrow({
    where: { personId: p.id, type: "Birthday" },
  });
  await db.alert.update({ where: { id: b.id }, data: { status: "Completed" } });
  await refreshAlerts();
  assert.equal(
    (await db.alert.findUniqueOrThrow({ where: { id: b.id } })).status,
    "Completed",
  );
});

test("birthday email stages use exactly seven days and the birthday, including completed task history", async () => {
  const seven = addDays(date, 7),
    tomorrow = addDays(date, 1);
  const upcoming = await db.person.create({
    data: {
      kind: "Member",
      memberId: "SEVEN-DAYS-FAKE",
      name: "Fictional Upcoming",
      centre: "Centre A",
      assignedId: u.id,
      dob: new Date(`1950-${seven.slice(5)}`),
    },
  });
  const nextDay = await db.person.create({
    data: {
      kind: "Member",
      memberId: "ONE-DAY-FAKE",
      name: "Fictional Tomorrow",
      centre: "Centre A",
      assignedId: u.id,
      dob: new Date(`1950-${tomorrow.slice(5)}`),
    },
  });
  await refreshAlerts();
  let due = await dueItems(u.id, date);
  assert.ok(due?.items.some((a) => a.personId === upcoming.id));
  assert.equal(
    due?.items.some((a) => a.personId === nextDay.id),
    false,
  );
  const a = await db.alert.findFirstOrThrow({
    where: { personId: upcoming.id, type: "Birthday" },
  });
  await db.alert.update({ where: { id: a.id }, data: { status: "Completed" } });
  due = await dueItems(u.id, seven);
  assert.ok(due?.items.some((a) => a.personId === upcoming.id));
  await db.person.update({
    where: { id: upcoming.id },
    data: { dob: new Date(`1950-${addDays(seven, 1).slice(5)}`) },
  });
  await refreshAlerts();
  due = await dueItems(u.id, seven);
  assert.equal(
    due?.items.some((a) => a.personId === upcoming.id),
    false,
  );
});

test("dashboard summaries scope conditions and omit full clinical/import relations", async () => {
  const { dashboardData } = await import("../src/lib/dashboard");
  const outside = await db.person.create({
    data: {
      kind: "Care Recipient",
      name: "Fictional outside",
      centre: "Centre B",
    },
  });
  const inside = await db.person.create({
    data: {
      kind: "Care Recipient",
      name: "Fictional inside",
      centre: "Centre A",
    },
  });
  const a = await db.medicalCondition.create({
      data: { name: "Fictional permitted condition" },
    }),
    b = await db.medicalCondition.create({
      data: { name: "Fictional restricted condition" },
    });
  await db.personCondition.createMany({
    data: [
      { personId: inside.id, conditionId: a.id },
      { personId: outside.id, conditionId: b.id },
    ],
  });
  await db.careRelationship.createMany({
    data: [inside.id, outside.id].map((recipientId) => ({
      memberId: p.id,
      recipientId,
      relationship: "Family",
    })),
  });
  const result = await dashboardData(u).finally(() =>
    db.careRelationship.deleteMany({
      where: { memberId: p.id, recipientId: { in: [inside.id, outside.id] } },
    }),
  );
  assert.equal(result.dashboardSummary.centreContext, "Centre A");
  assert.equal(result.dashboardSummary.totals.linkedRecipients, 1);
  assert.ok(result.people.every((p) => p.centre === "Centre A"));
  assert.deepEqual(result.dashboardSummary.conditions, [
    { name: a.name, count: 1 },
  ]);
  assert.equal(
    result.people.some((p) => p.id === outside.id),
    false,
  );
  assert.equal("rawImport" in result.people[0], false);
  assert.deepEqual(result.people[0].assessments, []);
});

test("future review tasks appear immediately; resolving and reopening preserve reminder notes and completed history", async () => {
  const future = await db.grantApplication.create({
    data: {
      personId: p.id,
      schemeId: scheme.id,
      status: "Submitted",
      applicationDate: new Date(date),
      nextReviewDate: new Date(addDays(date, 60)),
      assignedId: u.id,
    },
  });
  await refreshAlerts();
  const task = await db.alert.findFirstOrThrow({
    where: { grantId: future.id, status: "Pending" },
  });
  await db.alert.update({
    where: { id: task.id },
    data: { notes: "Preserve staff task notes" },
  });
  await db.grantApplication.update({
    where: { id: future.id },
    data: { resolvedAt: new Date(date) },
  });
  await refreshAlerts();
  assert.equal(
    (await db.alert.findUniqueOrThrow({ where: { id: task.id } })).notes,
    "Preserve staff task notes",
  );
  await db.grantApplication.update({
    where: { id: future.id },
    data: { resolvedAt: null },
  });
  await refreshAlerts();
  assert.equal(
    (await db.alert.findUniqueOrThrow({ where: { id: task.id } })).status,
    "Pending",
  );
  const history = await db.$transaction((tx) =>
    completeFollowUp(tx, u, task.id, {
      completedAt: date,
      outcome: "Approved",
      resolution: "Resolved",
    }),
  );
  const replay = await db.$transaction((tx) =>
    completeFollowUp(tx, u, task.id, {
      completedAt: date,
      outcome: "Approved",
      resolution: "Resolved",
    }),
  );
  assert.equal(replay.id, history.id);
  assert.equal(await db.followUp.count({ where: { grantId: future.id } }), 1);
});

test("concurrent complete scheduled jobs reconcile once and send a single digest per recipient", async () => {
  const owner = await db.user.create({
    data: {
      username: "concurrent.owner",
      name: "Fictional Concurrent Owner",
      passwordHash: "test-only",
      email: "concurrent@example.test",
      emailNotifications: true,
    },
  });
  await db.person.create({
    data: {
      kind: "Member",
      memberId: "CONCURRENT-FAKE",
      name: "Fictional Concurrent Birthday",
      centre: "Centre A",
      assignedId: owner.id,
      dob: new Date(`1940-${date.slice(5)}`),
    },
  });
  const messages: import("../src/lib/email").EmailMessage[] = [];
  const sender = mockSender(messages);
  await Promise.all([runNotifications(sender), runNotifications(sender)]);
  assert.equal(messages.filter((m) => m.to === owner.email).length, 1);
  assert.equal(
    await db.notificationDelivery.count({ where: { userId: owner.id } }),
    1,
  );
});

test("changed application dates preserve legacy completed reminders while moving the outstanding cycle", async () => {
  const oldDate = addDays(date, 60),
    newDate = addDays(date, 61);
  const grant = await db.grantApplication.create({
    data: {
      personId: p.id,
      schemeId: scheme.id,
      status: "Submitted",
      nextReviewDate: new Date(newDate),
    },
  });
  const original = await db.alert.create({
    data: {
      grantId: grant.id,
      personId: p.id,
      title: "Fictional historical review",
      type: "Grant review",
      dueDate: new Date(oldDate),
      sourceKey: `grant:${grant.id}:Grant review:${oldDate}`,
      status: "Completed",
      notes: "Historical completion must remain",
    },
  });
  await refreshAlerts();
  const pending = await db.alert.findFirstOrThrow({
    where: { grantId: grant.id, status: "Pending" },
  });
  await db.grantApplication.update({
    where: { id: grant.id },
    data: { nextReviewDate: new Date(oldDate) },
  });
  await refreshAlerts();
  const historical = await db.alert.findUniqueOrThrow({
    where: { id: original.id },
  });
  assert.equal(historical.status, "Completed");
  assert.equal(historical.notes, "Historical completion must remain");
  const moved = await db.alert.findFirstOrThrow({
    where: { grantId: grant.id, status: "Pending" },
  });
  assert.equal(moved.id, pending.id);
  assert.equal(moved.dueDate.toISOString().slice(0, 10), oldDate);
  assert.equal(await db.followUp.count({ where: { grantId: grant.id } }), 0);
});

test("page-specific payloads exclude unrelated records and enforce centre scope", async () => {
  const { workspaceData } = await import("../src/lib/workspace-data");
  const outside = await db.person.create({
    data: {
      kind: "Member",
      memberId: "PRIVATE-OUTSIDE",
      name: "Outside private profile",
      centre: "Centre B",
      remarks: "Never expose this note",
      rawImport: "private source",
    },
  });
  const scoped = { ...u, role: "Manager" };
  const directory = await workspaceData(scoped, "members", "");
  assert.deepEqual(directory.people, []);
  const selected = await workspaceData(scoped, "people", p.id);
  assert.deepEqual(
    selected.people.map((v) => v.id),
    [p.id],
  );
  assert.equal(
    JSON.stringify(selected).includes("Never expose this note"),
    false,
  );
  const denied = await workspaceData(scoped, "people", outside.id);
  assert.deepEqual(denied.people, []);
  const settings = await workspaceData(scoped, "settings", "");
  assert.deepEqual(settings.people, []);
  assert.deepEqual(settings.grants, []);
  assert.equal(JSON.stringify(settings).includes("passwordHash"), false);
});
test("daily in-app reminder fallback checkpoints once without sending emails", async () => {
  const { maintainReminders } = await import("../src/lib/reminder-maintenance");
  const count = await db.notificationDelivery.count();
  assert.deepEqual(await maintainReminders(), { changed: true });
  const alerts = await db.alert.count();
  assert.deepEqual(await maintainReminders(), { changed: false });
  assert.equal(await db.alert.count(), alerts);
  assert.equal(await db.notificationDelivery.count(), count);
});

test("targeted reminder reconciliation preserves another person's outstanding reminders", async () => {
  const { reconcileAlerts } = await import("../src/lib/alerts");
  const other = await db.person.create({
    data: {
      kind: "Member",
      memberId: "SCOPED-OTHER",
      name: "Other reminder owner",
      centre: "Centre A",
      dob: new Date(`1948-${date.slice(5)}`),
    },
  });
  await refreshAlerts();
  const reminder = await db.alert.findFirstOrThrow({
    where: { personId: other.id, type: "Birthday", status: "Pending" },
  });
  await db.$transaction((tx) => reconcileAlerts(tx, { personIds: [p.id] }));
  const untouched = await db.alert.findUniqueOrThrow({
    where: { id: reminder.id },
  });
  assert.equal(untouched.status, "Pending");
  assert.equal(untouched.sourceKey, reminder.sourceKey);
});
