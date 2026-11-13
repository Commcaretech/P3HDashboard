import {
  personScope,
  programmeScope,
  alertScope,
  unrestricted,
} from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";
import { db, personInclude, programmeInclude } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dashboardData } from "@/lib/dashboard";
import { workspaceData } from "@/lib/workspace-data";
import { permissionKey, privateHeaders } from "@/lib/permission-key";
import { can } from "@/lib/domain";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser();
    const section = req.nextUrl.searchParams.get("section") || "";
    if (section === "access")
      return NextResponse.json(
        {
          accessKey: permissionKey(u),
          user: { id: u.id, name: u.name, role: u.role },
        },
        { headers: privateHeaders(u) },
      );
    if (section === "dashboard")
      return NextResponse.json(await dashboardData(u), {
        headers: privateHeaders(u),
      });
    if (section)
      return NextResponse.json(
        await workspaceData(
          u,
          section,
          req.nextUrl.searchParams.get("id") || "",
        ),
        { headers: privateHeaders(u) },
      );
    const tableOnly = ["members", "care-recipients"].includes(
      req.nextUrl.searchParams.get("section") ?? "",
    );

    const [people, programmes, grants, alerts, schemes, staff, audit] =
      await Promise.all([
        tableOnly
          ? Promise.resolve([])
          : db.person.findMany({
              where: personScope(u),
              include: {
                ...personInclude,
                assigned: { select: { name: true } },
                caregiverLinks: { where: { recipient: personScope(u) } },
                recipientLinks: { where: { member: personScope(u) } },
                participations: {
                  where: { programme: programmeScope(u) },
                  include: { programme: { select: { name: true } } },
                },
              },
              orderBy: { updatedAt: "desc" },
            }),
        tableOnly || req.nextUrl.searchParams.get("section") === "programmes"
          ? Promise.resolve([])
          : db.programme.findMany({
              where: programmeScope(u),
              include: {
                ...programmeInclude,
                _count: {
                  select: {
                    participations: { where: { status: "Registered" } },
                  },
                },
                participations: { where: { person: personScope(u) } },
              },
              orderBy: { name: "asc" },
            }),
        tableOnly
          ? Promise.resolve([])
          : db.grantApplication.findMany({
              where: { deletedAt: null, person: personScope(u) },
              include: {
                scheme: true,
                assigned: { select: { name: true } },
                followUps: { orderBy: { completedAt: "desc" } },
              },
              orderBy: { updatedAt: "desc" },
            }),
        db.alert.findMany({
          where: alertScope(u),
          include: { assigned: { select: { name: true } } },
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
            ...(u.role === "Admin"
              ? {
                  email: true,
                  emailNotifications: true,
                  recipientBirthdays: true,
                }
              : {}),
            allCentres: true,
            allowedCentres: true,
          },
          orderBy: { name: "asc" },
        }),
        !tableOnly && can(u.role, "audit") && unrestricted(u)
          ? db.auditLog.findMany({
              include: { user: { select: { name: true } } },
              orderBy: { timestamp: "desc" },
              take: 500,
            })
          : Promise.resolve([]),
      ]);
    const scopedAudit =
      !tableOnly && can(u.role, "audit") && !unrestricted(u)
        ? await db.auditLog.findMany({
            where: {
              OR: [
                {
                  entityType: { in: ["Member", "Care Recipient", "person"] },
                  entityId: { in: people.map((p) => p.id) },
                },
                {
                  entityType: { in: ["Programme", "programme"] },
                  entityId: { in: programmes.map((p) => p.id) },
                },
                {
                  entityType: "Grant",
                  entityId: { in: grants.map((g) => g.id) },
                },
                {
                  entityType: "Alert",
                  entityId: { in: alerts.map((a) => a.id) },
                },
                {
                  entityType: "Relationship",
                  entityId: {
                    in: people.flatMap((p) =>
                      [...p.caregiverLinks, ...p.recipientLinks].map(
                        (l) => l.id,
                      ),
                    ),
                  },
                },
                {
                  entityType: "Participation",
                  entityId: {
                    in: people.flatMap((p) =>
                      p.participations.map((x) => x.id),
                    ),
                  },
                },
              ],
            },
            include: { user: { select: { name: true } } },
            orderBy: { timestamp: "desc" },
            take: 500,
          })
        : audit;
    return NextResponse.json(
      {
        people: people.map((p) => ({
          ...p,
          rawImport:
            !req.nextUrl.searchParams.get("section") ||
            req.nextUrl.searchParams.get("section") === "people"
              ? p.rawImport
              : null,
        })),
        programmes: programmes.map((p) => ({
          ...p,
          registeredCount: p._count.participations,
        })),
        grants,
        alerts,
        schemes,
        staff,
        audit: scopedAudit,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
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
