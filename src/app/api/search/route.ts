import { searchText } from "@/lib/query";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { personScope, programmeScope } from "@/lib/access";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ results: [] });
    const [people, programmes] = await Promise.all([
      db.person.findMany({
        where: {
          AND: [
            personScope(u),
            { status: { not: "Archived" } },
            {
              OR: [
                { memberId: searchText(q) },
                { name: searchText(q) },
                { alias: searchText(q) },
                { tags: searchText(q) },
                {
                  conditions: {
                    some: { condition: { name: searchText(q) } },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          kind: true,
          name: true,
          alias: true,
          memberId: true,
          centre: true,
        },
        take: 12,
        orderBy: { name: "asc" },
      }),
      db.programme.findMany({
        where: {
          AND: [
            programmeScope(u),
            { status: { not: "Archived" }, name: searchText(q) },
          ],
        },
        select: { id: true, name: true, centre: true },
        take: 6,
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json(
      {
        results: [
          ...people
            .sort(
              (a, b) =>
                Number(a.kind !== "Member") - Number(b.kind !== "Member") ||
                a.name.localeCompare(b.name),
            )
            .map((p) => ({
              id: p.id,
              title: p.name || p.alias || p.memberId || "Unnamed record",
              detail: [p.memberId, p.centre].filter(Boolean).join(" · "),
              group: p.kind === "Member" ? "Members" : "Care Recipients",
              href: `/people/${p.id}`,
            })),
          ...programmes.map((p) => ({
            id: p.id,
            title: p.name,
            detail: p.centre,
            group: "Programmes",
            href: `/programmes?q=${encodeURIComponent(p.name)}`,
          })),
        ],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
