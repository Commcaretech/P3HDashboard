import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  AccessUser,
  unrestricted,
  personScope,
  programmeScope,
  alertScope,
} from "./access";
export async function auditScope(
  u: AccessUser,
): Promise<Prisma.AuditLogWhereInput> {
  if (unrestricted(u)) return {};
  const [people, programmes, grants, alerts, relationships, participations] =
    await Promise.all([
      db.person.findMany({ where: personScope(u), select: { id: true } }),
      db.programme.findMany({ where: programmeScope(u), select: { id: true } }),
      db.grantApplication.findMany({
        where: { person: personScope(u) },
        select: { id: true },
      }),
      db.alert.findMany({ where: alertScope(u), select: { id: true } }),
      db.careRelationship.findMany({
        where: { member: personScope(u), recipient: personScope(u) },
        select: { id: true },
      }),
      db.participation.findMany({
        where: { person: personScope(u), programme: programmeScope(u) },
        select: { id: true },
      }),
    ]);
  return {
    OR: [
      {
        entityType: { in: ["Member", "Care Recipient", "person"] },
        entityId: { in: people.map((p) => p.id) },
      },
      {
        entityType: { in: ["Programme", "programme"] },
        entityId: { in: programmes.map((p) => p.id) },
      },
      { entityType: "Grant", entityId: { in: grants.map((p) => p.id) } },
      { entityType: "Alert", entityId: { in: alerts.map((p) => p.id) } },
      {
        entityType: "Relationship",
        entityId: { in: relationships.map((p) => p.id) },
      },
      {
        entityType: "Participation",
        entityId: { in: participations.map((p) => p.id) },
      },
    ],
  };
}
