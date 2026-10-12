import {
  centreAllowed,
  unrestricted,
  requirePersonAccess,
  requireProgrammeAccess,
  requireAlertAccess,
  validateAssignment,
} from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, hashPassword } from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
import { db } from "@/lib/db";
import { savePerson, saveProgramme, audit } from "@/lib/records";
import { grantSchema, roles, parseDate } from "@/lib/domain";
import { refreshAlerts } from "@/lib/alerts";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const b = z
      .object({
        action: z.enum([
          "person",
          "programme",
          "grant",
          "alert",
          "alertStatus",
          "snooze",
          "userAccess",
          "archive",
          "relationship",
          "unlink",
          "participation",
          "user",
          "refresh",
        ]),
        id: z.string().optional(),
        version: z.string().optional(),
        data: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(await req.json());
    const u = await requireUser(
      ["user", "userAccess"].includes(b.action) ? "admin" : "write",
    );
    if (b.action === "refresh") {
      await refreshAlerts();
      return NextResponse.json({ ok: true });
    }
    const result = await db.$transaction(
      async (tx) => {
        if (b.action === "person") {
          if (b.id) await requirePersonAccess(tx, u, b.id);
          const centre = String(b.data.centre ?? "").trim();
          if (!centreAllowed(u, centre))
            throw new Error(
              "Your centre permissions do not permit this record.",
            );
          await validateAssignment(tx, u, b.data.assignedId, centre);
          return savePerson(tx, u.id, b.data, b.id, undefined, b.version);
        }
        if (b.action === "programme") {
          if (b.id) await requireProgrammeAccess(tx, u, b.id);
          const centre = String(b.data.centre ?? "").trim();
          if (!centreAllowed(u, centre))
            throw new Error(
              "Your centre permissions do not permit this record.",
            );
          return saveProgramme(tx, u.id, b.data, b.id, b.version);
        }
        if (b.action === "grant") {
          const v = grantSchema.parse(b.data);
          const permitted = await requirePersonAccess(tx, u, v.personId);
          await validateAssignment(tx, u, v.assignedId, permitted.centre);
          if (b.id) {
            const old = await tx.grantApplication.findUniqueOrThrow({
              where: { id: b.id },
            });
            await requirePersonAccess(tx, u, old.personId);
          }
          const person = await tx.person.findUnique({
            where: { id: v.personId },
          });
          if (!person || person.status === "Archived")
            throw new Error("Choose an active person.");
          const scheme = await tx.supportScheme.upsert({
            where: { name: v.scheme },
            create: { name: v.scheme },
            update: {},
          });
          const { scheme: _, ...rest } = v;
          void _;
          const before = b.id
            ? await tx.grantApplication.findUnique({ where: { id: b.id } })
            : null;
          if (
            before &&
            b.version &&
            before.updatedAt.toISOString() !== b.version
          )
            throw new Error(
              "Another staff member changed this grant. Reload before saving.",
            );
          const data = {
            ...rest,
            schemeId: scheme.id,
            amount: v.amount ? Number(v.amount) : null,
            assignedId: v.assignedId || null,
            ...Object.fromEntries(
              [
                "applicationDate",
                "submissionDate",
                "approvalDate",
                "expiryDate",
                "nextReviewDate",
              ].map((k) => [
                k,
                v[k as keyof typeof v]
                  ? new Date(String(v[k as keyof typeof v]))
                  : null,
              ]),
            ),
          };
          const g = b.id
            ? await tx.grantApplication.update({ where: { id: b.id }, data })
            : await tx.grantApplication.create({ data });
          await audit(tx, u.id, "Grant updated", "Grant", g.id, before, v);
          return g;
        }
        if (b.action === "alert") {
          const v = z
            .object({
              title: z.string().trim().min(1).max(200),
              personId: z.string().default(""),
              type: z.enum([
                "Case review",
                "Programme follow-up",
                "Custom reminder",
                "Grant follow-up",
              ]),
              dueDate: z
                .string()
                .refine(
                  (v) => Boolean(parseDate(v)),
                  "A valid due date is required",
                ),
              priority: z.enum(["Low", "Normal", "High"]),
              assignedId: z.string().default(""),
              notes: z.string().max(12000).default(""),
            })
            .parse(b.data);
          if (v.personId) {
            const permitted = await requirePersonAccess(tx, u, v.personId);
            await validateAssignment(tx, u, v.assignedId, permitted.centre);
            const person = await tx.person.findUnique({
              where: { id: v.personId },
            });
            if (!person || person.status === "Archived")
              throw new Error(
                "Choose an active person or leave Person unassigned.",
              );
          }
          if (
            v.assignedId &&
            !(await tx.user.findFirst({
              where: { id: v.assignedId, active: true },
            }))
          )
            throw new Error("Choose an active staff account.");
          const a = await tx.alert.create({
            data: {
              ...v,
              personId: v.personId || null,
              assignedId: v.assignedId || (unrestricted(u) ? null : u.id),
              dueDate: new Date(v.dueDate),
            },
          });
          await audit(tx, u.id, "Alert created", "Alert", a.id, null, v);
          return a;
        }
        if (b.action === "snooze") {
          const v = z
            .object({
              date: z.string().refine(
                (d) =>
                  Boolean(parseDate(d)) &&
                  d >
                    new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Singapore",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date()),
                "Choose a future date",
              ),
            })
            .parse(b.data);
          const before = await requireAlertAccess(tx, u, b.id ?? "");
          if (before.status !== "Pending")
            throw new Error("Only pending alerts can be snoozed.");
          const a = await tx.alert.update({
            where: { id: before.id },
            data: { snoozedUntil: new Date(v.date) },
          });
          await audit(
            tx,
            u.id,
            "Alert snoozed",
            "Alert",
            a.id,
            { snoozedUntil: before.snoozedUntil, dueDate: before.dueDate },
            { snoozedUntil: a.snoozedUntil },
          );
          return a;
        }
        if (b.action === "alertStatus") {
          const v = z
            .object({ status: z.enum(["Completed", "Dismissed", "Pending"]) })
            .parse(b.data);
          const before = await requireAlertAccess(tx, u, b.id ?? "");
          const a = await tx.alert.update({
            where: { id: before.id },
            data: { ...v, snoozedUntil: null },
          });
          await audit(
            tx,
            u.id,
            `Alert ${v.status.toLowerCase()}`,
            "Alert",
            a.id,
            before,
            v,
          );
          return a;
        }
        if (b.action === "archive") {
          const v = z
            .object({ type: z.enum(["person", "programme"]) })
            .parse(b.data);
          if (!b.id) throw new Error("Record is required");
          if (v.type === "person") await requirePersonAccess(tx, u, b.id);
          else await requireProgrammeAccess(tx, u, b.id);
          const before =
            v.type === "person"
              ? await tx.person.findUniqueOrThrow({ where: { id: b.id } })
              : await tx.programme.findUniqueOrThrow({ where: { id: b.id } });
          const record =
            v.type === "person"
              ? await tx.person.update({
                  where: { id: b.id },
                  data: { status: "Archived" },
                })
              : await tx.programme.update({
                  where: { id: b.id },
                  data: { status: "Archived" },
                });
          await audit(
            tx,
            u.id,
            "Record archived",
            v.type,
            b.id,
            before,
            record,
          );
          return record;
        }
        if (b.action === "relationship") {
          const v = z
            .object({
              memberId: z.string().min(1),
              recipientId: z.string().min(1),
              relationship: z.string().trim().min(1).max(200),
            })
            .parse(b.data);
          await requirePersonAccess(tx, u, v.memberId);
          await requirePersonAccess(tx, u, v.recipientId);
          const m = await tx.person.findUnique({ where: { id: v.memberId } }),
            r = await tx.person.findUnique({ where: { id: v.recipientId } });
          if (
            m?.kind !== "Member" ||
            r?.kind !== "Care Recipient" ||
            m.status === "Archived" ||
            r.status === "Archived"
          )
            throw new Error("Select an active member and care recipient");
          const link = await tx.careRelationship.create({ data: v });
          await audit(
            tx,
            u.id,
            "Relationship linked",
            "Relationship",
            link.id,
            null,
            v,
          );
          return link;
        }
        if (b.action === "unlink") {
          if (!b.id) throw new Error("Select a relationship");
          const before = await tx.careRelationship.findUniqueOrThrow({
            where: { id: b.id },
          });
          await requirePersonAccess(tx, u, before.memberId);
          await requirePersonAccess(tx, u, before.recipientId);
          await tx.careRelationship.delete({ where: { id: b.id } });
          await audit(
            tx,
            u.id,
            "Relationship removed",
            "Relationship",
            b.id,
            before,
            null,
          );
          return { ok: true };
        }
        if (b.action === "participation") {
          const v = z
            .object({
              personId: z.string().min(1),
              programmeId: z.string().min(1),
              status: z.enum([
                "Registered",
                "Attended",
                "Completed",
                "Withdrawn",
              ]),
            })
            .parse(b.data);
          await requireProgrammeAccess(tx, u, v.programmeId);
          await requirePersonAccess(tx, u, v.personId);
          const p = await tx.programme.findUniqueOrThrow({
            where: { id: v.programmeId },
            include: { participations: true },
          });
          const person = await tx.person.findUniqueOrThrow({
            where: { id: v.personId },
          });
          if (person.status === "Archived" || p.status !== "Active")
            throw new Error("Choose active records");
          if (
            v.status === "Registered" &&
            (p.registrationStatus !== "Open" ||
              (p.capacity > 0 &&
                p.participations.filter(
                  (x) => x.status === "Registered" && x.personId !== v.personId,
                ).length >= p.capacity))
          )
            throw new Error("Programme registration is closed or full");
          const saved = await tx.participation.upsert({
            where: {
              personId_programmeId: {
                personId: v.personId,
                programmeId: v.programmeId,
              },
            },
            create: v,
            update: { status: v.status },
          });
          await audit(
            tx,
            u.id,
            "Participation updated",
            "Participation",
            saved.id,
            null,
            v,
          );
          return saved;
        }
        if (b.action === "userAccess") {
          const v = z
            .object({
              allCentres: z.enum(["All centres", "Selected centres"]),
              centres: z.string().max(2000),
            })
            .parse(b.data);
          const before = await tx.user.findUniqueOrThrow({
            where: { id: b.id },
            include: { allowedCentres: true },
          });
          const centres = [
            ...new Set(
              v.centres
                .split(/[,;\n]/)
                .map((c) => c.trim())
                .filter(Boolean),
            ),
          ];
          if (
            before.role !== "Admin" &&
            v.allCentres === "Selected centres" &&
            !centres.length
          )
            throw new Error("Choose at least one centre.");
          await tx.userCentre.deleteMany({ where: { userId: before.id } });
          const saved = await tx.user.update({
            where: { id: before.id },
            data: {
              allCentres:
                before.role === "Admin" || v.allCentres === "All centres",
              allowedCentres: { create: centres.map((centre) => ({ centre })) },
            },
          });
          await audit(
            tx,
            u.id,
            "Centre access updated",
            "User",
            before.id,
            {
              allCentres: before.allCentres,
              centres: before.allowedCentres.map((c) => c.centre),
            },
            v,
          );
          return { id: saved.id };
        }
        if (b.action === "user") {
          const v = z
            .object({
              username: z.string().trim().min(3).max(80),
              name: z.string().trim().min(1).max(100),
              password: z.string().min(12).max(128),
              role: z.enum(roles),
              allCentres: z
                .enum(["All centres", "Selected centres"])
                .default("Selected centres"),
              centres: z.string().max(2000).default(""),
            })
            .parse(b.data);
          const centres = [
            ...new Set(
              v.centres
                .split(/[,;\n]/)
                .map((c) => c.trim())
                .filter(Boolean),
            ),
          ];
          if (
            v.role !== "Admin" &&
            v.allCentres === "Selected centres" &&
            !centres.length
          )
            throw new Error("Choose at least one centre.");
          const user = await tx.user.create({
            data: {
              username: v.username.toLowerCase(),
              name: v.name,
              passwordHash: hashPassword(v.password),
              role: v.role,
              allCentres: v.role === "Admin" || v.allCentres === "All centres",
              allowedCentres: { create: centres.map((centre) => ({ centre })) },
            },
          });
          await audit(
            tx,
            u.id,
            "Staff account created",
            "User",
            user.id,
            null,
            { name: v.name, role: v.role },
          );
          return { id: user.id };
        }
        throw new Error("Unsupported action");
      },
      { timeout: 60000 },
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return errorResponse(e);
  }
}
