import { Prisma } from "@prisma/client";
import { z } from "zod";
import { centreAllowed, personScope, type AccessUser } from "./access";
import { db } from "./db";
import { audit } from "./records";
import { currentWriter } from "./surveys";
import {
  hashSurvey,
  surveyDate,
  surveyLanguages,
  surveyPhases,
} from "./survey-parser";
import {
  ncssImportMode,
  ncssMaxRows,
  ncssMemberId,
  ncssSourceId,
} from "./ncss-matched-csv";
import { questionKeys, scoreSurvey } from "./survey-scoring";

export const ncssImportEnabled = () =>
  Boolean(process.env.NCSS_SURVEY_IMPORT_APPROVAL?.trim());

const rowSchema = z
  .strictObject({
    rowNumber: z
      .number()
      .int()
      .min(2)
      .max(ncssMaxRows + 1),
    sourceResponseId: z
      .string()
      .regex(ncssSourceId)
      .transform((id) => id.toLowerCase())
      .nullable(),
    memberId: z.union([
      z.literal(""),
      z.string().regex(ncssMemberId),
      z.null(),
    ]),
    surveyDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      .nullable(),
    phase: z.enum(surveyPhases),
    consent: z.literal(true),
    answers: z
      .array(
        z.union([
          z.number().int().min(0).max(5),
          z.literal("unknown"),
          z.null(),
        ]),
      )
      .length(questionKeys.length),
  })
  .refine(({ answers }) =>
    answers.every(
      (answer, i) =>
        typeof answer !== "number" || (i < 26 ? answer >= 1 : answer <= 4),
    ),
  );
const intakeSchema = z
  .strictObject({
    action: z.enum(["preview", "import"]),
    centre: z.string().trim().min(1).max(200),
    language: z.enum(surveyLanguages),
    rows: z.array(rowSchema).max(ncssMaxRows),
    excludedConsent: z.number().int().min(0).max(ncssMaxRows),
    excludedTest: z.number().int().min(0).max(ncssMaxRows),
    reviewToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    ({ rows, excludedConsent, excludedTest }) =>
      rows.length + excludedConsent + excludedTest <= ncssMaxRows &&
      new Set(rows.map((r) => r.rowNumber)).size === rows.length,
  );

export function parseNCSSIntake(value: unknown) {
  const result = intakeSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Invalid matched survey request. Prepare the matched CSV again and retry.",
    );
  return result.data;
}

type Input = ReturnType<typeof parseNCSSIntake>;
type Tx = Prisma.TransactionClient;
type Status =
  | "Ready"
  | "Missing Member ID"
  | "Invalid Member ID"
  | "Member ID unavailable"
  | "Invalid survey date"
  | "Invalid response ID"
  | "Already imported"
  | "Source conflict";

async function prepare(tx: Tx, actor: AccessUser, body: Input) {
  if (!centreAllowed(actor, body.centre))
    throw new Error("Your centre permissions do not permit this record.");
  const memberIds = [
    ...new Set(body.rows.flatMap((r) => (r.memberId ? [r.memberId] : []))),
  ];
  const sourceIds = [
    ...new Set(
      body.rows.flatMap((r) =>
        r.sourceResponseId ? [r.sourceResponseId] : [],
      ),
    ),
  ];
  const members = new Map<string, string>();
  for (let i = 0; i < memberIds.length; i += 400) {
    const found = await tx.person.findMany({
      where: {
        AND: [
          personScope(actor),
          {
            kind: "Member",
            status: "Active",
            centre: body.centre,
            memberId: { in: memberIds.slice(i, i + 400) },
          },
        ],
      },
      select: { id: true, memberId: true },
    });
    for (const member of found) members.set(member.memberId!, member.id);
  }
  const previous = new Map<
    string,
    {
      personId: string | null;
      language: string;
      confirmedMemberId: string | null;
      centre: string;
      surveyDate: Date | null;
      phase: string;
      deletedAt: Date | null;
      importMode: string;
      contentHash: string;
      rawAnswers: Prisma.JsonValue;
    }[]
  >();
  for (let i = 0; i < sourceIds.length; i += 400) {
    const found = await tx.surveyResponse.findMany({
      where: {
        sourceResponseId: { in: sourceIds.slice(i, i + 400) },
      },
      select: {
        sourceResponseId: true,
        language: true,
        personId: true,
        confirmedMemberId: true,
        centre: true,
        surveyDate: true,
        phase: true,
        deletedAt: true,
        importMode: true,
        contentHash: true,
        rawAnswers: true,
      },
    });
    for (const row of found) {
      const matches = previous.get(row.sourceResponseId) ?? [];
      matches.push(row);
      previous.set(row.sourceResponseId, matches);
    }
  }
  const seen = new Map<string, Set<string>>();
  const entries = body.rows.map((row) => {
    const answers = Object.fromEntries(
      questionKeys.map((key, i) => [key, row.answers[i]]),
    );
    const contentHash = hashSurvey(
      JSON.stringify([row.surveyDate, row.phase, row.answers]),
    );
    const personId = row.memberId ? members.get(row.memberId) : undefined;
    const sourceKey = hashSurvey(
      JSON.stringify(["NCSS FormSG", row.sourceResponseId]),
    );
    if (row.sourceResponseId) {
      const signatures = seen.get(sourceKey) ?? new Set<string>();
      signatures.add(JSON.stringify([row.memberId, contentHash]));
      seen.set(sourceKey, signatures);
    }
    return {
      row,
      answers,
      contentHash,
      personId,
      sourceKey,
      scores: scoreSurvey(answers),
    };
  });
  const encountered = new Set<string>();
  const validated = entries.map((entry) => {
    const { row, contentHash, personId, sourceKey, scores } = entry;
    let status: Status = "Ready";
    if (row.memberId === "") status = "Missing Member ID";
    else if (row.memberId === null) status = "Invalid Member ID";
    else if (!personId) status = "Member ID unavailable";
    else if (
      !row.surveyDate ||
      surveyDate(row.surveyDate, true) !== row.surveyDate
    )
      status = "Invalid survey date";
    else if (!row.sourceResponseId) status = "Invalid response ID";
    else if (seen.get(sourceKey)!.size > 1) status = "Source conflict";
    else {
      const matches = previous.get(row.sourceResponseId) ?? [];
      if (matches.length) {
        const existing = matches[0];
        const sameAnswers =
          existing.importMode === ncssImportMode
            ? existing.contentHash === contentHash
            : existing.surveyDate?.toISOString() === row.surveyDate &&
              existing.phase === row.phase &&
              JSON.stringify(
                scoreSurvey(existing.rawAnswers as Record<string, unknown>)
                  .values,
              ) === JSON.stringify(scores.values);
        status =
          matches.length === 1 &&
          !existing.deletedAt &&
          existing.centre === body.centre &&
          existing.language === body.language &&
          existing.personId === personId &&
          existing.confirmedMemberId === row.memberId &&
          sameAnswers
            ? "Already imported"
            : "Source conflict";
      } else if (encountered.has(sourceKey)) status = "Already imported";
      encountered.add(sourceKey);
    }
    return { ...entry, status };
  });

  const historyCandidates = validated.filter(
    (entry) => entry.status === "Ready" && entry.row.phase !== "Needs Review",
  );
  const activePeople = [
    ...new Set(historyCandidates.map((entry) => entry.personId!)),
  ];
  const baselineDates = new Map<string, string>();
  const laterDates = new Map<string, string>();
  const addPhase = (personId: string, phase: string, date: string) => {
    if (phase === "Baseline" && date > (baselineDates.get(personId) ?? ""))
      baselineDates.set(personId, date);
    if (phase !== "Baseline" && date < (laterDates.get(personId) ?? "9999"))
      laterDates.set(personId, date);
  };
  for (let i = 0; i < activePeople.length; i += 400) {
    const prior = await tx.surveyResponse.groupBy({
      by: ["personId", "phase"],
      where: {
        centre: body.centre,
        personId: { in: activePeople.slice(i, i + 400) },
        deletedAt: null,
        matchStatus: "Linked",
        phase: { in: ["Baseline", "Annual", "Follow-up"] },
      },
      _min: { surveyDate: true },
      _max: { surveyDate: true },
    });
    for (const item of prior) {
      const date =
        item.phase === "Baseline" ? item._max.surveyDate : item._min.surveyDate;
      if (date) addPhase(item.personId!, item.phase, date.toISOString());
    }
  }
  for (const { row, personId } of historyCandidates)
    addPhase(personId!, row.phase, row.surveyDate!);

  const display = validated.map(({ row, status, scores, personId }) => {
    const orderConflict =
      row.surveyDate &&
      personId &&
      row.phase !== "Needs Review" &&
      (row.phase === "Baseline"
        ? row.surveyDate > (laterDates.get(personId) ?? "9999")
        : row.surveyDate < (baselineDates.get(personId) ?? ""));
    return {
      rowNumber: row.rowNumber,
      status,
      surveyDate: row.surveyDate,
      phase: row.phase,
      overall: scores.overall,
      zbi: scores.zbi,
      warnings: [
        ...scores.warnings,
        ...(row.phase === "Needs Review"
          ? ["Missing or unrecognised survey phase"]
          : []),
        ...(orderConflict
          ? ["Recorded phases in this caregiver’s timeline require review"]
          : []),
      ],
    };
  });
  const ready = validated.filter((entry) => entry.status === "Ready");
  const duplicates = display.filter(
    (r) => r.status === "Already imported",
  ).length;
  const summary = {
    submitted: body.rows.length + body.excludedConsent + body.excludedTest,
    consentExcluded: body.excludedConsent,
    testExcluded: body.excludedTest,
    eligible: body.rows.length,
    duplicates,
    conflicts: display.filter((r) => r.status === "Source conflict").length,
    missingMemberId: display.filter((r) => r.status === "Missing Member ID")
      .length,
    rejected: body.rows.length - ready.length - duplicates,
    incomplete: ready.filter(
      ({ scores }) => scores.overall === null || scores.zbi === null,
    ).length,
    ready: ready.length,
  };
  const reviewToken = hashSurvey(
    JSON.stringify([
      actor.id,
      body.centre,
      body.language,
      body.excludedConsent,
      body.excludedTest,
      validated.map(({ row, contentHash, personId, status }) => [
        row.rowNumber,
        row.sourceResponseId,
        row.memberId,
        contentHash,
        personId,
        status,
      ]),
      display.map(({ warnings }) => warnings),
    ]),
  );
  return { validated, ready, display, summary, reviewToken };
}

export async function processNCSS(user: AccessUser, body: Input) {
  if (!ncssImportEnabled())
    throw new Error("NCSS import is disabled pending organisational approval.");
  return db.$transaction(
    async (tx) => {
      const actor = await currentWriter(tx, user);
      const { ready, display, summary, reviewToken } = await prepare(
        tx,
        actor,
        body,
      );
      if (body.action === "preview")
        return { rows: display, summary, reviewToken };
      if (body.reviewToken !== reviewToken)
        throw new Error(
          "The import preview has changed. Preview the file again before saving.",
        );
      if (!ready.length)
        throw new Error("There are no valid new responses to import.");
      const totals = {
        ...summary,
        saved: ready.length,
        skipped:
          summary.duplicates + summary.consentExcluded + summary.testExcluded,
      };
      const batch = await tx.surveyImportBatch.create({
        data: {
          filename: "NCSS matched CSV",
          language: body.language,
          centre: body.centre,
          uploadedBy: actor.id,
          summary: totals,
        },
      });
      const warnings = new Map(display.map((r) => [r.rowNumber, r.warnings]));
      const data = ready.map(
        ({ row, sourceKey, contentHash, answers, scores, personId }) => ({
          batchId: batch.id,
          importMode: ncssImportMode,
          sourceKey,
          contentHash,
          sourceResponseId: row.sourceResponseId!,
          rowNumber: row.rowNumber,
          centre: body.centre,
          language: body.language,
          submittedName: "",
          cleanedName: "",
          timestampText: row.surveyDate!,
          surveyDate: new Date(row.surveyDate!),
          phaseText: row.phase,
          phase: row.phase,
          personId,
          confirmedMemberId: row.memberId,
          matchStatus: "Linked",
          rawAnswers: answers,
          answers,
          warnings: warnings.get(row.rowNumber)!,
          physical: scores.physical,
          psychological: scores.psychological,
          social: scores.social,
          environment: scores.environment,
          overall: scores.overall,
          zbi: scores.zbi,
          method: scores.method,
        }),
      );
      for (let i = 0; i < data.length; i += 50)
        await tx.surveyResponse.createMany({ data: data.slice(i, i + 50) });
      await audit(
        tx,
        actor.id,
        "NCSS survey import confirmed",
        "SurveyImportBatch",
        batch.id,
        null,
        totals,
      );
      return { batchId: batch.id, summary: totals };
    },
    {
      timeout: 60000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export type NCSSPreview = Extract<
  Awaited<ReturnType<typeof processNCSS>>,
  { reviewToken: string }
>;
export type NCSSResult = Extract<
  Awaited<ReturnType<typeof processNCSS>>,
  { batchId: string }
>;
