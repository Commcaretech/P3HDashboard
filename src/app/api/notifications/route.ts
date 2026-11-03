import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
import { db } from "@/lib/db";
import { emailConfigured, productionSender } from "@/lib/email";
import { sendDigest } from "@/lib/notifications";
import { today } from "@/lib/domain";
export async function GET() {
  try {
    await requireUser("admin");
    return NextResponse.json(
      {
        configured: emailConfigured(),
        deliveries: await db.notificationDelivery.findMany({
          select: {
            id: true,
            userId: true,
            type: true,
            scheduledDate: true,
            status: true,
            providerMessageId: true,
            lastAttempt: true,
            attempts: true,
            failureReason: true,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const u = await requireUser("admin");
    const sender = productionSender();
    if (!sender)
      throw new Error(
        "Email is not configured. Set server-side provider credentials first.",
      );
    const result = await sendDigest(u.id, today(), sender, true);
    if (result !== "Accepted")
      throw new Error(
        `Test email: ${result}. Check your email address, enabled notifications and delivery diagnostics.`,
      );
    await db.auditLog.create({
      data: {
        userId: u.id,
        action: "Test email accepted by provider",
        entityType: "User",
        entityId: u.id,
        changes: { result },
      },
    });
    return NextResponse.json({
      message:
        "Provider accepted the test email. Inbox delivery is not confirmed.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
