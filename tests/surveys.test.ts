import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { surveyHeaders } from "../src/lib/survey-parser";
import { SURVEY_METHOD } from "../src/lib/survey-scoring";
import { grantDatesFromNotes } from "../src/lib/grant-note-dates";
const file = resolve("data", `surveys-${randomUUID()}.db`);
process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`;
new DatabaseSync(file).close();
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const { db } = await import("../src/lib/db");
const {
  importSurveys,
  previewSurveys,
  updateSurvey,
  surveyCandidates,
  listSurveys,
  surveyHistory,
  exportSurveys,
  manageSurveyAlias,
  surveyStatistics,
  safeSurveyCell,
} = await import("../src/lib/surveys");
after(() => db.$disconnect());
const actor = async (role = "Staff", centre = "Centre A") =>
  db.user.create({
    data: {
      username: randomUUID(),
      name: "Fictional Staff",
      passwordHash: "test-only",
      role,
      allCentres: role === "Admin",
      allowedCentres: { create: [{ centre }] },
    },
    include: { allowedCentres: true },
  });
const caregiver = async (centre = "Centre A", name = "Fictional Caregiver") =>
  db.person.create({
    data: {
      kind: "Member",
      memberId: `FAKE-${randomUUID()}`,
      name,
      centre,
      dob: new Date("1960-01-01"),
      remarks: "Preserve notes",
    },
  });
const q = (values: string[]) =>
  values.map((s) => '"' + s.replaceAll('"', '""') + '"').join(",");
const make = (id = randomUUID(), overrides: Record<number, string> = {}) =>
  q(
    [
      id,
      "13/11/2026 10:00",
      "Fictional Alias 00000000",
      "01/01/1960",
      "At the start of / Before the programme",
      "Yes",
      ...Array(26).fill("3"),
      ...Array(6).fill("2"),
    ].map((v, i) => overrides[i] ?? v),
  );
const payload = (rows: string[], centre = "Centre A") => ({
  centre,
  files: [
    {
      name: "fictional.csv",
      language: "English",
      content: [q(surveyHeaders), ...rows].join("\n"),
    },
  ],
});
const get = (id: string) =>
  db.surveyResponse.findUniqueOrThrow({ where: { id } });
test("eligible unmatched import, minimal exclusions, repeat upload and raw-source conflicts are retained and reported", async () => {
  const u = await actor(),
    id = randomUUID(),
    input = payload([
      make(id),
      make(randomUUID(), { 5: "No", 2: "Declined private identity" }),
      make(randomUUID(), { 2: "TEST" }),
      make(randomUUID(), { 6: "unknown" }),
    ]);
  const preview = await previewSurveys(u, input);
  assert.equal(preview.files[0].rows[1].submittedName, undefined);
  const r = await db.$transaction((tx) => importSurveys(tx, u, input));
  assert.equal(r.batches[0].saved, 2);
  assert.equal(r.batches[0].consentExcluded, 1);
  assert.equal(r.batches[0].testExcluded, 1);
  const batch = await db.surveyImportBatch.findUniqueOrThrow({
    where: { id: r.batches[0].id },
  });
  assert.ok(!JSON.stringify(batch.summary).includes("Declined private"));
  const saved = await db.surveyResponse.findMany({
    where: { batchId: batch.id },
  });
  assert.ok(saved.every((s) => s.personId === null));
  assert.equal(saved[0].overall, 50);
  const repeat = await db.$transaction((tx) => importSurveys(tx, u, input));
  assert.equal(repeat.batches[0].saved, 0);
  assert.equal(repeat.batches[0].duplicates, 2);
  const conflict = await db.$transaction((tx) =>
    importSurveys(tx, u, payload([make(id, { 6: "1" })])),
  );
  assert.equal(conflict.batches[0].conflicts, 1);
  assert.equal((await get(saved[0].id)).overall, 50);
});
test("matching requires staff confirmation, keeps Member IDs and multiple verified aliases, and never relinks on reimport", async () => {
  const u = await actor(),
    p = await caregiver(),
    id = randomUUID(),
    input = payload([make(id)]);
  await db.$transaction((tx) => importSurveys(tx, u, input));
  const r = await db.surveyResponse.findFirstOrThrow({
    where: { sourceResponseId: id },
  });
  await assert.rejects(
    db.$transaction((tx) =>
      updateSurvey(tx, u, {
        action: "link",
        id: r.id,
        version: r.updatedAt.toISOString(),
        personId: p.id,
        notes: "Verified via approved process",
        confirmed: false,
      }),
    ),
    /Confirm identity/,
  );
  await db.$transaction((tx) =>
    updateSurvey(tx, u, {
      action: "link",
      id: r.id,
      version: r.updatedAt.toISOString(),
      personId: p.id,
      notes: "Verified via approved process",
      confirmed: true,
      saveAlias: true,
    }),
  );
  const linked = await get(r.id);
  assert.equal(linked.personId, p.id);
  assert.equal(linked.confirmedMemberId, p.memberId);
  assert.equal(
    (await db.person.findUniqueOrThrow({ where: { id: p.id } })).memberId,
    p.memberId,
  );
  assert.equal((await listSurveys(u, { personId: p.id })).total, 1);
  assert.equal(
    (await db.person.findUniqueOrThrow({ where: { id: p.id } })).remarks,
    "Preserve notes",
  );
  await db.$transaction((tx) => importSurveys(tx, u, input));
  assert.equal((await get(r.id)).personId, p.id);
  await db.$transaction((tx) =>
    manageSurveyAlias(tx, u, {
      personId: p.id,
      text: "Another Alias",
      verified: true,
      notes: "Confirmed",
    }),
  );
  assert.equal(await db.personAlias.count({ where: { personId: p.id } }), 2);
  await assert.rejects(
    db.$transaction((tx) =>
      updateSurvey(tx, u, {
        action: "correct",
        id: r.id,
        version: r.updatedAt.toISOString(),
        phase: "Annual",
        notes: "Stale",
      }),
    ),
    /changed/,
  );
});
test("shared nicknames only suggest candidates; birth-date conflicts are visible; ambiguity is auditable", async () => {
  const u = await actor(),
    p = await caregiver(),
    other = await caregiver();
  for (const person of [p, other])
    await db.$transaction((tx) =>
      manageSurveyAlias(tx, u, {
        personId: person.id,
        text: "Shared Alias",
        verified: true,
        notes: "Confirmed alias",
      }),
    );
  const id = randomUUID();
  await db.$transaction((tx) =>
    importSurveys(
      tx,
      u,
      payload([make(id, { 2: "Shared Alias", 3: "01/01/1961" })]),
    ),
  );
  let r = await db.surveyResponse.findFirstOrThrow({
    where: { sourceResponseId: id },
  });
  const suggested = await surveyCandidates(u, r.id, "");
  assert.equal(
    suggested.rows.filter((c) => c.evidence.includes("Verified alias matches"))
      .length,
    2,
  );
  assert.ok(suggested.rows.every((c) => c.conflicts.length === 1));
  assert.equal(r.personId, null);
  await db.$transaction((tx) =>
    updateSurvey(tx, u, {
      action: "ambiguous",
      id: r.id,
      version: r.updatedAt.toISOString(),
      notes: "Two possible caregivers",
    }),
  );
  r = await get(r.id);
  assert.equal(r.matchStatus, "Ambiguous");
  assert.equal(
    (await listSurveys(u, { match: "Ambiguous" })).rows.some(
      (s) => s.id === r.id,
    ),
    true,
  );
  assert.equal(
    await db.surveyIdentityReview.count({
      where: { responseId: r.id, action: "Ambiguous" },
    }),
    1,
  );
});
test("centre scopes cover imports, candidate search, direct records, aliases, exports and revoked/inactive writers", async () => {
  const u = await actor(),
    other = await actor("Staff", "Centre B"),
    readonly = await actor("Read Only"),
    p = await caregiver("Centre B"),
    id = randomUUID();
  await assert.rejects(
    db.$transaction((tx) => importSurveys(tx, other, payload([make()]))),
    /centre permissions/,
  );
  await db.$transaction((tx) => importSurveys(tx, u, payload([make(id)])));
  const r = await db.surveyResponse.findFirstOrThrow({
    where: { sourceResponseId: id },
  });
  await assert.rejects(
    surveyCandidates(other, r.id, "Fictional"),
    /centre permissions/,
  );
  assert.equal(
    (await listSurveys(other, {})).rows.some((s) => s.id === r.id),
    false,
  );
  assert.equal((await surveyHistory(other, {})).rows.length, 0);
  await assert.rejects(
    db.$transaction((tx) =>
      updateSurvey(tx, u, {
        action: "link",
        id: r.id,
        version: r.updatedAt.toISOString(),
        personId: p.id,
        confirmed: true,
        notes: "wrong centre",
      }),
    ),
    /survey centre/,
  );
  await assert.rejects(
    db.$transaction((tx) =>
      manageSurveyAlias(tx, u, {
        personId: p.id,
        text: "Alias",
        verified: true,
        notes: "wrong centre",
      }),
    ),
    /centre permissions/,
  );
  await assert.rejects(
    db.$transaction((tx) => importSurveys(tx, readonly, payload([make()]))),
    /role/,
  );
  await assert.rejects(
    db.$transaction((tx) => exportSurveys(tx, u, {})),
    /role/,
  );
  await db.user.update({ where: { id: u.id }, data: { active: false } });
  await assert.rejects(
    db.$transaction((tx) => importSurveys(tx, u, payload([make()]))),
    /role/,
  );
});
test("controlled manager unlink preserves source, link history and aliases; corrections retain originals and recompute scores", async () => {
  const u = await actor(),
    manager = await actor("Manager"),
    p = await caregiver(),
    id = randomUUID();
  await db.$transaction((tx) =>
    importSurveys(
      tx,
      u,
      payload([
        make(id, { 4: "At the end of / After the programme", 6: "unmapped" }),
      ]),
    ),
  );
  let r = await db.surveyResponse.findFirstOrThrow({
    where: { sourceResponseId: id },
  });
  await db.$transaction((tx) =>
    updateSurvey(tx, u, {
      action: "correct",
      id: r.id,
      version: r.updatedAt.toISOString(),
      phase: "Annual",
      answers: { Q1: 4 },
      notes: "Confirmed original response with staff",
    }),
  );
  r = await get(r.id);
  assert.equal((r.rawAnswers as Record<string, string>).Q1, "unmapped");
  assert.equal(r.phaseText, "At the end of / After the programme");
  assert.equal(r.phase, "Annual");
  await db.$transaction((tx) =>
    updateSurvey(tx, u, {
      action: "link",
      id: r.id,
      version: r.updatedAt.toISOString(),
      personId: p.id,
      confirmed: true,
      notes: "Confirmed identity",
    }),
  );
  r = await get(r.id);
  await assert.rejects(
    db.$transaction((tx) =>
      updateSurvey(tx, u, {
        action: "unlink",
        id: r.id,
        version: r.updatedAt.toISOString(),
        confirmed: true,
        notes: "Mistaken identity",
      }),
    ),
    /role/,
  );
  await db.$transaction((tx) =>
    updateSurvey(tx, manager, {
      action: "unlink",
      id: r.id,
      version: r.updatedAt.toISOString(),
      confirmed: true,
      notes: "Mistaken identity",
    }),
  );
  const final = await get(r.id);
  assert.equal(final.personId, null);
  assert.deepEqual(final.rawAnswers, r.rawAnswers);
  assert.equal(
    await db.surveyIdentityReview.count({ where: { responseId: r.id } }),
    2,
  );
  assert.equal((await listSurveys(u, { personId: p.id })).total, 0);
});
test("two simultaneous identity decisions cannot overwrite one revision", async () => {
  const u = await actor(),
    id = randomUUID();
  await db.$transaction((tx) => importSurveys(tx, u, payload([make(id)])));
  const r = await db.surveyResponse.findFirstOrThrow({
    where: { sourceResponseId: id },
  });
  const input = {
    action: "ambiguous",
    id: r.id,
    version: r.updatedAt.toISOString(),
    notes: "Needs verification",
  };
  const results = await Promise.allSettled([
    db.$transaction((tx) => updateSurvey(tx, u, input)),
    db.$transaction((tx) => updateSurvey(tx, u, input)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("statistics pair verified identities, separate samples, exclude incompatible versions and avoid fabricated changes", () => {
  const row = (
    personId: string | null,
    phase: string,
    date: string,
    n: number,
    method = SURVEY_METHOD,
  ) => ({
    personId,
    phase,
    surveyDate: new Date(date),
    method,
    warnings: [],
    physical: n,
    psychological: n,
    social: n,
    environment: n,
    overall: n,
    zbi: 6,
  });
  const stats = surveyStatistics([
    row("one", "Baseline", "2026-01-01", 25),
    row("one", "Annual", "2026-11-01", 75),
    row("two", "Annual", "2026-11-01", 100),
    row(null, "Baseline", "2026-01-01", 100),
    row("one", "Annual", "2026-12-01", 100, "incompatible"),
  ]);
  assert.equal(stats.responses, 5);
  assert.equal(stats.caregivers, 2);
  assert.equal(stats.means.overall.n, 3);
  assert.equal(stats.paired.overall.n, 1);
  assert.equal(stats.paired.overall.change, 50);
  const conflict = surveyStatistics([
    row("one", "Baseline", "2026-01-01", 25),
    row("one", "Baseline", "2026-02-01", 40),
    row("one", "Annual", "2026-11-01", 75),
  ]);
  assert.equal(conflict.phaseConflicts, 1);
  assert.equal(conflict.paired.overall.n, 0);
});
test("outcome exports include all filtered linked rows, extended columns and a sensitive-export audit", async () => {
  const manager = await actor("Manager"),
    p = await caregiver("Centre A", "=Fictional Formula"),
    id = randomUUID();
  await db.$transaction((tx) =>
    importSurveys(tx, manager, payload([make(id)])),
  );
  const r = await db.surveyResponse.findFirstOrThrow({
    where: { sourceResponseId: id },
  });
  await db.$transaction((tx) =>
    updateSurvey(tx, manager, {
      action: "link",
      id: r.id,
      version: r.updatedAt.toISOString(),
      personId: p.id,
      confirmed: true,
      notes: "Confirmed",
    }),
  );
  const csv = await db.$transaction((tx) =>
    exportSurveys(tx, manager, { personId: p.id, extended: "1" }),
  );
  assert.ok(csv.includes("Member ID"));
  assert.ok(csv.includes('"\'=Fictional Formula"'));
  assert.equal(csv.split("\r\n").length, 2);
  assert.ok(csv.includes("P3H_WHOQOL"));
  assert.equal(
    await db.auditLog.count({ where: { action: "Survey outcomes exported" } }),
    1,
  );
  for (const value of ["=cmd", "\t+cmd", "@SUM(A1)", "-cmd"])
    assert.ok(safeSurveyCell(value).startsWith("\"'"));
});
test("survey migration is additive over a populated pre-survey snapshot", () => {
  const copy = new DatabaseSync(":memory:");
  for (const folder of readdirSync("prisma/migrations")
    .filter((n) => n.startsWith("20") && n < "202611130001_surveys_outcomes")
    .sort())
    copy.exec(
      readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"),
    );
  copy.exec(
    "INSERT INTO Person(id,kind,memberId,name,updatedAt) VALUES('fictional','Member','FAKE-ONLY','Fictional',CURRENT_TIMESTAMP)",
  );
  const tables = copy
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  const before = Object.fromEntries(
    tables.map((t) => [
      t.name,
      copy.prepare(`SELECT * FROM \"${t.name}\"`).all(),
    ]),
  );
  copy.exec(
    readFileSync(
      "prisma/migrations/202611130001_surveys_outcomes/migration.sql",
      "utf8",
    ),
  );
  for (const t of tables)
    assert.deepEqual(
      copy.prepare(`SELECT * FROM \"${t.name}\"`).all(),
      before[t.name],
    );
  assert.equal(
    copy.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  assert.deepEqual(copy.prepare("PRAGMA foreign_key_check").all(), []);
  copy.close();
});
test("grant remarks yield reviewable exact dates and never infer uncertain applications", () => {
  const rs = grantDatesFromNotes(
    "South West $250 applied on 10/11/2026\nCHAS applied/renewed on 10/11/2026\nHPC+ referred on 10/11/2026\nMaybe MOW applied on 10/11/2026",
  );
  assert.deepEqual(
    rs.map((r) => r.followUp),
    ["2027-01-10", "2026-11-24", "2026-11-17"],
  );
  assert.equal(grantDatesFromNotes("CHAS applied on 31/02/2026").length, 0);
});

test("all-centre administrators can see linked and unmatched survey records", async () => {
  const admin = await actor("Admin");
  const all = await db.surveyResponse.count();
  const listing = await listSurveys(admin, {});
  assert.equal(listing.total, all);
  assert.ok(listing.rows.some((r) => r.personId));
});

test("paired comparisons use Singapore calendar dates across the UTC boundary", () => {
  const row = (phase: string, date: string) => ({
    personId: "same-person",
    phase,
    surveyDate: new Date(date),
    method: SURVEY_METHOD,
    warnings: [],
    physical: 50,
    psychological: 50,
    social: 50,
    environment: 50,
    overall: 50,
    zbi: 6,
  });
  const result = surveyStatistics([
    row("Baseline", "2026-11-13T01:00:00+08:00"),
    row("Annual", "2026-11-13T23:00:00+08:00"),
  ]);
  assert.equal(result.paired.overall.n, 0);
  assert.equal(result.repeatedCaregivers, 0);
});

test("verified aliases are prioritised before a capped broad name search", async () => {
  const u = await actor(),
    exact = await caregiver("Centre A", "Very Common Name");
  await db.person.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      kind: "Member",
      memberId: `AAA-${i}-${randomUUID()}`,
      name: "Very Common Name",
      centre: "Centre A",
    })),
  });
  await db.$transaction((tx) =>
    manageSurveyAlias(tx, u, {
      personId: exact.id,
      text: "Very Common",
      verified: true,
      notes: "Fictional verified alias",
    }),
  );
  const id = randomUUID();
  await db.$transaction((tx) =>
    importSurveys(tx, u, payload([make(id, { 2: "Very Common" })])),
  );
  const response = await db.surveyResponse.findFirstOrThrow({
    where: { sourceResponseId: id },
  });
  const candidates = await surveyCandidates(u, response.id, "");
  assert.equal(candidates.rows.length, 20);
  assert.equal(candidates.rows[0].id, exact.id);
  assert.equal((await get(response.id)).personId, null);
});
