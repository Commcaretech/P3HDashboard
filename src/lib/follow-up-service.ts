import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessUser, requireAlertAccess, requirePersonAccess } from "./access";
import { addDays, addMonths, closedGrant } from "./follow-up";
import { parseDate, today } from "./domain";
import { audit } from "./records";
import { reconcileAlerts } from "./alerts";
export async function completeFollowUp(
  tx: Prisma.TransactionClient,
  u: AccessUser,
  id: string,
  input: unknown,
) {
  const v = z
    .object({
      completedAt: z
        .string()
        .refine(
          (d) => Boolean(parseDate(d)) && d <= today(),
          "Choose a valid follow-up date, no later than today",
        ),
      outcome: z.enum([
        "Contacted",
        "Pending Response",
        "Approved",
        "Unsuccessful",
        "Other",
      ]),
      notes: z.string().max(12000).default(""),
      resolution: z.enum(["Open", "Resolved"]).default("Open"),
      nextDate: z.string().default(""),
    })
    .parse(input);
  const a = await requireAlertAccess(tx, u, id);
  if (!a.grantId || a.type !== "Grant review")
    throw new Error("Choose a grant follow-up task.");
  const g = await tx.grantApplication.findUniqueOrThrow({
    where: { id: a.grantId },
  });
  const p = await requirePersonAccess(tx, u, g.personId);
  const existing = await tx.followUp.findUnique({ where: { alertId: id } });
  if (existing) return existing;
  if (p.status !== "Active" || closedGrant(g))
    throw new Error(
      "This application is closed or inactive. Reopen it before following up.",
    );
  if (a.status !== "Pending")
    throw new Error("This follow-up is no longer pending.");
  const resolved = v.resolution === "Resolved";
  const calculated =
    !resolved && g.recurring
      ? g.followUpMonths
        ? addMonths(v.completedAt, g.followUpMonths)
        : g.followUpDays
          ? addDays(v.completedAt, g.followUpDays)
          : ""
      : "";
  const next = resolved ? "" : v.nextDate || calculated;
  if (next && (!parseDate(next) || next <= v.completedAt))
    throw new Error(
      "Next follow-up must be after the completed follow-up date.",
    );
  const claimed = await tx.alert.updateMany({
    where: { id, status: "Pending" },
    data: {
      status: "Completed",
      snoozedUntil: null,
      activeFollowUpKey: null,
      sourceKey: a.sourceKey ? `${a.sourceKey}:completed:${a.id}` : null,
    },
  });
  if (!claimed.count)
    throw new Error(
      "This follow-up was already completed. Reload the task list.",
    );
  const history = await tx.followUp.create({
    data: {
      alertId: id,
      grantId: g.id,
      completedBy: u.id,
      completedAt: new Date(v.completedAt),
      outcome: v.outcome,
      notes: v.notes,
      resolved,
      nextDate: next ? new Date(next) : null,
    },
  });
  await tx.grantApplication.update({
    where: { id: g.id },
    data: {
      nextReviewDate: next ? new Date(next) : null,
      resolvedAt: resolved ? new Date(v.completedAt) : null,
    },
  });
  await audit(
    tx,
    u.id,
    resolved ? "Follow-up resolved" : "Follow-up completed",
    "Grant",
    g.id,
    null,
    history,
  );
  await reconcileAlerts(tx);
  return history;
}
