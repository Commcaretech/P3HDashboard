import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  ncssImportEnabled,
  parseNCSSIntake,
  processNCSS,
} from "@/lib/ncss-import";
import { db } from "@/lib/db";
import { privateHeaders } from "@/lib/permission-key";
import { checkOrigin, errorResponse } from "@/lib/http";
import {
  listSurveys,
  manageSurveyAlias,
  nextSurveyForReview,
  lookupSurveyMember,
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
        ? {
            ...(await surveyOptions(u)),
            ncssImportEnabled: ncssImportEnabled(),
          }
        : ["overview", "trends"].includes(f.view)
          ? await surveyOverview(u, f)
          : f.view === "history"
            ? await surveyHistory(u, f)
            : f.view === "detail"
              ? await surveyDetail(u, f.id || "", f.identity === "1")
              : f.view === "identity"
                ? await listSurveys(u, f, true)
                : f.view === "queue"
                  ? await nextSurveyForReview(u, f)
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
    let v;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Error("Invalid survey request.");
    }
    if (v?.action === "preview" || v?.action === "import")
      return NextResponse.json(await processNCSS(u, parseNCSSIntake(v)), {
        headers: privateHeaders(u),
      });
    if (
      ![
        "lookup",
        "alias",
        "link",
        "unlink",
        "correct",
        "ambiguous",
        "reject",
        "correct-name",
        "reassign-import",
      ].includes(v?.action)
    )
      throw new Error("Invalid survey action.");
    const result =
      v.action === "lookup"
        ? await lookupSurveyMember(u, v)
        : await db.$transaction(
            async (tx): Promise<unknown> =>
              v.action === "alias"
                ? manageSurveyAlias(tx, u, v)
                : updateSurvey(tx, u, v),
            { timeout: 60000 },
          );
    return NextResponse.json(result, { headers: privateHeaders(u) });
  } catch (e) {
    return errorResponse(e);
  }
}
