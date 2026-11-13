import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { personScope } from "@/lib/access";
import { privateHeaders } from "@/lib/permission-key";
import { personOptionSelect } from "@/lib/workspace-data";
import { searchText } from "@/lib/query";
import { closedGrant } from "@/lib/follow-up";
import { today } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      f = Object.fromEntries(req.nextUrl.searchParams);
    const and: Prisma.GrantApplicationWhereInput[] = [
      { person: personScope(u) },
    ];
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
    const all = await db.grantApplication.findMany({
        where: { deletedAt: null, person: personScope(u) },
        select: {
          id: true,
          status: true,
          resolvedAt: true,
          nextReviewDate: true,
        },
      }),
      now = today();
    const openIds = all.filter((g) => !closedGrant(g)).map((g) => g.id);
    if (f.open) and.push({ id: { in: openIds } });
    if (f.time)
      and.push({
        id: {
          in: all
            .filter(
              (g) =>
                !closedGrant(g) &&
                g.nextReviewDate &&
                (f.time === "Overdue"
                  ? g.nextReviewDate.toISOString().slice(0, 10) < now
                  : g.nextReviewDate.toISOString().slice(0, 10) === now),
            )
            .map((g) => g.id),
        },
      });
    const where = { AND: [{ deletedAt: null }, ...and] },
      total = await db.grantApplication.count({ where }),
      size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20,
      page = Math.max(
        1,
        Math.min(Math.ceil(total / size) || 1, Math.floor(Number(f.page)) || 1),
      );
    const grants = await db.grantApplication.findMany({
      where,
      include: {
        scheme: true,
        assigned: { select: { name: true } },
        followUps: { orderBy: { completedAt: "desc" } },
      },
      orderBy: [{ nextReviewDate: "asc" }, { id: "asc" }],
      skip: (page - 1) * size,
      take: size,
    });
    const people = await db.person.findMany({
      where: {
        AND: [personScope(u), { id: { in: grants.map((g) => g.personId) } }],
      },
      select: personOptionSelect,
    });
    return NextResponse.json(
      {
        grants,
        people,
        total,
        page,
        size,
        statuses: [...new Set(all.map((g) => g.status))],
        counts: {
          active: openIds.length,
          due: all.filter(
            (g) =>
              !closedGrant(g) &&
              g.nextReviewDate &&
              g.nextReviewDate.toISOString().slice(0, 10) <= now,
          ).length,
          overdue: all.filter(
            (g) =>
              !closedGrant(g) &&
              g.nextReviewDate &&
              g.nextReviewDate.toISOString().slice(0, 10) < now,
          ).length,
          completed: all.filter(closedGrant).length,
        },
      },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
