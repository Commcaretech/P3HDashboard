import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { reportData } from "@/lib/report-data";
import { privateHeaders } from "@/lib/permission-key";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser();
    return NextResponse.json(
      await reportData(u, Object.fromEntries(req.nextUrl.searchParams)),
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
