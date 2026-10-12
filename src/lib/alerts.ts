import { db } from "./db";
import { birthday, today } from "./domain";
export function birthdayPlans(
  id: string,
  name: string,
  dob: Date,
  now: string,
) {
  const b = birthday(dob, now);
  if (b.days > 30) return [];
  return [30, 7, 1, 0]
    .filter((n) => b.days <= n)
    .map((n) => ({
      sourceKey: `birthday:${id}:${b.date}:${n}`,
      personId: id,
      title: `Birthday: ${name} (${n === 0 ? "today" : `${n}-day reminder`})`,
      type: "Birthday",
      dueDate: new Date(new Date(b.date).getTime() - n * 86400000),
      priority: n <= 1 ? "High" : "Normal",
    }));
}
export async function refreshAlerts() {
  const now = today();
  await db.$transaction(
    async (tx) => {
      const keys: string[] = [];
      const people = await tx.person.findMany({
        where: { status: "Active", dob: { not: null } },
      });
      for (const p of people) {
        for (const plan of birthdayPlans(
          p.id,
          p.name || p.alias || p.memberId || "Person",
          p.dob!,
          now,
        )) {
          keys.push(plan.sourceKey);
          await tx.alert.upsert({
            where: { sourceKey: plan.sourceKey },
            create: { ...plan, assignedId: p.assignedId },
            update: { assignedId: p.assignedId },
          });
        }
      }
      const grants = await tx.grantApplication.findMany({
        include: { scheme: true, person: true },
        where: { status: { notIn: ["Rejected", "Expired"] } },
      });
      for (const g of grants) {
        if (g.person.status === "Archived") continue;
        for (const [type, date] of [
          ["Grant review", g.nextReviewDate],
          ["Support expiry", g.expiryDate],
        ] as const) {
          if (!date || date.getTime() > new Date(now).getTime() + 30 * 86400000)
            continue;
          const sourceKey = `grant:${g.id}:${type}:${date.toISOString().slice(0, 10)}`;
          keys.push(sourceKey);
          await tx.alert.upsert({
            where: { sourceKey },
            create: {
              sourceKey,
              title: `${g.scheme.name}: ${type}`,
              personId: g.personId,
              grantId: g.id,
              type,
              dueDate: date,
              assignedId: g.assignedId,
              priority: date < new Date(now) ? "High" : "Normal",
            },
            update: { assignedId: g.assignedId },
          });
        }
      }
      await tx.alert.updateMany({
        where: { status: "Pending", sourceKey: { not: null, notIn: keys } },
        data: {
          status: "Dismissed",
          notes:
            "Source record or date changed; reminder is no longer current.",
        },
      });
    },
    { timeout: 60000 },
  );
}
