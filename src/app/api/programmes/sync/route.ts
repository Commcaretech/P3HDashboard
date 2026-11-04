import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db, programmeInclude } from "@/lib/db";
import { programmeScope, unrestricted } from "@/lib/access";
import { checkOrigin } from "@/lib/http";
import {
  syncProgrammes,
  syncConfig,
  SyncError,
  canSync,
} from "@/lib/programme-sync";
import {
  needsReview,
  confirmedOccurrences,
  schedulingConcern,
} from "@/lib/programme-source";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(req: NextRequest) {
  const u = await currentUser();
  let delegated = false;
  try {
    if (!u) throw new SyncError(401, "Please sign in.");
    try {
      checkOrigin(req);
    } catch {
      throw new SyncError(403, "Request origin is not permitted.");
    }
    // No request data is needed; stream a small body rather than trusting Content-Length.
    const reader = req.body?.getReader();
    let bytes = 0;
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 1024) {
          await reader.cancel();
          throw new SyncError(413, "Sync request is too large.");
        }
      }
    delegated = true;
    return reply(await syncProgrammes(u));
  } catch (e) {
    const safe =
      e instanceof SyncError
        ? e
        : new SyncError(503, "Programme sync is unavailable. Retry later.");
    if (!delegated) {
      // Unauthenticated attempts have no staff FK and live in the sync security history.
      const run = await db.programmeSyncRun.create({
        data: {
          userId: u?.id,
          scope: [],
          status: "Rejected",
          finishedAt: new Date(),
          errors: 1,
          errorSummary: safe.message,
        },
      });
      if (u)
        await db.auditLog.create({
          data: {
            userId: u.id,
            action: "Programme sync rejected",
            entityType: "ProgrammeSync",
            entityId: run.id,
            changes: { status: safe.status },
          },
        });
    }
    return reply({ error: safe.message }, safe.status);
  }
}
export async function GET() {
  const u = await currentUser();
  if (!u) return reply({ error: "Please sign in." }, 401);
  try {
    let configuration = "Configured";
    try {
      syncConfig();
    } catch (e) {
      configuration =
        e instanceof SyncError ? e.message : "Configuration unavailable";
    }
    const programmes = await db.programme.findMany({
      where: { AND: [programmeScope(u), { external: { isNot: null } }] },
      include: programmeInclude,
    });
    const history = await db.programmeSyncRun.findMany({
      where: unrestricted(u) ? {} : { userId: u.id },
      orderBy: { startedAt: "desc" },
      take: 10,
    });
    const lastSuccess = await db.programmeSyncRun.findFirst({
      where: {
        ...(unrestricted(u) ? {} : { userId: u.id }),
        status: "Success",
      },
      orderBy: { startedAt: "desc" },
    });
    const lock = await db.programmeSyncLock.findUnique({
      where: { id: "program-spacebooking" },
    });
    return reply({
      configuration,
      canSync: canSync(u),
      running: Boolean(lock && lock.expiresAt > new Date()),
      imported: programmes.length,
      upcoming: programmes.reduce(
        (n, p) => n + confirmedOccurrences(p).length,
        0,
      ),
      concerns: programmes.filter(schedulingConcern).length,
      review: programmes.filter(needsReview).length,
      lastSuccess:
        lastSuccess?.finishedAt ??
        programmes
          .map((p) => p.external!.lastSyncAt)
          .sort((a, b) => b.getTime() - a.getTime())[0] ??
        null,
      history: history.map((r) => ({
        id: r.id,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        status: r.status,
        created: r.created,
        updated: r.updated,
        unchanged: r.unchanged,
        skipped: r.skipped,
        errors: r.errors,
        errorSummary: r.errorSummary,
        diagnostics: unrestricted(u) ? r.diagnostics : undefined,
      })),
    });
  } catch {
    return reply({ error: "Programme sync status is unavailable." }, 503);
  }
}
