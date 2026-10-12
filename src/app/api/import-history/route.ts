import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { unrestricted } from "@/lib/access";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser("write"),
      id = req.nextUrl.searchParams.get("id");
    if (id) {
      await requireUser("admin");
      const page = Math.max(
        1,
        Math.min(
          100000,
          Math.floor(Number(req.nextUrl.searchParams.get("page"))) || 1,
        ),
      );
      const size = [20, 50, 100].includes(
        Number(req.nextUrl.searchParams.get("size")),
      )
        ? Number(req.nextUrl.searchParams.get("size"))
        : 20;
      const batch = await db.importBatch.findUnique({
        where: { id },
        include: {
          rows: {
            orderBy: { rowNumber: "asc" },
            skip: (page - 1) * size,
            take: size,
          },
          _count: { select: { rows: true } },
        },
      });
      if (!batch) throw new Error("Import not found.");
      return NextResponse.json({
        batch: { ...batch, total: batch._count.rows, page, size },
      });
    }
    const batches = await db.importBatch.findMany({
      where: unrestricted(u) && u.role === "Admin" ? {} : { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { rows: { select: { action: true } } },
    });
    const staff = await db.user.findMany({ select: { id: true, name: true } });
    return NextResponse.json({
      batches: batches.map(({ rows, ...b }) => ({
        ...b,
        uploadedBy:
          staff.find((s) => s.id === b.userId)?.name ?? "Former staff",
        createdCount: rows.filter((r) => r.action === "Import").length,
        updatedCount: rows.filter((r) => r.action === "Update existing").length,
        skippedCount: rows.filter((r) => r.action === "Skip").length,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
