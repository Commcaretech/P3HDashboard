import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
const url = `file:${resolve("data", `test-${randomUUID()}.db`).replace(/\\/g, "/")}`;
process.env.DATABASE_URL = url;
const blank = new DatabaseSync(url.slice(5));
blank.close();
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
);
const { db, personInclude } = await import("../src/lib/db");
const { savePerson, saveProgramme } = await import("../src/lib/records");
const { refreshAlerts } = await import("../src/lib/alerts");
const { today } = await import("../src/lib/domain");
const { extractMemberSupport } = await import("../src/lib/support-extraction");
const { validateAssignment } = await import("../src/lib/access");
after(async () => {
  await db.$disconnect();
});

test("assignments require an active staff account with centre access and changes are audited", async () => {
  const staff = await db.user.create({
    data: {
      username: "assignment-fake",
      name: "Fictional Case Owner",
      passwordHash: "test-only",
      role: "Staff",
      allCentres: false,
      allowedCentres: { create: [{ centre: "Centre A" }] },
    },
    include: { allowedCentres: true },
  });
  await db.$transaction((tx) =>
    validateAssignment(tx, staff, staff.id, "Centre A"),
  );
  await assert.rejects(
    db.$transaction((tx) =>
      validateAssignment(tx, staff, staff.id, "Centre B"),
    ),
    /Assigned staff must have access/,
  );
  const member = await db.$transaction((tx) =>
    savePerson(tx, staff.id, {
      kind: "Member",
      memberId: "ASSIGNMENT-FAKE",
      centre: "Centre A",
    }),
  );
  await db.$transaction((tx) =>
    savePerson(
      tx,
      staff.id,
      {
        kind: "Member",
        memberId: "ASSIGNMENT-FAKE",
        centre: "Centre A",
        assignedId: staff.id,
      },
      member.id,
    ),
  );
  assert.equal(
    await db.auditLog.count({
      where: { action: "Assignment changed", entityId: member.id },
    }),
    1,
  );
  await db.user.update({ where: { id: staff.id }, data: { active: false } });
  await assert.rejects(
    db.$transaction((tx) =>
      validateAssignment(tx, staff, staff.id, "Centre A"),
    ),
    /Assigned staff must have access/,
  );
  await db.auditLog.deleteMany({ where: { userId: staff.id } });
  await db.person.delete({ where: { id: member.id } });
  await db.user.delete({ where: { id: staff.id } });
});

test("note extraction persists support, preserves notes, audits and skips existing schemes", async () => {
  const user = await db.user.create({
    data: {
      username: "support-test",
      name: "Fake Reviewer",
      passwordHash: "test-only",
    },
  });
  const remarks =
    "Receiving HCG, SSS, PioneerDAS, Home Therapy\nReceived South West $250 and $1000\nCompleted EASE";
  const member = await db.person.create({
    data: { kind: "Member", memberId: "SUPPORT-TEST", remarks },
  });
  const counts = await db.$transaction((tx) =>
    extractMemberSupport(tx, user.id, member.id),
  );
  assert.deepEqual(counts, { created: 6, skipped: 0 });
  const grant = await db.grantApplication.findFirstOrThrow({
    where: { personId: member.id, scheme: { name: "South West" } },
  });
  assert.equal(grant.amount, null);
  assert.equal(grant.approvalDate, null);
  assert.match(grant.notes, /\$250 and \$1000/);
  assert.equal(
    (await db.person.findUniqueOrThrow({ where: { id: member.id } })).remarks,
    remarks,
  );
  assert.equal(
    await db.auditLog.count({
      where: { action: "Support extracted from notes" },
    }),
    6,
  );
  await db.grantApplication.update({
    where: { id: grant.id },
    data: { status: "Approved", notes: "Staff verified" },
  });
  assert.deepEqual(
    await db.$transaction((tx) => extractMemberSupport(tx, user.id, member.id)),
    { created: 0, skipped: 6 },
  );
  assert.equal(
    (await db.grantApplication.findUniqueOrThrow({ where: { id: grant.id } }))
      .notes,
    "Staff verified",
  );
  await assert.rejects(
    db.$transaction(async (tx) => {
      const p = await tx.person.create({
        data: { kind: "Member", memberId: "SUPPORT-ROLLBACK", remarks },
      });
      await extractMemberSupport(tx, user.id, p.id);
      throw new Error("Rollback test");
    }),
  );
  assert.equal(
    await db.person.count({ where: { memberId: "SUPPORT-ROLLBACK" } }),
    0,
  );
  // Keep the unrelated existing integration scenario's count assertions isolated.
  await db.auditLog.deleteMany({ where: { userId: user.id } });
  await db.grantApplication.deleteMany({ where: { personId: member.id } });
  await db.supportScheme.deleteMany({ where: { applications: { none: {} } } });
  await db.person.delete({ where: { id: member.id } });
  await db.user.delete({ where: { id: user.id } });
});
test("relational CRUD, persistence, rollback, audit and idempotent alerts", async () => {
  const user = await db.user.create({
    data: {
      username: "fake",
      name: "Fake",
      role: "Admin",
      passwordHash: "not-a-real-hash",
    },
  });
  const p = await db.$transaction((tx) =>
    savePerson(tx, user.id, {
      kind: "Member",
      memberId: "FAKE-DB",
      name: "Fictional Person",
      dob: `1950-${today().slice(5)}`,
      languages: "English, Mandarin",
      interests: "Music",
      conditions: "Gastritis",
    }),
  );
  const stored = await db.person.findUniqueOrThrow({
    where: { id: p.id },
    include: personInclude,
  });
  assert.equal(stored.languages.length, 2);
  assert.equal(stored.conditions.length, 1);
  assert.equal(await db.auditLog.count(), 1);
  await assert.rejects(
    db.$transaction(async (tx) => {
      await savePerson(tx, user.id, { kind: "Member", memberId: "ROLLBACK" });
      await savePerson(tx, user.id, { kind: "Member", memberId: "FAKE-DB" });
    }),
  );
  assert.equal(await db.person.count({ where: { memberId: "ROLLBACK" } }), 0);
  const cr = await db.$transaction((tx) =>
    savePerson(tx, user.id, {
      kind: "Care Recipient",
      alias: "Fake CR",
      conditions: "Dementia",
      zbi: "10",
    }),
  );
  const assessment = await db.assessment.findFirstOrThrow({
    where: { personId: cr.id },
  });
  assert.equal(assessment.assessedAt, null);
  assert.ok(assessment.recordedAt);
  await db.careRelationship.create({
    data: { memberId: p.id, recipientId: cr.id, relationship: "Spouse" },
  });
  const prog = await db.$transaction((tx) =>
    saveProgramme(tx, user.id, {
      name: "Fake Programme",
      conditions: "Dementia",
      languages: "Mandarin",
      interests: "Music",
      capacity: 5,
      status: "Active",
      registrationStatus: "Open",
    }),
  );
  assert.equal(
    await db.programmeCondition.count({ where: { programmeId: prog.id } }),
    1,
  );
  const scheme = await db.supportScheme.create({ data: { name: "HCG" } });
  await db.grantApplication.create({
    data: {
      personId: p.id,
      schemeId: scheme.id,
      status: "Submitted",
      nextReviewDate: new Date(today()),
      expiryDate: new Date(today()),
    },
  });
  await refreshAlerts();
  const count = await db.alert.count();
  assert.equal(count, 6);
  const generated = await db.alert.findFirstOrThrow({
    where: { type: "Grant review" },
  });
  const snoozedUntil = new Date(Date.parse(today()) + 7 * 86400000);
  await db.alert.update({
    where: { id: generated.id },
    data: { snoozedUntil },
  });
  await refreshAlerts();
  assert.equal(await db.alert.count(), count);
  const refreshed = await db.alert.findUniqueOrThrow({
    where: { id: generated.id },
  });
  assert.equal(
    refreshed.snoozedUntil?.toISOString(),
    snoozedUntil.toISOString(),
  );
  assert.equal(
    refreshed.dueDate.toISOString(),
    generated.dueDate.toISOString(),
  );
  const alert = await db.alert.findFirstOrThrow();
  await db.alert.update({
    where: { id: alert.id },
    data: { status: "Completed" },
  });
  await refreshAlerts();
  assert.equal(
    (await db.alert.findUniqueOrThrow({ where: { id: alert.id } })).status,
    "Completed",
  );
  const other = new PrismaClient({ datasourceUrl: url });
  assert.equal(await other.person.count(), 2);
  await other.$disconnect();
  await assert.rejects(
    db.$transaction((tx) =>
      savePerson(
        tx,
        user.id,
        { kind: "Member", memberId: "FAKE-DB", name: "Stale" },
        p.id,
        undefined,
        "old-version",
      ),
    ),
  );
});
