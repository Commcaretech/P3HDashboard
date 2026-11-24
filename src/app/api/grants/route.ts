import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { grantScope } from "@/lib/access";
import { privateHeaders } from "@/lib/permission-key";
import { personOptionSelect } from "@/lib/workspace-data";
import { searchText } from "@/lib/query";
import { addDays, openGrantFilter } from "@/lib/follow-up";
import { today } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      f = Object.fromEntries(req.nextUrl.searchParams);
    const scope = grantScope(u);
    const and: Prisma.GrantApplicationWhereInput[] = [scope];
    if (f.q)
      and.push({
        OR: [
          { scheme: { name: searchText(f.q.slice(0, 200)) } },
          { notes: searchText(f.q.slice(0, 200)) },
          {
            person: {
              OR: [
                { name: searchText(f.q.slice(0, 200)) },
                { alias: searchText(f.q.slice(0, 200)) },
                { memberId: searchText(f.q.slice(0, 200)) },
              ],
            },
          },
        ],
      });
    if (f.status) and.push({ status: f.status });
    if (f.scheme) and.push({ scheme: { name: f.scheme } });
    if (f.assigned)
      and.push({
        OR: [
          { assignedId: f.assigned },
          { assigned: { name: f.assigned } },
          {
            assignedId: null,
            person: {
              OR: [
                { assignedId: f.assigned },
                { assigned: { name: f.assigned } },
              ],
            },
          },
        ],
      });
    const todayDate = today();
    const todayStart = new Date(todayDate);
    const tomorrowStart = new Date(addDays(todayDate, 1));
    const open = { ...scope, ...openGrantFilter };
    if (f.open || f.time) and.push(openGrantFilter);
    if (f.time)
      and.push({
        nextReviewDate:
          f.time === "Overdue"
            ? { lt: todayStart }
            : { gte: todayStart, lt: tomorrowStart },
      });
    const where = { AND: and };
    const [total, statuses, active, due, overdue] = await Promise.all([
      db.grantApplication.count({ where }),
      db.grantApplication.groupBy({
        by: ["status"],
        where: scope,
        _count: { _all: true },
        orderBy: { status: "asc" },
      }),
      db.grantApplication.count({ where: open }),
      db.grantApplication.count({
        where: { ...open, nextReviewDate: { lt: tomorrowStart } },
      }),
      db.grantApplication.count({
        where: { ...open, nextReviewDate: { lt: todayStart } },
      }),
    ]);
    const allCount = statuses.reduce((sum, row) => sum + row._count._all, 0);
    const size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20,
      page = Math.max(
        1,
        Math.min(Math.ceil(total / size) || 1, Math.floor(Number(f.page)) || 1),
      );
    const rows = await db.grantApplication.findMany({
      where,
      include: {
        scheme: true,
        person: { select: personOptionSelect },
        assigned: { select: { name: true } },
        followUps: { orderBy: { completedAt: "desc" } },
      },
      orderBy: [{ nextReviewDate: "asc" }, { id: "asc" }],
      skip: (page - 1) * size,
      take: size,
    });
    const people = new Map<string, (typeof rows)[number]["person"]>();
    const grants = rows.map(({ person, ...grant }) => {
      people.set(person.id, person);
      return grant;
    });
    return NextResponse.json(
      {
        grants,
        people: [...people.values()],
        total,
        page,
        size,
        statuses: statuses.map((row) => row.status),
        counts: {
          active,
          due,
          overdue,
          completed: allCount - active,
        },
      },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
