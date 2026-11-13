import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AccessUser, personScope, programmeScope, alertScope } from "./access";
import { birthday, today } from "./domain";
import { searchText } from "./query";
export type ReportCell = string | number | { text: string; personId: string };
export async function reportData(u: AccessUser, f: Record<string, string>) {
  const scope = personScope(u),
    and: Prisma.PersonWhereInput[] = [scope],
    view = f.view || "caseload",
    q = (f.q || "").slice(0, 200);
  if (f.centre) and.push({ centre: f.centre });
  if (f.assigned)
    and.push({
      OR: [{ assignedId: f.assigned }, { assigned: { name: f.assigned } }],
    });
  if (f.condition)
    and.push({ conditions: { some: { condition: { name: f.condition } } } });
  if (f.programme)
    and.push({
      participations: {
        some: { programme: { name: f.programme, ...programmeScope(u) } },
      },
    });
  if (f.from) and.push({ createdAt: { gte: new Date(f.from) } });
  if (f.to)
    and.push({ createdAt: { lt: new Date(Date.parse(f.to) + 86400000) } });
  if (q)
    and.push({
      OR: [
        { name: searchText(q) },
        { alias: searchText(q) },
        { memberId: searchText(q) },
        { centre: searchText(q) },
        { conditions: { some: { condition: { name: searchText(q) } } } },
        { languages: { some: { language: { name: searchText(q) } } } },
        { interests: { some: { interest: { name: searchText(q) } } } },
        { grants: { some: { scheme: { name: searchText(q) } } } },
      ],
    });
  const [people, centres, programmes, conditions] = await Promise.all([
    db.person.findMany({
      where: { AND: and },
      select: {
        id: true,
        kind: true,
        name: true,
        alias: true,
        memberId: true,
        centre: true,
        dob: true,
        status: true,
        preferredLanguage: true,
        languages: { select: { language: { select: { name: true } } } },
        interests: { select: { interest: { select: { name: true } } } },
        conditions: { select: { condition: { select: { name: true } } } },
        participations: {
          where: { programme: programmeScope(u) },
          select: {
            id: true,
            status: true,
            programme: { select: { name: true } },
          },
        },
      },
    }),
    db.person.findMany({
      where: scope,
      select: { centre: true },
      distinct: ["centre"],
    }),
    db.programme.findMany({
      where: programmeScope(u),
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    db.medicalCondition.findMany({
      where: { people: { some: { person: scope } } },
      select: { name: true },
    }),
  ]);
  const active = people.filter((p) => p.status === "Active"),
    ids = people.map((p) => p.id),
    label = (p: (typeof people)[number]) =>
      p.name || p.alias || p.memberId || "Unnamed record";
  let headers = ["Group", "Count"],
    rows: { id: string; cells: ReportCell[] }[] = [];
  const group = (values: string[]) =>
    [
      ...values.reduce(
        (m, v) => m.set(v, (m.get(v) || 0) + 1),
        new Map<string, number>(),
      ),
    ]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ id: name, cells: [name, count] }));
  if (view === "caseload")
    rows = group(
      active.map((p) => `${p.kind} / ${p.centre || "Centre not recorded"}`),
    );
  if (view === "conditions")
    rows = group(
      active
        .filter((p) => p.kind === "Care Recipient")
        .flatMap((p) => p.conditions.map((c) => c.condition.name)),
    );
  if (view === "languages")
    rows = group(
      active.flatMap((p) =>
        p.languages.length
          ? p.languages.map((l) => l.language.name)
          : p.preferredLanguage
            ? [p.preferredLanguage]
            : [],
      ),
    );
  if (view === "member-interests" || view === "recipient-interests")
    rows = group(
      active
        .filter(
          (p) =>
            p.kind ===
            (view === "member-interests" ? "Member" : "Care Recipient"),
        )
        .flatMap((p) => p.interests.map((i) => i.interest.name)),
    );
  if (view === "grant-status")
    rows = group(
      (
        await db.grantApplication.findMany({
          where: { deletedAt: null, personId: { in: ids }, person: scope },
          select: { status: true },
        })
      ).map((g) => g.status),
    );
  if (view === "birthdays") {
    headers = ["Person", "Birthday", "Days remaining"];
    rows = active
      .filter(
        (p) =>
          p.dob &&
          (f.birthdayMonth === "current"
            ? p.dob.toISOString().slice(5, 7) === today().slice(5, 7)
            : birthday(p.dob, today()).days <= 30),
      )
      .map((p) => {
        const b = birthday(p.dob!, today());
        return {
          id: p.id,
          cells: [{ text: label(p), personId: p.id }, b.date, b.days],
        };
      })
      .sort((a, b) => String(a.cells[1]).localeCompare(String(b.cells[1])));
  }
  if (view === "follow-ups") {
    headers = ["Action", "Person", "Due date"];
    rows = (
      await db.alert.findMany({
        where: {
          AND: [
            alertScope(u),
            {
              status: "Pending",
              OR: [{ personId: { in: ids } }, { personId: null }],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          personId: true,
          dueDate: true,
          snoozedUntil: true,
        },
        orderBy: { dueDate: "asc" },
      })
    ).map((a) => ({
      id: a.id,
      cells: [
        a.title,
        people.find((p) => p.id === a.personId)
          ? {
              text: label(people.find((p) => p.id === a.personId)!),
              personId: a.personId!,
            }
          : "No linked profile",
        (a.snoozedUntil || a.dueDate).toISOString().slice(0, 10),
      ],
    }));
  }
  if (view === "participation") {
    headers = ["Person", "Programme", "Status"];
    rows = people.flatMap((p) =>
      p.participations.map((x) => ({
        id: x.id,
        cells: [{ text: label(p), personId: p.id }, x.programme.name, x.status],
      })),
    );
  }
  const total = rows.length,
    size = [20, 50, 100].includes(Number(f.size)) ? Number(f.size) : 20,
    page = Math.max(
      1,
      Math.min(Math.ceil(total / size) || 1, Math.floor(Number(f.page)) || 1),
    );
  return {
    headers,
    rows: rows.slice((page - 1) * size, page * size),
    total,
    page,
    size,
    filters: {
      centre: centres.map((p) => p.centre).filter(Boolean),
      programme: programmes.map((p) => p.name),
      condition: conditions.map((p) => p.name),
    },
  };
}
