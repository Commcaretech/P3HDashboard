import {privateHeaders} from "@/lib/permission-key";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, programmeInclude } from "@/lib/db";
import { centreAllowed, programmeScope, personScope } from "@/lib/access";
import {
  catalogueCounts,
  filterCatalogue,
  sourceCentres,
  nextOccurrence,
  reviewStatus,
} from "@/lib/programme-source";
import type { Programme } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser();
    const f = Object.fromEntries(req.nextUrl.searchParams.entries());
    if (f.centre && !centreAllowed(u, sourceCentres[f.centre] ?? f.centre))
      return NextResponse.json(
        { error: "Your centre permissions do not permit this record." },
        { status: 403 },
      );
    const records = await db.programme.findMany({
      where: programmeScope(u),
      include: {
        ...programmeInclude,
        participations: {
          where: { person: personScope(u) },
          select: { personId: true, status: true },
        },
        _count: {
          select: { participations: { where: { status: "Registered" } } },
        },
      },
      orderBy: { name: "asc" },
    });
    const programmes = JSON.parse(
      JSON.stringify(
        records.map((p) => ({
          ...p,
          registeredCount: p._count.participations,
        })),
      ),
    ) as Programme[];
    const active = programmes.filter((p) => p.status !== "Archived");
    const centreRows = filterCatalogue(active, { centre: f.centre ?? "" });
    const metricRows = filterCatalogue(programmes, { ...f, review: "" });
    const filtered = filterCatalogue(programmes, f);
    const sortValue = (p: Programme) =>
      f.sort === "centre"
        ? p.centre
        : f.sort === "next"
          ? (nextOccurrence(p, f.date)?.date ?? "")
          : f.sort === "category"
            ? p.category
            : f.sort === "review"
              ? reviewStatus(p)
              : f.sort === "registration"
                ? p.registrationStatus
                : p.name;
    filtered.sort(
      (a, b) =>
        sortValue(a).localeCompare(sortValue(b)) *
        (f.direction === "-1" ? -1 : 1),
    );
    const size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20;
    const pages = Math.max(1, Math.ceil(filtered.length / size));
    const page = Math.max(
      1,
      Math.min(
        pages,
        Number.isSafeInteger(Number(f.page)) ? Number(f.page) : 1,
      ),
    );
    const [languages, interests, conditions] = await Promise.all([
      db.language.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      db.interest.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      db.medicalCondition.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json(
      {
        rows: filtered.slice((page - 1) * size, page * size),
        total: filtered.length,
        page,
        size,
        counts: catalogueCounts(metricRows, f.date),
        diagnostics: {
          unknownVisibility: metricRows.reduce(
            (n, p) =>
              n +
              (p.external?.occurrences.filter(
                (o) =>
                  !o.missing &&
                  !o.visibilityKnown &&
                  p.external?.eligibilityRulesVersion !== 2,
              ).length || 0),
            0,
          ),
          undated: metricRows.reduce(
            (n, p) =>
              n +
              (p.external?.occurrences.filter((o) => !o.missing && !o.date)
                .length || 0),
            0,
          ),
        },
        centres: [
          {
            id: "",
            label: "All Centres",
            allowed: true,
            counts: catalogueCounts(active),
          },
          ...Object.entries(sourceCentres).map(([id, label]) => ({
            id,
            label,
            allowed: centreAllowed(u, label),
            counts: centreAllowed(u, label)
              ? catalogueCounts(
                  active.filter(
                    (p) => p.external?.centreId === id || p.centre === label,
                  ),
                )
              : null,
          })),
        ],
        categories: [
          ...new Set(centreRows.map((p) => p.category).filter(Boolean)),
        ],
        vocabulary: {
          languages: languages.map((v) => v.name),
          interests: interests.map((v) => v.name),
          conditions: conditions.map((v) => v.name),
        },
      },
      { headers: privateHeaders(u) },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && e.message === "Please sign in."
            ? e.message
            : "Programme catalogue could not be loaded.",
      },
      {
        status:
          e instanceof Error && e.message === "Please sign in." ? 401 : 503,
      },
    );
  }
}
