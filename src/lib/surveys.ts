import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  AccessUser,
  centreAllowed,
  personScope,
  unrestricted,
  surveyScope,
} from "./access";
import { can } from "./domain";
import { audit } from "./records";
import {
  metadataWarnings,
  normaliseAlias,
  parseSurveyCSV,
  surveyDate,
  surveyLanguages,
  surveyPhases,
} from "./survey-parser";
import {
  questionKeys,
  roundSurvey,
  scoreSurvey,
  SURVEY_METHOD,
  surveyDay,
} from "./survey-scoring";
import { ncssImportMode, ncssMemberId } from "./ncss-matched-csv";
import { searchText } from "./query";

type Tx = Prisma.TransactionClient;
export const surveyFilesInput = z.object({
  centre: z.string().trim().min(1).max(200),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(240),
        language: z.enum(surveyLanguages),
        content: z.string().max(4 * 1024 * 1024),
      }),
    )
    .min(1)
    .max(5),
});
export { surveyScope } from "./access";
export const surveyListSelect = {
  id: true,
  rowNumber: true,
  importMode: true,
  centre: true,
  language: true,
  surveyDate: true,
  phase: true,
  personId: true,
  confirmedMemberId: true,
  matchStatus: true,
  method: true,
  warnings: true,
  physical: true,
  psychological: true,
  social: true,
  environment: true,
  overall: true,
  zbi: true,
  updatedAt: true,
} as const;
const stagedNames = {
  submittedName: true,
  cleanedName: true,
  correctedName: true,
} as const;
const caritaHubMethod = "CaritaHub (staff confirmed)";
const birthDateConflict = (
  member: Date | null,
  stage: Date | null | undefined,
) =>
  Boolean(
    member &&
    stage &&
    member.toISOString().slice(0, 10) !== stage.toISOString().slice(0, 10),
  );
export async function currentWriter(tx: Tx, u: AccessUser, manager = false) {
  const actor = await tx.user.findUnique({
    where: { id: u.id },
    include: { allowedCentres: true },
  });
  if (!actor?.active || !can(actor.role, manager ? "audit" : "write"))
    throw new Error("Your role does not permit this action.");
  return actor;
}
async function prepareSurveys(u: AccessUser, input: unknown, tx: Tx = db) {
  const body = surveyFilesInput.parse(input);
  if (!can(u.role, "write"))
    throw new Error("Your role does not permit this action.");
  if (!centreAllowed(u, body.centre))
    throw new Error("Your centre permissions do not permit this record.");
  if (
    body.files.reduce((a, b) => a + Buffer.byteLength(b.content), 0) >
    8 * 1024 * 1024
  )
    throw new Error("Combined CSV upload must be at most 8 MB.");
  const files = body.files.map((f) => ({
    ...f,
    rows: parseSurveyCSV(f.content, f.language),
  }));
  if (files.reduce((n, f) => n + f.rows.length, 0) > 5000)
    throw new Error("Import at most 5,000 responses at a time.");
  const keys = [
    ...new Set(
      files.flatMap((f) =>
        f.rows.flatMap((r) => (r.sourceKey ? [r.sourceKey] : [])),
      ),
    ),
  ];
  // Chunk lookups also work with SQLite's bound-parameter limits.
  const existing = [];
  for (let i = 0; i < keys.length; i += 300)
    existing.push(
      ...(await tx.surveyResponse.findMany({
        where: { sourceKey: { in: keys.slice(i, i + 300) } },
        select: {
          id: true,
          sourceKey: true,
          contentHash: true,
          deletedAt: true,
          centre: true,
          person: { select: { centre: true } },
        },
      })),
    );
  if (
    existing.some(
      (r) =>
        !centreAllowed(u, r.centre) ||
        (r.person && !centreAllowed(u, r.person.centre)),
    )
  )
    throw new Error("Your centre permissions do not permit this record.");
  const seen = new Map(existing.map((r) => [r.sourceKey, r.contentHash]));
  const trashed = new Set(
    existing.filter((r) => r.deletedAt).map((r) => r.sourceKey),
  );
  return {
    centre: body.centre,
    files: files.map((f) => ({
      name: f.name,
      language: f.language,
      rows: f.rows.map((r) => {
        const prior = r.sourceKey ? seen.get(r.sourceKey) : undefined;
        const disposition =
          r.exclusion ||
          (r.sourceKey && trashed.has(r.sourceKey)
            ? "In Trash. Restore the original record."
            : "") ||
          (prior
            ? prior === r.contentHash
              ? "Already imported"
              : "Source conflict — original retained"
            : "Ready for identity review");
        if (r.sourceKey && !prior) seen.set(r.sourceKey, r.contentHash!);
        return { ...r, disposition };
      }),
    })),
  };
}
export async function previewSurveys(u: AccessUser, input: unknown) {
  const preview = await prepareSurveys(u, input);
  return {
    centre: preview.centre,
    files: preview.files.map((file) => ({
      name: file.name,
      language: file.language,
      rows: file.rows.map(
        ({
          rowNumber,
          exclusion,
          disposition,
          warnings,
          scores,
          surveyDate,
          phase,
        }) => ({
          rowNumber,
          exclusion,
          disposition,
          warnings,
          scores,
          surveyDate,
          phase,
        }),
      ),
    })),
  };
}
export function importSummary(
  rows: Awaited<ReturnType<typeof prepareSurveys>>["files"][number]["rows"],
) {
  return {
    submitted: rows.length,
    eligible: rows.filter((r) => !r.exclusion).length,
    consentExcluded: rows.filter((r) => r.exclusion === "Consent not granted")
      .length,
    testExcluded: rows.filter((r) => r.exclusion === "Test record").length,
    duplicates: rows.filter(
      (r) =>
        r.disposition === "Already imported" ||
        r.disposition.startsWith("In Trash"),
    ).length,
    conflicts: rows.filter((r) => r.disposition.startsWith("Source conflict"))
      .length,
    identityReview: rows.filter(
      (r) => r.disposition === "Ready for identity review",
    ).length,
    invalid: rows.filter((r) => !r.exclusion && r.warnings?.length).length,
    linked: 0,
  };
}
export async function importSurveys(tx: Tx, u: AccessUser, input: unknown) {
  const actor = await currentWriter(tx, u),
    preview = await prepareSurveys(actor, input, tx);
  const batches = [];
  for (const file of preview.files) {
    const summary = importSummary(file.rows);
    const batch = await tx.surveyImportBatch.create({
      data: {
        filename: file.name,
        language: file.language,
        centre: preview.centre,
        uploadedBy: actor.id,
        summary: {
          ...summary,
          saved: summary.identityReview,
          rows: file.rows.map((r) => ({
            rowNumber: r.rowNumber,
            disposition: r.disposition,
          })),
        },
      },
    });
    const responses: Prisma.SurveyResponseCreateManyInput[] = [];
    const identifiers = new Map<
      string,
      Omit<Prisma.SurveyIdentityStageCreateManyInput, "responseId">
    >();
    for (const r of file.rows) {
      if (
        !r.sourceKey ||
        !r.scores ||
        r.disposition !== "Ready for identity review"
      )
        continue;
      const {
        physical,
        psychological,
        social,
        environment,
        overall,
        zbi,
        method,
      } = r.scores;
      responses.push({
        batchId: batch.id,
        sourceKey: r.sourceKey,
        contentHash: r.contentHash!,
        sourceResponseId: r.sourceResponseId!,
        rowNumber: r.rowNumber,
        centre: preview.centre,
        language: file.language,
        submittedName: "",
        cleanedName: "",
        timestampText: r.timestampText!,
        surveyDate: r.surveyDate ? new Date(r.surveyDate) : null,
        phaseText: r.phaseText!,
        phase: r.phase!,
        rawAnswers: r.answers!,
        answers: r.answers!,
        warnings: r.warnings!,
        physical,
        psychological,
        social,
        environment,
        overall,
        zbi,
        method,
      });
      identifiers.set(r.sourceKey, {
        submittedName: r.submittedName!,
        cleanedName: r.cleanedName!,
        dobText: r.dobText!,
        dob: r.dob ? new Date(r.dob) : null,
        nameHistory: [],
      });
    }
    // Keep inserts bounded while preserving a single transaction for every file.
    for (let i = 0; i < responses.length; i += 50) {
      const saved = await tx.surveyResponse.createManyAndReturn({
        data: responses.slice(i, i + 50),
        select: { id: true, sourceKey: true },
      });
      await tx.surveyIdentityStage.createMany({
        data: saved.map((row) => ({
          responseId: row.id,
          ...identifiers.get(row.sourceKey)!,
        })),
      });
    }
    await audit(
      tx,
      actor.id,
      "Survey import confirmed",
      "SurveyImportBatch",
      batch.id,
      null,
      summary,
    );
    batches.push({
      id: batch.id,
      name: file.name,
      ...summary,
      saved: summary.identityReview,
    });
  }
  return { batches };
}
async function responseFor(tx: Tx, u: AccessUser, id: string) {
  const r = await tx.surveyResponse.findFirst({
    where: { AND: [surveyScope(u), { id }] },
    select: {
      ...surveyListSelect,
      identityStage: true,
      timestampText: true,
      phaseText: true,
      rawAnswers: true,
      answers: true,
    },
  });
  if (!r) throw new Error("Your centre permissions do not permit this record.");
  return r;
}
const nameCorrectionAction = "Survey name corrected";
const nameReversalAction = "Survey name correction reversed";

const stagedNameHistory = z.array(
  z.object({
    staffId: z.string(),
    timestamp: z.string(),
    previous: z.string().nullable(),
    corrected: z.string().nullable(),
    notes: z.string(),
  }),
);

export async function surveyDetail(
  u: AccessUser,
  id: string,
  identity = false,
) {
  if (identity && !can(u.role, "write"))
    throw new Error("Your role does not permit this action.");
  if (!identity) {
    const publicRecord = await db.surveyResponse.findFirst({
      where: { AND: [surveyScope(u), { id }] },
      select: surveyListSelect,
    });
    if (!publicRecord)
      throw new Error("Your centre permissions do not permit this record.");
    return {
      ...publicRecord,
      timestampText: "",
      phaseText: "",
      rawAnswers: null as Prisma.JsonValue,
      answers: null as Prisma.JsonValue,
      identity: null,
      canReassign: false,
    };
  }
  const { identityStage: stage, ...response } = await responseFor(db, u, id);
  const [corrections, reviews] = await Promise.all([
    db.auditLog.findMany({
      where: {
        entityType: "SurveyResponse",
        entityId: id,
        action: {
          in: ["Survey correction", nameCorrectionAction, nameReversalAction],
        },
      },
      select: {
        id: true,
        action: true,
        timestamp: true,
        changes: true,
        user: { select: { name: true } },
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    }),
    db.surveyIdentityReview.findMany({
      where: { responseId: id },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    }),
  ]);
  const stagedHistory = stagedNameHistory.parse(stage?.nameHistory ?? []);
  const staffIds = [
    ...new Set([
      ...reviews.map((r) => r.reviewedBy),
      ...stagedHistory.map((r) => r.staffId),
    ]),
  ];
  const staff = await db.user.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true },
  });
  const names = new Map(staff.map((person) => [person.id, person.name]));
  const legacyNameHistory = corrections.flatMap((entry) => {
    if (entry.action === "Survey correction") return [];
    const event = entry.changes as {
      before?: { correctedName?: string };
      after?: { correctedName?: string; notes?: string };
    };
    // Current central audit entries contain metadata only. Older entries retain
    // their historical details, available exclusively from this restricted view.
    if (!event.after || !Object.hasOwn(event.after, "correctedName")) return [];
    return [
      {
        id: entry.id,
        timestamp: entry.timestamp,
        reviewerName: entry.user.name,
        previous: event.before?.correctedName ?? null,
        corrected: event.after.correctedName ?? null,
        notes: event.after.notes ?? "",
      },
    ];
  });
  return {
    ...response,
    canReassign: response.importMode === ncssImportMode && can(u.role, "admin"),
    identity: {
      submittedName: stage?.submittedName ?? "",
      cleanedName: stage?.cleanedName ?? "",
      correctedName: stage?.correctedName ?? null,
      dobText: stage?.dobText ?? "",
      dob: stage?.dob ?? null,
      reviews: reviews.map((review) => ({
        ...review,
        reviewerName: names.get(review.reviewedBy) || review.reviewedBy,
      })),
      corrections: corrections.filter(
        (entry) => entry.action === "Survey correction",
      ),
      nameHistory: [
        ...stagedHistory.toReversed().map((event) => ({
          ...event,
          id: event.timestamp,
          timestamp: new Date(event.timestamp),
          reviewerName: names.get(event.staffId) ?? event.staffId,
        })),
        ...legacyNameHistory,
      ],
    },
  };
}

const surveyMemberId = z.string().trim().min(1).max(150);
const missingMember =
  "Member ID not found in this survey’s centre. The survey remains unmatched.";

async function findSurveyMember(
  tx: Tx,
  actor: AccessUser,
  centre: string,
  memberId: string,
) {
  const member = await tx.person.findFirst({
    where: {
      AND: [
        personScope(actor),
        { kind: "Member", centre, memberId, status: { not: "Archived" } },
      ],
    },
    select: { id: true, memberId: true, centre: true, status: true, dob: true },
  });
  if (!member?.memberId) throw new Error(missingMember);
  return { ...member, memberId: member.memberId };
}

async function findActiveNCSSMember(
  tx: Tx,
  actor: AccessUser,
  centre: string,
  memberId: string,
) {
  if (!ncssMemberId.test(memberId)) throw new Error("Enter a valid Member ID.");
  const member = await tx.person.findFirst({
    where: {
      AND: [
        personScope(actor),
        { kind: "Member", centre, memberId, status: "Active" },
      ],
    },
    select: { id: true, memberId: true, centre: true, status: true },
  });
  if (!member?.memberId)
    throw new Error(
      "Member ID is unavailable in this import centre. Check the verified mapping.",
    );
  return { ...member, memberId: member.memberId, birthDateConflict: false };
}

export async function lookupSurveyMember(u: AccessUser, input: unknown) {
  if (!can(u.role, "write"))
    throw new Error("Your role does not permit this action.");
  const { id, memberId } = z
    .object({ id: z.string().min(1), memberId: surveyMemberId })
    .parse(input);
  const response = await db.surveyResponse.findFirst({
    where: { AND: [surveyScope(u), { id }] },
    select: {
      centre: true,
      importMode: true,
      personId: true,
      identityStage: { select: { dob: true } },
    },
  });
  if (!response)
    throw new Error("Your centre permissions do not permit this record.");
  if (response.importMode === ncssImportMode) {
    if (!can(u.role, "admin"))
      throw new Error("Your role does not permit this action.");
    const member = await findActiveNCSSMember(db, u, response.centre, memberId);
    if (member.id === response.personId)
      throw new Error("This survey already belongs to that Member ID.");
    return member;
  }
  if (response.personId)
    throw new Error("This survey already has a verified member.");
  const member = await findSurveyMember(db, u, response.centre, memberId);
  return {
    id: member.id,
    memberId: member.memberId,
    centre: member.centre,
    status: member.status,
    birthDateConflict: birthDateConflict(
      member.dob,
      response.identityStage?.dob,
    ),
  };
}

export const surveyActionInput = z.object({
  action: z.enum([
    "link",
    "unlink",
    "correct",
    "ambiguous",
    "reject",
    "correct-name",
    "reassign-import",
  ]),
  id: z.string(),
  version: z.string(),
  personId: z.string().optional(),
  memberId: surveyMemberId.optional(),
  verificationMethod: z.literal("CaritaHub").optional(),
  confirmed: z.boolean().default(false),
  notes: z.string().trim().max(2000).default(""),
  correctedName: z.string().max(150).nullable().optional(),
  phase: z.enum(surveyPhases).optional(),
  surveyDate: z.string().optional(),
  dob: z.string().optional(),
  answers: z
    .record(z.string(), z.union([z.number().int(), z.null()]))
    .optional(),
});
export async function updateSurvey(tx: Tx, u: AccessUser, input: unknown) {
  const v = surveyActionInput.parse(input),
    actor = await currentWriter(tx, u, v.action === "unlink"),
    r = await responseFor(tx, actor, v.id);
  const stage = r.identityStage;
  const matchedImport = r.importMode === ncssImportMode;
  if (
    v.action === "reassign-import" &&
    (!matchedImport || !can(actor.role, "admin"))
  )
    throw new Error("Your role does not permit this action.");
  if (matchedImport && v.action !== "reassign-import")
    throw new Error(
      "An administrator must confirm a replacement Member ID for this survey.",
    );
  if (r.updatedAt.toISOString() !== v.version)
    throw new Error("This survey changed. Reload before saving.");
  if (v.action !== "correct-name" && !v.notes)
    throw new Error("Enter the review notes before saving.");
  const at = new Date(Math.max(Date.now(), r.updatedAt.getTime() + 1));
  const claim = await tx.surveyResponse.updateMany({
    where: { id: r.id, updatedAt: r.updatedAt },
    data: { updatedAt: at },
  });
  if (claim.count !== 1)
    throw new Error("This survey changed. Reload before saving.");
  if (v.action === "reassign-import") {
    if (!v.confirmed || !v.memberId || !v.personId)
      throw new Error("Check and confirm the replacement Member ID.");
    const member = await findActiveNCSSMember(tx, actor, r.centre, v.memberId);
    if (member.id !== v.personId || member.id === r.personId)
      throw new Error("Check the replacement Member ID again.");
    await tx.surveyResponse.update({
      where: { id: r.id },
      data: {
        personId: member.id,
        confirmedMemberId: member.memberId,
        updatedAt: at,
      },
    });
    await tx.surveyIdentityReview.createMany({
      data: [
        {
          responseId: r.id,
          personId: r.personId,
          memberId: r.confirmedMemberId,
          action: "Reassigned from",
          method: ncssImportMode,
          reviewedBy: actor.id,
          notes: v.notes,
        },
        {
          responseId: r.id,
          personId: member.id,
          memberId: member.memberId,
          action: "Reassigned to",
          method: ncssImportMode,
          reviewedBy: actor.id,
          notes: v.notes,
        },
      ],
    });
    await audit(
      tx,
      actor.id,
      "NCSS survey Member ID corrected",
      "SurveyResponse",
      r.id,
      { personId: r.personId, memberId: r.confirmedMemberId },
      { personId: member.id, memberId: member.memberId },
    );
    return { id: r.id, memberId: member.memberId };
  }
  if (v.action === "correct-name") {
    if (!stage) throw new Error("This survey has no staged name to edit.");
    if (v.correctedName === undefined)
      throw new Error("Enter a corrected name.");
    const name =
      v.correctedName?.normalize("NFKC").trim().replace(/\s+/g, " ") ?? null;
    if (
      name !== null &&
      (!/\p{L}/u.test(name) || /[\p{N}\p{Cc}]/u.test(name) || name.length > 150)
    )
      throw new Error(
        "Enter a name with letters and no numbers or control characters.",
      );
    if (
      name === stage.correctedName ||
      (name !== null &&
        name === stage.submittedName &&
        stage.correctedName === null)
    )
      throw new Error("The name is already up to date.");
    await tx.surveyIdentityStage.update({
      where: { responseId: r.id },
      data: {
        correctedName: name,
        nameHistory: [
          ...stagedNameHistory.parse(stage.nameHistory),
          {
            staffId: actor.id,
            timestamp: at.toISOString(),
            previous: stage.correctedName,
            corrected: name,
            notes: v.notes,
          },
        ],
      },
    });
    await audit(
      tx,
      actor.id,
      name === null ? nameReversalAction : nameCorrectionAction,
      "SurveyResponse",
      r.id,
      null,
      { hasCorrection: name !== null },
    );
  } else if (v.action === "link") {
    if (!v.confirmed || v.verificationMethod !== "CaritaHub" || r.personId)
      throw new Error(
        "Confirm identity in CaritaHub first. A linked survey must be unlinked by a manager before reassignment.",
      );
    if (!v.memberId || !v.personId)
      throw new Error(
        "Check the verified Member ID before confirming the match.",
      );
    const p = await findSurveyMember(tx, actor, r.centre, v.memberId);
    if (v.personId !== p.id)
      throw new Error(
        "This caregiver’s Member ID changed. Find the caregiver again.",
      );
    await tx.surveyResponse.update({
      where: { id: r.id },
      data: {
        personId: p.id,
        confirmedMemberId: p.memberId,
        matchStatus: "Linked",
        warnings: [
          ...(Array.isArray(r.warnings) ? r.warnings.map(String) : []),
          ...(birthDateConflict(p.dob, stage?.dob)
            ? [
                "Birth date differs from verified caregiver record; identity was manually confirmed",
              ]
            : []),
        ],
        updatedAt: at,
      },
    });
    await tx.surveyIdentityReview.create({
      data: {
        responseId: r.id,
        personId: p.id,
        memberId: p.memberId,
        action: "Linked",
        method: caritaHubMethod,
        reviewedBy: actor.id,
        notes: v.notes,
      },
    });
    await audit(
      tx,
      actor.id,
      "Survey identity linked",
      "SurveyResponse",
      r.id,
      { personId: null },
      { personId: p.id, method: caritaHubMethod },
    );
  } else if (v.action === "unlink") {
    if (!r.personId || !v.confirmed)
      throw new Error("Confirm unlinking this survey.");
    await tx.surveyResponse.update({
      where: { id: r.id },
      data: {
        personId: null,
        confirmedMemberId: null,
        matchStatus: "Unmatched",
        updatedAt: at,
      },
    });
    await tx.personAlias.updateMany({
      where: { personId: r.personId, source: `Survey ${r.id}`, verified: true },
      data: { verified: false, verifiedBy: actor.id, verifiedAt: at },
    });
    await tx.surveyIdentityReview.create({
      data: {
        responseId: r.id,
        personId: r.personId,
        memberId: r.confirmedMemberId,
        action: "Unlinked",
        reviewedBy: actor.id,
        notes: v.notes,
      },
    });
    await audit(
      tx,
      actor.id,
      "Survey identity unlinked",
      "SurveyResponse",
      r.id,
      { personId: r.personId },
      { personId: null },
    );
  } else if (v.action === "ambiguous" || v.action === "reject") {
    if (r.personId)
      throw new Error(
        "A linked survey must be unlinked before identity review.",
      );
    await tx.surveyResponse.update({
      where: { id: r.id },
      data: { matchStatus: "Ambiguous", updatedAt: at },
    });
    await tx.surveyIdentityReview.create({
      data: {
        responseId: r.id,
        action: v.action === "reject" ? "Rejected" : "Ambiguous",
        reviewedBy: actor.id,
        notes: v.notes,
      },
    });
    await audit(
      tx,
      actor.id,
      v.action === "reject"
        ? "Survey identity rejected"
        : "Survey identity needs review",
      "SurveyResponse",
      r.id,
      { matchStatus: r.matchStatus },
      { matchStatus: "Ambiguous" },
    );
  } else {
    const answers = { ...(r.answers as Record<string, unknown>) };
    for (const [k, val] of Object.entries(v.answers || {})) {
      if (
        !questionKeys.includes(k) ||
        (val !== null &&
          (val < (k.startsWith("Z") ? 0 : 1) ||
            val > (k.startsWith("Z") ? 4 : 5)))
      )
        throw new Error("Choose a valid answer for each survey question.");
      answers[k] = val;
    }
    const date =
      v.surveyDate === undefined
        ? r.surveyDate
        : v.surveyDate
          ? surveyDate(v.surveyDate, true)
          : null;
    const dob =
      v.dob === undefined
        ? (stage?.dob ?? null)
        : v.dob
          ? surveyDate(v.dob)
          : null;
    if (v.dob !== undefined && !stage)
      throw new Error("This survey has no staged birth date to edit.");
    if ((v.surveyDate && !date) || (v.dob && !dob))
      throw new Error(
        "Enter valid dates. A timestamp requires an explicit offset or Singapore date and time.",
      );
    const scores = scoreSurvey(answers),
      phase = v.phase ?? r.phase;
    const data = {
      surveyDate: date ? new Date(date) : null,
      phase,
      answers: answers as Prisma.InputJsonObject,
      warnings: [
        ...metadataWarnings({
          cleanedName: stage?.cleanedName ?? "",
          dobText: stage?.dobText ?? "",
          surveyDate: date,
          dob,
          phase,
        }),
        ...scores.warnings,
      ],
      physical: scores.physical,
      psychological: scores.psychological,
      social: scores.social,
      environment: scores.environment,
      overall: scores.overall,
      zbi: scores.zbi,
      method: scores.method,
      updatedAt: at,
    };
    await tx.surveyResponse.update({ where: { id: r.id }, data });
    if (v.dob !== undefined)
      await tx.surveyIdentityStage.update({
        where: { responseId: r.id },
        data: { dob: dob ? new Date(dob) : null },
      });
    await audit(
      tx,
      actor.id,
      "Survey correction",
      "SurveyResponse",
      r.id,
      {
        phase: r.phase,
        surveyDate: r.surveyDate,
        answers: r.answers,
      },
      { ...data, notes: v.notes },
    );
  }
  return { id: r.id };
}
export async function manageSurveyAlias(tx: Tx, u: AccessUser, input: unknown) {
  const v = z
    .object({
      personId: z.string(),
      text: z.string().trim().min(1).max(200),
      verified: z.boolean(),
      notes: z.string().trim().min(1).max(2000),
    })
    .parse(input);
  const actor = await currentWriter(tx, u, !v.verified);
  const p = await tx.person.findFirst({
    where: {
      AND: [
        personScope(actor),
        { id: v.personId, kind: "Member", memberId: { not: null } },
      ],
    },
  });
  if (!p) throw new Error("Your centre permissions do not permit this record.");
  const normalized = normaliseAlias(v.text);
  if (!normalized)
    throw new Error("Enter a name or initials, without phone digits.");
  const saved = await tx.personAlias.upsert({
    where: { personId_normalized: { personId: p.id, normalized } },
    create: {
      personId: p.id,
      text: v.text,
      normalized,
      verified: v.verified,
      verifiedBy: actor.id,
    },
    update: {
      verified: v.verified,
      verifiedBy: actor.id,
      verifiedAt: new Date(),
    },
  });
  await audit(
    tx,
    actor.id,
    "Verified survey alias changed",
    "Member",
    p.id,
    null,
    { aliasId: saved.id, ...v },
  );
  return saved;
}
export function surveyFilters(u: AccessUser, f: Record<string, string>) {
  const and: Prisma.SurveyResponseWhereInput[] = [surveyScope(u)];
  if (f.centre) and.push({ centre: f.centre });
  if (f.language) and.push({ language: f.language });
  if (f.phase) and.push({ phase: f.phase });
  if (f.batch) and.push({ batchId: f.batch });
  if (f.match === "Unmatched") and.push({ personId: null });
  else if (f.match === "Corrected")
    and.push({ identityStage: { is: { correctedName: { not: null } } } });
  else if (f.match === "Verified") and.push({ matchStatus: "Linked" });
  else if (f.match && f.match !== "Needs Review")
    and.push({ matchStatus: f.match });
  if (f.personId) and.push({ personId: f.personId });
  if (f.quality === "warnings") and.push({ NOT: { warnings: { equals: [] } } });
  if (f.quality === "timestamp") and.push({ surveyDate: null });
  if (f.quality === "whoqol") and.push({ overall: null });
  if (f.quality === "phase") and.push({ phase: "Needs Review" });
  if (f.review === "1" || f.match === "Needs Review")
    and.push({
      OR: [
        { matchStatus: { not: "Linked" } },
        { NOT: { warnings: { equals: [] } } },
        { phase: "Needs Review" },
      ],
    });
  if (f.from || f.to) {
    if ((f.from && !surveyDate(f.from)) || (f.to && !surveyDate(f.to)))
      throw new Error("Choose valid date filters.");
    and.push({
      surveyDate: {
        ...(f.from ? { gte: new Date(`${f.from}T00:00:00+08:00`) } : {}),
        ...(f.to
          ? { lt: new Date(Date.parse(`${f.to}T00:00:00+08:00`) + 86400000) }
          : {}),
      },
    });
  }
  if (f.q)
    and.push({
      OR: [
        { id: searchText(f.q.slice(0, 150)) },
        { confirmedMemberId: searchText(f.q.slice(0, 150)) },
      ],
    });
  return { AND: and };
}
export async function nextSurveyForReview(
  u: AccessUser,
  f: Record<string, string>,
) {
  if (!can(u.role, "write"))
    throw new Error("Your role does not permit this action.");
  return db.surveyResponse.findFirst({
    where: {
      AND: [
        surveyFilters(u, f),
        { personId: null },
        ...(f.after ? [{ id: { gt: f.after } }] : []),
      ],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
}
export async function listSurveys(
  u: AccessUser,
  f: Record<string, string>,
  identity = false,
) {
  if (identity && !can(u.role, "write"))
    throw new Error("Your role does not permit this action.");
  if (
    f.personId &&
    !(await db.person.findFirst({
      where: { AND: [personScope(u), { id: f.personId, kind: "Member" }] },
      select: { id: true },
    }))
  )
    throw new Error("Your centre permissions do not permit this record.");
  const size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20,
    where = surveyFilters(u, f),
    total = await db.surveyResponse.count({ where });
  const page = Math.min(
    Math.max(1, Math.floor(Number(f.page)) || 1),
    Math.max(1, Math.ceil(total / size)),
  );
  const direction = f.direction === "asc" ? "asc" : "desc";
  const order: Prisma.SurveyResponseOrderByWithRelationInput =
    f.sort === "phase"
      ? { phase: direction }
      : {
          surveyDate:
            f.sort === "date" ? direction : f.personId ? "asc" : "desc",
        };
  const [rows, aliases, centres] = await Promise.all([
    db.surveyResponse.findMany({
      where,
      select: {
        ...surveyListSelect,
        identityStage: identity ? { select: stagedNames } : false,
      },
      take: size,
      skip: (page - 1) * size,
      orderBy: [order, { id: "asc" }],
    }),
    f.personId && can(u.role, "write")
      ? db.personAlias.findMany({
          where: { personId: f.personId },
          orderBy: { text: "asc" },
        })
      : [],
    db.person.groupBy({
      by: ["centre"],
      where: personScope(u),
      orderBy: { centre: "asc" },
    }),
  ]);
  return {
    rows,
    aliases,
    total,
    page,
    size,
    centres: [
      ...new Set([
        ...centres.map((c) => c.centre),
        ...u.allowedCentres.map((c) => c.centre),
      ]),
    ].filter(Boolean),
    canExport: can(u.role, "audit"),
  };
}
export const outcomeFields = [
  "physical",
  "psychological",
  "social",
  "environment",
  "overall",
  "zbi",
] as const;
type Scores = Record<(typeof outcomeFields)[number], number | null>;
export function surveyStatistics(
  rows: (Scores & {
    personId: string | null;
    surveyDate: Date | null;
    phase: string;
    method: string;
    warnings: unknown;
    matchStatus?: string;
  })[],
) {
  const linked = rows.filter((r) => r.personId),
    valid = linked.filter(
      (r) =>
        r.surveyDate &&
        ["Baseline", "Annual", "Follow-up"].includes(r.phase) &&
        r.method === SURVEY_METHOD,
    );
  const means = Object.fromEntries(
    outcomeFields.map((key) => {
      const values = valid.flatMap((r) => (r[key] !== null ? [r[key]!] : []));
      return [
        key,
        {
          n: values.length,
          mean: values.length
            ? roundSurvey(values.reduce((a, b) => a + b, 0) / values.length)
            : null,
        },
      ];
    }),
  );
  const groups = new Map<string, typeof valid>();
  for (const r of valid) {
    const group = groups.get(r.personId!);
    if (group) group.push(r);
    else groups.set(r.personId!, [r]);
  }
  const pairs = [...groups.values()].flatMap((items) => {
    const sorted = [...items].sort(
      (a, b) => a.surveyDate!.getTime() - b.surveyDate!.getTime(),
    );
    const baselines = sorted.filter((r) => r.phase === "Baseline");
    const first = baselines.length === 1 ? baselines[0] : undefined,
      last = sorted.findLast((r) => ["Annual", "Follow-up"].includes(r.phase));
    return first &&
      last &&
      surveyDay(first.surveyDate!) < surveyDay(last.surveyDate!)
      ? [{ first, last }]
      : [];
  });
  const paired = Object.fromEntries(
    outcomeFields.map((key) => {
      const vs = pairs.filter(
        ({ first, last }) => first[key] !== null && last[key] !== null,
      );
      const avg = (fn: (r: (typeof vs)[number]) => number) =>
        vs.length
          ? roundSurvey(vs.reduce((n, r) => n + fn(r), 0) / vs.length)
          : null;
      return [
        key,
        {
          n: vs.length,
          baseline: avg((r) => r.first[key]!),
          latest: avg((r) => r.last[key]!),
          change: avg((r) => r.last[key]! - r.first[key]!),
        },
      ];
    }),
  );
  return {
    responses: rows.length,
    completeResponses: rows.filter(
      (row) => row.overall !== null && row.zbi !== null,
    ).length,
    linked: linked.length,
    unmatched: rows.length - linked.length,
    invalid: rows.filter((r) => Array.isArray(r.warnings) && r.warnings.length)
      .length,
    caregivers: new Set(linked.map((r) => r.personId)).size,
    baselineCaregivers: new Set(
      valid.filter((r) => r.phase === "Baseline").map((r) => r.personId),
    ).size,
    repeatedCaregivers: [...groups.values()].filter(
      (rs) => new Set(rs.map((r) => surveyDay(r.surveyDate!))).size > 1,
    ).length,
    phaseConflicts: [...groups.values()].filter(
      (rs) => rs.filter((r) => r.phase === "Baseline").length > 1,
    ).length,
    quality: {
      ambiguous: rows.filter((r) => r.matchStatus === "Ambiguous").length,
      invalidTimestamps: rows.filter((r) => !r.surveyDate).length,
      unknownAnswers: rows.filter(
        (r) =>
          Array.isArray(r.warnings) &&
          r.warnings.some((s) => String(s).includes("Unknown answer")),
      ).length,
      incompleteDomains: rows.filter((r) => r.overall === null).length,
      birthDates: rows.filter(
        (r) =>
          Array.isArray(r.warnings) &&
          r.warnings.some((s) => /Birth date/.test(String(s))),
      ).length,
      phases: rows.filter((r) => r.phase === "Needs Review").length,
    },
    means,
    paired,
  };
}
export async function surveyOverview(u: AccessUser, f: Record<string, string>) {
  const scoped = surveyFilters(u, f);
  const filter = (extra: Prisma.SurveyResponseWhereInput) => ({
    AND: [scoped, extra],
  });
  const comparable = filter({
    personId: { not: null },
    surveyDate: { not: null },
    phase: { in: ["Baseline", "Annual", "Follow-up"] },
    method: SURVEY_METHOD,
  });
  const metric = {
    physical: true,
    psychological: true,
    social: true,
    environment: true,
    overall: true,
    zbi: true,
  } as const;
  const [
    groups,
    completeResponses,
    invalidTimestamps,
    incompleteDomains,
    phases,
    notes,
    averages,
    dated,
  ] = await Promise.all([
    db.surveyResponse.groupBy({
      by: ["personId", "matchStatus"],
      where: scoped,
      _count: { _all: true },
    }),
    db.surveyResponse.count({
      where: filter({ overall: { not: null }, zbi: { not: null } }),
    }),
    db.surveyResponse.count({ where: filter({ surveyDate: null }) }),
    db.surveyResponse.count({ where: filter({ overall: null }) }),
    db.surveyResponse.count({ where: filter({ phase: "Needs Review" }) }),
    db.surveyResponse.findMany({
      where: filter({ NOT: { warnings: { equals: [] } } }),
      select: { warnings: true },
    }),
    db.surveyResponse.aggregate({
      where: comparable,
      _avg: metric,
      _count: metric,
    }),
    db.surveyResponse.findMany({
      where: comparable,
      select: {
        personId: true,
        surveyDate: true,
        phase: true,
        method: true,
        ...metric,
      },
    }),
  ]);
  const { paired, repeatedCaregivers, phaseConflicts, baselineCaregivers } =
    surveyStatistics(dated.map((row) => ({ ...row, warnings: [] })));
  const means = Object.fromEntries(
    outcomeFields.map((key) => [
      key,
      {
        n: averages._count[key],
        mean:
          averages._avg[key] === null ? null : roundSurvey(averages._avg[key]!),
      },
    ]),
  );
  const responses = groups.reduce((n, g) => n + g._count._all, 0);
  const linked = groups.reduce(
    (n, g) => n + (g.personId ? g._count._all : 0),
    0,
  );
  const months = new Map<
    string,
    {
      overallSum: number;
      overallCount: number;
      zbiSum: number;
      zbiCount: number;
    }
  >();
  if (f.view === "trends") {
    for (const row of dated) {
      const month = surveyDay(row.surveyDate!).slice(0, 7);
      const point = months.get(month) ?? {
        overallSum: 0,
        overallCount: 0,
        zbiSum: 0,
        zbiCount: 0,
      };
      if (row.overall !== null) {
        point.overallSum += row.overall;
        point.overallCount++;
      }
      if (row.zbi !== null) {
        point.zbiSum += row.zbi;
        point.zbiCount++;
      }
      months.set(month, point);
    }
  }
  return {
    responses,
    completeResponses,
    linked,
    unmatched: responses - linked,
    invalid: notes.length,
    caregivers: new Set(groups.flatMap((g) => (g.personId ? [g.personId] : [])))
      .size,
    baselineCaregivers,
    repeatedCaregivers,
    phaseConflicts,
    quality: {
      ambiguous: groups.reduce(
        (n, g) => n + (g.matchStatus === "Ambiguous" ? g._count._all : 0),
        0,
      ),
      invalidTimestamps,
      incompleteDomains,
      phases,
      unknownAnswers: notes.filter(
        (r) =>
          Array.isArray(r.warnings) &&
          r.warnings.some((w) => String(w).includes("Unknown answer")),
      ).length,
      birthDates: notes.filter(
        (r) =>
          Array.isArray(r.warnings) &&
          r.warnings.some((w) => String(w).includes("Birth date")),
      ).length,
    },
    means,
    paired,
    monthly: [...months]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, point]) => ({
        month,
        overall: point.overallCount
          ? roundSurvey(point.overallSum / point.overallCount)
          : null,
        zbi: point.zbiCount ? roundSurvey(point.zbiSum / point.zbiCount) : null,
        overallCount: point.overallCount,
        zbiCount: point.zbiCount,
      })),
  };
}
export async function surveyHistory(u: AccessUser, f: Record<string, string>) {
  const where = unrestricted(u)
    ? {}
    : { centre: { in: u.allowedCentres.map((c) => c.centre) } };
  const size = 20,
    total = await db.surveyImportBatch.count({ where });
  const page = Math.min(
    Math.max(1, Math.floor(Number(f.page)) || 1),
    Math.max(1, Math.ceil(total / size)),
  );
  const batches = await db.surveyImportBatch.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: size,
    skip: (page - 1) * size,
  });
  const linked = await db.surveyResponse.groupBy({
    by: ["batchId"],
    where: {
      AND: [
        surveyScope(u),
        {
          batchId: { in: batches.map((batch) => batch.id) },
          matchStatus: "Linked",
        },
      ],
    },
    _count: { _all: true },
  });
  const counts = new Map(
    linked.map((entry) => [entry.batchId, entry._count._all]),
  );
  return {
    total,
    page,
    size,
    rows: batches.map(({ filename, ...batch }) => ({
      ...batch,
      filename: can(u.role, "write") ? filename : "Survey import",
      linkedCount: counts.get(batch.id) ?? 0,
    })),
  };
}
export const safeSurveyCell = (s: unknown) => {
  const value = String(s ?? "");
  return (
    '"' +
    (/^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value).replaceAll(
      '"',
      '""',
    ) +
    '"'
  );
};
export async function exportSurveys(
  tx: Tx,
  u: AccessUser,
  f: Record<string, string>,
) {
  const actor = await currentWriter(tx, u, true),
    where = {
      AND: [
        surveyFilters(actor, f),
        {
          personId: { not: null },
          confirmedMemberId: { not: null },
          matchStatus: "Linked",
        },
      ],
    };
  const rows = await tx.surveyResponse.findMany({
    where,
    select: surveyListSelect,
    orderBy: [{ surveyDate: "asc" }, { id: "asc" }],
    take: 10001,
  });
  if (rows.length > 10000)
    throw new Error(
      "Narrow the filters to export at most 10,000 survey records.",
    );
  const extended = f.extended === "1";
  const headers = [
    "Member ID",
    "Survey Date",
    "Survey Phase",
    "Physical",
    "Psychological",
    "Social Relations",
    "Environment",
    "Overall",
    "ZBI",
    ...(extended
      ? [
          "Centre",
          "Survey language",
          "Match status",
          "Scoring version",
          "Data quality warnings",
        ]
      : []),
  ];
  const lines = rows.map((r) => [
    r.confirmedMemberId,
    r.surveyDate
      ? new Date(r.surveyDate.getTime() + 8 * 3600000)
          .toISOString()
          .slice(0, 10)
      : "",
    r.phase,
    ...outcomeFields.map((k) => r[k]),
    ...(extended
      ? [
          r.centre,
          r.language,
          r.matchStatus,
          r.method,
          JSON.stringify(r.warnings),
        ]
      : []),
  ]);
  await audit(
    tx,
    actor.id,
    "Survey outcomes exported",
    "SurveyExport",
    "filtered",
    null,
    { count: rows.length, extended },
  );
  return (
    "\ufeff" +
    [headers, ...lines]
      .map((row) => row.map(safeSurveyCell).join(","))
      .join("\r\n")
  );
}

export async function surveyOptions(u: AccessUser) {
  const centres = await db.person.findMany({
    where: personScope(u),
    distinct: ["centre"],
    select: { centre: true },
    orderBy: { centre: "asc" },
  });
  return {
    centres: [
      ...new Set([
        ...centres.map((c) => c.centre),
        ...u.allowedCentres.map((c) => c.centre),
      ]),
    ].filter(Boolean),
  };
}
