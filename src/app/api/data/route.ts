import { NextResponse } from "next/server";
import { db, personInclude, programmeInclude } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/domain";
import { refreshAlerts } from "@/lib/alerts";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const u = await requireUser();
    await refreshAlerts();
    const [people, programmes, grants, alerts, schemes, staff, audit] =
      await Promise.all([
        db.person.findMany({
          include: {
            ...personInclude,
            caregiverLinks: true,
            recipientLinks: true,
            participations: { include: { programme: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
        db.programme.findMany({
          include: programmeInclude,
          orderBy: { name: "asc" },
        }),
        db.grantApplication.findMany({
          include: {
            scheme: true,
            person: true,
            assigned: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
        db.alert.findMany({
          include: { person: true, assigned: { select: { name: true } } },
          orderBy: { dueDate: "asc" },
        }),
        db.supportScheme.findMany({ orderBy: { name: "asc" } }),
        db.user.findMany({
          select: {
            id: true,
            name: true,
            role: true,
            active: true,
            username: true,
          },
          orderBy: { name: "asc" },
        }),
        can(u.role, "audit")
          ? db.auditLog.findMany({
              include: { user: { select: { name: true } } },
              orderBy: { timestamp: "desc" },
              take: 500,
            })
          : Promise.resolve([]),
      ]);
    return NextResponse.json({
      people,
      programmes,
      grants,
      alerts,
      schemes,
      staff,
      audit,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Please sign in.")
      return NextResponse.json({ error: e.message }, { status: 401 });
    return NextResponse.json(
      {
        error:
          "Cannot load local records. Retry, or ask your administrator to check the database.",
      },
      { status: 503 },
    );
  }
}
