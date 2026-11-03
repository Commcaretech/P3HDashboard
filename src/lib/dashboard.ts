import { db } from "./db";
import { AccessUser, personScope, programmeScope, alertScope } from "./access";
import { today } from "./domain";
export async function dashboardData(u: AccessUser) {
  const scope = personScope(u);
  const [
    people,
    alerts,
    grants,
    staff,
    schemes,
    conditions,
    activeProgrammes,
    completedThisMonth,
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
        scheme: { select: { name: true } },
        status: true,
        nextReviewDate: true,
        expiryDate: true,
        assignedId: true,
        resolvedAt: true,
        recurring: true,
        followUpDays: true,
        followUpMonths: true,
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
        OR: [
          {
            resolvedAt: {
              gte: new Date(today().slice(0, 7) + "-01"),
              lt: new Date(Date.parse(today()) + 86400000),
            },
          },
        ],
      },
    }),
  ]);
  return {
    people: people.map((p) => ({
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
      conditions: conditions
        .filter((c) => c._count.people > 0)
        .map((c) => ({ name: c.name, count: c._count.people })),
      activeProgrammes,
      completedThisMonth,
    },
  };
}
