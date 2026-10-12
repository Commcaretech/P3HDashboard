import { createHash, timingSafeEqual } from "node:crypto";

export function checkSetupAccess(
  origin: string,
  supplied: string,
  secret?: string,
) {
  if (secret) {
    if (secret.length < 32)
      throw new Error(
        "The administrator must configure a setup token of at least 32 characters.",
      );
    const digest = (value: string) =>
      createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(supplied), digest(secret)))
      throw new Error("Setup token is incorrect.");
    return;
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
    throw new Error(
      "Online setup requires a setup token configured by the administrator.",
    );
}
