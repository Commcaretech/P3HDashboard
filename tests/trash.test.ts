import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const file = resolve("data", `trash-${randomUUID()}.db`);
process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`;
new DatabaseSync(file).close();
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const { db } = await import("../src/lib/db");
const { previewTrash, changeTrash, listTrash } =
  await import("../src/lib/trash");
const { personScope, programmeScope, grantScope, surveyScope, alertScope } =
  await import("../src/lib/access");
const { reconcileAlerts } = await import("../src/lib/alerts");
const { dueItems } = await import("../src/lib/notifications");
const { savePerson, saveProgramme } = await import("../src/lib/records");
const { importSurveys, previewSurveys, surveyOverview, exportSurveys } =
  await import("../src/lib/surveys");
const { surveyHeaders } = await import("../src/lib/survey-parser");
const { syncProgrammes } = await import("../src/lib/programme-sync");
after(() => db.$disconnect());
const actor = (role = "Manager", centre = "Centre A") =>
  db.user.create({
    data: {
      username: randomUUID(),
      name: "Fictional Manager",
      passwordHash: "test-only",
      role,
      allCentres: role === "Admin",
      allowedCentres: { create: [{ centre }] },
    },
    include: { allowedCentres: true },
  });
async function fixture() {
  const u = await actor();
  const person = await db.person.create({
    data: {
      kind: "Member",
      name: "Fictional Caregiver",
      memberId: `TRASH-FAKE-${randomUUID()}`,
      centre: "Centre A",
      assignedId: u.id,
      remarks: "Preserve existing notes",
    },
  });
  const recipient = await db.person.create({
    data: {
      kind: "Care Recipient",
      name: "Fictional Recipient",
      centre: "Centre A",
    },
  });
  await db.careRelationship.create({
    data: {
      memberId: person.id,
      recipientId: recipient.id,
      relationship: "Family",
    },
  });
  const scheme = await db.supportScheme.upsert({
    where: { name: "HPC+" },
    create: { name: "HPC+" },
    update: {},
  });
  const grant = await db.grantApplication.create({
    data: {
      personId: person.id,
      schemeId: scheme.id,
      status: "Submitted",
      nextReviewDate: new Date("2026-01-01"),
      recurring: true,
      followUpDays: 7,
      notes: "Preserve follow-up notes",
    },
  });
  const programme = await db.programme.create({
    data: { name: "Fictional Programme", centre: "Centre A" },
  });
  await db.participation.create({
    data: {
      personId: person.id,
      programmeId: programme.id,
      status: "Attended",
    },
  });
  await db.assessment.create({
    data: { personId: person.id, type: "ZBI", value: 42 },
  });
  const batch = await db.surveyImportBatch.create({
    data: {
      filename: "fictional.csv",
      language: "English",
      centre: "Centre A",
      uploadedBy: u.id,
      summary: { saved: 1 },
    },
  });
  const survey = await db.surveyResponse.create({
    data: {
      batchId: batch.id,
      sourceKey: randomUUID(),
      contentHash: "fake",
      rowNumber: 2,
      centre: "Centre A",
      language: "English",
      submittedName: "Fictional",
      cleanedName: "Fictional",
      timestampText: "2026-01-01",
      surveyDate: new Date("2026-01-01"),
      phase: "Baseline",
      personId: person.id,
      confirmedMemberId: person.memberId,
      matchStatus: "Linked",
      rawAnswers: { Q1: "3" },
      answers: { Q1: "3" },
      warnings: [],
      method: "P3H_WHOQOL_ZBI6_v1_complete_domains",
      physical: 50,
      psychological: 50,
      social: 50,
      environment: 50,
      overall: 50,
      zbi: 12,
    },
  });
  await db.$transaction((tx) =>
    reconcileAlerts(tx, { personIds: [person.id] }),
  );
  return { u, person, recipient, grant, programme, survey };
}
async function change(
  u: Awaited<ReturnType<typeof actor>>,
  type: "person" | "programme" | "grant" | "survey",
  id: string,
  action: "move" | "restore",
) {
  const p = await previewTrash(u, type, id);
  return db.$transaction((tx) =>
    changeTrash(tx, u, {
      type,
      id,
      action,
      version: p.version,
      confirmed: true,
      reason: "Fictional test",
    }),
  );
}
test("all five record types move to Trash and restore without erasing source data, IDs or related history", async () => {
  const f = await fixture();
  for (const [type, id] of [
    ["person", f.person.id],
    ["person", f.recipient.id],
    ["programme", f.programme.id],
    ["grant", f.grant.id],
    ["survey", f.survey.id],
  ] as const) {
    const original = await previewTrash(f.u, type, id);
    assert.equal(original.deletedAt, null);
    await change(f.u, type, id, "move");
    assert.ok((await previewTrash(f.u, type, id)).deletedAt);
    assert.ok((await listTrash(f.u, {})).rows.some((r) => r.id === id));
    await change(f.u, type, id, "restore");
    assert.equal((await previewTrash(f.u, type, id)).deletedAt, null);
  }
  assert.equal(
    (await db.person.findUniqueOrThrow({ where: { id: f.person.id } }))
      .memberId,
    f.person.memberId,
  );
  assert.equal(
    (await db.grantApplication.findUniqueOrThrow({ where: { id: f.grant.id } }))
      .notes,
    "Preserve follow-up notes",
  );
  assert.equal(
    (await db.surveyResponse.findUniqueOrThrow({ where: { id: f.survey.id } }))
      .zbi,
    12,
  );
  assert.equal(
    await db.careRelationship.count({ where: { memberId: f.person.id } }),
    1,
  );
  assert.equal(
    await db.participation.count({ where: { personId: f.person.id } }),
    1,
  );
  assert.equal(
    await db.assessment.count({ where: { personId: f.person.id } }),
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { action: { in: ["Moved to Trash", "Restored from Trash"] } },
    }),
    10,
  );
});
test("trashed caregivers hide their grants, surveys and alerts while retaining independent linked people", async () => {
  const f = await fixture();
  await change(f.u, "person", f.person.id, "move");
  assert.equal(
    await db.person.count({
      where: { AND: [personScope(f.u), { id: f.person.id }] },
    }),
    0,
  );
  assert.equal(
    await db.grantApplication.count({
      where: { AND: [grantScope(f.u), { id: f.grant.id }] },
    }),
    0,
  );
  assert.equal(
    await db.surveyResponse.count({
      where: { AND: [surveyScope(f.u), { id: f.survey.id }] },
    }),
    0,
  );
  assert.equal(
    await db.alert.count({
      where: { AND: [alertScope(f.u), { personId: f.person.id }] },
    }),
    0,
  );
  assert.equal(
    await db.person.count({
      where: { AND: [personScope(f.u), { id: f.recipient.id }] },
    }),
    1,
  );
  await assert.rejects(
    db.$transaction((tx) =>
      savePerson(tx, f.u.id, { name: "Not allowed" }, f.person.id),
    ),
    /Restore/,
  );
  await change(f.u, "person", f.person.id, "restore");
  assert.equal(
    await db.surveyResponse.count({
      where: { AND: [surveyScope(f.u), { id: f.survey.id }] },
    }),
    1,
  );
});
test("independently trashed child records stay in Trash; restore the linked person before restoring children", async () => {
  const f = await fixture();
  await change(f.u, "grant", f.grant.id, "move");
  await change(f.u, "survey", f.survey.id, "move");
  await change(f.u, "person", f.person.id, "move");
  await assert.rejects(
    change(f.u, "grant", f.grant.id, "restore"),
    /linked caregiver/,
  );
  await assert.rejects(
    change(f.u, "survey", f.survey.id, "restore"),
    /linked caregiver/,
  );
  await change(f.u, "person", f.person.id, "restore");
  assert.ok(
    (await db.grantApplication.findUniqueOrThrow({ where: { id: f.grant.id } }))
      .deletedAt,
  );
  assert.ok(
    (await db.surveyResponse.findUniqueOrThrow({ where: { id: f.survey.id } }))
      .deletedAt,
  );
});
test("manager and centre access are rechecked; staff, read-only, revoked and out-of-centre actors cannot change Trash", async () => {
  const f = await fixture(),
    other = await actor("Manager", "Centre B"),
    staff = await actor("Staff"),
    reader = await actor("Read Only");
  for (const u of [staff, reader]) {
    await assert.rejects(listTrash(u, {}), /role/);
    await assert.rejects(previewTrash(u, "person", f.person.id), /role/);
  }
  await assert.rejects(
    previewTrash(other, "person", f.person.id),
    /centre permissions/,
  );
  await assert.rejects(
    previewTrash(other, "grant", f.grant.id),
    /centre permissions/,
  );
  const p = await previewTrash(f.u, "person", f.person.id);
  await db.user.update({ where: { id: f.u.id }, data: { role: "Staff" } });
  await assert.rejects(
    db.$transaction((tx) =>
      changeTrash(tx, f.u, {
        action: "move",
        type: "person",
        id: f.person.id,
        version: p.version,
        confirmed: true,
      }),
    ),
    /role/,
  );
  const shared = await db.programme.create({
    data: { name: "Global Shared", centre: "" },
  });
  await assert.rejects(
    previewTrash(other, "programme", shared.id),
    /centre permissions/,
  );
});
test("stale and simultaneous Trash decisions never overwrite a changed revision", async () => {
  const f = await fixture(),
    p = await previewTrash(f.u, "person", f.person.id);
  await db.person.update({
    where: { id: f.person.id },
    data: {
      name: "Changed",
      updatedAt: new Date(Date.parse(p.version) + 1000),
    },
  });
  await assert.rejects(
    db.$transaction((tx) =>
      changeTrash(tx, f.u, {
        action: "move",
        type: "person",
        id: f.person.id,
        version: p.version,
        confirmed: true,
      }),
    ),
    /changed/,
  );
  const current = await previewTrash(f.u, "person", f.person.id),
    input = {
      action: "move",
      type: "person",
      id: f.person.id,
      version: current.version,
      confirmed: true,
    };
  const results = await Promise.allSettled([
    db.$transaction((tx) => changeTrash(tx, f.u, input)),
    db.$transaction((tx) => changeTrash(tx, f.u, input)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("trashed grants do not send reminders; restoration revives the same reminder without losing snooze or completion history", async () => {
  const f = await fixture();
  await db.user.update({
    where: { id: f.u.id },
    data: {
      email: `fake-${randomUUID()}@example.test`,
      emailNotifications: true,
    },
  });
  const reminder = await db.alert.findFirstOrThrow({
    where: { grantId: f.grant.id, status: "Pending" },
  });
  await db.alert.update({
    where: { id: reminder.id },
    data: { notes: "Retain note", snoozedUntil: new Date("2026-01-02") },
  });
  await change(f.u, "grant", f.grant.id, "move");
  assert.ok(
    !(await dueItems(f.u.id, "2026-11-13"))!.items.some(
      (a) => a.grantId === f.grant.id,
    ),
  );
  await change(f.u, "grant", f.grant.id, "restore");
  const restored = await db.alert.findUniqueOrThrow({
    where: { id: reminder.id },
  });
  assert.equal(restored.notes, "Retain note");
  assert.equal(restored.snoozedUntil!.toISOString().slice(0, 10), "2026-01-02");
  assert.equal(
    await db.alert.count({ where: { grantId: f.grant.id, status: "Pending" } }),
    1,
  );
});
test("surveys in Trash disappear from outcomes and exports and cannot be recreated by repeat imports", async () => {
  const u = await actor(),
    quote = (xs: string[]) =>
      xs.map((x) => '"' + x.replaceAll('"', '""') + '"').join(",");
  const input = {
    centre: "Centre A",
    files: [
      {
        name: "fictional.csv",
        language: "English",
        content:
          quote(surveyHeaders) +
          "\n" +
          quote([
            randomUUID(),
            "13/11/2026 10:00",
            "Fictional",
            "01/01/1960",
            "At the start of / Before the programme",
            "Yes",
            ...Array(26).fill("3"),
            ...Array(6).fill("2"),
          ]),
      },
    ],
  };
  const imported = await db.$transaction((tx) => importSurveys(tx, u, input));
  const r = await db.surveyResponse.findFirstOrThrow({
    where: { batchId: imported.batches[0].id },
  });
  const before = await surveyOverview(u, {});
  await change(u, "survey", r.id, "move");
  assert.equal((await surveyOverview(u, {})).responses, before.responses - 1);
  const preview = await previewSurveys(u, input);
  assert.match(preview.files[0].rows[0].disposition, /In Trash/);
  const repeat = await db.$transaction((tx) => importSurveys(tx, u, input));
  assert.equal(repeat.batches[0].saved, 0);
  assert.equal(
    await db.surveyResponse.count({ where: { sourceKey: r.sourceKey } }),
    1,
  );
  const f = await fixture();
  await change(f.u, "survey", f.survey.id, "move");
  const csv = await db.$transaction((tx) =>
    exportSurveys(tx, f.u, { personId: f.person.id }),
  );
  assert.equal(csv.split("\r\n").length, 1);
});
test("synced programmes stay in Trash on re-sync, with their latest source information available on restore", async () => {
  const admin = await actor("Admin");
  process.env.P3H_SYNC_ENABLED = "true";
  process.env.P3H_PROGRAMME_FEED_URL =
    "https://abcdefghijklmnopqrst.supabase.co/functions/v1/p3h-programmes";
  process.env.P3H_SYNC_SHARED_SECRET =
    "fictional-trash-shared-secret-at-least-32-characters";
  const value = {
    sourceProgrammeKey: randomUUID(),
    name: "Fictional Source",
    centreId: "SEEN_BB",
    category: "Social",
    sourceStatus: "confirmed",
    sourceUpdatedAt: null,
    recurrence: null,
    fragmentIndex: 0,
    fragmentCount: 1,
    occurrences: [],
    scheduleTemplates: [],
  };
  const feed: typeof fetch = async () =>
    Response.json({
      version: 1,
      source: "program-spacebooking",
      generatedAt: new Date().toISOString(),
      items: [value],
      page: { hasMore: false, nextCursor: null },
    });
  await syncProgrammes(admin, db, feed);
  const p = await db.programme.findFirstOrThrow({
    where: { external: { sourceKey: value.sourceProgrammeKey } },
  });
  await change(admin, "programme", p.id, "move");
  value.name = "Updated Source";
  await syncProgrammes(admin, db, feed);
  assert.equal(
    await db.programme.count({
      where: { AND: [programmeScope(admin), { id: p.id }] },
    }),
    0,
  );
  await assert.rejects(
    db.$transaction((tx) => saveProgramme(tx, admin.id, { ...p }, p.id)),
    /Restore/,
  );
  await change(admin, "programme", p.id, "restore");
  assert.equal(
    (await db.programme.findUniqueOrThrow({ where: { id: p.id } })).name,
    "Updated Source",
  );
});
test("Trash cursor pagination and search do not lose records or leak other centres", async () => {
  const u = await actor("Manager", "Pagination Centre"),
    other = await actor("Manager", "Hidden Centre");
  await db.person.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      kind: "Member",
      name: `Fictional Page ${i}`,
      centre: "Pagination Centre",
      deletedAt: new Date("2026-11-13"),
      deletedBy: u.id,
    })),
  });
  await db.person.create({
    data: {
      kind: "Member",
      name: "Do not leak",
      centre: "Hidden Centre",
      deletedAt: new Date(),
      deletedBy: other.id,
    },
  });
  const first = await listTrash(u, {}),
    second = await listTrash(u, { cursor: first.nextCursor! });
  assert.equal(first.total, 25);
  assert.equal(first.rows.length, 20);
  assert.equal(second.rows.length, 5);
  assert.equal(
    new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
    25,
  );
  assert.ok(first.rows.every((r) => r.centre === "Pagination Centre"));
  assert.equal((await listTrash(u, { q: "Page 24" })).total, 1);
});
test("additive Trash migration preserves existing rows and relationships with null defaults", () => {
  const copy = new DatabaseSync(":memory:");
  for (const folder of readdirSync("prisma/migrations")
    .filter((n) => n.startsWith("20") && n < "202611130002_record_trash")
    .sort())
    copy.exec(
      readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"),
    );
  copy.exec(
    "INSERT INTO Person(id,kind,memberId,name,updatedAt) VALUES('fake','Member','FAKE','Fictional',CURRENT_TIMESTAMP)",
  );
  const before = copy
    .prepare("SELECT id,kind,memberId,name,updatedAt FROM Person")
    .all();
  copy.exec(
    readFileSync(
      "prisma/migrations/202611130002_record_trash/migration.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    copy.prepare("SELECT id,kind,memberId,name,updatedAt FROM Person").all(),
    before,
  );
  assert.equal(
    copy.prepare("SELECT deletedAt FROM Person").get()?.deletedAt,
    null,
  );
  assert.equal(
    copy.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  assert.deepEqual(copy.prepare("PRAGMA foreign_key_check").all(), []);
  copy.close();
});

test("global administrators can preview and restore linked grant and survey records in Trash", async () => {
  const f = await fixture(),
    admin = await actor("Admin");
  for (const type of ["grant", "survey"] as const) {
    const id = type === "grant" ? f.grant.id : f.survey.id;
    await change(admin, type, id, "move");
    assert.ok((await listTrash(admin, { type })).rows.some((r) => r.id === id));
    await change(admin, type, id, "restore");
  }
});
