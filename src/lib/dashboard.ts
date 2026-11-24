import { db } from "./db";
import type { Prisma } from "@prisma/client";
import {
  AccessUser,
  personScope,
  programmeScope,
  alertScope,
  surveyScope,
  unrestricted,
} from "./access";
import { birthday, today, can } from "./domain";
import { addDays, openGrantFilter } from "./follow-up";
const effectiveDue = (a: { dueDate: Date; snoozedUntil: Date | null }) =>
  a.snoozedUntil ?? a.dueDate;
const counts = (values: string[]) =>
  [
    ...values.reduce(
      (m, v) => m.set(v, (m.get(v) || 0) + 1),
      new Map<string, number>(),
    ),
  ].map(([name, count]) => ({ name, count }));
const personSelect = {
  id: true,
  kind: true,
  memberId: true,
  name: true,
  alias: true,
  dob: true,
  centre: true,
  status: true,
  assignedId: true,
  assigned: { select: { name: true } },
  preferredLanguage: true,
  onboardingDate: true,
  updatedAt: true,
} satisfies Prisma.PersonSelect;
export async function dashboardData(u: AccessUser) {
  const scope = personScope(u),
    activeMembers = { AND: [scope, { kind: "Member", status: "Active" }] },
    surveyWhere = surveyScope(u),
    now = today(),
    todayStart = new Date(now),
    tomorrowStart = new Date(addDays(now, 1)),
    ownership = can(u.role, "audit")
      ? {}
      : {
          OR: [
            { assignedId: u.id },
            { assignedId: null, person: { assignedId: u.id } },
          ],
        };
  const [
    recentPeople,
    peopleCounts,
    languages,
    onboardingDates,
    birthDates,
    pending,
    grantStatuses,
    pendingGrants,
    staff,
    schemes,
    conditions,
    activeProgrammes,
    completedThisMonth,
    surveyResponses,
    unmatchedSurveys,
    surveyedCaregivers,
    linkedRecipients,
  ] = await Promise.all([
    db.person.findMany({
      where: scope,
      select: personSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 20,
    }),
    db.person.groupBy({
      by: ["kind", "status"],
      where: scope,
      _count: { _all: true },
    }),
    db.person.groupBy({
      by: ["preferredLanguage"],
      where: activeMembers,
      _count: { _all: true },
    }),
    db.person.groupBy({
      by: ["onboardingDate"],
      where: { ...activeMembers, onboardingDate: { not: null } },
      _count: { _all: true },
    }),
    db.person.groupBy({
      by: ["dob"],
      where: { ...activeMembers, dob: { not: null } },
      _count: { _all: true },
    }),
    db.alert.findMany({
      where: { AND: [alertScope(u), { status: "Pending" }, ownership] },
      include: { assigned: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.grantApplication.groupBy({
      by: ["status"],
      where: { deletedAt: null, person: scope },
      _count: { _all: true },
    }),
    db.grantApplication.count({
      where: {
        AND: [{ deletedAt: null, person: scope }, openGrantFilter, ownership],
      },
    }),
    db.user.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        active: true,
        username: true,
        allCentres: true,
        allowedCentres: true,
      },
      orderBy: { name: "asc" },
    }),
    db.supportScheme.findMany({ orderBy: { name: "asc" } }),
    db.medicalCondition.findMany({
      select: {
        name: true,
        _count: {
          select: {
            people: {
              where: {
                person: {
                  AND: [scope, { kind: "Care Recipient", status: "Active" }],
                },
              },
            },
          },
        },
      },
    }),
    db.programme.count({
      where: { AND: [programmeScope(u), { status: "Active" }] },
    }),
    db.grantApplication.count({
      where: {
        deletedAt: null,
        person: scope,
        resolvedAt: {
          gte: new Date(now.slice(0, 7) + "-01"),
          lt: tomorrowStart,
        },
      },
    }),
    db.surveyResponse.count({ where: surveyWhere }),
    db.surveyResponse.count({
      where: { AND: [surveyWhere, { personId: null }] },
    }),
    db.person.count({
      where: {
        ...activeMembers,
        surveyResponses: { some: surveyWhere },
      },
    }),
    db.person.count({
      where: {
        AND: [
          scope,
          {
            kind: "Care Recipient",
            status: { not: "Archived" },
            recipientLinks: {
              some: { member: { AND: [scope, { status: "Active" }] } },
            },
          },
        ],
      },
    }),
  ]);
  const grantFollowups = pending.filter((a) => a.type.startsWith("Grant"));
  const overdue = grantFollowups.filter((a) => effectiveDue(a) < todayStart);
  const alerts = [...pending]
    .sort((a, b) => effectiveDue(a).getTime() - effectiveDue(b).getTime())
    .slice(0, 60);
  const recentIds = new Set(recentPeople.map((p) => p.id));
  const alertPersonIds = alerts.flatMap((a) =>
    a.personId && !recentIds.has(a.personId) ? [a.personId] : [],
  );
  const grantIds = alerts
    .map((a) => a.grantId)
    .filter((id): id is string => Boolean(id));
  const [alertPeople, grants] = await Promise.all([
    alertPersonIds.length
      ? db.person.findMany({
          where: { AND: [scope, { id: { in: alertPersonIds } }] },
          select: personSelect,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        })
      : [],
    grantIds.length
      ? db.grantApplication.findMany({
          where: { deletedAt: null, id: { in: grantIds }, person: scope },
          include: {
            scheme: true,
            assigned: { select: { name: true } },
            followUps: { orderBy: { completedAt: "desc" } },
          },
        })
      : [],
  ]);
  const activeConditions = conditions
    .filter((c) => c._count.people > 0)
    .map((c) => ({ name: c.name, count: c._count.people }));
  const birthdays = birthDates.reduce(
    (total, row) =>
      total +
      (row.dob && birthday(row.dob, now).days <= 30 ? row._count._all : 0),
    0,
  );
  const onboarding = new Map<string, number>();
  for (const row of onboardingDates) {
    if (!row.onboardingDate) continue;
    const month = row.onboardingDate.toISOString().slice(0, 7);
    onboarding.set(month, (onboarding.get(month) ?? 0) + row._count._all);
  }
  const languageCounts = new Map<string, number>();
  for (const row of languages) {
    const name = row.preferredLanguage || "Not recorded";
    languageCounts.set(name, (languageCounts.get(name) ?? 0) + row._count._all);
  }
  const peopleTotal = (kind: string) =>
    peopleCounts.reduce(
      (total, row) =>
        total +
        (row.kind === kind && row.status !== "Archived" ? row._count._all : 0),
      0,
    );
  return {
    people: [...recentPeople, ...alertPeople].map((p) => ({
      ...p,
      languages: [],
      interests: [],
      conditions: [],
      assessments: [],
      caregiverLinks: [],
      recipientLinks: [],
      participations: [],
    })),
    alerts,
    grants,
    staff,
    schemes,
    programmes: [],
    audit: [],
    dashboardSummary: {
      centreContext: unrestricted(u)
        ? "All centres"
        : u.allowedCentres
            .map(({ centre }) => centre)
            .sort()
            .join(", ") || "No centres assigned",
      conditions: activeConditions,
      activeProgrammes,
      completedThisMonth,
      totals: {
        members: peopleTotal("Member"),
        recipients: peopleTotal("Care Recipient"),
        activeCases:
          peopleCounts.find(
            (row) => row.kind === "Member" && row.status === "Active",
          )?._count._all ?? 0,
        surveyResponses,
        unmatchedSurveys,
        surveyedCaregivers,
        linkedRecipients,
        dementia:
          activeConditions.find((c) => c.name.toLowerCase() === "dementia")
            ?.count ?? 0,
        birthdays,
        pendingGrants,
        today: pending.filter((a) => {
          const date = effectiveDue(a);
          return date >= todayStart && date < tomorrowStart;
        }).length,
        overdue: overdue.length,
        outstanding: pending.length,
        grantFollowups: grantFollowups.length,
      },
      charts: {
        languages: [...languageCounts].map(([name, count]) => ({
          name,
          count,
        })),
        onboarding: [...onboarding]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        grantStatus: grantStatuses.map((row) => ({
          name: row.status,
          count: row._count._all,
        })),
        overdueStaff: counts(
          overdue.map((a) => a.assigned?.name ?? "Unassigned"),
        ),
      },
    },
  };
}
