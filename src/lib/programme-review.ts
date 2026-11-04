import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessUser, requireProgrammeAccess, centreAllowed } from "./access";
import { can } from "./domain";
import { programmeInclude } from "./db";
import { saveProgramme, audit } from "./records";
import { suitabilityIssues } from "./programme-source";
const text = z.string().max(12000).default("");
export const reviewInput = z.object({
  decision: z.enum(["draft", "reviewed", "information"]),
  version: z.string(),
  reviewVersion: z.string().nullable(),
  sourceFingerprint: z.string(),
  values: z.object({
    audience: z.enum(["", "Caregivers", "Care Recipients", "Both"]),
    languages: text,
    interests: text,
    mobility: text,
    conditions: text,
    languageAssessment: z.enum(["Assessed", "Not Assessed"]),
    interestAssessment: z.enum(["Assessed", "Not Assessed"]),
    mobilityAssessment: z.enum(["Assessed", "Not Assessed"]),
    conditionAssessment: z.enum(["Assessed", "Not Assessed", "Not Applicable"]),
    accessibility: text,
    intensity: z.enum([
      "Not Assessed",
      "Not Applicable",
      "Low",
      "Moderate",
      "High",
    ]),
    registrationStatus: z.enum(["Unverified", "Open", "Closed", "Waitlist"]),
    staffNotes: text,
    description: text,
    notes: text,
  }),
});
export async function saveProgrammeReview(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  id: string,
  input: unknown,
) {
  const body = reviewInput.parse(input);
  const current = await tx.user.findUnique({
    where: { id: u.id },
    include: { allowedCentres: true },
  });
  if (!current?.active || !can(current.role, "write"))
    throw new Error("Your role does not permit this action.");
  await requireProgrammeAccess(tx, current, id);
  const p = await tx.programme.findUniqueOrThrow({
    where: { id },
    include: programmeInclude,
  });
  if (
    p.updatedAt.toISOString() !== body.version ||
    (p.review?.updatedAt.toISOString() ?? null) !== body.reviewVersion ||
    (p.external?.reviewFingerprint ?? "") !== body.sourceFingerprint
  )
    throw new Error(
      "Another staff member or sync changed this programme. Reload before reviewing.",
    );
  if (!centreAllowed(current, p.centre))
    throw new Error("Your centre permissions do not permit this record.");
  const v = body.values;
  const review = {
    audience: v.audience,
    languageAssessment: v.languageAssessment,
    interestAssessment: v.interestAssessment,
    mobilityAssessment: v.mobilityAssessment,
    conditionAssessment: v.conditionAssessment,
    accessibility: v.accessibility,
    intensity: v.intensity,
    staffNotes: v.staffNotes,
  };
  const issues = suitabilityIssues({
    ...p,
    mobility: v.mobility,
    languages: v.languages.split(/[,;\n]/).filter((x) => x.trim()),
    interests: v.interests.split(/[,;\n]/).filter((x) => x.trim()),
    conditions: v.conditions.split(/[,;\n]/).filter((x) => x.trim()),
    review: {
      ...review,
      status: "In Review",
      issues: [],
      sourceFingerprint: body.sourceFingerprint,
      reviewedBy: null,
      reviewedByName: "",
      reviewedAt: null,
      updatedAt: new Date(),
    },
  });
  if (body.decision === "reviewed" && issues.length)
    throw new Error(`Complete suitability review: ${issues.join("; ")}`);
  // Claim this exact revision atomically so two reviewers cannot overwrite each other.
  const claimedAt = new Date(Math.max(Date.now(), p.updatedAt.getTime() + 1));
  const claim = await tx.programme.updateMany({
    where: { id, updatedAt: p.updatedAt },
    data: { updatedAt: claimedAt },
  });
  if (claim.count !== 1)
    throw new Error(
      "Another staff member or sync changed this programme. Reload before reviewing.",
    );
  await saveProgramme(
    tx,
    u.id,
    { ...p, ...v, suitabilityReviewed: p.suitabilityReviewed },
    id,
  );
  const status =
    body.decision === "reviewed"
      ? "Reviewed"
      : body.decision === "information"
        ? "Needs Recheck"
        : "In Review";
  const data = {
    ...review,
    status,
    issues,
    sourceFingerprint: p.external?.reviewFingerprint ?? "",
    ...(status === "Reviewed"
      ? {
          reviewedBy: u.id,
          reviewedByName: current.name,
          reviewedAt: new Date(),
        }
      : {}),
  };
  const saved = await tx.programmeReview.upsert({
    where: { programmeId: id },
    create: { programmeId: id, ...data },
    update: data,
  });
  await tx.programme.update({
    where: { id },
    data: { suitabilityReviewed: status === "Reviewed", updatedAt: claimedAt },
  });
  await audit(
    tx,
    u.id,
    `Programme review ${status}`,
    "Programme",
    id,
    p.review,
    saved,
  );
  return saved;
}
