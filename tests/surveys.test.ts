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
  lookupSurveyMember,
  surveyDetail,
  nextSurveyForReview,
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
  assert.ok(
    preview.files.every((file) =>
      file.rows.every(
        (row) => !("submittedName" in row) && !("rawAnswers" in row),
      ),
    ),
  );
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
        memberId: p.memberId!,
        verificationMethod: "CaritaHub",
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
      memberId: p.memberId!,
      verificationMethod: "CaritaHub",
      notes: "Verified via approved process",
      confirmed: true,
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
  assert.equal(await db.personAlias.count({ where: { personId: p.id } }), 1);
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
test("shared nicknames do not resolve a Member ID and ambiguity is auditable", async () => {
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
  await assert.rejects(
    lookupSurveyMember(u, { id: r.id, memberId: "Shared Alias" }),
    /Member ID not found/,
  );
  assert.equal(
    (await lookupSurveyMember(u, { id: r.id, memberId: p.memberId })).id,
    p.id,
  );
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
    lookupSurveyMember(other, { id: r.id, memberId: "FICTIONAL" }),
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
        memberId: p.memberId!,
        verificationMethod: "CaritaHub",
        confirmed: true,
        notes: "wrong centre",
      }),
    ),
    /Member ID not found/,
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
      memberId: p.memberId!,
      verificationMethod: "CaritaHub",
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
      memberId: p.memberId!,
      verificationMethod: "CaritaHub",
      confirmed: true,
      notes: "Confirmed",
    }),
  );
  const csv = await db.$transaction((tx) =>
    exportSurveys(tx, manager, { personId: p.id, extended: "1" }),
  );
  assert.ok(csv.includes("Member ID"));
  assert.ok(!csv.includes("Fictional Formula"));
  assert.ok(csv.includes(p.memberId!));
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
  const staging = "202611230002_caritahub_identity_stage";
  for (const folder of readdirSync("prisma/migrations")
    .filter(
      (name) =>
        name > "202611130001_surveys_outcomes" &&
        name < staging &&
        name.startsWith("20"),
    )
    .sort())
    copy.exec(
      readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"),
    );
  copy.exec(`
    INSERT INTO "SurveyImportBatch"(id,filename,language,centre,uploadedBy,summary)
      VALUES ('batch','fictional.csv','English','Centre A','staff','{}');
    INSERT INTO "SurveyResponse"(id,batchId,sourceKey,contentHash,rowNumber,centre,language,submittedName,cleanedName,correctedName,timestampText,personId,confirmedMemberId,rawAnswers,answers,method,warnings,updatedAt)
      VALUES ('response','batch','fictional-key','hash',2,'Centre A','English','Original Fictional','Original Fictional','Corrected Fictional','','fictional','FAKE-ONLY','{"Q1":"3"}','{"Q1":3}','method','[]',CURRENT_TIMESTAMP);
  `);
  copy.exec(readFileSync(`prisma/migrations/${staging}/migration.sql`, "utf8"));
  copy.exec(
    readFileSync(
      "prisma/migrations/202611240001_ncss_matched_csv/migration.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    {
      ...copy
        .prepare(
          "SELECT submittedName, cleanedName, correctedName FROM SurveyIdentityStage",
        )
        .get(),
    },
    {
      submittedName: "Original Fictional",
      cleanedName: "Original Fictional",
      correctedName: "Corrected Fictional",
    },
  );
  assert.deepEqual(
    {
      ...copy
        .prepare(
          "SELECT submittedName, correctedName, confirmedMemberId, rawAnswers, importMode FROM SurveyResponse",
        )
        .get(),
    },
    {
      submittedName: "",
      correctedName: null,
      confirmedMemberId: "FAKE-ONLY",
      rawAnswers: '{"Q1":"3"}',
      importMode: "Legacy",
    },
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

test("batch inserts retain row dispositions and exact data-quality filters across pages", async () => {
  const centre = "Fictional Batch Centre";
  const u = await actor("Staff", centre);
  const input = payload(
    Array.from({ length: 52 }, (_, i) =>
      make(randomUUID(), i === 51 ? { 1: "invalid", 4: "unknown", 8: "" } : {}),
    ),
    centre,
  );
  const batch = await db.$transaction((tx) => importSurveys(tx, u, input));
  assert.equal(batch.batches[0].saved, 52);
  for (const quality of ["timestamp", "whoqol", "phase"]) {
    const result = await listSurveys(u, { centre, quality });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0].surveyDate, null);
  }
  const second = await db.$transaction((tx) => importSurveys(tx, u, input));
  assert.equal(second.batches[0].duplicates, 52);
  assert.equal((await listSurveys(u, { centre, page: "3" })).rows.length, 12);
});

test("name corrections are scoped, reversible and audited without changing imports, scores or identity", async () => {
  const centre = "Fictional Name Review Centre";
  const writer = await actor("Staff", centre);
  const reader = await actor("Read Only", centre);
  const outside = await actor("Manager", "Fictional Other Centre");
  const input = payload(
    [make(randomUUID(), { 2: "Fictional Nmae 00000000", 6: "unknown" })],
    centre,
  );
  const batch = await db.$transaction((tx) => importSurveys(tx, writer, input));
  const original = await db.surveyResponse.findFirstOrThrow({
    where: { batchId: batch.batches[0].id },
  });
  const edit = (
    u: typeof writer,
    version: Date,
    name: string | null,
    notes?: string,
  ) =>
    db.$transaction((tx) =>
      updateSurvey(tx, u, {
        action: "correct-name",
        id: original.id,
        correctedName: name,
        version: version.toISOString(),
        notes,
        // Name changes must ignore payloads for other survey actions.
        answers: { Q1: 5 },
        personId: "not-a-caregiver",
        confirmed: true,
      }),
    );
  await assert.rejects(
    edit(reader, original.updatedAt, "Fictional Name"),
    /role/,
  );
  await assert.rejects(
    edit(outside, original.updatedAt, "Fictional Name"),
    /centre/,
  );
  await assert.rejects(
    edit(writer, original.updatedAt, "12345"),
    /name with letters/,
  );
  await edit(
    writer,
    original.updatedAt,
    " Fictional   Name ",
    "Checked against the source register",
  );
  const first = await get(original.id);
  assert.deepEqual(first, {
    ...original,
    updatedAt: first.updatedAt,
  });
  await assert.rejects(edit(writer, original.updatedAt, null), /changed/);
  assert.deepEqual(
    (await listSurveys(writer, { match: "Corrected" }, true)).rows.map(
      (r) => r.id,
    ),
    [original.id],
  );
  assert.deepEqual(
    (
      await listSurveys(writer, { match: "Needs Review", q: original.id })
    ).rows.map((r) => r.id),
    [original.id],
  );
  await edit(writer, first.updatedAt, "Fictional Middle Name");
  await edit(writer, (await get(original.id)).updatedAt, null);
  const detail = await surveyDetail(writer, original.id, true);
  assert.equal(detail.identity!.correctedName, null);
  assert.equal((await listSurveys(writer, { match: "Corrected" })).total, 0);
  assert.deepEqual(
    detail.identity!.nameHistory.map((entry) => [
      entry.previous,
      entry.corrected,
      entry.notes,
    ]),
    [
      ["Fictional Middle Name", null, ""],
      ["Fictional Name", "Fictional Middle Name", ""],
      [null, "Fictional Name", "Checked against the source register"],
    ],
  );
  assert.ok(
    detail.identity!.nameHistory.every(
      (entry) =>
        entry.reviewerName === writer.name && entry.timestamp instanceof Date,
    ),
  );
  const replay = await db.$transaction((tx) =>
    importSurveys(tx, writer, input),
  );
  assert.equal(replay.batches[0].duplicates, 1);
});

test("CaritaHub lookup, sequential review and reassignment keep identities in scope", async () => {
  const centre = "Fictional Identity Queue Centre";
  const writer = await actor("Staff", centre);
  const reader = await actor("Read Only", centre);
  const permitted = await caregiver(centre, "Fictional Li Hua");
  const stranger = await caregiver(
    "Fictional Other Centre",
    "Fictional Li Hwa",
  );
  const batch = await db.$transaction((tx) =>
    importSurveys(
      tx,
      writer,
      payload(
        [
          make(randomUUID(), { 2: "Fictional Li Hwa" }),
          make(randomUUID(), { 2: "F. L. H." }),
        ],
        centre,
      ),
    ),
  );
  const rows = await db.surveyResponse.findMany({
    where: { batchId: batch.batches[0].id },
    orderBy: { id: "asc" },
  });
  const findMember = (memberId: string) =>
    lookupSurveyMember(writer, { id: rows[0].id, memberId });
  await assert.rejects(findMember("Fictional Li Hwa"), /Member ID not found/);
  await assert.rejects(findMember("F. L. H."), /Member ID not found/);
  await assert.rejects(findMember(stranger.memberId!), /Member ID not found/);
  assert.deepEqual(await findMember(permitted.memberId!), {
    id: permitted.id,
    memberId: permitted.memberId,
    centre,
    status: permitted.status,
    birthDateConflict: false,
  });
  await assert.rejects(surveyDetail(reader, rows[0].id, true), /role/);
  assert.equal((await surveyDetail(reader, rows[0].id)).identity, null);
  await assert.rejects(listSurveys(reader, {}, true), /role/);
  assert.ok(
    !JSON.stringify(await listSurveys(reader, {})).includes("Fictional Li Hwa"),
  );
  assert.ok(
    JSON.stringify(await listSurveys(writer, {}, true)).includes(
      "Fictional Li Hwa",
    ),
  );
  await assert.rejects(nextSurveyForReview(reader, {}), /role/);
  assert.deepEqual(await nextSurveyForReview(writer, {}), { id: rows[0].id });
  const link = (confirmed: boolean, memberId: string) =>
    db.$transaction((tx) =>
      updateSurvey(tx, writer, {
        action: "link",
        id: rows[0].id,
        personId: permitted.id,
        verificationMethod: "CaritaHub",
        memberId,
        confirmed,
        version: rows[0].updatedAt.toISOString(),
        notes: "Verified in the fictional register",
      }),
    );
  await assert.rejects(link(false, permitted.memberId!), /Confirm identity/);
  await assert.rejects(link(true, stranger.memberId!), /Member ID not found/);
  await link(true, permitted.memberId!);
  assert.deepEqual(await nextSurveyForReview(writer, { after: rows[0].id }), {
    id: rows[1].id,
  });
  assert.equal((await get(rows[1].id)).personId, null);
  assert.equal((await listSurveys(writer, { match: "Verified" })).total, 1);
  assert.equal(await nextSurveyForReview(writer, { after: rows[1].id }), null);
  const detail = await surveyDetail(writer, rows[0].id, true);
  assert.equal(detail.identity!.reviews[0].memberId, permitted.memberId);
  assert.equal(detail.identity!.reviews[0].reviewerName, writer.name);
  assert.equal(
    detail.identity!.reviews[0].method,
    "CaritaHub (staff confirmed)",
  );
  const manager = await actor("Manager", centre);
  const replacement = await caregiver(centre);
  const update = (account: typeof writer, version: Date, decision: object) =>
    db.$transaction((tx) =>
      updateSurvey(tx, account, {
        id: rows[0].id,
        version: version.toISOString(),
        notes: "Fictional case review",
        ...decision,
      }),
    );
  const linked = await get(rows[0].id);
  await update(manager, linked.updatedAt, {
    action: "unlink",
    confirmed: true,
  });
  const linkAgain = {
    action: "link",
    confirmed: true,
    memberId: replacement.memberId,
    personId: replacement.id,
  };
  const unlinked = await get(rows[0].id);
  await assert.rejects(
    update(writer, unlinked.updatedAt, linkAgain),
    /Confirm identity in CaritaHub/,
  );
  await update(writer, unlinked.updatedAt, {
    ...linkAgain,
    verificationMethod: "CaritaHub",
  });
  const reassigned = await surveyDetail(writer, rows[0].id, true);
  assert.equal(reassigned.confirmedMemberId, replacement.memberId);
  assert.ok(
    reassigned.identity!.reviews.some(
      (review) =>
        review.action === "Unlinked" && review.memberId === permitted.memberId,
    ),
  );
  assert.equal((await get(rows[1].id)).personId, null);
  await db.$transaction((tx) =>
    updateSurvey(tx, writer, {
      action: "reject",
      id: rows[1].id,
      version: rows[1].updatedAt.toISOString(),
      notes: "Fictional Member ID could not be verified",
    }),
  );
  assert.equal((await get(rows[1].id)).matchStatus, "Ambiguous");
  assert.equal(
    (await surveyDetail(writer, rows[1].id, true)).identity!.reviews[0].action,
    "Rejected",
  );
});

test("all export languages keep staged names separate and identical answers in distinct submissions", async () => {
  const centre = "Fictional Multilingual Centre";
  const writer = await actor("Staff", centre);
  const input = payload(
    [make(randomUUID(), { 2: "Fictional Staged Name" })],
    centre,
  );
  const files = ["English", "Mandarin", "Malay / Tamil"].map((language) => ({
    ...input.files[0],
    language,
    name: `${language}.csv`,
  }));
  const result = await db.$transaction((tx) =>
    importSurveys(tx, writer, { centre, files }),
  );
  assert.deepEqual(
    result.batches.map((batch) => batch.saved),
    [1, 1, 1],
  );
  const safe = await listSurveys(writer, {});
  assert.ok(!JSON.stringify(safe).includes("Fictional Staged Name"));
  const staged = await listSurveys(writer, {}, true);
  assert.equal(staged.total, 3);
  assert.ok(
    staged.rows.every(
      (row) => row.identityStage?.submittedName === "Fictional Staged Name",
    ),
  );
  assert.ok(staged.rows.every((row) => row.overall === 50 && row.zbi === 12));
  const replay = await db.$transaction((tx) =>
    importSurveys(tx, writer, { centre, files }),
  );
  assert.deepEqual(
    replay.batches.map((batch) => batch.duplicates),
    [1, 1, 1],
  );
});

test("matched NCSS payload is strict and imports active existing IDs safely", async () => {
  const { ncssHeaders, ncssImportMode, readMatchedNCSS } =
    await import("../src/lib/ncss-matched-csv");
  const { parseNCSSIntake, processNCSS } =
    await import("../src/lib/ncss-import");
  const centre = "Fictional NCSS Test Centre";
  const u = await actor("Staff", centre),
    admin = await actor("Admin"),
    outOfScope = await actor("Staff", "Fictional Outside Centre"),
    reader = await actor("Read Only", centre);
  const p = await db.person.create({
    data: {
      kind: "Member",
      name: "Synthetic Caregiver",
      memberId: "000079",
      centre,
    },
  });
  const alternate = await caregiver(centre);
  const archived = await db.person.create({
    data: {
      kind: "Member",
      name: "Synthetic Archived",
      memberId: "000080",
      status: "Archived",
      centre,
    },
  });
  const recipient = await db.person.create({
    data: {
      kind: "Care Recipient",
      name: "Synthetic Recipient",
      memberId: "000081",
      centre,
    },
  });
  const elsewhere = await caregiver("Fictional Outside Centre");
  const source = (i: number) => i.toString(16).padStart(24, "0");
  const row = (
    i: number,
    memberId = p.memberId!,
    inFields: Record<number, string> = {},
  ) =>
    q(
      [
        source(i),
        "26/3/2026 10:50",
        "Private, Fictional\nIdentity",
        "01/01/1901",
        "At the start of / Before the programme",
        "Yes",
        ...Array(26).fill("3"),
        ...Array(6).fill("0"),
        "Private demographics",
        "Private demographics",
        memberId,
      ].map((v, i) => inFields[i] ?? v),
    );
  const parse = (
    rows: string[],
    language: "English" | "Mandarin" | "Malay / Tamil" = "English",
  ) =>
    readMatchedNCSS(
      [q([...ncssHeaders, "Member ID"]), ...rows].join("\r\n"),
      language,
    );
  const makeBody = (parsed: ReturnType<typeof parse>) => ({
    action: "preview",
    centre,
    language: parsed.language,
    rows: parsed.rows,
    excludedConsent: parsed.excluded.filter(
      (r) => r.status === "Consent excluded",
    ).length,
    excludedTest: parsed.excluded.filter((r) => r.status === "Test excluded")
      .length,
  });
  const request = (v: unknown, who = u) => processNCSS(who, parseNCSSIntake(v));
  const parsed = parse([
    row(1),
    row(2, "", {}),
    row(3, "BAD=ID"),
    row(4, archived.memberId!),
    row(5, recipient.memberId!),
    row(6, elsewhere.memberId!),
    row(7, "MISSING"),
    row(8, p.memberId!, { 5: "" }),
    row(9, p.memberId!, { 5: "No" }),
    row(10, p.memberId!, { 2: "FiCtIoNaL TeSt Name" }),
    row(11, p.memberId!, { 1: "30/2/2026 11:01" }),
    row(12, p.memberId!, { 0: "Fictional unexpected" }),
    row(13, p.memberId!, {
      4: "Fictional unknown phase",
      8: "Private unknown answer text",
      10: "",
      33: "",
    }),
  ]);
  const body = makeBody(parsed);
  assert.equal(parsed.rows[0].memberId, "000079");
  assert.equal(parsed.rows[0].surveyDate, "2026-03-26T02:50:00.000Z");
  assert.equal(
    parsed.rows.find((r) => r.rowNumber === 14)?.answers[2],
    "unknown",
  );
  for (const sensitive of ["Private", "1901", "Fictional", "FiCtIoNaL"])
    assert.ok(!JSON.stringify(body.rows).includes(sensitive));
  assert.throws(
    () => parseNCSSIntake({ ...body, filenames: ["Private name"] }),
    /Invalid matched/,
  );
  assert.throws(
    () =>
      parseNCSSIntake({
        ...body,
        rows: [{ ...body.rows[0], submittedName: "Private" }],
      }),
    /Invalid matched/,
  );
  assert.throws(
    () =>
      parseNCSSIntake({
        ...body,
        rows: [
          {
            ...body.rows[0],
            answers: [...Array(31).fill(2), "Private answer"],
          },
        ],
      }),
    /Invalid matched/,
  );
  assert.throws(
    () => parseNCSSIntake({ action: "import", files: [{ content: row(1) }] }),
    /Invalid matched/,
  );
  const prior = process.env.NCSS_SURVEY_IMPORT_APPROVAL;
  delete process.env.NCSS_SURVEY_IMPORT_APPROVAL;
  try {
    await assert.rejects(request(body), /organisational approval/);
    process.env.NCSS_SURVEY_IMPORT_APPROVAL = "fictional-tests-only";
    await assert.rejects(request(body, outOfScope), /centre permissions/);
    await assert.rejects(request(body, reader), /role/);
    const preview = await request(body);
    assert.ok(preview.reviewToken);
    assert.equal(preview.summary.ready, 2);
    assert.equal(preview.summary.incomplete, 1);
    assert.equal(preview.summary.rejected, 8);
    assert.equal(
      preview.rows?.filter((r) => r.status === "Member ID unavailable").length,
      4,
    );
    await assert.rejects(
      request({ ...body, action: "import" }),
      /preview has changed/,
    );
    const importBody = {
      ...body,
      action: "import",
      reviewToken: preview.reviewToken,
    };
    const simultaneous = await Promise.allSettled([
      request(importBody),
      request(importBody),
    ]);
    assert.equal(
      simultaneous.filter((r) => r.status === "fulfilled").length,
      1,
    );
    const imported = await db.surveyResponse.findMany({
      where: { importMode: ncssImportMode, centre },
      include: { identityStage: true },
    });
    assert.equal(imported.length, 2);
    const first = imported.find((r) => r.sourceResponseId === source(1))!;
    assert.equal(first.zbi, 0);
    assert.equal(first.overall, 50);
    assert.equal(first.personId, p.id);
    assert.equal(first.submittedName, "");
    assert.equal(first.dob, null);
    assert.equal(first.identityStage, null);
    assert.equal(imported.find((r) => r.phase === "Needs Review")?.zbi, null);
    assert.equal((await request(body)).summary.duplicates, 2);
    assert.equal(
      (await request({ ...body, language: "Mandarin" })).summary.conflicts,
      2,
    );
    assert.equal(
      (await request(makeBody(parse([row(1, alternate.memberId!), row(1)]))))
        .summary.conflicts,
      2,
    );
    assert.equal(
      (await request(makeBody(parse([row(1, p.memberId!, { 6: "4" })]))))
        .summary.conflicts,
      1,
    );
    assert.equal(
      (
        await request(
          makeBody(parse([row(1, p.memberId!, { 1: "27/3/2026 10:50" })])),
        )
      ).summary.conflicts,
      1,
    );
    const reassignment = {
      action: "reassign-import",
      id: first.id,
      version: first.updatedAt.toISOString(),
      personId: alternate.id,
      memberId: alternate.memberId,
      notes: "Fictional administrative correction",
      confirmed: true,
    };
    await assert.rejects(
      db.$transaction((tx) => updateSurvey(tx, u, reassignment)),
      /role/,
    );
    await db.$transaction((tx) => updateSurvey(tx, admin, reassignment));
    const corrected = await db.surveyResponse.findUniqueOrThrow({
      where: { id: first.id },
      include: { reviews: true },
    });
    assert.equal(corrected.confirmedMemberId, alternate.memberId);
    assert.equal(corrected.contentHash, first.contentHash);
    assert.deepEqual(corrected.rawAnswers, first.rawAnswers);
    assert.deepEqual(
      new Set(corrected.reviews.map((r) => r.memberId)),
      new Set([p.memberId, alternate.memberId]),
    );

    const mandarin = parse(
      [row(14, p.memberId!, { 5: "是", 6: "Good (好)" })],
      "Mandarin",
    );
    const tamil = parse(
      [row(15, p.memberId!, { 5: "ஆம்", 6: "Good (நல்லது)" })],
      "Malay / Tamil",
    );
    assert.equal(mandarin.rows[0].answers[0], 4);
    assert.equal(tamil.rows[0].answers[0], 4);
    for (const sourceFile of [mandarin, tamil]) {
      const multilingual = makeBody(sourceFile);
      const reviewed = await request(multilingual);
      assert.equal(reviewed.summary.ready, 1);
      await request({
        ...multilingual,
        action: "import",
        reviewToken: reviewed.reviewToken,
      });
    }
    const wide = parse(Array.from({ length: 5000 }, (_, i) => row(i + 100)));
    assert.equal(wide.rows.length, 5000);
    assert.equal((await request(makeBody(wide))).summary.ready, 5000);
    assert.throws(() => parse([row(16) + ',"unfinished']), /quoted/);
    assert.equal(parse([row(16), "", row(17)]).rows[1].rowNumber, 4);
    assert.throws(() => parse([row(17) + ",extra"]), /different number/);
    assert.throws(
      () =>
        readMatchedNCSS(
          [q([...ncssHeaders, "Member ID", "Matching Status"]), row(18)].join(
            "\n",
          ),
          "English",
        ),
      /final column/,
    );
  } finally {
    if (prior === undefined) delete process.env.NCSS_SURVEY_IMPORT_APPROVAL;
    else process.env.NCSS_SURVEY_IMPORT_APPROVAL = prior;
  }
});

test("downloadable NCSS workbook keeps original columns, text Member IDs and protected matching formulas", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const { ncssHeaders } = await import("../src/lib/ncss-matched-csv");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile("assets/ncss-member-id-template.xlsx");
  const mapping = workbook.getWorksheet("CaritaHub Mapping")!;
  const survey = workbook.getWorksheet("NCSS Matched Survey")!;
  assert.deepEqual(
    Array.from({ length: 41 }, (_, i) => survey.getCell(1, i + 1).value),
    [...ncssHeaders, "Member ID"],
  );
  assert.equal(mapping.getCell("B5001").numFmt, "@");
  assert.equal(survey.getCell("AQ1001").numFmt, "@");
  assert.equal(survey.getCell("AQ1001").protection?.locked, false);
  assert.equal(survey.getCell("A1").protection?.locked, false);
  assert.notEqual(survey.getCell("AO1").protection?.locked, false);
  assert.notEqual(survey.getCell("AO1001").protection?.locked, false);
  assert.match(survey.getCell("AO2").formula!, /AQ2.*AP2/);
  assert.match(survey.getCell("AP2").formula!, /AT2<>1/);
  assert.match(survey.getCell("AR2").formula!, /Duplicate Name/);
  assert.match(survey.getCell("AT2").formula!, /COUNTIF/);
  assert.equal(workbook.worksheets.length, 2);
});
