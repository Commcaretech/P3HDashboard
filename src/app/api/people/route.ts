import { searchText } from "@/lib/query";
import { privateHeaders } from "@/lib/permission-key";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { alertScope, grantScope, personScope } from "@/lib/access";
import { errorResponse } from "@/lib/http";
import { normaliseAlias } from "@/lib/survey-parser";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(),
      f = Object.fromEntries(req.nextUrl.searchParams),
      kind = f.kind === "Care Recipient" ? "Care Recipient" : "Member";
    const page = Math.max(1, Math.min(100000, Math.floor(Number(f.page)) || 1)),
      size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20;
    const q = (f.q ?? "").slice(0, 200),
      alias = normaliseAlias(q),
      and: Prisma.PersonWhereInput[] = [
        personScope(u),
        { kind, status: f.status || { not: "Archived" } },
      ];
    if (q)
      and.push({
        OR: [
          { name: searchText(q) },
          { memberId: searchText(q) },
          { alias: searchText(q) },
          { contactNumber: searchText(q) },
          ...(alias
            ? [
                {
                  verifiedAliases: {
                    some: { verified: true, normalized: searchText(alias) },
                  },
                },
              ]
            : []),
          { remarks: searchText(q) },
          { tags: searchText(q) },
          { conditions: { some: { condition: { name: searchText(q) } } } },
        ],
      });
    if (f.centre) and.push({ centre: f.centre });
    if (f.language)
      and.push({
        OR: [
          { preferredLanguage: f.language },
          { languages: { some: { language: { name: f.language } } } },
        ],
      });
    if (f.condition)
      and.push({
        OR: [
          { conditions: { some: { condition: { name: f.condition } } } },
          ...(kind === "Member"
            ? [
                {
                  caregiverLinks: {
                    some: {
                      recipient: {
                        AND: [
                          personScope(u),
                          {
                            conditions: {
                              some: { condition: { name: f.condition } },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      });
    if (f.interest)
      and.push({ interests: { some: { interest: { name: f.interest } } } });
    if (f.mobility) and.push({ mobility: f.mobility });
    if (f.tag) and.push({ tags: searchText(f.tag) });
    if (f.scheme)
      and.push({
        grants: { some: { ...grantScope(u), scheme: { name: f.scheme } } },
      });
    if (f.assigned)
      and.push(
        f.assigned === "Unassigned"
          ? { assignedId: null }
          : {
              OR: [
                { assignedId: f.assigned },
                { assigned: { name: f.assigned } },
              ],
            },
      );
    const sortable = [
        "name",
        "memberId",
        "centre",
        "preferredLanguage",
        "status",
        "assigned",
        "updatedAt",
      ],
      sort = sortable.includes(f.sort) ? f.sort : "name",
      direction = f.direction === "desc" ? "desc" : "asc";
    const base = { AND: [personScope(u), { kind }] };
    const total = await db.person.count({ where: { AND: and } });
    const activePage = Math.min(page, Math.max(1, Math.ceil(total / size)));
    const [
      people,
      centres,
      languages,
      conditions,
      interests,
      mobility,
      tags,
      preferredLanguages,
    ] = await Promise.all([
      db.person.findMany({
        where: { AND: and },
        skip: (activePage - 1) * size,
        take: size,
        orderBy: [
          sort === "assigned"
            ? { assigned: { name: direction } }
            : { [sort]: direction },
          { memberId: "asc" },
          { id: "asc" },
        ],
        select: {
          id: true,
          kind: true,
          memberId: true,
          name: true,
          alias: true,
          contactNumber: true,
          centre: true,
          preferredLanguage: true,
          status: true,
          assignedId: true,
          updatedAt: true,
          languages: { include: { language: true } },
          conditions: { include: { condition: true } },
          assigned: { select: { name: true } },
          caregiverLinks: {
            where: { recipient: personScope(u) },
            include: {
              recipient: {
                select: {
                  id: true,
                  name: true,
                  alias: true,
                  memberId: true,
                  conditions: { include: { condition: true } },
                },
              },
            },
          },
          recipientLinks: {
            where: { member: personScope(u) },
            include: {
              member: {
                select: { id: true, name: true, alias: true, memberId: true },
              },
            },
          },
          alerts: {
            where: { AND: [alertScope(u), { status: "Pending" }] },
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              title: true,
              dueDate: true,
              snoozedUntil: true,
            },
          },
        },
      }),
      db.person.groupBy({
        by: ["centre"],
        where: base,
        orderBy: { centre: "asc" },
      }),
      db.language.findMany({
        where: { people: { some: { person: base } } },
        select: { name: true },
      }),
      db.medicalCondition.findMany({
        where: {
          people: {
            some: {
              person: {
                AND: [
                  personScope(u),
                  {
                    OR: [
                      base,
                      ...(kind === "Member"
                        ? [{ recipientLinks: { some: { member: base } } }]
                        : []),
                    ],
                  },
                ],
              },
            },
          },
        },
        select: { name: true },
      }),
      db.interest.findMany({
        where: { people: { some: { person: base } } },
        select: { name: true },
      }),
      db.person.groupBy({
        by: ["mobility"],
        where: base,
        orderBy: { mobility: "asc" },
      }),
      db.person.groupBy({
        by: ["tags"],
        where: base,
        orderBy: { tags: "asc" },
      }),
      db.person.groupBy({
        by: ["preferredLanguage"],
        where: base,
      }),
    ]);
    return NextResponse.json(
      {
        people: people.map((p) => ({
          ...p,
          interests: [],
          assessments: [],
          participations: [],
          rawImport: null,
        })),
        total,
        page: activePage,
        size,
        filters: {
          centre: centres.map((p) => p.centre),
          language: [
            ...new Set([
              ...languages.map((p) => p.name),
              ...preferredLanguages
                .map((p) => p.preferredLanguage)
                .filter(Boolean),
            ]),
          ].sort(),
          condition: conditions.map((p) => p.name),
          interest: interests.map((p) => p.name),
          mobility: mobility.map((p) => p.mobility),
          tag: [
            ...new Set(
              tags.flatMap((p) => p.tags.split(/[,;\n]/).map((s) => s.trim())),
            ),
          ],
        },
      },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
