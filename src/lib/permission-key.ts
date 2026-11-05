import { createHash } from "node:crypto";
import type { AccessUser } from "./access";
export function permissionKey(u: AccessUser) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        u.id,
        u.role,
        u.allCentres,
        u.allowedCentres.map((c) => c.centre).sort(),
      ]),
    )
    .digest("hex")
    .slice(0, 24);
}
export const privateHeaders = (u: AccessUser) => ({
  "Cache-Control": "private, no-store",
  "X-P3H-Access": permissionKey(u),
});
