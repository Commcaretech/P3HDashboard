import { db } from "./db";
import {
  AccessUser,
  personScope,
  programmeScope,
  alertScope,
  surveyScope,
} from "./access";
import { birthday, today, can } from "./domain";
import { closedGrant } from "./follow-up";
import { alertGroup } from "./workflow";
const group = (a: { dueDate: Date; snoozedUntil: Date | null }) =>
  alertGroup({
    dueDate: a.dueDate.toISOString(),
    snoozedUntil: a.snoozedUntil?.toISOString() ?? null,
  });
const counts = (values: string[]) =>
  [
    ...values.reduce(
      (m, v) => m.set(v, (m.get(v) || 0) + 1),
      new Map<string, number>(),
    ),
  ].map(([name, count]) => ({ name, count }));
export async function dashboardData(u: AccessUser) {
  const scope = personScope(u),
    now = today();
  const [
    people,
    allAlerts,
    allGrants,
    staff,
    schemes,
    conditions,
    activeProgrammes,
    completedThisMonth,
    surveyResponses,
    unmatchedSurveys,
    surveyedCaregivers,
  ] = await Promise.all([
    db.person.findMany({
      where: scope,
      select: {
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
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.alert.findMany({
      where: { AND: [alertScope(u), { status: "Pending" }] },
      include: { assigned: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.grantApplication.findMany({
      where: { person: scope },
      select: {
        id: true,
        personId: true,
        status: true,
        resolvedAt: true,
        assignedId: true,
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
        person: scope,
        resolvedAt: {
          gte: new Date(now.slice(0, 7) + "-01"),
          lt: new Date(Date.parse(now) + 86400000),
        },
      },
    }),
    db.surveyResponse.count({ where: surveyScope(u) }),
    db.surveyResponse.count({
      where: { AND: [surveyScope(u), { personId: null }] },
    }),
    db.person.count({
      where: {
        AND: [
          scope,
          {
            kind: "Member",
            status: "Active",
            surveyResponses: { some: surveyScope(u) },
          },
        ],
      },
    }),
  ]);
  const owners = new Map(people.map((p) => [p.id, p.assignedId]));
  const pending = allAlerts.filter(
    (a) =>
      can(u.role, "audit") ||
      a.assignedId === u.id ||
      (!a.assignedId && a.personId && owners.get(a.personId) === u.id),
  );
  const alerts = [...pending]
    .sort((a, b) => {
      const order = { Overdue: 0, Today: 1, Upcoming: 2, Snoozed: 3 };
      return (
        (order[group(a) as keyof typeof order] ?? 4) -
          (order[group(b) as keyof typeof order] ?? 4) ||
        (a.snoozedUntil || a.dueDate).getTime() -
          (b.snoozedUntil || b.dueDate).getTime()
      );
    })
    .slice(0, 60);
  const ids = new Set([
    ...alerts.map((a) => a.personId),
    ...people.slice(0, 20).map((p) => p.id),
  ]);
  const grantIds = alerts
    .map((a) => a.grantId)
    .filter((id): id is string => Boolean(id));
  const grants = await db.grantApplication.findMany({
    where: { id: { in: grantIds }, person: scope },
    include: {
      scheme: true,
      assigned: { select: { name: true } },
      followUps: { orderBy: { completedAt: "desc" } },
    },
  });
  const members = people.filter(
    (p) => p.kind === "Member" && p.status === "Active",
  );
  const activeConditions = conditions
    .filter((c) => c._count.people > 0)
    .map((c) => ({ name: c.name, count: c._count.people }));
  const birthdays = members.filter(
    (p) => p.dob && birthday(p.dob, now).days <= 30,
  );
  const pendingGrants = allGrants.filter(
    (g) =>
      !closedGrant(g) &&
      (can(u.role, "audit") ||
        g.assignedId === u.id ||
        (!g.assignedId && owners.get(g.personId) === u.id)),
  );
  return {
    people: people
      .filter((p) => ids.has(p.id))
      .map((p) => ({
        ...p,
        dob: p.dob,
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
      conditions: activeConditions,
      activeProgrammes,
      completedThisMonth,
      totals: {
        members: people.filter(
          (p) => p.kind === "Member" && p.status !== "Archived",
        ).length,
        recipients: people.filter(
          (p) => p.kind === "Care Recipient" && p.status !== "Archived",
        ).length,
        activeCases: members.length,
        surveyResponses,
        unmatchedSurveys,
        surveyedCaregivers,
        dementia:
          activeConditions.find((c) => c.name.toLowerCase() === "dementia")
            ?.count ?? 0,
        birthdays: birthdays.length,
        pendingGrants: pendingGrants.length,
        today: pending.filter((a) => group(a) === "Today").length,
        overdue: pending.filter(
          (a) => a.type.startsWith("Grant") && group(a) === "Overdue",
        ).length,
        outstanding: pending.length,
        grantFollowups: pending.filter((a) => a.type.startsWith("Grant"))
          .length,
      },
      charts: {
        languages: counts(
          members.map((p) => p.preferredLanguage || "Not recorded"),
        ),
        onboarding: counts(
          members.flatMap((p) =>
            p.onboardingDate
              ? [p.onboardingDate.toISOString().slice(0, 7)]
              : [],
          ),
        ).sort((a, b) => a.name.localeCompare(b.name)),
        grantStatus: counts(allGrants.map((g) => g.status)),
        overdueStaff: counts(
          pending
            .filter((a) => a.type.startsWith("Grant") && group(a) === "Overdue")
            .map((a) => a.assigned?.name ?? "Unassigned"),
        ),
      },
    },
  };
}
