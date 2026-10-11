import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  currentUser,
  hashPassword,
  verifyPassword,
  startSession,
  tokenHash,
} from "@/lib/auth";
import { checkOrigin, errorResponse } from "@/lib/http";
export async function GET() {
  try {
    const user = await currentUser();
    return NextResponse.json({
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      setup: (await db.user.count()) === 0,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Cannot open the local database. Run the documented migration command.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const v = z
      .object({
        action: z.enum(["login", "setup", "logout"]),
        username: z.string().trim().max(80).default(""),
        password: z.string().max(128).default(""),
        name: z.string().trim().max(100).default(""),
      })
      .parse(await req.json());
    if (v.action === "logout") {
      const c = await cookies();
      const t = c.get("p3h-session")?.value;
      if (t) await db.session.deleteMany({ where: { id: tokenHash(t) } });
      c.delete("p3h-session");
      return NextResponse.json({ ok: true });
    }
    let user;
    if (v.action === "setup") {
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(
          new URL(req.headers.get("origin")!).hostname,
        )
      )
        throw new Error(
          "Initial setup must be performed on the hosting computer.",
        );
      if (v.password.length < 12 || !v.username || !v.name)
        throw new Error(
          "Name, username and a password of at least 12 characters are required.",
        );
      user = await db.$transaction(async (tx) => {
        if (await tx.user.count())
          throw new Error("Setup is already complete.");
        return tx.user.create({
          data: {
            username: v.username.toLowerCase(),
            name: v.name,
            passwordHash: hashPassword(v.password),
            role: "Admin",
          },
        });
      });
    } else {
      const username = v.username.toLowerCase();
      const attempt = await db.loginAttempt.findUnique({ where: { username } });
      if (attempt?.lockedUntil && attempt.lockedUntil > new Date())
        throw new Error("Too many attempts. Try again in 15 minutes.");
      user = await db.user.findUnique({ where: { username } });
      if (!user?.active || !verifyPassword(v.password, user.passwordHash)) {
        const failures =
          (attempt?.lockedUntil && attempt.lockedUntil < new Date()
            ? 0
            : (attempt?.failures ?? 0)) + 1;
        await db.loginAttempt.upsert({
          where: { username },
          create: {
            username,
            failures,
            lockedUntil: failures >= 5 ? new Date(Date.now() + 900000) : null,
          },
          update: {
            failures,
            lockedUntil: failures >= 5 ? new Date(Date.now() + 900000) : null,
          },
        });
        throw new Error("Username or password is incorrect.");
      }
      await db.loginAttempt.deleteMany({ where: { username } });
    }
    await startSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
