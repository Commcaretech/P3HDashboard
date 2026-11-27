import { Prisma } from "@prisma/client";
import { closedGrant } from "./follow-up";
import { db } from "./db";
import { birthday, parseDate, today } from "./domain";
import {
  CHECKIN_TYPE,
  checkInDueDate,
  checkInFollowUpKey,
  checkInSourceKey,
  checkInTitle,
  isCheckInDue,
  lastContactDate,
} from "./checkin";
export function birthdayPlans(
  id: string,
  name: string,
  dob: Date,
  now: string,
) {
  const b = birthday(dob, now);
  if (b.days > 30) return [];
  return [
    {
      sourceKey: `birthday:${id}:${b.date}`,
      personId: id,
      title: `Birthday: ${name} (${b.days === 0 ? "today" : `${b.days} ${b.days === 1 ? "day" : "days"} away`})`,
      type: "Birthday",
      dueDate: new Date(b.date),
      priority: b.days <= 1 ? "High" : "Normal",
    },
  ];
}
export async function reconcileAlerts(
  tx: Prisma.TransactionClient,
  scope?: { personIds?: string[]; grantIds?: string[] },
) {
  const now = today();
  const keys: string[] = [];
  const people = await tx.person.findMany({
    where: {
      ...(scope ? { id: { in: scope.personIds ?? [] } } : {}),
      status: "Active",
      deletedAt: null,
      dob: { not: null },
      OR: [{ kind: "Member" }, { assigned: { recipientBirthdays: true } }],
    },
  });
  for (const p of people) {
    for (const plan of birthdayPlans(
      p.id,
      p.name || p.alias || p.memberId || "Person",
      p.dob!,
      now,
    )) {
      keys.push(plan.sourceKey);
      const current = await tx.alert.findUnique({
        where: { sourceKey: plan.sourceKey },
      });
      if (!current) {
        // Reuse the closest old reminder so its completion and snooze survive.
        const legacy = await tx.alert.findFirst({
          where: {
            personId: p.id,
            type: "Birthday",
            sourceKey: { startsWith: `${plan.sourceKey}:` },
          },
          orderBy: { dueDate: "desc" },
        });
        if (legacy)
          await tx.alert.update({
            where: { id: legacy.id },
            data: { sourceKey: plan.sourceKey },
          });
      }
      await tx.alert.upsert({
        where: { sourceKey: plan.sourceKey },
        create: { ...plan, assignedId: p.assignedId },
        update: {
          title: plan.title,
          dueDate: plan.dueDate,
          priority: plan.priority,
          assignedId: p.assignedId,
          ...(current?.autoDismissed
            ? { status: "Pending", autoDismissed: false }
            : {}),
        },
      });
    }
  }
  const checkinPeople = await tx.person.findMany({
    where: {
      ...(scope ? { id: { in: scope.personIds ?? [] } } : {}),
      kind: "Member",
      status: "Active",
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      alias: true,
      memberId: true,
      assignedId: true,
      lastContactedAt: true,
      onboardingDate: true,
      createdAt: true,
    },
  });
  if (checkinPeople.length) {
    const followUps = await tx.followUp.findMany({
      where: {
        grant: {
          personId: { in: checkinPeople.map((p) => p.id) },
          deletedAt: null,
        },
      },
      select: {
        completedAt: true,
        grant: { select: { personId: true } },
      },
    });
    const lastFollowUp = new Map<string, string[]>();
    for (const f of followUps) {
      const d = parseDate(f.completedAt);
      if (!d) continue;
      const list = lastFollowUp.get(f.grant.personId) ?? [];
      list.push(d);
      lastFollowUp.set(f.grant.personId, list);
    }
    for (const p of checkinPeople) {
      const last = lastContactDate(p, lastFollowUp.get(p.id) ?? []);
      if (!isCheckInDue(last, now)) continue;
      const due = checkInDueDate(last),
        sourceKey = checkInSourceKey(p.id, due),
        followUpKey = checkInFollowUpKey(p.id),
        name = p.name || p.alias || p.memberId || "Person";
      keys.push(sourceKey);
      const outstanding =
        (await tx.alert.findUnique({
          where: { activeFollowUpKey: followUpKey },
        })) ??
        (await tx.alert.findFirst({
          where: {
            personId: p.id,
            type: CHECKIN_TYPE,
            status: "Pending",
            sourceKey: { startsWith: "checkin:" },
          },
        }));
      if (outstanding && outstanding.sourceKey !== sourceKey) {
        const existing = await tx.alert.findUnique({ where: { sourceKey } });
        if (existing?.status === "Completed") {
          // A changed due date starts a new active cycle; keep legacy completion intact.
          await tx.alert.update({
            where: { id: existing.id },
            data: {
              sourceKey: `${sourceKey}:completed:${existing.id}`,
              activeFollowUpKey: null,
            },
          });
        }
        if (!existing || existing.status === "Completed")
          await tx.alert.update({
            where: { id: outstanding.id },
            data: { sourceKey, dueDate: new Date(due), snoozedUntil: null },
          });
      }
      const prior = await tx.alert.findUnique({ where: { sourceKey } });
      await tx.alert.upsert({
        where: { sourceKey },
        create: {
          sourceKey,
          activeFollowUpKey: followUpKey,
          title: checkInTitle(name),
          personId: p.id,
          type: CHECKIN_TYPE,
          dueDate: new Date(due),
          assignedId: p.assignedId,
          priority: due < now ? "High" : "Normal",
        },
        update: {
          assignedId: p.assignedId,
          autoDismissed: false,
          priority: due < now ? "High" : "Normal",
          personId: p.id,
          title: checkInTitle(name),
          activeFollowUpKey:
            !prior ||
            prior.status === "Pending" ||
            (prior.status === "Dismissed" && prior.autoDismissed)
              ? followUpKey
              : null,
          status:
            prior?.status === "Dismissed" && prior.autoDismissed
              ? "Pending"
              : (prior?.status ?? "Pending"),
        },
      });
    }
  }
  const grants = await tx.grantApplication.findMany({
    where: {
      deletedAt: null,
      person: { deletedAt: null },
      ...(scope
        ? {
            OR: [
              { id: { in: scope.grantIds ?? [] } },
              { personId: { in: scope.personIds ?? [] } },
            ],
          }
        : {}),
    },
    include: {
      scheme: true,
      person: { select: { id: true, status: true, assignedId: true } },
    },
  });
  for (const g of grants) {
    if (g.person.status !== "Active") continue;
    for (const [type, date] of [
      ["Grant review", g.nextReviewDate],
      ["Support expiry", g.expiryDate],
    ] as const) {
      if (
        (type === "Grant review" && closedGrant(g)) ||
        !date ||
        (type === "Support expiry" &&
          date.getTime() > new Date(now).getTime() + 30 * 86400000)
      )
        continue;
      const sourceKey = `grant:${g.id}:${type}:${date.toISOString().slice(0, 10)}`;
      keys.push(sourceKey);
      const outstanding =
        (type === "Grant review"
          ? await tx.alert.findUnique({ where: { activeFollowUpKey: g.id } })
          : null) ??
        (await tx.alert.findFirst({
          where: {
            grantId: g.id,
            type,
            status: "Pending",
            sourceKey: { startsWith: `grant:${g.id}:` },
          },
        }));
      if (outstanding && outstanding.sourceKey !== sourceKey) {
        const existing = await tx.alert.findUnique({ where: { sourceKey } });
        if (existing?.status === "Completed") {
          // A changed review date starts a new active cycle; keep legacy completion intact.
          await tx.alert.update({
            where: { id: existing.id },
            data: {
              sourceKey: `${sourceKey}:completed:${existing.id}`,
              activeFollowUpKey: null,
            },
          });
        }
        if (!existing || existing.status === "Completed")
          await tx.alert.update({
            where: { id: outstanding.id },
            data: { sourceKey, dueDate: date, snoozedUntil: null },
          });
      }
      const prior = await tx.alert.findUnique({ where: { sourceKey } });
      await tx.alert.upsert({
        where: { sourceKey },
        create: {
          sourceKey,
          activeFollowUpKey: type === "Grant review" ? g.id : null,
          title: `${g.scheme.name}: ${type}`,
          personId: g.personId,
          grantId: g.id,
          type,
          dueDate: date,
          assignedId: g.assignedId ?? g.person.assignedId,
          priority: date < new Date(now) ? "High" : "Normal",
        },
        update: {
          assignedId: g.assignedId ?? g.person.assignedId,
          autoDismissed: false,
          priority: date < new Date(now) ? "High" : "Normal",
          personId: g.personId,
          title: `${g.scheme.name}: ${type}`,
          activeFollowUpKey:
            type === "Grant review" &&
            (!prior ||
              prior.status === "Pending" ||
              (prior.status === "Dismissed" && prior.autoDismissed))
              ? g.id
              : null,
          status:
            prior?.status === "Dismissed" && prior.autoDismissed
              ? "Pending"
              : (prior?.status ?? "Pending"),
        },
      });
    }
  }
  await tx.alert.updateMany({
    where: {
      ...(scope
        ? {
            AND: [
              {
                OR: [
                  { personId: { in: scope.personIds ?? [] } },
                  { grantId: { in: scope.grantIds ?? [] } },
                ],
              },
            ],
          }
        : {}),
      status: "Pending",
      sourceKey: { not: null, notIn: keys },
      OR: [
        { sourceKey: { startsWith: "birthday:" } },
        { sourceKey: { startsWith: "grant:" } },
        { sourceKey: { startsWith: "checkin:" } },
      ],
    },
    data: {
      status: "Dismissed",
      activeFollowUpKey: null,
      autoDismissed: true,
    },
  });
}
export async function refreshAlerts() {
  await db.$transaction(reconcileAlerts, { timeout: 60000 });
}
