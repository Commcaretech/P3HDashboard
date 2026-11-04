// Server module: imported only by route handlers and tests.
import { randomUUID, createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AccessUser, centreAllowed, unrestricted } from "./access";
import { sourceCentres } from "./programme-source";
export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const canSync = (u: AccessUser) => ["Admin", "Manager"].includes(u.role);
export function syncConfig(env = process.env) {
  if (env.P3H_SYNC_ENABLED !== "true")
    throw new SyncError(503, "Programme integration is disabled.");
  let url: URL;
  try {
    url = new URL(env.P3H_PROGRAMME_FEED_URL ?? "");
  } catch {
    throw new SyncError(503, "Programme feed configuration is incomplete.");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/functions/v1/p3h-programmes" ||
    url.search ||
    url.hash
  )
    throw new SyncError(503, "Programme feed URL is not permitted.");
  const secret = env.P3H_SYNC_SHARED_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512)
    throw new SyncError(503, "Programme feed configuration is incomplete.");
  return { url, secret };
}
const nullable = z.string().max(2000).nullable();
const timestamp = z.iso.datetime({ offset: true }).nullable();
const eligibility = z.object({
  eligibilityStatus: z.enum([
    "confirmed_upcoming",
    "tentative",
    "cancelled",
    "past",
    "hidden",
    "incomplete",
    "scheduling_review",
  ]),
  recommendationEligible: z.boolean(),
  identifiableProgramme: z.boolean(),
  inUpcomingCatalogue: z.boolean(),
  confirmed: z.boolean(),
  schedulingVerification: z.object({
    status: z.enum(["verified", "required", "not_checked"]),
    reasonCodes: z.array(z.string().max(200)).max(100),
  }),
  reasonCodes: z.array(z.string().max(200)).max(100),
  explanations: z.array(z.string().max(2000)).max(100).optional(),
});
const sourceClock = nullable.transform((v) =>
  v && /^\d:[0-5]\d$/.test(v) ? `0${v}` : v,
);
const occurrence = z
  .object({
    occurrenceKey: z.string().min(1).max(200),
    sourceRecordIds: z.array(z.string().max(200)).max(100),
    sessionDate: nullable,
    day: nullable,
    startTime: sourceClock,
    endTime: sourceClock,
    venue: nullable,
    status: nullable,
    cancelled: z.boolean(),
    sourceUpdatedAt: timestamp,
    recurrence: nullable,
    eligibility: eligibility.optional(),
    sourceVisibility: z
      .object({ timetableVisible: z.boolean(), calendarVisible: z.boolean() })
      .optional(),
    sourceActivityName: z.string().max(200).optional(),
    independentSession: z.boolean().optional(),
  })
  .refine((o) => {
    if (
      o.eligibility &&
      o.eligibility.eligibilityStatus !== "confirmed_upcoming"
    )
      return true;
    if (
      o.eligibility &&
      (!o.sessionDate || !o.startTime || !o.endTime || !o.venue)
    )
      return false;
    return (
      (!o.sessionDate || z.iso.date().safeParse(o.sessionDate).success) &&
      (!o.startTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(o.startTime)) &&
      (!o.endTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(o.endTime)) &&
      (!o.startTime || !o.endTime || o.endTime > o.startTime)
    );
  });
const diagnosticsSchema = z.object({
  excludedByReason: z.record(z.string().max(100), z.number().int().min(0)),
  schedulingReviewCount: z.number().int().min(0),
  eligibleUpcomingOccurrences: z.number().int().min(0),
  eligibleProgrammes: z.number().int().min(0),
});
const item = z.object({
  sourceProgrammeKey: z.string().min(1).max(200),
  name: z.string().trim().max(200),
  centreId: z.string().min(1).max(100).nullable(),
  rulesVersion: z.number().default(0),
  category: nullable,
  sourceStatus: nullable,
  sourceUpdatedAt: timestamp,
  recurrence: nullable,
  fragmentIndex: z.number().int().min(0).max(999),
  fragmentCount: z.number().int().min(1).max(1000),
  occurrences: z.array(occurrence).max(100),
  scheduleTemplates: z.array(occurrence).max(100),
  excludedOccurrences: z.array(occurrence).max(100).default([]),
});
const pageSchema = z.object({
  version: z.literal(1),
  eligibilityRulesVersion: z.literal(2).optional(),
  diagnostics: diagnosticsSchema.optional(),
  excludedItems: z.array(item).max(100).default([]),
  source: z.literal("program-spacebooking"),
  generatedAt: z.iso.datetime({ offset: true }),
  items: z.array(item).max(100),
  page: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).max(1024).nullable(),
  }),
});
type Item = z.infer<typeof item>;
export async function fetchCatalogue(
  config: ReturnType<typeof syncConfig>,
  fetcher: typeof fetch = fetch,
) {
  const fragments = new Map<string, Map<number, Item>>(),
    cursors = new Set<string>();
  let cursor: string | null = null,
    size = 0;
  const signal = AbortSignal.timeout(90000);
  let diagnostics: z.infer<typeof diagnosticsSchema> | undefined;
  let rulesVersion: number | undefined;
  for (let page = 0; page < 50; page++) {
    const url = new URL(config.url);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    let data: z.infer<typeof pageSchema>;
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: {
          "x-p3h-sync-token": config.secret,
          Accept: "application/json",
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok)
        throw new SyncError(
          502,
          response.status === 401
            ? "Programme source rejected the integration credentials."
            : "Programme source is unavailable. Retry later.",
        );
      // Stream with a hard bound, including chunked responses.
      const reader = response.body?.getReader();
      if (!reader) throw Error();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 2_000_000) {
          await reader.cancel();
          throw Error();
        }
        chunks.push(part.value);
      }
      size += bytes;
      if (size > 20_000_000) throw Error();
      data = pageSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
    } catch (e) {
      if (e instanceof SyncError) throw e;
      throw new SyncError(
        502,
        "Programme feed failed validation or timed out. No catalogue changes were saved.",
      );
    }
    if (
      rulesVersion !== undefined &&
      rulesVersion !== (data.eligibilityRulesVersion ?? 0)
    )
      throw new SyncError(
        502,
        "Feed eligibility version changed during pagination.",
      );
    rulesVersion = data.eligibilityRulesVersion ?? 0;
    if (
      diagnostics &&
      JSON.stringify(diagnostics) !== JSON.stringify(data.diagnostics)
    )
      throw new SyncError(502, "Feed diagnostics changed during pagination.");
    diagnostics = data.diagnostics;
    for (const value of [...data.items, ...data.excludedItems]) {
      value.rulesVersion = rulesVersion;
      if (
        rulesVersion === 2 &&
        [
          ...value.occurrences,
          ...value.scheduleTemplates,
          ...value.excludedOccurrences,
        ].some((o) => !o.eligibility || !o.sourceVisibility)
      )
        throw new SyncError(502, "Missing source eligibility classification.");
      let group = fragments.get(value.sourceProgrammeKey);
      if (!group) {
        group = new Map();
        fragments.set(value.sourceProgrammeKey, group);
      }
      const previous = group.get(value.fragmentIndex);
      if (previous && JSON.stringify(previous) !== JSON.stringify(value))
        throw new SyncError(
          502,
          "Conflicting programme fragments. Retry the sync.",
        );
      group.set(value.fragmentIndex, value);
    }
    if (
      data.page.hasMore !== Boolean(data.page.nextCursor) ||
      (data.page.hasMore && !data.items.length && !data.excludedItems.length)
    )
      throw new SyncError(502, "Incomplete programme pagination.");
    if (!data.page.hasMore) {
      const result: Item[] = [];
      for (const group of fragments.values()) {
        const first = group.get(0);
        if (!first || group.size !== first.fragmentCount)
          throw new SyncError(502, "Incomplete programme fragments.");
        const merged = {
          ...first,
          occurrences: [] as Item["occurrences"],
          scheduleTemplates: [] as Item["scheduleTemplates"],
          excludedOccurrences: [] as Item["excludedOccurrences"],
        };
        const seen = new Map<string, string>();
        for (let i = 0; i < first.fragmentCount; i++) {
          const f = group.get(i);
          if (!f) throw new SyncError(502, "Incomplete programme fragments.");
          const metadata = (v: Item) =>
            JSON.stringify({
              ...v,
              fragmentIndex: 0,
              occurrences: [],
              scheduleTemplates: [],
              excludedOccurrences: [],
            });
          if (metadata(f) !== metadata(first))
            throw new SyncError(502, "Conflicting programme fragments.");
          for (const kind of [
            "occurrences",
            "scheduleTemplates",
            "excludedOccurrences",
          ] as const)
            for (const o of f[kind]) {
              if (
                kind !== "excludedOccurrences" &&
                (kind === "occurrences") !== Boolean(o.sessionDate)
              )
                throw new SyncError(502, "Invalid occurrence date.");
              const serialized = JSON.stringify(o),
                prev = seen.get(o.occurrenceKey);
              if (prev && prev !== serialized)
                throw new SyncError(502, "Conflicting occurrence keys.");
              if (!prev) {
                merged[kind].push(o);
                seen.set(o.occurrenceKey, serialized);
              }
            }
        }
        result.push(merged);
      }
      return Object.assign(result, { diagnostics });
    }
    cursor = data.page.nextCursor;
    if (!cursor || cursors.has(cursor))
      throw new SyncError(502, "Repeated programme cursor.");
    cursors.add(cursor);
  }
  throw new SyncError(502, "Programme feed exceeds the safe page limit.");
}
const source = "program-spacebooking";
export async function syncProgrammes(
  u: AccessUser,
  client: PrismaClient = db,
  fetcher: typeof fetch = fetch,
) {
  const run = await client.programmeSyncRun.create({
    data: {
      userId: u.id,
      scope: unrestricted(u) ? ["*"] : u.allowedCentres.map((c) => c.centre),
    },
  });
  const token = randomUUID();
  let acquired = false;
  try {
    if (!canSync(u))
      throw new SyncError(
        403,
        "Your role does not permit programme synchronisation.",
      );
    const config = syncConfig();
    // A unique row plus conditional expired-lease takeover works across server processes.
    try {
      await client.programmeSyncLock.create({
        data: { id: source, token, expiresAt: new Date(Date.now() + 180000) },
      });
      acquired = true;
    } catch (e) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== "P2002"
      )
        throw e;
      acquired =
        (
          await client.programmeSyncLock.updateMany({
            where: { id: source, expiresAt: { lt: new Date() } },
            data: { token, expiresAt: new Date(Date.now() + 180000) },
          })
        ).count === 1;
    }
    if (!acquired)
      throw new SyncError(
        409,
        "A programme sync is already running. Retry after it finishes.",
      );
    const recent = await client.programmeSyncRun.count({
      where: {
        id: { not: run.id },
        userId: u.id,
        startedAt: { gte: new Date(Date.now() - 60000) },
        status: { in: ["Success", "Failed"] },
      },
    });
    if (recent >= 3)
      throw new SyncError(429, "Too many sync attempts. Wait one minute.");
    const items = await fetchCatalogue(config, fetcher);
    const counts = await client.$transaction(
      async (tx) => {
        const current = await tx.user.findUnique({
          where: { id: u.id },
          include: { allowedCentres: true },
        });
        if (
          !current?.active ||
          !canSync(current) ||
          current.role !== u.role ||
          current.allCentres !== u.allCentres ||
          JSON.stringify(current.allowedCentres.map((c) => c.centre).sort()) !==
            JSON.stringify(u.allowedCentres.map((c) => c.centre).sort())
        )
          throw new SyncError(
            403,
            "Staff access changed. Reload before syncing.",
          );
        const lease = await tx.programmeSyncLock.updateMany({
          where: { id: source, token, expiresAt: { gt: new Date() } },
          data: { expiresAt: new Date(Date.now() + 180000) },
        });
        if (lease.count !== 1)
          throw new SyncError(409, "Sync lease expired. Retry safely.");
        const totals = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
        const seen: string[] = [];
        for (const value of items) {
          const centre = sourceCentres[value.centreId ?? ""];
          if (!centre) {
            totals.skipped++;
            continue;
          }
          if (!centreAllowed(u, centre)) {
            totals.skipped++;
            continue;
          }
          const old = await tx.externalProgramme.findUnique({
            where: {
              source_sourceKey: { source, sourceKey: value.sourceProgrammeKey },
            },
            include: { programme: true },
          });
          if (old && !centreAllowed(u, old.programme.centre))
            throw new SyncError(
              403,
              "A programme centre change requires an administrator review.",
            );
          if (
            !old &&
            (!value.name ||
              [
                ...value.occurrences,
                ...value.scheduleTemplates,
                ...value.excludedOccurrences,
              ].every((o) => o.eligibility?.identifiableProgramme === false))
          ) {
            totals.skipped++;
            continue;
          }
          if (old?.ownership === "Local") {
            totals.skipped++;
            seen.push(old.id);
            continue;
          }
          const schedule = [
            ...value.occurrences,
            ...value.scheduleTemplates,
            ...value.excludedOccurrences,
          ].sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey));
          const reviewFingerprint = createHash("sha256")
            .update(
              JSON.stringify({
                name: value.name || old?.programme.name || "",
                centre,
                category: value.category,
                recurrence: value.recurrence,
                schedule: schedule
                  .map((o) => ({
                    date: o.sessionDate,
                    day: o.day,
                    start: o.startTime,
                    end: o.endTime,
                    venue: o.venue,
                    status: o.status,
                    cancelled: o.cancelled,
                    eligibility: o.eligibility?.eligibilityStatus,
                    scheduling: o.eligibility?.schedulingVerification,
                    visibility: o.sourceVisibility,
                    independent: o.independentSession,
                  }))
                  .sort((a, b) =>
                    JSON.stringify(a).localeCompare(JSON.stringify(b)),
                  ),
              }),
            )
            .digest("hex");
          const materialChange = Boolean(
            old && (old.missing || old.reviewFingerprint !== reviewFingerprint),
          );
          const groupingStatus =
            value.rulesVersion === 2 &&
            schedule.length > 0 &&
            !schedule.some((o) =>
              o.eligibility?.reasonCodes.some((c) =>
                ["series_membership_unverified", "ambiguous_identity"].includes(
                  c,
                ),
              ),
            )
              ? "Verified"
              : "Unverified";
          const fingerprint = createHash("sha256")
            .update(
              JSON.stringify({
                name: value.name || old?.programme.name || "",
                centre,
                category: value.category,
                recurrence: value.recurrence,
                status: value.sourceStatus,
                schedule,
              }),
            )
            .digest("hex");
          const changed =
            !old || old.fingerprint !== fingerprint || old.missing;
          const now = new Date();
          const p =
            old?.programme ??
            (await tx.programme.create({
              data: {
                name: value.name || old?.programme.name || "",
                centre,
                category: value.category ?? "",
                registrationStatus: "Unverified",
              },
            }));
          if (changed)
            await tx.programme.update({
              where: { id: p.id },
              data: {
                name: value.name || old?.programme.name || "",
                centre,
                category: value.category ?? "",
                frequency: value.recurrence ?? "",
                day: "",
                startTime: "",
                endTime: "",
                venue: "",
              },
            });
          if (materialChange) {
            await tx.programmeReview.updateMany({
              where: { programmeId: p.id, status: "Reviewed" },
              data: {
                status: "Needs Recheck",
                issues: [
                  "Source schedule, venue, category, visibility or eligibility changed; review required",
                ],
              },
            });
            await tx.programme.update({
              where: { id: p.id },
              data: { suitabilityReviewed: false },
            });
          }
          const ext = await tx.externalProgramme.upsert({
            where: {
              source_sourceKey: { source, sourceKey: value.sourceProgrammeKey },
            },
            create: {
              programmeId: p.id,
              source,
              sourceKey: value.sourceProgrammeKey,
              centreId: value.centreId!,
              reviewFingerprint,
              groupingStatus,
              eligibilityRulesVersion: value.rulesVersion,
              lastSeenAt: now,
              lastSyncAt: now,
              fingerprint,
            },
            update: {
              centreId: value.centreId!,
              reviewFingerprint,
              groupingStatus,
              eligibilityRulesVersion: value.rulesVersion,
              lastSeenAt: now,
              lastSyncAt: now,
              fingerprint,
              missing: false,
            },
          });
          await tx.externalProgramme.update({
            where: { id: ext.id },
            data: {
              sourceStatus: value.sourceStatus ?? "",
              sourceUpdatedAt: value.sourceUpdatedAt
                ? new Date(value.sourceUpdatedAt)
                : null,
            },
          });
          await tx.programmeReview.upsert({
            where: { programmeId: p.id },
            create: {
              programmeId: p.id,
              status: "Pending Review",
              issues: [],
              sourceFingerprint: reviewFingerprint,
            },
            update: {},
          });
          for (const o of schedule) {
            const data = {
              eligibilityStatus:
                o.eligibility?.eligibilityStatus ?? "unverified",
              schedulingStatus:
                o.eligibility?.schedulingVerification.status ?? "not_checked",
              recommendationEligible:
                o.eligibility?.recommendationEligible ?? false,
              reasonCodes: o.eligibility?.reasonCodes ?? [
                "eligibility_not_provided",
              ],
              timetableVisible: o.sourceVisibility?.timetableVisible ?? false,
              calendarVisible: o.sourceVisibility?.calendarVisible ?? false,
              sourceActivityName: o.sourceActivityName ?? value.name,
              independentSession: o.independentSession ?? false,
              sourceRecordIds: o.sourceRecordIds,
              date: o.sessionDate,
              day: o.day ?? "",
              startTime: o.startTime ?? "",
              endTime: o.endTime ?? "",
              venue: o.venue ?? "",
              status: o.cancelled ? "cancelled" : (o.status ?? ""),
              recurrence: o.recurrence ?? "",
              missing: false,
              sourceUpdatedAt: o.sourceUpdatedAt
                ? new Date(o.sourceUpdatedAt)
                : null,
            };
            await tx.externalOccurrence.upsert({
              where: {
                externalId_sourceKey: {
                  externalId: ext.id,
                  sourceKey: o.occurrenceKey,
                },
              },
              create: {
                externalId: ext.id,
                sourceKey: o.occurrenceKey,
                ...data,
              },
              update: data,
            });
          }
          await tx.externalOccurrence.updateMany({
            where: {
              externalId: ext.id,
              sourceKey: { notIn: schedule.map((o) => o.occurrenceKey) },
              missing: false,
            },
            data: { missing: true },
          });
          seen.push(ext.id);
          totals[!old ? "created" : changed ? "updated" : "unchanged"]++;
        }
        // Entire feed validated before marking absences; retain all records and history.
        const missing = await tx.externalProgramme.findMany({
          where: {
            source,
            ownership: "Imported",
            missing: false,
            id: { notIn: seen },
          },
          include: { programme: true },
        });
        for (const ext of missing)
          if (
            centreAllowed(u, ext.programme.centre) &&
            Object.hasOwn(sourceCentres, ext.centreId)
          ) {
            await tx.externalProgramme.update({
              where: { id: ext.id },
              data: { missing: true },
            });
            await tx.externalOccurrence.updateMany({
              where: { externalId: ext.id },
              data: { missing: true },
            });
            await tx.programmeReview.updateMany({
              where: { programmeId: ext.programmeId, status: "Reviewed" },
              data: {
                status: "Needs Recheck",
                issues: [
                  "Programme missing from the latest complete source feed",
                ],
              },
            });
            await tx.programme.update({
              where: { id: ext.programmeId },
              data: { suitabilityReviewed: false },
            });
            totals.updated++;
          }
        await tx.programmeSyncRun.update({
          where: { id: run.id },
          data: {
            ...totals,
            ...(items.diagnostics ? { diagnostics: items.diagnostics } : {}),
            status: "Success",
            finishedAt: new Date(),
            errorSummary: items.some(
              (i) => !Object.hasOwn(sourceCentres, i.centreId ?? ""),
            )
              ? "Unknown source centres skipped; administrator mapping review required."
              : "",
          },
        });
        await tx.auditLog.create({
          data: {
            userId: u.id,
            action: "Programme sync completed",
            entityType: "ProgrammeSync",
            entityId: run.id,
            changes: totals,
          },
        });
        return totals;
      },
      { timeout: 60000, maxWait: 10000 },
    );
    return {
      runId: run.id,
      ...counts,
      diagnostics: unrestricted(u) ? items.diagnostics : undefined,
    };
  } catch (e) {
    const safe =
      e instanceof SyncError
        ? e
        : new SyncError(
            503,
            "Programme sync could not complete. The previous catalogue is preserved.",
          );
    await client.programmeSyncRun.update({
      where: { id: run.id },
      data: {
        status: "Failed",
        finishedAt: new Date(),
        errors: 1,
        errorSummary: safe.message,
      },
    });
    await client.auditLog.create({
      data: {
        userId: u.id,
        action: "Programme sync failed",
        entityType: "ProgrammeSync",
        entityId: run.id,
        changes: { status: safe.status, error: safe.message },
      },
    });
    throw safe;
  } finally {
    if (acquired)
      await client.programmeSyncLock.deleteMany({
        where: { id: source, token },
      });
  }
}
