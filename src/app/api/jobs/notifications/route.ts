import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runNotifications } from "@/lib/notifications";
export const dynamic = "force-dynamic";
// Vercel Cron invokes its schedule with GET and, when CRON_SECRET is set,
// automatically sends `Authorization: Bearer <CRON_SECRET>`. External
// schedulers use POST with the NOTIFICATION_JOB_SECRET bearer token. Both
// secrets are server-only and the endpoint accepts either, so the same job
// runs from either scheduler without duplicating secrets.
function authorised(req: NextRequest) {
  const received = req.headers.get("authorization") ?? "";
  for (const secret of [
    process.env.NOTIFICATION_JOB_SECRET,
    process.env.CRON_SECRET,
  ]) {
    if (!secret || secret.length < 32) continue;
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(received);
    if (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    )
      return true;
  }
  return false;
}
async function handle(req: NextRequest) {
  if (!authorised(req))
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
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
