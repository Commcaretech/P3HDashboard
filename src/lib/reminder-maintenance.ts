import { randomUUID } from "node:crypto";
import { db } from "./db";
import { reconcileAlerts } from "./alerts";
import { today } from "./domain";
export async function maintainReminders() {
  const id = "daily-in-app-reminders",
    date = today(),
    token = randomUUID();
  await db.maintenanceState.upsert({
    where: { id },
    create: { id },
    update: {},
  });
  const claim = await db.maintenanceState.updateMany({
    where: {
      id,
      lastCompletedDate: { not: date },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { leaseToken: token, leaseUntil: new Date(Date.now() + 120000) },
  });
  if (!claim.count) return { changed: false };
  try {
    await db.$transaction(
      async (tx) => {
        await reconcileAlerts(tx);
        const done = await tx.maintenanceState.updateMany({
          where: { id, leaseToken: token },
          data: {
            lastCompletedDate: date,
            lastCompletedAt: new Date(),
            leaseUntil: null,
            leaseToken: null,
          },
        });
        if (done.count !== 1)
          throw new Error("Reminder maintenance lease changed");
      },
      { timeout: 60000 },
    );
    return { changed: true };
  } finally {
    await db.maintenanceState.updateMany({
      where: { id, leaseToken: token },
      data: { leaseToken: null, leaseUntil: null },
    });
  }
}
