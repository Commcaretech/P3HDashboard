import { searchText } from "@/lib/query";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { personScope, programmeScope } from "@/lib/access";
import { privateHeaders } from "@/lib/permission-key";
import { errorResponse } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      f = req.nextUrl.searchParams,
      q = (f.get("q") || "").trim().slice(0, 100),
      full = f.get("full") === "1";
    if (q.length < 2)
      return NextResponse.json(
        { results: [], total: 0, page: 1, size: 20 },
        { headers: privateHeaders(u) },
      );
    const pw: Prisma.PersonWhereInput = {
      AND: [
        personScope(u),
        { status: { not: "Archived" } },
        {
          OR: [
            { memberId: searchText(q) },
            { name: searchText(q) },
            { alias: searchText(q) },
            { tags: searchText(q) },
            { conditions: { some: { condition: { name: searchText(q) } } } },
            ...(full
              ? [
                  { remarks: searchText(q) },
                  {
                    languages: { some: { language: { name: searchText(q) } } },
                  },
                  {
                    interests: { some: { interest: { name: searchText(q) } } },
                  },
                ]
              : []),
          ],
        },
      ],
    };
    const gw: Prisma.ProgrammeWhereInput = {
      AND: [
        programmeScope(u),
        { status: { not: "Archived" } },
        {
          OR: [
            { name: searchText(q) },
            ...(full
              ? [
                  { description: searchText(q) },
                  {
                    languages: { some: { language: { name: searchText(q) } } },
                  },
                  {
                    interests: { some: { interest: { name: searchText(q) } } },
                  },
                  {
                    conditions: {
                      some: { condition: { name: searchText(q) } },
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    };
    const [pc, gc] = full
      ? await Promise.all([
          db.person.count({ where: pw }),
          db.programme.count({ where: gw }),
        ])
      : [12, 6];
    const size =
        full && [20, 50, 100].includes(Number(f.get("size")))
          ? Number(f.get("size"))
          : 20,
      total = pc + gc,
      page = full
        ? Math.max(
            1,
            Math.min(Math.ceil(total / size) || 1, Number(f.get("page")) || 1),
          )
        : 1,
      skip = (page - 1) * size,
      ptake = full ? Math.min(size, Math.max(0, pc - skip)) : 12;
    const [people, programmes] = await Promise.all([
      ptake
        ? db.person.findMany({
            where: pw,
            select: {
              id: true,
              kind: true,
              name: true,
              alias: true,
              memberId: true,
              centre: true,
            },
            take: ptake,
            skip: full ? Math.min(skip, pc) : 0,
            orderBy: [{ name: "asc" }, { id: "asc" }],
          })
        : Promise.resolve([]),
      !full || size > ptake
        ? db.programme.findMany({
            where: gw,
            select: { id: true, name: true, centre: true },
            take: full ? size - ptake : 6,
            skip: full ? Math.max(0, skip - pc) : 0,
            orderBy: [{ name: "asc" }, { id: "asc" }],
          })
        : Promise.resolve([]),
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
              detail: [p.memberId, p.centre].filter(Boolean).join(" / "),
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
        total: full ? total : people.length + programmes.length,
        page,
        size,
      },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
