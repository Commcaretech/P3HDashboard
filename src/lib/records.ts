import { Prisma } from "@prisma/client";
import { categories, personSchema, programmeSchema } from "./domain";
import { personInclude, programmeInclude } from "./db";
type Tx = Prisma.TransactionClient;
export async function audit(
  tx: Tx,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await tx.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      changes: JSON.parse(
        JSON.stringify({ before, after }),
      ) as Prisma.InputJsonValue,
    },
  });
}
async function vocabulary(
  tx: Tx,
  type: "language" | "interest" | "medicalCondition",
  values: string[],
  existing: { id: string; name: string }[] = [],
) {
  const ids: string[] = [];
  for (const name of values) {
    const preserved = existing.find(
      (x) => x.name.toLowerCase() === name.toLowerCase(),
    );
    if (preserved) {
      ids.push(preserved.id);
      continue;
    }
    const item =
      type === "language"
        ? await tx.language.upsert({
            where: { name },
            create: { name },
            update: {},
          })
        : type === "interest"
          ? await tx.interest.upsert({
              where: { name },
              create: { name },
              update: {},
            })
          : await tx.medicalCondition.upsert({
              where: { name },
              create: { name },
              update: {},
            });
    ids.push(item.id);
  }
  return ids;
}
export async function savePerson(
  tx: Tx,
  userId: string,
  input: unknown,
  id?: string,
  raw?: Prisma.InputJsonValue,
  version?: string,
) {
  const existing = id
    ? await tx.person.findUniqueOrThrow({
        where: { id },
        include: personInclude,
      })
    : null;
  const original = existing
    ? {
        ...existing,
        memberId: existing.memberId ?? "",
        assignedId: existing.assignedId ?? "",
        dob: existing.dob?.toISOString().slice(0, 10) ?? "",
        onboardingDate:
          existing.onboardingDate?.toISOString().slice(0, 10) ?? "",
        languages: existing.languages
          .filter((x) => x.mode === "Spoken / understood")
          .map((x) => x.language.name)
          .join(","),
        spokenLanguages: existing.languages
          .filter((x) => x.mode === "Spoken")
          .map((x) => x.language.name)
          .join(","),
        understoodLanguages: existing.languages
          .filter((x) => x.mode === "Understood")
          .map((x) => x.language.name)
          .join(","),
        interests: existing.interests.map((x) => x.interest.name).join(","),
        conditions: existing.conditions.map((x) => x.condition.name).join(","),
      }
    : {};
  const v = personSchema.parse({
    ...original,
    ...(input as Record<string, unknown>),
  });
  const {
    languages,
    spokenLanguages,
    understoodLanguages,
    interests,
    conditions,
    zbi,
    zbiDate,
    dob,
    onboardingDate,
    memberId,
    ...base
  } = v;
  const before = id
    ? await tx.person.findUnique({ where: { id }, include: personInclude })
    : null;
  if (id && !before) throw new Error("Record not found");
  if (before && version && before.updatedAt.toISOString() !== version)
    throw new Error(
      "Another staff member changed this record. Reload before saving.",
    );
  if (before && before.kind !== v.kind)
    throw new Error("Record type cannot be changed");
  const data = {
    ...base,
    memberId: memberId || null,
    assignedId: base.assignedId || null,
    dob: dob ? new Date(dob) : null,
    onboardingDate: onboardingDate ? new Date(onboardingDate) : null,
    ...(raw ? { rawImport: raw } : {}),
  };
  const p = id
    ? await tx.person.update({ where: { id }, data })
    : await tx.person.create({ data });
  const supplied = new Set(Object.keys(input as Record<string, unknown>));
  const touched = {
    language:
      !before ||
      [
        "languages",
        "spokenLanguages",
        "understoodLanguages",
        "preferredLanguage",
      ].some((key) => supplied.has(key)),
    interest: !before || supplied.has("interests"),
    medicalCondition:
      !before ||
      ["conditions", "primaryCondition"].some((key) => supplied.has(key)),
  };
  if (touched.language)
    await tx.personLanguage.deleteMany({ where: { personId: p.id } });
  if (touched.interest)
    await tx.personInterest.deleteMany({ where: { personId: p.id } });
  if (touched.medicalCondition)
    await tx.personCondition.deleteMany({ where: { personId: p.id } });
  for (const [type, values] of [
    [
      "language",
      categories(
        [languages, spokenLanguages, understoodLanguages, v.preferredLanguage]
          .filter(Boolean)
          .join(","),
      ),
    ],
    ["interest", categories(interests)],
    [
      "medicalCondition",
      categories([conditions, v.primaryCondition].filter(Boolean).join(",")),
    ],
  ] as const) {
    if (!touched[type]) continue;
    const existingVocabulary =
      type === "language"
        ? before?.languages.map((x) => x.language)
        : type === "interest"
          ? before?.interests.map((x) => x.interest)
          : before?.conditions.map((x) => x.condition);
    for (const categoryId of await vocabulary(
      tx,
      type,
      values,
      existingVocabulary,
    )) {
      if (type === "language") {
        const category = await tx.language.findUniqueOrThrow({
          where: { id: categoryId },
        });
        const spoken = categories(spokenLanguages).includes(category.name),
          understood = categories(understoodLanguages).includes(category.name);
        await tx.personLanguage.create({
          data: {
            personId: p.id,
            languageId: categoryId,
            mode:
              spoken && understood
                ? "Spoken / understood"
                : spoken
                  ? "Spoken"
                  : understood
                    ? "Understood"
                    : "Spoken / understood",
          },
        });
      }
      if (type === "interest")
        await tx.personInterest.create({
          data: { personId: p.id, interestId: categoryId },
        });
      if (type === "medicalCondition")
        await tx.personCondition.create({
          data: {
            personId: p.id,
            conditionId: categoryId,
            notes:
              before?.conditions.find((c) => c.conditionId === categoryId)
                ?.notes ?? "",
          },
        });
    }
  }
  if (zbi) {
    await tx.assessment.create({
      data: {
        personId: p.id,
        type: "ZBI",
        value: Number(zbi),
        assessedAt: zbiDate ? new Date(zbiDate) : null,
      },
    });
  }
  if (before && before.assignedId !== p.assignedId)
    await audit(
      tx,
      userId,
      "Assignment changed",
      p.kind,
      p.id,
      { assignedId: before.assignedId },
      { assignedId: p.assignedId },
    );
  await audit(
    tx,
    userId,
    before ? "Record edited" : "Record created",
    p.kind,
    p.id,
    before,
    { ...v, rawImport: raw ? "preserved" : undefined },
  );
  return p;
}
export async function saveProgramme(
  tx: Tx,
  userId: string,
  input: unknown,
  id?: string,
  version?: string,
) {
  const imported = id
    ? await tx.externalProgramme.findUnique({ where: { programmeId: id } })
    : null;
  const existingProgramme = id
    ? await tx.programme.findUnique({
        where: { id },
        include: programmeInclude,
      })
    : null;
  const raw = input as Record<string, unknown>;
  const v = programmeSchema.parse(
    imported && existingProgramme
      ? {
          ...raw,
          ...Object.fromEntries(
            [
              "name",
              "category",
              "centre",
              "venue",
              "day",
              "startTime",
              "endTime",
              "frequency",
              "capacity",
            ].map((k) => [
              k,
              existingProgramme[k as keyof typeof existingProgramme],
            ]),
          ),
          suitabilityReviewed: existingProgramme.suitabilityReviewed,
        }
      : raw,
  );
  const changedSuitability = Boolean(
    imported &&
    existingProgramme?.review?.status === "Reviewed" &&
    (["mobility", "description", "notes"].some(
      (k) =>
        v[k as "mobility" | "description" | "notes"] !==
        existingProgramme[k as "mobility" | "description" | "notes"],
    ) ||
      JSON.stringify(categories(v.languages).sort()) !==
        JSON.stringify(
          existingProgramme.languages.map((x) => x.language.name).sort(),
        ) ||
      JSON.stringify(categories(v.interests).sort()) !==
        JSON.stringify(
          existingProgramme.interests.map((x) => x.interest.name).sort(),
        ) ||
      JSON.stringify(categories(v.conditions).sort()) !==
        JSON.stringify(
          existingProgramme.conditions.map((x) => x.condition.name).sort(),
        )),
  );
  if (changedSuitability) {
    v.suitabilityReviewed = false;
    await tx.programmeReview.update({
      where: { programmeId: id },
      data: {
        status: "Needs Recheck",
        issues: ["Local suitability changed; complete review again"],
      },
    });
  }
  const { languages, interests, conditions, ...data } = v;
  const before = id ? await tx.programme.findUnique({ where: { id } }) : null;
  if (id && !before) throw new Error("Record not found");
  if (before && version && before.updatedAt.toISOString() !== version)
    throw new Error(
      "Another staff member changed this programme. Reload before saving.",
    );
  const p = id
    ? await tx.programme.update({ where: { id }, data })
    : await tx.programme.create({ data });
  await tx.programmeLanguage.deleteMany({ where: { programmeId: p.id } });
  await tx.programmeInterest.deleteMany({ where: { programmeId: p.id } });
  await tx.programmeCondition.deleteMany({ where: { programmeId: p.id } });
  for (const [type, values] of [
    ["language", categories(languages)],
    ["interest", categories(interests)],
    ["medicalCondition", categories(conditions)],
  ] as const) {
    for (const categoryId of await vocabulary(tx, type, values)) {
      if (type === "language")
        await tx.programmeLanguage.create({
          data: { programmeId: p.id, languageId: categoryId },
        });
      if (type === "interest")
        await tx.programmeInterest.create({
          data: { programmeId: p.id, interestId: categoryId },
        });
      if (type === "medicalCondition")
        await tx.programmeCondition.create({
          data: { programmeId: p.id, conditionId: categoryId },
        });
    }
  }
  await audit(
    tx,
    userId,
    before ? "Programme updated" : "Programme created",
    "Programme",
    p.id,
    before,
    v,
  );
  return p;
}
