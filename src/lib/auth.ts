import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { can } from "./domain";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(key, "hex");
  return derived.length === stored.length && timingSafeEqual(derived, stored);
}
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get("p3h-session")?.value;
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { id: tokenHash(token) },
    include: { user: true },
  });
  return s && s.expiresAt > new Date() && s.user.active ? s.user : null;
}
export async function requireUser(
  action: "read" | "write" | "audit" | "admin" = "read",
) {
  const u = await currentUser();
  if (!u) throw new Error("Please sign in.");
  if (!can(u.role, action))
    throw new Error("Your role does not permit this action.");
  return u;
}
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: tokenHash(token),
      userId,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  (await cookies()).set("p3h-session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 8 * 3600,
  });
}
