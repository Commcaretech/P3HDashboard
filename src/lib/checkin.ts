import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessUser, requirePersonAccess } from "./access";
import { parseDate, today } from "./domain";
import { addDays } from "./follow-up";
import { audit } from "./records";
// Provisional monthly check-in rule (P3H approval pending): a caregiver is due
// a check-in 30 days after their last recorded contact. See
// docs/automatic-reminders.md. "Last contact" is the latest of a staff-recorded
// check-in and a completed grant follow-up; with neither, the caregiver's
// onboarding date (or creation date) is the baseline.
export const CHECKIN_INTERVAL_DAYS = 30;
export const CHECKIN_TYPE = "Monthly check-in";
export const checkInFollowUpKey = (personId: string) =>
  `checkin:${personId}`;
export const checkInSourceKey = (personId: string, due: string) =>
  `checkin:${personId}:${due}`;
export const checkInTitle = (name: string) => `Monthly check-in: ${name}`;
export type CheckInContact = {
  lastContactedAt?: Date | string | null;
  onboardingDate?: Date | string | null;
  createdAt: Date | string;
};
export function lastContactDate(
  person: CheckInContact,
  followUpDates: Array<Date | string> = [],
): string {
  const candidates = [
    person.lastContactedAt,
    ...followUpDates,
    person.onboardingDate ?? person.createdAt,
  ]
    .map((d) => parseDate(d))
    .filter((d): d is string => Boolean(d));
  if (!candidates.length)
    throw new Error(
      "A caregiver needs an onboarding or creation date to schedule a check-in.",
    );
  return [...candidates].sort().at(-1)!;
}
export function checkInDueDate(lastContact: string) {
  if (!parseDate(lastContact))
    throw new Error("Enter a valid last-contact date.");
  return addDays(lastContact, CHECKIN_INTERVAL_DAYS);
}
export function isCheckInDue(lastContact: string, now = today()) {
  return checkInDueDate(lastContact) <= now;
}
export async function recordCheckIn(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  personId: string,
  input: unknown,
) {
  const v = z
    .object({
      date: z
        .string()
        .refine(
          (d) => Boolean(parseDate(d)) && d <= today(),
          "Choose a valid check-in date, no later than today",
        ),
      notes: z.string().max(12000).default(""),
    })
    .parse(input);
  const p = await requirePersonAccess(tx, u, personId);
  if (p.kind !== "Member" || p.status !== "Active")
    throw new Error("Choose an active caregiver to record a check-in.");
  const before = {
    lastContactedAt: p.lastContactedAt
      ? parseDate(p.lastContactedAt)
      : null,
  };
  const pending = await tx.alert.findMany({
    where: { personId: p.id, type: CHECKIN_TYPE, status: "Pending" },
  });
  for (const a of pending)
    await tx.alert.update({
      where: { id: a.id },
      data: {
        status: "Completed",
        snoozedUntil: null,
        activeFollowUpKey: null,
        sourceKey: a.sourceKey
          ? `${a.sourceKey}:completed:${a.id}`
          : null,
      },
    });
  const updated = await tx.person.update({
    where: { id: p.id },
    data: { lastContactedAt: new Date(v.date) },
  });
  await audit(tx, u.id, "Check-in recorded", "Person", p.id, before, {
    lastContactedAt: v.date,
    notes: v.notes,
    completedAlerts: pending.map((a) => a.id),
  });
  // Lazy import: alerts.ts uses the pure helpers above, so a static import
  // here would make the two modules depend on each other.
  const { reconcileAlerts } = await import("./alerts");
  await reconcileAlerts(tx, { personIds: [p.id] });
  return updated;
}
export async function completeCheckInAlert(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  alert: {
    id: string;
    personId: string | null;
    type: string;
    status: string;
  },
) {
  if (alert.type !== CHECKIN_TYPE || !alert.personId)
    throw new Error("Choose a monthly check-in task.");
  if (alert.status !== "Pending")
    throw new Error("This check-in is no longer pending.");
  return recordCheckIn(tx, u, alert.personId, {
    date: today(),
    notes: "",
  });
}
