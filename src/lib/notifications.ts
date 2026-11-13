import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { personScope } from "./access";
import { addDays, closedGrant } from "./follow-up";
import { birthday, today } from "./domain";
import {
  digestMessage,
  EmailMessage,
  EmailSender,
  productionSender,
} from "./email";
import { refreshAlerts } from "./alerts";
export async function dueItems(userId: string, date: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { allowedCentres: true },
  });
  if (
    !u?.active ||
    !u.emailNotifications ||
    !u.email ||
    !z.email().safeParse(u.email).success
  )
    return null;
  const items = await db.alert.findMany({
    where: {
      status: { in: ["Pending", "Completed"] },
      OR: [
        { assignedId: u.id },
        { assignedId: null, person: { assignedId: u.id } },
      ],
      AND: [
        { OR: [{ grantId: null }, { grant: { deletedAt: null } }] },
        {
          OR: [
            { personId: null },
            { person: { AND: [personScope(u), { status: "Active" }] } },
          ],
        },
        {
          OR: [
            { snoozedUntil: null },
            { snoozedUntil: { lte: new Date(date) } },
          ],
        },
      ],
    },
    include: { person: true, grant: true },
  });
  return {
    u,
    items: items.filter((a) => {
      const due = a.dueDate.toISOString().slice(0, 10);
      if (a.type === "Birthday")
        return (
          Boolean(
            a.person?.dob &&
            due === birthday(a.person.dob, date).date &&
            a.sourceKey === `birthday:${a.person.id}:${due}`,
          ) &&
          (a.person?.kind === "Member" || u.recipientBirthdays) &&
          [date, addDays(date, 7)].includes(due)
        );
      if (a.status !== "Pending") return false;
      if (a.type === "Grant review" && a.grant && closedGrant(a.grant))
        return false;
      return due <= addDays(date, 7);
    }),
  };
}
export async function sendDigest(
  userId: string,
  date: string,
  sender: EmailSender,
  test = false,
) {
  const eligible = await dueItems(userId, date);
  if (!eligible || (!test && !eligible.items.length)) return "Skipped";
  const { u, items } = eligible;
  const counts: Record<string, number> = {
    "Overdue follow-ups": 0,
    "Follow-ups due today": 0,
    "Follow-ups due tomorrow": 0,
    "Due within 7 days": 0,
    "Upcoming caregiver birthdays": 0,
    "Care recipient birthdays": 0,
  };
  for (const a of items) {
    const d = a.dueDate.toISOString().slice(0, 10);
    const k =
      a.type === "Birthday"
        ? a.person?.kind === "Member"
          ? "Upcoming caregiver birthdays"
          : "Care recipient birthdays"
        : d < date
          ? "Overdue follow-ups"
          : d === date
            ? "Follow-ups due today"
            : d === addDays(date, 1)
              ? "Follow-ups due tomorrow"
              : "Due within 7 days";
    counts[k]++;
  }
  const key = `${test ? "test" : "digest"}:${u.id}:${date}`;
  const message = digestMessage(
    u.email!,
    counts,
    process.env.APP_ORIGIN || "http://localhost:3100",
    test,
  );
  const row = await db.notificationDelivery.upsert({
    where: { notificationKey: key },
    create: {
      notificationKey: key,
      userId,
      scheduledDate: date,
      type: test ? "Test email" : "Daily digest",
      payload: message,
      reminderIds: items.map((a) => a.id),
    },
    update: {},
  });
  if (
    ["Accepted", "Mock accepted", "Cancelled"].includes(row.status) ||
    row.attempts >= 3
  )
    return row.status;
  // Never automatically retry outside the provider's 24-hour idempotency window.
  if (row.createdAt.getTime() < Date.now() - 23 * 3600000)
    return "Expired retry window";
  const token = randomUUID(),
    now = new Date();
  const claim = await db.notificationDelivery.updateMany({
    where: {
      id: row.id,
      status: { in: ["Pending", "Failed", "Sending"] },
      attempts: { lt: 3 },
      AND: [
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        {
          OR: [
            { lastAttempt: null },
            { lastAttempt: { lt: new Date(now.getTime() - 60000) } },
          ],
        },
      ],
    },
    data: {
      leaseToken: token,
      leaseUntil: new Date(now.getTime() + 120000),
      status: "Sending",
      lastAttempt: now,
      attempts: { increment: 1 },
    },
  });
  if (!claim.count) return "Busy or waiting for retry";
  try {
    // Recheck eligibility and access after obtaining the claim, immediately before dispatch.
    const latest = await dueItems(userId, date);
    const ids = (row.reminderIds as string[]) ?? [];
    const valid =
      latest &&
      latest.u.email === (row.payload as unknown as EmailMessage).to &&
      (test || ids.every((id) => latest.items.some((a) => a.id === id)));
    if (!valid) {
      await db.notificationDelivery.updateMany({
        where: { id: row.id, leaseToken: token },
        data: {
          status: "Cancelled",
          leaseUntil: null,
          failureReason: "Recipient permissions, preferences or tasks changed.",
        },
      });
      return "Cancelled";
    }
    const accepted = await sender.send(
      row.payload as unknown as EmailMessage,
      key,
    );
    await db.notificationDelivery.updateMany({
      where: { id: row.id, leaseToken: token },
      data: {
        status: accepted.mock ? "Mock accepted" : "Accepted",
        providerMessageId: accepted.id,
        failureReason: null,
        leaseUntil: null,
      },
    });
    return accepted.mock ? "Mock accepted" : "Accepted";
  } catch {
    await db.notificationDelivery.updateMany({
      where: { id: row.id, leaseToken: token },
      data: {
        status: "Failed",
        failureReason:
          "Provider request failed or acceptance could not be confirmed. Check provider diagnostics; retry within 23 hours.",
        leaseUntil: null,
      },
    });
    return "Failed";
  }
}
export async function runNotifications(
  sender: EmailSender | null = productionSender(),
  date = today(),
) {
  await refreshAlerts();
  if (!sender) return { configured: false, processed: 0 };
  const users = await db.user.findMany({
    where: { active: true, emailNotifications: true, email: { not: null } },
    select: { id: true },
  });
  const results = [];
  for (const u of users) results.push(await sendDigest(u.id, date, sender));
  return { configured: true, processed: results.length, results };
}
