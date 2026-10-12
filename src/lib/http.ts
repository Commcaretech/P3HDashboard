import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected =
    process.env.APP_ORIGIN ??
    process.env.RENDER_EXTERNAL_URL ??
    `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  if (!origin || origin !== expected)
    throw new Error("Request origin is not permitted.");
  const size = Number(req.headers.get("content-length") || 0);
  if (size > 11 * 1024 * 1024)
    throw new Error("Upload is too large (10 MB maximum).");
}
export function errorResponse(e: unknown) {
  let message = "Unable to save. Please retry or contact your administrator.";
  if (e instanceof z.ZodError)
    message = e.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  else if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002")
      message =
        "A record with this identifier already exists. Review the existing record.";
    if (e.code === "P2025") message = "Record not found.";
  } else if (
    e instanceof Error &&
    !/prisma|sqlite|invocation|constraint|stack/i.test(e.message)
  )
    message = e.message;
  return NextResponse.json(
    { error: message },
    {
      status:
        message === "Please sign in."
          ? 401
          : message === "Your role does not permit this action."
            ? 403
            : 400,
    },
  );
}
