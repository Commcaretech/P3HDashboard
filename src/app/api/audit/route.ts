import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { privateHeaders } from "@/lib/permission-key";
import { auditScope } from "@/lib/audit-scope";
import { searchText } from "@/lib/query";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser("audit"),
      f = Object.fromEntries(req.nextUrl.searchParams),
      scope = await auditScope(u),
      q = (f.q || "").slice(0, 200),
      where = {
        AND: [
          scope,
          ...(q
            ? [
                {
                  OR: [
                    { action: searchText(q) },
                    { entityType: searchText(q) },
                    { entityId: searchText(q) },
                    { user: { name: searchText(q) } },
                  ],
                },
              ]
            : []),
          ...(f.entity ? [{ entityType: f.entity }] : []),
        ],
      };
    const total = await db.auditLog.count({ where }),
      size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20,
      page = Math.max(
        1,
        Math.min(Math.ceil(total / size) || 1, Math.floor(Number(f.page)) || 1),
      );
    const audit = await db.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      skip: (page - 1) * size,
      take: size,
    });
    return NextResponse.json(
      { audit, total, page, size },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
