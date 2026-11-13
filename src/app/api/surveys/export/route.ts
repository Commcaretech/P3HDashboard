import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkOrigin, errorResponse } from "@/lib/http";
import { privateHeaders } from "@/lib/permission-key";
import { exportSurveys } from "@/lib/surveys";
import { z } from "zod";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const u = await requireUser("audit"),
      filters = z
        .record(z.string().max(100), z.string().max(200))
        .parse(await req.json());
    const csv = await db.$transaction((tx) => exportSurveys(tx, u, filters));
    return new NextResponse(csv, {
      headers: {
        ...privateHeaders(u),
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="p3h-survey-outcomes.csv"',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
