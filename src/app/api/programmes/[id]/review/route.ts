import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
import { db } from "@/lib/db";
import { saveProgrammeReview } from "@/lib/programme-review";
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(req);
    const u = await requireUser("write");
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 128000) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Review request is too large." },
            { status: 413 },
          );
        }
        chunks.push(part.value);
      }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const { id } = await ctx.params;
    const result = await db.$transaction(
      (tx) => saveProgrammeReview(tx, u, id, body),
      { timeout: 15000 },
    );
    return NextResponse.json({ ok: true, status: result.status });
  } catch (e) {
    return errorResponse(e);
  }
}
