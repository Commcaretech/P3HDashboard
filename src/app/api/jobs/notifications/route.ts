import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runNotifications } from "@/lib/notifications";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const secret = process.env.NOTIFICATION_JOB_SECRET;
  const received = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(received);
  if (
    !secret ||
    secret.length < 32 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const result = await runNotifications();
    return NextResponse.json(result, {
      status: result.results?.includes("Failed") ? 503 : 200,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Notification job failed. Check database connectivity and retry.",
      },
      { status: 503 },
    );
  }
}
