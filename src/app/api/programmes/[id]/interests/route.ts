import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
import { db } from "@/lib/db";
import { centreAllowed, requireProgrammeAccess } from "@/lib/access";
import { can } from "@/lib/domain";
import { saveProgrammeInterestTags } from "@/lib/records";
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(req);
    const u = await requireUser("write");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = req.body?.getReader();
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 16000) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Interest tag request is too large." },
            { status: 413 },
          );
        }
        chunks.push(part.value);
      }
    const input = z
      .object({
        version: z.string(),
        tags: z.array(z.string().trim().min(1).max(100)).max(50),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const { id } = await ctx.params;
    await db.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: u.id },
        include: { allowedCentres: true },
      });
      if (!current?.active || !can(current.role, "write"))
        throw new Error("Your role does not permit this action.");
      const p = await requireProgrammeAccess(tx, current, id);
      if (!centreAllowed(current, p.centre))
        throw new Error("Your centre permissions do not permit this record.");
      await saveProgrammeInterestTags(tx, u.id, id, input.tags, input.version);
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
