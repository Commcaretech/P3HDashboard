import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertScope, personScope } from "@/lib/access";
import { privateHeaders } from "@/lib/permission-key";
import { personOptionSelect } from "@/lib/workspace-data";
import { alertGroup } from "@/lib/workflow";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      f = Object.fromEntries(req.nextUrl.searchParams),
      all = await db.alert.findMany({
        where: {
          AND: [
            alertScope(u),
            {
              OR: [
                { assignedId: u.id },
                { assignedId: null, person: { assignedId: u.id } },
              ],
            },
          ],
        },
        select: { id: true, status: true, dueDate: true, snoozedUntil: true },
      }),
      group = (a: (typeof all)[number]) =>
        a.status === "Completed"
          ? "Completed"
          : ["Overdue", "Today"].includes(
                alertGroup({
                  dueDate: a.dueDate.toISOString(),
                  snoozedUntil: a.snoozedUntil?.toISOString() ?? null,
                }),
              )
            ? alertGroup({
                dueDate: a.dueDate.toISOString(),
                snoozedUntil: a.snoozedUntil?.toISOString() ?? null,
              })
            : "Upcoming";
    const rows = all
        .filter((a) =>
          f.time
            ? f.time === "Completed"
              ? a.status === "Completed"
              : a.status === "Pending" && group(a) === f.time
            : a.status === "Pending",
        )
        .sort((a, b) => {
          const order = {
            Overdue: 0,
            Today: 1,
            Upcoming: 2,
            Snoozed: 3,
            Completed: 4,
          };
          return (
            (order[group(a) as keyof typeof order] ?? 5) -
              (order[group(b) as keyof typeof order] ?? 5) ||
            (a.snoozedUntil || a.dueDate).getTime() -
              (b.snoozedUntil || b.dueDate).getTime()
          );
        }),
      size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20,
      total = rows.length,
      page = Math.max(
        1,
        Math.min(Math.ceil(total / size) || 1, Math.floor(Number(f.page)) || 1),
      );
    const alerts = await db.alert.findMany({
        where: {
          AND: [
            alertScope(u),
            {
              id: {
                in: rows.slice((page - 1) * size, page * size).map((a) => a.id),
              },
            },
          ],
        },
        include: { assigned: { select: { name: true } } },
      }),
      ids = alerts
        .map((a) => a.personId)
        .filter((id): id is string => Boolean(id)),
      grantIds = alerts
        .map((a) => a.grantId)
        .filter((id): id is string => Boolean(id));
    const [people, grants] = await Promise.all([
      db.person.findMany({
        where: { AND: [personScope(u), { id: { in: ids } }] },
        select: personOptionSelect,
      }),
      db.grantApplication.findMany({
        where: { id: { in: grantIds }, person: personScope(u) },
        include: {
          scheme: true,
          assigned: { select: { name: true } },
          followUps: { orderBy: { completedAt: "desc" } },
        },
      }),
    ]);
    return NextResponse.json(
      {
        alerts: alerts.sort(
          (a, b) =>
            rows.findIndex((r) => r.id === a.id) -
            rows.findIndex((r) => r.id === b.id),
        ),
        people,
        grants,
        total,
        page,
        size,
        counts: {
          Overdue: all.filter(
            (a) => a.status === "Pending" && group(a) === "Overdue",
          ).length,
          Today: all.filter(
            (a) => a.status === "Pending" && group(a) === "Today",
          ).length,
          Upcoming: all.filter(
            (a) => a.status === "Pending" && group(a) === "Upcoming",
          ).length,
          Completed: all.filter((a) => a.status === "Completed").length,
        },
      },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
