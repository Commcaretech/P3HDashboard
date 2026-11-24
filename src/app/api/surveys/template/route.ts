import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { privateHeaders } from "@/lib/permission-key";

export async function GET() {
  try {
    const user = await requireUser("write");
    const file = await readFile(
      join(process.cwd(), "assets/ncss-member-id-template.xlsx"),
    );
    return new Response(new Uint8Array(file), {
      headers: {
        ...privateHeaders(user),
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="P3H-NCSS-Member-ID-Template.xlsx"',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
