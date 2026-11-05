import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
import { maintainReminders } from "@/lib/reminder-maintenance";
import { privateHeaders } from "@/lib/permission-key";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const u = await requireUser("write");
    return NextResponse.json(await maintainReminders(), {
      headers: privateHeaders(u),
    });
  } catch (e) {
    if (e instanceof Error && /sign in|role|origin/.test(e.message))
      return errorResponse(e);
    return NextResponse.json(
      {
        error:
          "In-app reminders could not be checked. Use Refresh Alerts or retry later.",
      },
      { status: 503 },
    );
  }
}
