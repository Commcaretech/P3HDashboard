import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { personScope } from "@/lib/access";
import { privateHeaders } from "@/lib/permission-key";
import { birthday, today } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      f = req.nextUrl.searchParams,
      kind = f.get("kind") === "Care Recipient" ? "Care Recipient" : "Member";
    const people = await db.person.findMany({
      where: {
        AND: [
          personScope(u),
          { kind, status: "Active", dob: { not: null } },
          ...(f.get("centre") ? [{ centre: f.get("centre")! }] : []),
          ...(f.get("assigned") ? [{ assignedId: f.get("assigned")! }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        alias: true,
        memberId: true,
        centre: true,
        dob: true,
        assigned: { select: { name: true } },
      },
    });
    const rows = people
      .map((p) => ({ ...p, ...birthday(p.dob!, today()) }))
      .filter((p) => p.days <= 30)
      .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
    const page = Math.max(
      1,
      Math.min(Math.ceil(rows.length / 20) || 1, Number(f.get("page")) || 1),
    );
    const centres = await db.person.findMany({
      where: { AND: [personScope(u), { kind, status: "Active" }] },
      select: { centre: true },
      distinct: ["centre"],
    });
    return NextResponse.json(
      {
        rows: rows.slice((page - 1) * 20, page * 20),
        total: rows.length,
        page,
        centres: centres.map((c) => c.centre).filter(Boolean),
      },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
