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
after(async () => {
  await db.$disconnect();
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
  await refreshAlerts();
  assert.equal(await db.alert.count(), count);
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
