import { Prisma } from "@prisma/client";
export type AccessUser = {
  id: string;
  role: string;
  allCentres: boolean;
  allowedCentres: { centre: string }[];
};
export const unrestricted = (u: AccessUser) =>
  u.role === "Admin" || u.allCentres;
export const centreAllowed = (u: AccessUser, centre: string) =>
  unrestricted(u) || u.allowedCentres.some((c) => c.centre === centre.trim());
export function personScope(
  u: AccessUser,
  includeTrashed = false,
): Prisma.PersonWhereInput {
  const scope: Prisma.PersonWhereInput = unrestricted(u)
    ? {}
    : {
        OR: [
          { centre: { in: u.allowedCentres.map((c) => c.centre) } },
          {
            kind: "Care Recipient",
            centre: "",
            recipientLinks: {
              some: {
                member: {
                  centre: { in: u.allowedCentres.map((c) => c.centre) },
                },
              },
            },
          },
        ],
      };
  return { AND: [scope, ...(includeTrashed ? [] : [{ deletedAt: null }])] };
}
export function programmeScope(
  u: AccessUser,
  includeTrashed = false,
): Prisma.ProgrammeWhereInput {
  return {
    AND: [
      unrestricted(u)
        ? {}
        : { centre: { in: ["", ...u.allowedCentres.map((c) => c.centre)] } },
      ...(includeTrashed ? [] : [{ deletedAt: null }]),
    ],
  };
}
export function grantScope(
  u: AccessUser,
  includeTrashed = false,
): Prisma.GrantApplicationWhereInput {
  return {
    person: personScope(u, includeTrashed),
    ...(includeTrashed ? {} : { deletedAt: null }),
  };
}
export function alertScope(u: AccessUser): Prisma.AlertWhereInput {
  return {
    AND: [
      { OR: [{ personId: null }, { person: personScope(u) }] },
      { OR: [{ grantId: null }, { grant: { deletedAt: null } }] },
      unrestricted(u)
        ? {}
        : {
            OR: [
              { person: personScope(u) },
              { personId: null, assignedId: u.id },
            ],
          },
    ],
  };
}
export async function requirePersonAccess(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  id: string,
) {
  const p = await tx.person.findFirst({
    where: { AND: [{ id }, personScope(u)] },
  });
  if (!p) throw new Error("Your centre permissions do not permit this record.");
  return p;
}
export async function requireProgrammeAccess(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  id: string,
) {
  const p = await tx.programme.findFirst({
    where: { AND: [{ id }, programmeScope(u)] },
  });
  if (!p) throw new Error("Your centre permissions do not permit this record.");
  return p;
}
export async function requireAlertAccess(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  id: string,
) {
  const a = await tx.alert.findFirst({
    where: { AND: [{ id }, alertScope(u)] },
  });
  if (!a) throw new Error("Your centre permissions do not permit this record.");
  return a;
}
export async function validateAssignment(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  id: unknown,
  centre: string,
) {
  if (!id) return;
  if (typeof id !== "string")
    throw new Error("Choose an active staff account.");
  const staff = await tx.user.findFirst({
    where: { id, active: true },
    include: { allowedCentres: true },
  });
  if (
    !staff ||
    !centreAllowed(staff, centre) ||
    (!unrestricted(u) && !centreAllowed(u, centre))
  )
    throw new Error("Assigned staff must have access to the record centre.");
}

export function surveyScope(
  u: AccessUser,
  includeTrashed = false,
): Prisma.SurveyResponseWhereInput {
  return {
    AND: [
      unrestricted(u)
        ? {}
        : { centre: { in: u.allowedCentres.map((c) => c.centre) } },
      { OR: [{ personId: null }, { person: personScope(u, includeTrashed) }] },
      ...(includeTrashed ? [] : [{ deletedAt: null }]),
    ],
  };
}
