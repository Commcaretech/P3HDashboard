import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const url = `file:${resolve("data", `sync-${randomUUID()}.db`).replace(/\\/g, "/")}`;
process.env.DATABASE_URL = url;
new DatabaseSync(url.slice(5)).close();
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const { db } = await import("../src/lib/db");
const { syncProgrammes, fetchCatalogue, syncConfig, canSync } =
  await import("../src/lib/programme-sync");
const { saveProgramme } = await import("../src/lib/records");
const { needsReview, nextOccurrence } =
  await import("../src/lib/programme-source");
const { programmeInclude } = await import("../src/lib/db");
const { match } = await import("../src/lib/matching");
process.env.P3H_SYNC_ENABLED = "true";
process.env.P3H_PROGRAMME_FEED_URL =
  "https://abcdefghijklmnopqrst.supabase.co/functions/v1/p3h-programmes";
process.env.P3H_SYNC_SHARED_SECRET = "fictional-32-character-or-longer-secret";
after(() => db.$disconnect());
const occ = (key = "o1") => ({
  occurrenceKey: key,
  sourceRecordIds: ["classes:1"],
  sessionDate: "2099-12-01",
  day: "Monday",
  startTime: "10:00",
  endTime: "11:00",
  venue: "Hall",
  status: "confirmed",
  cancelled: false,
  sourceUpdatedAt: null,
  recurrence: null,
});
const item = () => ({
  sourceProgrammeKey: "stable-1",
  name: "Programme",
  centreId: "SEEN_BB",
  category: "Social",
  sourceStatus: "confirmed",
  sourceUpdatedAt: null,
  recurrence: null,
  fragmentIndex: 0,
  fragmentCount: 1,
  occurrences: [occ()],
  scheduleTemplates: [],
});
const envelope = (items: unknown[]) => ({
  version: 1,
  source: "program-spacebooking",
  generatedAt: new Date().toISOString(),
  items,
  page: { hasMore: false, nextCursor: null },
});
const feed =
  (items: unknown[]): typeof fetch =>
  async (_url, init) => {
    assert.equal(
      new Headers(init?.headers).get("x-p3h-sync-token"),
      process.env.P3H_SYNC_SHARED_SECRET,
    );
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    return Response.json(envelope(items));
  };
async function user(role = "Admin", allCentres = true, centres: string[] = []) {
  return db.user.create({
    data: {
      username: randomUUID(),
      name: "Fictional",
      passwordHash: "test",
      role,
      allCentres,
      allowedCentres: { create: centres.map((centre) => ({ centre })) },
    },
    include: { allowedCentres: true },
  });
}
async function clearRate(id: string) {
  await db.programmeSyncRun.updateMany({
    where: { userId: id },
    data: { startedAt: new Date("2020-01-01") },
  });
}
test("first import, idempotency, changes, cancellation and local ownership preserve records", async () => {
  const u = await user();
  const manual = await db.programme.create({ data: { name: "Programme" } });
  const person = await db.person.create({
    data: { kind: "Member", name: "Fictional" },
  });
  const first = await syncProgrammes(u, db, feed([item()]));
  assert.equal(first.created, 1);
  let p = await db.programme.findFirstOrThrow({
    where: { external: { isNot: null } },
    include: programmeInclude,
  });
  assert.notEqual(p.id, manual.id);
  assert.equal(p.registrationStatus, "Unverified");
  assert.equal(p.mobility, "");
  assert.ok(needsReview(p));
  assert.equal(nextOccurrence(p)?.date, "2099-12-01");
  await db.participation.create({
    data: { personId: person.id, programmeId: p.id, status: "Attended" },
  });
  await db.$transaction((tx) =>
    saveProgramme(
      tx,
      u.id,
      {
        ...p,
        name: "Attempted source edit",
        description: "Local description",
        languages: "English",
        interests: "Music",
        conditions: "Dementia",
        mobility: "Assisted",
        notes: "Local notes",
        suitabilityReviewed: "Reviewed",
        registrationStatus: "Open",
      },
      p.id,
    ),
  );
  const second = await syncProgrammes(u, db, feed([item(), item()]));
  assert.equal(second.created, 0);
  assert.equal(second.unchanged, 1);
  p = await db.programme.findUniqueOrThrow({
    where: { id: p.id },
    include: programmeInclude,
  });
  assert.equal(p.name, "Programme");
  assert.equal(p.description, "Local description");
  assert.equal(p.languages[0].language.name, "English");
  assert.equal(p.registrationStatus, "Open");
  assert.equal(p.participations.length, 1);
  const changed = item();
  changed.name = "Renamed";
  changed.occurrences[0].venue = "New hall";
  changed.occurrences.push(occ("o2"));
  const third = await syncProgrammes(u, db, feed([changed]));
  assert.equal(third.updated, 1);
  await clearRate(u.id);
  changed.occurrences[0].cancelled = true;
  await syncProgrammes(u, db, feed([changed]));
  p = await db.programme.findUniqueOrThrow({
    where: { id: p.id },
    include: programmeInclude,
  });
  assert.equal(p.external?.occurrences.length, 2);
  assert.equal(
    p.external?.occurrences.find((o) => o.sourceKey === "o1")?.status,
    "cancelled",
  );
  assert.equal(p.name, "Renamed");
  assert.equal(await db.programme.count({ where: { id: manual.id } }), 1);
  await clearRate(u.id);
  await syncProgrammes(u, db, feed([]));
  p = await db.programme.findUniqueOrThrow({
    where: { id: p.id },
    include: programmeInclude,
  });
  assert.equal(p.external?.missing, true);
  assert.equal(p.participations.length, 1);
  assert.ok(needsReview(p));
  const history = await db.programmeSyncRun.findUniqueOrThrow({
    where: { id: first.runId },
  });
  assert.equal(history.created, 1);
  assert.equal(history.status, "Success");
});
test("manager scope, roles, disabled configuration and upstream failures", async () => {
  for (const role of ["Staff", "Read Only"]) {
    const u = await user(role);
    assert.equal(canSync(u), false);
    await assert.rejects(
      syncProgrammes(u, db, feed([])),
      (e) => e instanceof Error && e.message.includes("role"),
    );
  }
  const manager = await user("Manager", false, ["SEEN Bukit Batok"]);
  const permitted = { ...item(), sourceProgrammeKey: "manager-1" };
  const denied = {
    ...item(),
    sourceProgrammeKey: "denied-1",
    centreId: "GLOW_NY",
  };
  const r = await syncProgrammes(manager, db, feed([permitted, denied]));
  assert.equal(r.created, 1);
  assert.equal(r.skipped, 1);
  assert.equal(
    await db.externalProgramme.count({ where: { sourceKey: "denied-1" } }),
    0,
  );
  const admin = await user();
  const before = await db.programme.count();
  process.env.P3H_SYNC_ENABLED = "false";
  let called = false;
  await assert.rejects(
    syncProgrammes(admin, db, async () => {
      called = true;
      throw Error();
    }),
  );
  assert.equal(called, false);
  process.env.P3H_SYNC_ENABLED = "true";
  for (const code of [401, 500]) {
    await clearRate(admin.id);
    await assert.rejects(
      syncProgrammes(
        admin,
        db,
        async () => new Response("private upstream error", { status: code }),
      ),
    );
  }
  assert.equal(await db.programme.count(), before);
  const original = process.env.P3H_SYNC_SHARED_SECRET;
  delete process.env.P3H_SYNC_SHARED_SECRET;
  assert.throws(() => syncConfig());
  process.env.P3H_SYNC_SHARED_SECRET = original;
});
test("lease prevents overlap and recovers expiry; transaction rollback preserves catalogue", async () => {
  const u = await user();
  await db.programmeSyncLock.create({
    data: {
      id: "program-spacebooking",
      token: "other",
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await assert.rejects(syncProgrammes(u, db, feed([])), (e) =>
    Boolean(e && typeof e === "object" && "status" in e && e.status === 409),
  );
  await db.programmeSyncLock.update({
    where: { id: "program-spacebooking" },
    data: { expiresAt: new Date(0) },
  });
  const result = await syncProgrammes(
    u,
    db,
    feed([{ ...item(), sourceProgrammeKey: "recovered" }]),
  );
  assert.equal(result.created, 1);
  assert.equal(await db.programmeSyncLock.count(), 0);
  const count = await db.programme.count();
  const failClient = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return async () => {
          throw Error("private database error");
        };
      return Reflect.get(target, key);
    },
  });
  await assert.rejects(
    syncProgrammes(u, failClient, feed([])),
    /previous catalogue/,
  );
  assert.equal(await db.programme.count(), count);
  assert.equal(await db.programmeSyncLock.count(), 0);
});
test("strict feed validation rejects invalid JSON, incomplete and cyclic pages, wrong source, conflicting keys and fragments", async () => {
  const config = syncConfig();
  const cases: unknown[] = [
    {},
    { ...envelope([]), version: 2 },
    { ...envelope([]), source: "other" },
    { ...envelope([]), page: { hasMore: true, nextCursor: null } },
    envelope([{ ...item(), fragmentCount: 2 }]),
    envelope([item(), { ...item(), name: "conflict" }]),
    envelope([
      { ...item(), occurrences: [occ(), { ...occ(), venue: "conflict" }] },
    ]),
    envelope([
      { ...item(), occurrences: [{ ...occ(), sessionDate: "2026-02-31" }] },
    ]),
  ];
  for (const body of cases)
    await assert.rejects(
      fetchCatalogue(config, async () => Response.json(body)),
    );
  await assert.rejects(
    fetchCatalogue(config, async () => new Response("{invalid")),
  );
  await assert.rejects(
    fetchCatalogue(config, async () => {
      throw Error("Network error with private token");
    }),
    /failed validation/,
  );
  await assert.rejects(
    fetchCatalogue(config, async () =>
      Response.json({
        ...envelope([item()]),
        page: { hasMore: true, nextCursor: "same" },
      }),
    ),
    /Repeated/,
  );
});
test("fragments merge, duplicates deduplicate, changed row IDs keep stable programme identity", async () => {
  const config = syncConfig();
  const a = { ...item(), fragmentCount: 2 };
  const b = { ...a, fragmentIndex: 1, occurrences: [occ("o2")] };
  let page = 0;
  const merged = await fetchCatalogue(config, async () =>
    Response.json(
      page++ === 0
        ? { ...envelope([a]), page: { hasMore: true, nextCursor: "next" } }
        : envelope([b]),
    ),
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].occurrences.length, 2);
  const u = await user();
  const value = { ...item(), sourceProgrammeKey: "row-replacement" };
  await syncProgrammes(u, db, feed([value]));
  value.occurrences[0].sourceRecordIds = ["classes:new-monthly-id"];
  await syncProgrammes(u, db, feed([value]));
  assert.equal(
    await db.externalProgramme.count({
      where: { sourceKey: value.sourceProgrammeKey },
    }),
    1,
  );
});
test("unknown centres are skipped, recommendations require explicit suitability", async () => {
  const u = await user();
  const r = await syncProgrammes(
    u,
    db,
    feed([{ ...item(), centreId: "UNKNOWN", sourceProgrammeKey: "unknown" }]),
  );
  assert.equal(r.skipped, 1);
  assert.equal(
    await db.externalProgramme.count({ where: { sourceKey: "unknown" } }),
    0,
  );
  const person = {
    languages: ["English"],
    interests: ["Music"],
    conditions: ["Dementia"],
    mobility: "Assisted",
  };
  assert.equal(
    match(person, person, { ...person, mobility: "", imported: true }).eligible,
    false,
  );
  assert.equal(
    match(person, person, { ...person, imported: true, reviewRequired: true })
      .eligible,
    false,
  );
  for (const address of [
    "http://abcdefghijklmnopqrst.supabase.co/functions/v1/p3h-programmes",
    "https://evil.com/functions/v1/p3h-programmes",
    "https://abcdefghijklmnopqrst.supabase.co/functions/v1/p3h-programmes?token=x",
    "https://localhost/",
  ])
    assert.throws(() =>
      syncConfig({ ...process.env, P3H_PROGRAMME_FEED_URL: address }),
    );
});

test("simultaneous sync attempts have one owner; incomplete feed preserves prior records", async () => {
  const u = await user();
  let release: () => void = () => {};
  let started: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = syncProgrammes(u, db, async (input, init) => {
    started();
    await gate;
    return feed([{ ...item(), sourceProgrammeKey: "concurrent" }])(input, init);
  });
  await ready;
  await assert.rejects(syncProgrammes(u, db, feed([])), (e) =>
    Boolean(e && typeof e === "object" && "status" in e && e.status === 409),
  );
  release();
  await first;
  const snapshot = await db.externalProgramme.findMany({
    orderBy: { id: "asc" },
  });
  await assert.rejects(
    syncProgrammes(u, db, async () =>
      Response.json({
        ...envelope([item()]),
        page: { hasMore: true, nextCursor: null },
      }),
    ),
  );
  assert.deepEqual(
    await db.externalProgramme.findMany({ orderBy: { id: "asc" } }),
    snapshot,
  );
});
