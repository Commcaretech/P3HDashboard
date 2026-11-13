import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkOrigin, errorResponse } from "@/lib/http";
import { privateHeaders } from "@/lib/permission-key";
import { changeTrash, listTrash, previewTrash } from "@/lib/trash";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser("audit"),
      f = Object.fromEntries(req.nextUrl.searchParams);
    return NextResponse.json(
      f.action === "preview"
        ? await previewTrash(u, f.type, f.id || "")
        : await listTrash(u, f),
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const u = await requireUser("audit"),
      v = await req.json();
    const result = await db.$transaction((tx) => changeTrash(tx, u, v), {
      timeout: 60000,
    });
    return NextResponse.json(result, { headers: privateHeaders(u) });
  } catch (e) {
    return errorResponse(e);
  }
}
