import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const url = `file:${resolve("data", `review-${randomUUID()}.db`).replace(/\\/g, "/")}`;
process.env.DATABASE_URL = url;
new DatabaseSync(url.slice(5)).close();
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const { db, programmeInclude } = await import("../src/lib/db");
const { saveProgrammeReview } = await import("../src/lib/programme-review");
const { syncProgrammes } = await import("../src/lib/programme-sync");
const {
  catalogueCounts,
  filterCatalogue,
  reviewStatus,
  confirmedOccurrences,
  recommendationReady,
  suitabilityIssues,
} = await import("../src/lib/programme-source");
const { match } = await import("../src/lib/matching");
const { saveProgramme } = await import("../src/lib/records");
import type { Programme } from "../src/lib/types";
after(() => db.$disconnect());
process.env.P3H_SYNC_ENABLED = "true";
process.env.P3H_PROGRAMME_FEED_URL =
  "https://abcdefghijklmnopqrst.supabase.co/functions/v1/p3h-programmes";
process.env.P3H_SYNC_SHARED_SECRET =
  "fictional-review-test-shared-secret-32-characters";
const eligibility = (
  state = "confirmed_upcoming",
  reasonCodes: string[] = [],
) => ({
  eligibilityStatus: state,
  recommendationEligible: state === "confirmed_upcoming",
  identifiableProgramme: true,
  inUpcomingCatalogue: !["hidden", "past", "cancelled"].includes(state),
  confirmed: state === "confirmed_upcoming",
  schedulingVerification: {
    status: state === "scheduling_review" ? "required" : "verified",
    reasonCodes: state === "scheduling_review" ? ["venue_conflict"] : [],
  },
  reasonCodes,
});
const occurrence = (key = "o1") => ({
  occurrenceKey: key,
  sourceRecordIds: ["classes:original"],
  sessionDate: "2099-12-01",
  day: "Tuesday",
  startTime: "10:00",
  endTime: "11:00",
  venue: "Off-site",
  status: "scheduled",
  cancelled: false,
  sourceUpdatedAt: null as string | null,
  recurrence: null,
  sourceActivityName: "Healthy Eating",
  independentSession: false,
  sourceVisibility: { timetableVisible: true, calendarVisible: true },
  eligibility: eligibility(),
});
const programme = (key = "series-1", centreId = "SEEN_BB") => ({
  sourceProgrammeKey: key,
  name: "Healthy Eating",
  centreId,
  category: "Physical",
  sourceStatus: "scheduled",
  sourceUpdatedAt: null as string | null,
  recurrence: "Weekly",
  fragmentIndex: 0,
  fragmentCount: 1,
  occurrences: [occurrence()],
  scheduleTemplates: [],
  excludedOccurrences: [] as ReturnType<typeof occurrence>[],
});
const feed =
  (items: unknown[], excludedItems: unknown[] = []): typeof fetch =>
  async () =>
    Response.json({
      version: 1,
      eligibilityRulesVersion: 2,
      source: "program-spacebooking",
      generatedAt: new Date().toISOString(),
      items,
      excludedItems,
      page: { hasMore: false, nextCursor: null },
    });
async function actor(role = "Admin", centres: string[] = []) {
  return db.user.create({
    data: {
      username: randomUUID(),
      name: "Fictional Reviewer",
      passwordHash: "test",
      role,
      allCentres: role === "Admin",
      allowedCentres: { create: centres.map((centre) => ({ centre })) },
    },
    include: { allowedCentres: true },
  });
}
const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
const get = async (id: string) =>
  db.programme.findUniqueOrThrow({ where: { id }, include: programmeInclude });
const input = (p: Awaited<ReturnType<typeof get>>, decision = "reviewed") => ({
  decision,
  version: p.updatedAt.toISOString(),
  reviewVersion: p.review?.updatedAt.toISOString() ?? null,
  sourceFingerprint: p.external?.reviewFingerprint ?? "",
  values: {
    audience: "Both",
    languages: "English",
    interests: "Music",
    mobility: "Assisted",
    conditions: "",
    languageAssessment: "Assessed",
    interestAssessment: "Assessed",
    mobilityAssessment: "Assessed",
    conditionAssessment: "Not Applicable",
    accessibility: "Step-free; staff assistance required",
    intensity: "Low",
    registrationStatus: "Unverified",
    staffNotes:
      "Assessed by staff; condition-specific assessment not applicable",
    description: "Additional local details",
    notes: "Keep staff notes",
  },
});
async function clearRate(id: string) {
  await db.programmeSyncRun.updateMany({
    where: { userId: id },
    data: { startedAt: new Date("2020-01-01") },
  });
}
test("persistent explicit review workflow, N/A care assessments, stale review and scoped staff", async () => {
  const admin = await actor();
  await syncProgrammes(admin, db, feed([programme()]));
  let p = await db.programme.findFirstOrThrow({
    where: { external: { isNot: null } },
    include: programmeInclude,
  });
  assert.equal(reviewStatus(p), "Pending Review");
  assert.equal(p.review?.status, "Pending Review");
  assert.ok(suitabilityIssues(p).length);
  const incomplete = input(p);
  incomplete.values.languages = "";
  await assert.rejects(
    db.$transaction((tx) => saveProgrammeReview(tx, admin, p.id, incomplete)),
    /supported languages/,
  );
  const staff = await actor("Staff", ["SEEN Bukit Batok"]);
  await db.$transaction((tx) =>
    saveProgrammeReview(tx, staff, p.id, input(p, "draft")),
  );
  p = await get(p.id);
  assert.equal(p.review?.status, "In Review");
  assert.equal(p.review?.reviewedAt, null);
  const before = p;
  await db.$transaction((tx) => saveProgrammeReview(tx, staff, p.id, input(p)));
  p = await get(p.id);
  assert.equal(p.review?.status, "Reviewed");
  assert.equal(p.review?.reviewedBy, staff.id);
  assert.equal(p.conditions.length, 0);
  assert.equal(p.review?.conditionAssessment, "Not Applicable");
  assert.equal(suitabilityIssues(p).length, 0);
  assert.equal(recommendationReady(json<Programme>(p)), true);
  assert.equal(p.registrationStatus, "Unverified");
  await assert.rejects(
    db.$transaction((tx) =>
      saveProgrammeReview(tx, staff, p.id, input(before)),
    ),
    /Reload before reviewing/,
  );
  const outside = await actor("Staff", ["GLOW Nanyang"]);
  await assert.rejects(
    db.$transaction((tx) => saveProgrammeReview(tx, outside, p.id, input(p))),
    /centre permissions/,
  );
  const readOnly = await actor("Read Only", ["SEEN Bukit Batok"]);
  await assert.rejects(
    db.$transaction((tx) => saveProgrammeReview(tx, readOnly, p.id, input(p))),
    /role/,
  );
  await db.$transaction((tx) =>
    saveProgrammeReview(tx, staff, p.id, input(p, "information")),
  );
  p = await get(p.id);
  assert.equal(p.review?.status, "Needs Recheck");
  assert.equal(p.review?.staffNotes, input(p).values.staffNotes);
  assert.ok(p.review?.reviewedAt);
});
test("identical and metadata-only syncs retain approval; material change requires recheck and preserves participation", async () => {
  const admin = await actor();
  const source = programme("preserve");
  await syncProgrammes(admin, db, feed([source]));
  let p = await db.programme.findFirstOrThrow({
    where: { external: { sourceKey: "preserve" } },
    include: programmeInclude,
  });
  await db.$transaction((tx) => saveProgrammeReview(tx, admin, p.id, input(p)));
  p = await get(p.id);
  const person = await db.person.create({
    data: { kind: "Member", name: "Fictional" },
  });
  await db.participation.create({
    data: { personId: person.id, programmeId: p.id, status: "Attended" },
  });
  await syncProgrammes(admin, db, feed([source]));
  p = await get(p.id);
  assert.equal(p.review?.status, "Reviewed");
  source.occurrences[0].sourceUpdatedAt = "2026-11-04T02:00:00Z";
  source.occurrences[0].sourceRecordIds = ["classes:replacement"];
  await syncProgrammes(admin, db, feed([source]));
  p = await get(p.id);
  assert.equal(p.review?.status, "Reviewed");
  await clearRate(admin.id);
  source.occurrences[0].venue = "Different hall";
  await syncProgrammes(admin, db, feed([source]));
  p = await get(p.id);
  assert.equal(p.review?.status, "Needs Recheck");
  assert.equal(p.notes, "Keep staff notes");
  assert.equal(p.participations.length, 1);
  assert.equal(p.languages[0].language.name, "English");
  await db.$transaction((tx) => saveProgrammeReview(tx, admin, p.id, input(p)));
  p = await get(p.id);
  await db.$transaction((tx) =>
    saveProgramme(
      tx,
      admin.id,
      {
        ...p,
        languages: "English",
        interests: "Music",
        conditions: "",
        mobility: "Independent",
      },
      p.id,
    ),
  );
  p = await get(p.id);
  assert.equal(p.review?.status, "Needs Recheck");
});
test("centre/review/search filters and metrics agree; stable series remain distinct and sessions group", async () => {
  const admin = await actor();
  const one = programme("group-a", "GLOW_BB"),
    two = programme("group-b", "GLOW_BB"),
    three = programme("other-centre", "GLOW_NY");
  one.occurrences.push({ ...occurrence("o2"), sessionDate: "2099-12-08" });
  await syncProgrammes(admin, db, feed([one, two, three]));
  const rows = json<Programme[]>(
    await db.programme.findMany({
      where: {
        external: { sourceKey: { in: ["group-a", "group-b", "other-centre"] } },
      },
      include: programmeInclude,
    }),
  );
  const centre = filterCatalogue(rows, { centre: "GLOW_BB" });
  assert.equal(centre.length, 2);
  assert.equal(catalogueCounts(centre).upcoming, 3);
  const queue = filterCatalogue(centre, {
    review: "Pending Review",
    q: "Healthy",
    category: "Physical",
  });
  assert.equal(queue.length, catalogueCounts(centre).pending);
  assert.equal(filterCatalogue(rows, { centre: "SEEN_NY" }).length, 0);
  assert.equal(
    confirmedOccurrences(
      centre.find((p) => p.external?.sourceKey === "group-a")!,
    ).length,
    2,
  );
  assert.notEqual(centre[0].id, centre[1].id);
});
test("source classifications, excluded-only pages, unknown legacy eligibility and missing suitability never imply readiness", async () => {
  const admin = await actor();
  const manual = await db.programme.create({
    data: { name: "Healthy Eating", notes: "Manual stays" },
  });
  for (const state of [
    "confirmed_upcoming",
    "tentative",
    "cancelled",
    "past",
    "hidden",
    "incomplete",
    "scheduling_review",
  ]) {
    await clearRate(admin.id);
    const value = programme(`classification-${state}`);
    value.occurrences[0].eligibility = eligibility(state);
    if (state === "hidden")
      value.occurrences[0].sourceVisibility.calendarVisible = false;
    if (state === "cancelled") {
      value.occurrences[0].cancelled = true;
      value.occurrences[0].status = "cancelled";
    }
    if (state === "tentative") value.occurrences[0].status = "tbc";
    if (["past", "hidden"].includes(state)) {
      value.excludedOccurrences = value.occurrences;
      value.occurrences = [];
    }
    await syncProgrammes(
      admin,
      db,
      feed(
        value.occurrences.length ? [value] : [],
        value.occurrences.length ? [] : [value],
      ),
    );
    const p = await db.programme.findFirstOrThrow({
      where: { external: { sourceKey: value.sourceProgrammeKey } },
      include: programmeInclude,
    });
    assert.equal(p.external?.occurrences[0].eligibilityStatus, state);
    assert.equal(
      confirmedOccurrences(p).length,
      state === "confirmed_upcoming" ? 1 : 0,
    );
    assert.equal(recommendationReady(json<Programme>(p)), false);
  }
  assert.equal((await get(manual.id)).notes, "Manual stays");
  const person = {
    languages: ["English"],
    interests: ["Music"],
    conditions: ["Dementia"],
    mobility: "Assisted",
  };
  const matched = match(person, person, {
    ...person,
    imported: true,
    conditionAssessment: "Not Applicable",
    conditions: [],
  });
  assert.equal(matched.score, 65);
  assert.ok(matched.reasons.some((r) => r.includes("no condition-specific")));
  assert.equal(
    match(person, person, {
      ...person,
      imported: true,
      mobility: "",
      reviewRequired: true,
    }).eligible,
    false,
  );
});

test("legacy eligibility and unknown source suitability stay unverified; incomplete exclusions do not break pagination", async () => {
  const admin = await actor();
  const source = programme("legacy-source");
  const {
    eligibility: ignored,
    sourceVisibility: visibility,
    ...legacyOccurrence
  } = source.occurrences[0];
  void ignored;
  void visibility;
  const legacy = {
    ...source,
    occurrences: [legacyOccurrence],
    languages: ["English"],
    mobility: "All",
    conditions: ["Dementia"],
    suitabilityReviewed: true,
  };
  await syncProgrammes(admin, db, async () =>
    Response.json({
      version: 1,
      source: "program-spacebooking",
      generatedAt: new Date().toISOString(),
      items: [legacy],
      page: { hasMore: false, nextCursor: null },
    }),
  );
  const p = await db.programme.findFirstOrThrow({
    where: { external: { sourceKey: source.sourceProgrammeKey } },
    include: programmeInclude,
  });
  assert.equal(p.languages.length, 0);
  assert.equal(p.mobility, "");
  assert.equal(p.external?.groupingStatus, "Unverified");
  assert.equal(confirmedOccurrences(p).length, 0);
  assert.equal(reviewStatus(p), "Pending Review");
  assert.ok(suitabilityIssues(p).includes("Assess mobility suitability"));
  const hidden = programme("excluded-first");
  hidden.excludedOccurrences = [
    {
      ...occurrence(),
      eligibility: eligibility("hidden"),
      sourceVisibility: { timetableVisible: false, calendarVisible: false },
    },
  ];
  hidden.occurrences = [];
  let page = 0;
  await syncProgrammes(admin, db, async () =>
    Response.json(
      page++ === 0
        ? {
            version: 1,
            eligibilityRulesVersion: 2,
            source: "program-spacebooking",
            generatedAt: new Date().toISOString(),
            items: [],
            excludedItems: [hidden],
            page: { hasMore: true, nextCursor: "next" },
          }
        : {
            version: 1,
            eligibilityRulesVersion: 2,
            source: "program-spacebooking",
            generatedAt: new Date().toISOString(),
            items: [programme("after-excluded-page")],
            page: { hasMore: false, nextCursor: null },
          },
    ),
  );
  assert.equal(
    await db.externalProgramme.count({
      where: { sourceKey: { in: ["excluded-first", "after-excluded-page"] } },
    }),
    2,
  );
  const subject = {
    languages: ["English"],
    interests: ["Music"],
    conditions: [],
    mobility: "",
  };
  assert.equal(
    match(subject, undefined, {
      ...subject,
      mobility: "All",
      imported: true,
      conditionAssessment: "Not Applicable",
    }).eligible,
    false,
  );
});

test("additive review migration rechecks only imported legacy approvals without changing manual records", () => {
  const copy = new DatabaseSync(":memory:");
  for (const folder of readdirSync("prisma/migrations")
    .filter(
      (name) =>
        name.startsWith("20") && name !== "202611040002_programme_review",
    )
    .sort())
    copy.exec(
      readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"),
    );
  copy.exec(`INSERT INTO Programme(id,name,suitabilityReviewed,notes,updatedAt) VALUES('manual','Manual approval',true,'Keep manual notes',CURRENT_TIMESTAMP),('imported','Imported approval',true,'Keep imported notes',CURRENT_TIMESTAMP);
 INSERT INTO ExternalProgramme(id,programmeId,source,sourceKey,centreId,lastSeenAt,lastSyncAt,fingerprint) VALUES('ext','imported','program-spacebooking','legacy','SEEN_BB',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'legacy-fingerprint');`);
  const before = copy.prepare("SELECT * FROM Programme ORDER BY id").all();
  copy.exec(
    readFileSync(
      "prisma/migrations/202611040002_programme_review/migration.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    copy.prepare("SELECT * FROM Programme ORDER BY id").all(),
    before,
  );
  assert.equal(
    copy
      .prepare(
        "SELECT COUNT(*) AS count FROM ProgrammeReview WHERE programmeId='manual'",
      )
      .get()?.count,
    0,
  );
  assert.equal(
    copy
      .prepare(
        "SELECT status FROM ProgrammeReview WHERE programmeId='imported'",
      )
      .get()?.status,
    "Needs Recheck",
  );
  assert.equal(
    copy.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  copy.close();
});

test("valid one-digit source hours normalise and an unknown centre cannot leave stale eligible sessions", async () => {
  const admin = await actor();
  const value = programme("clock-and-centre");
  value.occurrences[0].startTime = "9:00";
  await syncProgrammes(admin, db, feed([value]));
  let p = await db.programme.findFirstOrThrow({
    where: { external: { sourceKey: value.sourceProgrammeKey } },
    include: programmeInclude,
  });
  assert.equal(p.external?.occurrences[0].startTime, "09:00");
  assert.equal(confirmedOccurrences(p).length, 1);
  await db.$transaction((tx) => saveProgrammeReview(tx, admin, p.id, input(p)));
  value.centreId = "UNKNOWN";
  const r = await syncProgrammes(admin, db, feed([value]));
  assert.equal(r.skipped, 1);
  p = await get(p.id);
  assert.equal(p.external?.missing, true);
  assert.equal(p.review?.status, "Needs Recheck");
  assert.equal(confirmedOccurrences(p).length, 0);
});

test("two reviewers cannot overwrite the same programme revision", async () => {
  const admin = await actor();
  await syncProgrammes(admin, db, feed([programme("parallel-reviews")]));
  const p = await db.programme.findFirstOrThrow({
    where: { external: { sourceKey: "parallel-reviews" } },
    include: programmeInclude,
  });
  const a = input(p, "draft"),
    b = input(p, "draft");
  a.values.staffNotes = "First concurrent draft";
  b.values.staffNotes = "Second concurrent draft";
  const results = await Promise.allSettled([
    db.$transaction((tx) => saveProgrammeReview(tx, admin, p.id, a)),
    db.$transaction((tx) => saveProgrammeReview(tx, admin, p.id, b)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const saved = await get(p.id);
  assert.ok(
    [a.values.staffNotes, b.values.staffNotes].includes(
      saved.review!.staffNotes,
    ),
  );
});
