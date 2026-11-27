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
  centre: true,
  language: true,
  cleanedName: true,
  surveyDate: true,
  dobText: true,
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
  person: { select: { name: true, memberId: true } },
} as const;
async function currentWriter(tx: Tx, u: AccessUser, manager = false) {
  const actor = await tx.user.findUnique({
    where: { id: u.id },
    include: { allowedCentres: true },
  });
  if (!actor?.active || !can(actor.role, manager ? "audit" : "write"))
    throw new Error("Your role does not permit this action.");
  return actor;
}
export async function previewSurveys(
  u: AccessUser,
  input: unknown,
  tx: Tx = db,
) {
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
  const keys = files.flatMap((f) =>
    f.rows.flatMap((r) => (r.sourceKey ? [r.sourceKey] : [])),
  );
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
            ? "In Trash ? restore the original record"
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
export function importSummary(
  rows: Awaited<ReturnType<typeof previewSurveys>>["files"][number]["rows"],
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
    preview = await previewSurveys(actor, input, tx);
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
      await tx.surveyResponse.create({
        data: {
          batchId: batch.id,
          sourceKey: r.sourceKey,
          contentHash: r.contentHash!,
          sourceResponseId: r.sourceResponseId!,
          rowNumber: r.rowNumber,
          centre: preview.centre,
          language: file.language,
          submittedName: r.submittedName!,
          cleanedName: r.cleanedName!,
          timestampText: r.timestampText!,
          surveyDate: r.surveyDate ? new Date(r.surveyDate) : null,
          dobText: r.dobText!,
          dob: r.dob ? new Date(r.dob) : null,
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
        },
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
    include: {
      reviews: { orderBy: { reviewedAt: "desc" } },
      person: { select: { name: true, memberId: true, dob: true } },
    },
  });
  if (!r) throw new Error("Your centre permissions do not permit this record.");
  return r;
}
export async function surveyDetail(u: AccessUser, id: string) {
  const response = await responseFor(db, u, id);
  const corrections = await db.auditLog.findMany({
    where: {
      entityType: "SurveyResponse",
      entityId: id,
      action: "Survey correction",
    },
    select: {
      id: true,
      action: true,
      timestamp: true,
      changes: true,
      user: { select: { name: true } },
    },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
  });
  return { ...response, corrections };
}
export async function surveyCandidates(u: AccessUser, id: string, q: string) {
  if (!can(u.role, "write"))
    throw new Error("Your role does not permit this action.");
  const r = await responseFor(db, u, id),
    alias = normaliseAlias(r.cleanedName);
  const search = q.trim().slice(0, 150),
    tokens = r.cleanedName
      .split(/\s+/)
      .filter((s) => s.length > 1)
      .slice(0, 4);
  const where: Prisma.PersonWhereInput = {
    AND: [
      personScope(u),
      {
        kind: "Member",
        centre: r.centre,
        memberId: { not: null },
        status: { not: "Archived" },
      },
      {
        OR: search
          ? [
              { memberId: searchText(search) },
              { name: searchText(search) },
              { alias: searchText(search) },
              { contactNumber: searchText(search) },
              ...(surveyDate(search)
                ? [{ dob: new Date(surveyDate(search)!) }]
                : []),
              ...(normaliseAlias(search)
                ? [
                    {
                      verifiedAliases: {
                        some: {
                          verified: true,
                          normalized: { contains: normaliseAlias(search) },
                        },
                      },
                    },
                  ]
                : []),
            ]
          : [
              {
                verifiedAliases: {
                  some: { normalized: alias || "__empty__", verified: true },
                },
              },
              ...tokens.map((t) => ({ name: searchText(t) })),
              { memberId: r.submittedName },
            ],
      },
    ],
  };
  const select = {
    id: true,
    memberId: true,
    name: true,
    alias: true,
    dob: true,
    contactNumber: true,
    centre: true,
    verifiedAliases: {
      where: { verified: true },
      select: { text: true, normalized: true },
    },
  } as const;
  const base = (where.AND as Prisma.PersonWhereInput[]).slice(0, 2);
  const strongAlias = normaliseAlias(search) || (!search ? alias : "");
  const strong = await db.person.findMany({
    where: {
      AND: [
        ...base,
        {
          OR: [
            { memberId: search || r.submittedName },
            ...(strongAlias
              ? [
                  {
                    verifiedAliases: {
                      some: { verified: true, normalized: strongAlias },
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    },
    take: 20,
    select,
    orderBy: [{ memberId: "asc" }, { id: "asc" }],
  });
  const others =
    strong.length < 20
      ? await db.person.findMany({
          where: { AND: [where, { id: { notIn: strong.map((p) => p.id) } }] },
          take: 20 - strong.length,
          select,
          orderBy: [{ memberId: "asc" }, { id: "asc" }],
        })
      : [];
  const rows = [...strong, ...others];
  return {
    rows: rows.map((p) => ({
      ...p,
      evidence: [
        p.memberId === r.submittedName && "Exact submitted Member ID",
        p.verifiedAliases.some((a) => a.normalized === alias) &&
          "Verified alias matches",
        normaliseAlias(p.name) === alias &&
          "Name resembles submission (not verified)",
        p.dob &&
          r.dob &&
          p.dob.toISOString().slice(0, 10) ===
            r.dob.toISOString().slice(0, 10) &&
          "Birth date agrees",
      ].filter(Boolean),
      conflicts:
        p.dob &&
        r.dob &&
        p.dob.toISOString().slice(0, 10) !== r.dob.toISOString().slice(0, 10)
          ? ["Birth date differs — verify identity"]
          : [],
    })),
  };
}
export const surveyActionInput = z.object({
  action: z.enum(["link", "unlink", "correct", "ambiguous"]),
  id: z.string(),
  version: z.string(),
  personId: z.string().optional(),
  confirmed: z.boolean().default(false),
  saveAlias: z.boolean().default(false),
  notes: z.string().trim().min(1).max(2000),
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
  if (r.updatedAt.toISOString() !== v.version)
    throw new Error("This survey changed. Reload before saving.");
  const at = new Date(Math.max(Date.now(), r.updatedAt.getTime() + 1));
  const claim = await tx.surveyResponse.updateMany({
    where: { id: r.id, updatedAt: r.updatedAt },
    data: { updatedAt: at },
  });
  if (claim.count !== 1)
    throw new Error("This survey changed. Reload before saving.");
  if (v.action === "link") {
    if (!v.confirmed || r.personId)
      throw new Error(
        "Confirm identity first. A linked survey must be unlinked by a manager before reassignment.",
      );
    const p = await tx.person.findFirst({
      where: {
        AND: [
          personScope(actor),
          {
            id: v.personId || "",
            kind: "Member",
            centre: r.centre,
            memberId: { not: null },
            status: { not: "Archived" },
          },
        ],
      },
    });
    if (!p?.memberId)
      throw new Error(
        "Select a caregiver with a Member ID in the survey centre.",
      );
    await tx.surveyResponse.update({
      where: { id: r.id },
      data: {
        personId: p.id,
        confirmedMemberId: p.memberId,
        matchStatus: "Linked",
        warnings: [
          ...(Array.isArray(r.warnings) ? r.warnings.map(String) : []),
          ...(p.dob &&
          r.dob &&
          p.dob.toISOString().slice(0, 10) !== r.dob.toISOString().slice(0, 10)
            ? [
                "Birth date differs from verified caregiver record; identity was manually confirmed",
              ]
            : []),
        ],
        updatedAt: at,
      },
    });
    if (v.saveAlias && normaliseAlias(r.cleanedName))
      await tx.personAlias.upsert({
        where: {
          personId_normalized: {
            personId: p.id,
            normalized: normaliseAlias(r.cleanedName),
          },
        },
        create: {
          personId: p.id,
          text: r.cleanedName,
          normalized: normaliseAlias(r.cleanedName),
          verifiedBy: actor.id,
          source: `Survey ${r.id}`,
        },
        update: { verified: true, verifiedBy: actor.id, verifiedAt: at },
      });
    await tx.surveyIdentityReview.create({
      data: {
        responseId: r.id,
        personId: p.id,
        memberId: p.memberId,
        action: "Linked",
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
      {
        personId: p.id,
        memberId: p.memberId,
        notes: v.notes,
        savedAlias: v.saveAlias,
      },
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
      { personId: null, notes: v.notes },
    );
  } else if (v.action === "ambiguous") {
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
        action: "Ambiguous",
        reviewedBy: actor.id,
        notes: v.notes,
      },
    });
    await audit(
      tx,
      actor.id,
      "Survey identity needs review",
      "SurveyResponse",
      r.id,
      { matchStatus: r.matchStatus },
      { matchStatus: "Ambiguous", notes: v.notes },
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
    const dob = v.dob === undefined ? r.dob : v.dob ? surveyDate(v.dob) : null;
    if ((v.surveyDate && !date) || (v.dob && !dob))
      throw new Error(
        "Enter valid dates. A timestamp requires an explicit offset or Singapore date and time.",
      );
    const scores = scoreSurvey(answers),
      phase = v.phase ?? r.phase;
    const data = {
      surveyDate: date ? new Date(date) : null,
      dob: dob ? new Date(dob) : null,
      phase,
      answers: answers as Prisma.InputJsonObject,
      warnings: [
        ...metadataWarnings({ ...r, surveyDate: date, dob, phase }),
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
    await audit(
      tx,
      actor.id,
      "Survey correction",
      "SurveyResponse",
      r.id,
      {
        phase: r.phase,
        surveyDate: r.surveyDate,
        dob: r.dob,
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
  if (f.match === "Unmatched") and.push({ personId: null });
  else if (f.match) and.push({ matchStatus: f.match });
  if (f.personId) and.push({ personId: f.personId });
  if (f.quality === "warnings") and.push({ NOT: { warnings: { equals: [] } } });
  if (f.review === "1")
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
        { cleanedName: searchText(f.q.slice(0, 150)) },
        { confirmedMemberId: searchText(f.q.slice(0, 150)) },
      ],
    });
  return { AND: and };
}
export async function listSurveys(u: AccessUser, f: Record<string, string>) {
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
  const [rows, aliases, centres] = await Promise.all([
    db.surveyResponse.findMany({
      where,
      select: surveyListSelect,
      take: size,
      skip: (page - 1) * size,
      orderBy: [{ surveyDate: f.personId ? "asc" : "desc" }, { id: "asc" }],
    }),
    f.personId
      ? db.personAlias.findMany({
          where: { personId: f.personId },
          orderBy: { text: "asc" },
        })
      : [],
    db.person.findMany({
      where: personScope(u),
      distinct: ["centre"],
      select: { centre: true },
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
        ["Baseline", "Annual"].includes(r.phase) &&
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
  for (const r of valid)
    groups.set(r.personId!, [...(groups.get(r.personId!) || []), r]);
  const pairs = [...groups.values()].flatMap((items) => {
    const sorted = [...items].sort(
      (a, b) => a.surveyDate!.getTime() - b.surveyDate!.getTime(),
    );
    const baselines = sorted.filter((r) => r.phase === "Baseline");
    const first = baselines.length === 1 ? baselines[0] : undefined,
      last = sorted.findLast((r) => r.phase === "Annual");
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
  const rows = await db.surveyResponse.findMany({
    where: surveyFilters(u, f),
    select: {
      personId: true,
      matchStatus: true,
      surveyDate: true,
      phase: true,
      method: true,
      warnings: true,
      physical: true,
      psychological: true,
      social: true,
      environment: true,
      overall: true,
      zbi: true,
    },
  });
  return surveyStatistics(rows);
}
export async function surveyHistory(u: AccessUser, f: Record<string, string>) {
  const where = unrestricted(u)
    ? {}
    : { centre: { in: u.allowedCentres.map((c) => c.centre) } };
  const size = 20,
    total = await db.surveyImportBatch.count({ where });
  const page = Math.min(
    Math.max(1, Number(f.page) || 1),
    Math.max(1, Math.ceil(total / size)),
  );
  return {
    total,
    page,
    size,
    rows: await db.surveyImportBatch.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: size,
      skip: (page - 1) * size,
    }),
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
        { personId: { not: null }, matchStatus: "Linked" },
      ],
    };
  const count = await tx.surveyResponse.count({ where });
  if (count > 10000)
    throw new Error(
      "Narrow the filters to export at most 10,000 survey records.",
    );
  const rows = await tx.surveyResponse.findMany({
    where,
    select: surveyListSelect,
    orderBy: [{ surveyDate: "asc" }, { id: "asc" }],
  });
  const extended = f.extended === "1";
  const headers = [
    "Name",
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
          "Member ID",
          "Centre",
          "Survey language",
          "Match status",
          "Scoring version",
          "Data quality warnings",
        ]
      : []),
  ];
  const lines = rows.map((r) => [
    r.person?.name || r.cleanedName,
    r.surveyDate
      ? new Date(r.surveyDate.getTime() + 8 * 3600000)
          .toISOString()
          .slice(0, 10)
      : "",
    r.phase,
    ...outcomeFields.map((k) => r[k]),
    ...(extended
      ? [
          r.confirmedMemberId,
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
    { count: rows.length, filters: f, extended },
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
