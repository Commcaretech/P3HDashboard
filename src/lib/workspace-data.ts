import { db, personInclude, programmeInclude } from "./db";
import { redactSurveyAudit } from "./records";
import { AccessUser, personScope, programmeScope, alertScope } from "./access";
import { birthday, today } from "./domain";
import { closedGrant } from "./follow-up";
import { can } from "./domain";
export const emptyData = () => ({
  people: [],
  programmes: [],
  grants: [],
  alerts: [],
  schemes: [],
  staff: [],
  audit: [],
});
export const staffSelect = {
  id: true,
  name: true,
  username: true,
  role: true,
  active: true,
  allCentres: true,
  allowedCentres: true,
} as const;
export const personOptionSelect = {
  id: true,
  kind: true,
  memberId: true,
  name: true,
  alias: true,
  centre: true,
  status: true,
  assignedId: true,
  assigned: { select: { name: true } },
} as const;
export async function workspaceData(
  u: AccessUser,
  section: string,
  id: string,
) {
  const base = emptyData();
  const staff = await db.user.findMany({
    select: {
      ...staffSelect,
      ...(section === "settings" && u.role === "Admin"
        ? { email: true, emailNotifications: true, recipientBirthdays: true }
        : {}),
    },
    orderBy: { name: "asc" },
  });
  const schemes = [
    "settings",
    "surveys",
    "trash",
    "programmes",
    "import",
    "audit",
    "search",
    "reports",
    "matching",
  ].includes(section)
    ? []
    : await db.supportScheme.findMany({ orderBy: { name: "asc" } });
  if (
    [
      "settings",
      "surveys",
      "trash",
      "members",
      "care-recipients",
      "programmes",
      "import",
      "audit",
      "search",
      "reports",
      "grants",
    ].includes(section)
  )
    return { ...base, staff, schemes };
  if (section === "options") {
    const [people, programmes, languages, interests, conditions] =
      await Promise.all([
        db.person.findMany({
          where: personScope(u),
          select: personOptionSelect,
          orderBy: { name: "asc" },
        }),
        db.programme.findMany({
          where: programmeScope(u),
          select: { id: true, name: true, status: true, centre: true },
          orderBy: { name: "asc" },
        }),
        db.language.findMany({ select: { name: true } }),
        db.interest.findMany({ select: { name: true } }),
        db.medicalCondition.findMany({ select: { name: true } }),
      ]);
    return {
      ...base,
      staff,
      schemes,
      people: people.map((p) => ({
        ...p,
        languages: [],
        interests: [],
        conditions: [],
        caregiverLinks: [],
        recipientLinks: [],
        participations: [],
      })),
      programmes,
      vocabulary: {
        languages: languages.map((v) => v.name),
        interests: interests.map((v) => v.name),
        conditions: conditions.map((v) => v.name),
      },
    };
  }
  if (section === "people") {
    const p = await db.person.findFirst({
      where: { AND: [{ id }, personScope(u)] },
      include: {
        ...personInclude,
        assigned: { select: { name: true } },
        caregiverLinks: { where: { recipient: personScope(u) } },
        recipientLinks: { where: { member: personScope(u) } },
        participations: {
          where: { programme: programmeScope(u) },
          include: { programme: { select: { name: true } } },
        },
      },
    });
    if (!p) return { ...base, staff, schemes };
    const ids = [
      ...new Set([
        p.id,
        ...p.caregiverLinks.map((l) => l.recipientId),
        ...p.recipientLinks.map((l) => l.memberId),
      ]),
    ];
    const [related, grants, alerts, audit] = await Promise.all([
      db.person.findMany({
        where: {
          AND: [personScope(u), { id: { in: ids.filter((i) => i !== p.id) } }],
        },
        include: {
          ...personInclude,
          assigned: { select: { name: true } },
          caregiverLinks: { where: { recipient: personScope(u) } },
          recipientLinks: { where: { member: personScope(u) } },
          participations: {
            where: { programme: programmeScope(u) },
            include: { programme: { select: { name: true } } },
          },
        },
        omit: { rawImport: true },
      }),
      db.grantApplication.findMany({
        where: { deletedAt: null, personId: p.id, person: personScope(u) },
        include: {
          scheme: true,
          assigned: { select: { name: true } },
          followUps: { orderBy: { completedAt: "desc" } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      db.alert.findMany({
        where: { AND: [alertScope(u), { personId: p.id }] },
        include: { assigned: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
      can(u.role, "audit")
        ? db.auditLog.findMany({
            where: { entityId: { in: ids } },
            include: { user: { select: { name: true } } },
            orderBy: { timestamp: "desc" },
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    return {
      ...base,
      staff,
      schemes,
      people: [p, ...related.map((r) => ({ ...r, rawImport: null }))],
      grants,
      alerts,
      audit: audit.map(redactSurveyAudit),
    };
  }
  if (section === "matching") {
    const [people, programmes] = await Promise.all([
      db.person.findMany({
        where: personScope(u),
        include: {
          ...personInclude,
          assigned: { select: { name: true } },
          caregiverLinks: { where: { recipient: personScope(u) } },
          recipientLinks: { where: { member: personScope(u) } },
          participations: {
            where: { programme: programmeScope(u) },
            include: { programme: { select: { name: true } } },
          },
        },
        omit: { rawImport: true },
      }),
      db.programme.findMany({
        where: programmeScope(u),
        include: {
          ...programmeInclude,
          participations: { where: { person: personScope(u) } },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      ...base,
      staff,
      schemes,
      people: people.map((p) => ({ ...p, rawImport: null })),
      programmes,
    };
  }
  if (section === "my-work") {
    const [
      people,
      cases,
      unassigned,
      ownedBirthdays,
      grants,
      caseGroups,
      alertGroups,
    ] = await Promise.all([
      db.person.findMany({
        where: {
          AND: [personScope(u), { assignedId: u.id, status: "Active" }],
        },
        select: { ...personOptionSelect, dob: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      db.person.count({
        where: {
          AND: [personScope(u), { assignedId: u.id, status: "Active" }],
        },
      }),
      db.person.count({
        where: {
          AND: [
            personScope(u),
            { kind: "Member", status: "Active", assignedId: null },
          ],
        },
      }),
      db.person.findMany({
        where: {
          AND: [
            personScope(u),
            {
              kind: "Member",
              status: "Active",
              assignedId: u.id,
              dob: { not: null },
            },
          ],
        },
        select: { dob: true },
      }),
      db.grantApplication.findMany({
        where: { deletedAt: null, person: personScope(u) },
        select: {
          assignedId: true,
          status: true,
          resolvedAt: true,
          nextReviewDate: true,
        },
      }),
      db.person.groupBy({
        by: ["assignedId"],
        where: { AND: [personScope(u), { status: "Active" }] },
        _count: true,
      }),
      db.alert.groupBy({
        by: ["assignedId"],
        where: { AND: [alertScope(u), { status: "Pending" }] },
        _count: true,
      }),
    ]);
    return {
      ...base,
      staff,
      schemes,
      people: people.map((p) => ({
        ...p,
        languages: [],
        interests: [],
        conditions: [],
        caregiverLinks: [],
        recipientLinks: [],
        participations: [],
      })),
      myWorkSummary: {
        cases,
        unassigned,
        birthdays: ownedBirthdays.filter(
          (p) => p.dob && birthday(p.dob, today()).days <= 30,
        ).length,
        grantFollowups: grants.filter(
          (g) => g.assignedId === u.id && g.nextReviewDate && !closedGrant(g),
        ).length,
        workload: can(u.role, "audit")
          ? staff
              .filter((s) => s.active)
              .map((s) => ({
                id: s.id,
                name: s.name,
                cases:
                  caseGroups.find((g) => g.assignedId === s.id)?._count ?? 0,
                alerts:
                  alertGroups.find((g) => g.assignedId === s.id)?._count ?? 0,
                grants: grants.filter(
                  (g) =>
                    g.assignedId === s.id &&
                    g.nextReviewDate &&
                    !closedGrant(g),
                ).length,
              }))
          : [],
      },
    };
  }
  if (section === "alerts") {
    const [alerts, grants, people] = await Promise.all([
      db.alert.findMany({
        where: alertScope(u),
        include: { assigned: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
      db.grantApplication.findMany({
        where: { deletedAt: null, person: personScope(u) },
        include: {
          scheme: true,
          assigned: { select: { name: true } },
          followUps: { orderBy: { completedAt: "desc" } },
        },
      }),
      db.person.findMany({
        where: personScope(u),
        select: {
          ...personOptionSelect,
          dob: true,
          mobility: true,
          preferredLanguage: true,
          updatedAt: true,
        },
      }),
    ]);
    return {
      ...base,
      staff,
      schemes,
      people: people.map((p) => ({
        ...p,
        languages: [],
        interests: [],
        conditions: [],
        caregiverLinks: [],
        recipientLinks: [],
        participations: [],
      })),
      alerts,
      grants,
    };
  }
  return { ...base, staff, schemes };
}
