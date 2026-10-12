"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Data, label, day } from "@/lib/types";
import { birthday, today } from "@/lib/domain";
import { Table, PersonLink } from "./ui";
import { count, names } from "./common";
export default function Reports({ d }: { d: Data }) {
  const params = useSearchParams();
  const [view, setView] = useState(params.get("view") ?? "caseload");
  const active = d.people.filter((p) => p.status === "Active");
  let headers = ["Group", "Count"];
  let records: { id: string; cells: React.ReactNode[]; sort: string }[] = [];
  if (view === "caseload") {
    records = count(
      active.map((p) => `${p.kind} · ${p.centre || "Centre not recorded"}`),
    ).map((r) => ({ id: r.name, sort: r.name, cells: [r.name, r.count] }));
  }
  if (
    [
      "conditions",
      "languages",
      "member-interests",
      "recipient-interests",
      "grant-status",
    ].includes(view)
  ) {
    const values =
      view === "conditions"
        ? active
            .filter((p) => p.kind === "Care Recipient")
            .flatMap((p) => names(p).conditions)
        : view === "languages"
          ? active.flatMap((p) => names(p).languages)
          : view === "grant-status"
            ? d.grants.map((g) => g.status)
            : active
                .filter(
                  (p) =>
                    p.kind ===
                    (view === "member-interests" ? "Member" : "Care Recipient"),
                )
                .flatMap((p) => names(p).interests);
    records = count(values).map((r) => ({
      id: r.name,
      sort: r.name,
      cells: [r.name, r.count],
    }));
  }
  if (view === "birthdays") {
    headers = ["Person", "Birthday", "Days remaining"];
    records = active
      .filter((p) => p.dob && birthday(new Date(p.dob), today()).days <= 30)
      .map((p) => {
        const b = birthday(new Date(p.dob!), today());
        return {
          id: p.id,
          sort: b.date,
          cells: [
            <PersonLink key="p" id={p.id}>
              {label(p)}
            </PersonLink>,
            b.date,
            b.days,
          ],
        };
      });
  }
  if (view === "follow-ups") {
    headers = ["Action", "Person", "Due date"];
    records = d.alerts
      .filter((a) => a.status === "Pending")
      .map((a) => ({
        id: a.id,
        sort: a.dueDate,
        cells: [
          a.title,
          a.personId ? label(d.people.find((p) => p.id === a.personId)!) : "—",
          day(a.dueDate),
        ],
      }));
  }
  if (view === "participation") {
    headers = ["Person", "Programme", "Status"];
    records = d.people.flatMap((p) =>
      p.participations.map((x) => ({
        id: x.id,
        sort: x.programme.name,
        cells: [
          <PersonLink key="p" id={p.id}>
            {label(p)}
          </PersonLink>,
          x.programme.name,
          x.status,
        ],
      })),
    );
  }
  return (
    <>
      <section className="panel">
        <label>
          Report
          <select
            aria-label="Report"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            {[
              ["caseload", "P3H caseload"],
              ["conditions", "Care recipients by condition"],
              ["languages", "Language distribution"],
              ["member-interests", "Member interests"],
              ["recipient-interests", "Care recipient interests"],
              ["grant-status", "Grant status"],
              ["birthdays", "Upcoming birthdays"],
              ["follow-ups", "Outstanding follow-ups"],
              ["participation", "Programme participation"],
            ].map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Reports use the application database. Category counts may include a
          person in more than one group.
        </p>
      </section>
      <Table headers={headers} rows={records} />
    </>
  );
}
