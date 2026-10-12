import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
import { schemeKey, supportFromNotes } from "@/lib/support-notes";
import { extractMemberSupport } from "@/lib/support-extraction";

export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = await requireUser("write");
    const body = z
      .object({
        action: z.enum(["preview", "commit"]),
        selections: z
          .array(
            z.object({
              personId: z.string().min(1),
              version: z.string(),
              scheme: z.string().max(200),
            }),
          )
          .max(10000)
          .default([]),
      })
      .parse(await req.json());
    if (body.action === "preview") {
      const members = await db.person.findMany({
        where: { kind: "Member", status: { not: "Archived" } },
        include: { grants: { include: { scheme: true } } },
      });
      const rows = members.flatMap((p) =>
        supportFromNotes(p.remarks).map((s) => ({
          ...s,
          personId: p.id,
          personLabel: p.name || p.memberId || p.id,
          version: p.updatedAt.toISOString(),
          existing: p.grants.some(
            (g) => schemeKey(g.scheme.name) === schemeKey(s.scheme),
          ),
        })),
      );
      return NextResponse.json({ rows });
    }
    const result = await db.$transaction(
      async (tx) => {
        let created = 0,
          skipped = 0;
        const grouped = new Map<string, typeof body.selections>();
        for (const s of body.selections)
          grouped.set(s.personId, [...(grouped.get(s.personId) ?? []), s]);
        for (const [personId, selections] of grouped) {
          const p = await tx.person.findUniqueOrThrow({
            where: { id: personId },
          });
          if (
            p.updatedAt.toISOString() !== selections[0].version ||
            selections.some((s) => s.version !== selections[0].version)
          )
            throw new Error(
              "Member notes have changed. Preview again before extracting support.",
            );
          if (p.kind !== "Member" || p.status === "Archived")
            throw new Error("Choose an active member.");
          const available = supportFromNotes(p.remarks).map((s) => s.scheme);
          if (selections.some((s) => !available.includes(s.scheme)))
            throw new Error(
              "The selected support is no longer in the member notes. Preview again.",
            );
          const counts = await extractMemberSupport(
            tx,
            user.id,
            personId,
            selections.map((s) => s.scheme),
          );
          created += counts.created;
          skipped += counts.skipped;
        }
        return { created, skipped };
      },
      { timeout: 60000, isolationLevel: "Serializable" },
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
