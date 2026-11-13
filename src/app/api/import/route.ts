import {
  centreAllowed,
  requirePersonAccess,
  validateAssignment,
} from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";
import { extractMemberSupport } from "@/lib/support-extraction";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
import { db, personInclude } from "@/lib/db";
import { columns, readWorkbook, parseRow, duplicates } from "@/lib/importer";
import { savePerson, audit } from "@/lib/records";
import { personSchema } from "@/lib/domain";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = await requireUser("write");
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const data = await req.formData();
      const file = data.get("file");
      if (
        !(file instanceof File) ||
        !file.name.toLowerCase().endsWith(".xlsx") ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("Select an .xlsx workbook under 10 MB.");
      const book = await readWorkbook(Buffer.from(await file.arrayBuffer()));
      return NextResponse.json({ ...book, filename: file.name });
    }
    const body = z
      .object({
        action: z.enum(["preview", "commit"]),
        filename: z.string().max(255),
        date1904: z.boolean().default(false),
        mapping: z.record(z.string(), z.string()).default({}),
        rawRows: z
          .array(
            z.record(z.string(), z.union([z.string().max(20000), z.number()])),
          )
          .max(10000)
          .default([]),
        rows: z.array(z.unknown()).max(10000).default([]),
      })
      .parse(await req.json());
    if (body.action === "preview") {
      if (!body.mapping["Member ID"])
        throw new Error("Map the required Member ID column.");
      const parsed = duplicates(
        body.rawRows.map((r, i) => ({
          ...parseRow(
            Object.fromEntries(
              columns.map((c) => [c, r[body.mapping[c]] ?? ""]),
            ),
            i + 2,
            body.date1904,
          ),
          raw: r,
        })),
      );
      const existing = await db.person.findMany({
        where: { memberId: { in: parsed.map((r) => r.memberId) } },
        include: personInclude,
      });
      const byMemberId = new Map(existing.map((p) => [p.memberId, p]));
      for (const r of parsed) {
        const p = byMemberId.get(r.memberId);
        if (
          !centreAllowed(user, r.centre) ||
          (p && !centreAllowed(user, p.centre))
        ) {
          r.action = "Skip";
          r.errors.push("Row is outside your authorised centres.");
          continue;
        }
        if (p?.deletedAt) {
          r.action = "Skip";
          r.errors.push(
            "This Member ID is in Trash. Ask a manager to restore it before importing.",
          );
          continue;
        }
        if (p) {
          r.existingId = p.id;
          r.action = "Skip";
          r.warnings.push(
            "Existing Member ID — compare and choose update or skip",
          );
          r.existing = {
            name: p.name,
            dob: p.dob?.toISOString().slice(0, 10) ?? "",
            centre: p.centre,
            gender: p.gender,
            race: p.race,
            workingStatus: p.workingStatus,
            languages: p.languages.map((x) => x.language.name).join(", "),
            interests: p.interests.map((x) => x.interest.name).join(", "),
            conditions: p.conditions.map((x) => x.condition.name).join(", "),
            remarks: p.remarks,
            tags: p.tags,
            onboardingDate: p.onboardingDate?.toISOString().slice(0, 10) ?? "",
            updatedAt: p.updatedAt.toISOString(),
          };
        }
      }
      return NextResponse.json({ rows: parsed });
    }
    const rowSchema = z
      .object({
        rowNumber: z.number().int().min(2),
        raw: z.record(z.string(), z.union([z.string().max(20000), z.number()])),
        action: z.enum(["Import", "Skip", "Update existing"]),
        existing: z.record(z.string(), z.string()).optional(),
        confirmedRecipient: z.boolean().optional(),
        recipientName: z.string().max(200).optional(),
        recipientRelationship: z.string().max(200).optional(),
        recipientConditions: z.string().max(10000).optional(),
        assessmentOwner: z.enum(["", "Member", "Care Recipient"]).default(""),
        zbi: z.string().default(""),
      })
      .passthrough();
    const rows = body.rows.map((r) => rowSchema.parse(r));
    const seen = new Set<string>();
    let created = 0,
      updated = 0,
      skipped = 0;
    const batch = await db.$transaction(
      async (tx) => {
        const batch = await tx.importBatch.create({
          data: { filename: body.filename, userId: user.id },
        });
        for (const r of rows) {
          const id = String(r.memberId ?? "").trim();
          if (r.action === "Skip") {
            skipped++;
          } else {
            if (seen.has(id))
              throw new Error("Resolve duplicate Member IDs before import.");
            seen.add(id);
            const existing = await tx.person.findUnique({
              where: { memberId: id },
            });
            if (!centreAllowed(user, String(r.centre ?? "")))
              throw new Error(
                "Your centre permissions do not permit this record.",
              );
            if (existing) await requirePersonAccess(tx, user, existing.id);
            if (existing && !r.existing?.updatedAt)
              throw new Error(
                "Preview existing records again before updating.",
              );
            const input = personSchema.parse({
              ...existing,
              ...r,
              name: r.name || existing?.name || "",
              kind: "Member",
              assignedId: existing?.assignedId ?? "",
              status: existing?.status ?? "Active",
              zbi: r.assessmentOwner === "Member" ? r.zbi : "",
            });
            await validateAssignment(
              tx,
              user,
              existing?.assignedId,
              input.centre,
            );
            if (r.assessmentOwner === "Care Recipient" && !r.confirmedRecipient)
              throw new Error(
                "Confirm a care recipient before assigning their ZBI.",
              );
            if (existing && r.action === "Import")
              throw new Error(
                "An existing Member ID cannot be imported as new.",
              );
            if (!existing && r.action === "Update existing")
              throw new Error("The existing member was not found.");
            const p = await savePerson(
              tx,
              user.id,
              input,
              existing?.id,
              r.raw as Prisma.InputJsonValue,
              r.existing?.updatedAt,
            );
            await extractMemberSupport(tx, user.id, p.id);
            if (r.confirmedRecipient) {
              if (!r.recipientName?.trim())
                throw new Error(
                  "A confirmed care recipient needs a name or alias.",
                );
              const cr = await savePerson(tx, user.id, {
                kind: "Care Recipient",
                name: r.recipientName,
                centre: p.centre,
                conditions: r.recipientConditions ?? "",
                zbi: r.assessmentOwner === "Care Recipient" ? r.zbi : "",
              });
              await tx.careRelationship.create({
                data: {
                  memberId: p.id,
                  recipientId: cr.id,
                  relationship:
                    r.recipientRelationship?.trim() || "Not specified",
                },
              });
            }
            if (existing) updated++;
            else created++;
          }
          await tx.importRow.create({
            data: {
              batchId: batch.id,
              rowNumber: r.rowNumber,
              memberId: id,
              action: r.action,
              raw: r.raw as Prisma.InputJsonValue,
            },
          });
        }
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            createdCount: created,
            updatedCount: updated,
            skippedCount: skipped,
            errorCount: rows.filter(
              (r) => Array.isArray(r.errors) && r.errors.length > 0,
            ).length,
          },
        });
        await audit(
          tx,
          user.id,
          "Import completed",
          "ImportBatch",
          batch.id,
          null,
          { created, updated, skipped },
        );
        return batch;
      },
      { timeout: 120000, isolationLevel: "Serializable" },
    );
    return NextResponse.json({ batchId: batch.id, created, updated, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
