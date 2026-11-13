import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { privateHeaders } from "@/lib/permission-key";
import { checkOrigin, errorResponse } from "@/lib/http";
import {
  importSurveys,
  listSurveys,
  manageSurveyAlias,
  previewSurveys,
  surveyCandidates,
  surveyDetail,
  surveyHistory,
  surveyOverview,
  surveyOptions,
  updateSurvey,
} from "@/lib/surveys";

export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      f = Object.fromEntries(req.nextUrl.searchParams);
    const result =
      f.view === "options"
        ? await surveyOptions(u)
        : f.view === "overview"
          ? await surveyOverview(u, f)
          : f.view === "history"
            ? await surveyHistory(u, f)
            : f.view === "detail"
              ? await surveyDetail(u, f.id || "")
              : f.view === "candidates"
                ? await surveyCandidates(u, f.id || "", f.q || "")
                : await listSurveys(u, f);
    return NextResponse.json(result, { headers: privateHeaders(u) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const u = await requireUser("write"),
      text = await req.text();
    if (Buffer.byteLength(text) > 10 * 1024 * 1024)
      throw new Error("Upload is too large (10 MB maximum).");
    const v = JSON.parse(text);
    const result =
      v.action === "preview"
        ? await previewSurveys(u, v)
        : await db.$transaction(
            async (tx): Promise<unknown> =>
              v.action === "import"
                ? importSurveys(tx, u, v)
                : v.action === "alias"
                  ? manageSurveyAlias(tx, u, v)
                  : updateSurvey(tx, u, v),
            { timeout: 60000 },
          );
    return NextResponse.json(result, { headers: privateHeaders(u) });
  } catch (e) {
    return errorResponse(e);
  }
}
