"use client";
import Link from "next/link";
import { Data, label, day } from "@/lib/types";
import { alertDue, alertGroup } from "@/lib/workflow";
import { birthday, today } from "@/lib/domain";
import { Table, PersonLink } from "./ui";
export default function MyWork({
  d,
  userId,
  manager,
}: {
  d: Data;
  userId: string;
  manager: boolean;
}) {
  const cases = d.people.filter(
    (p) => p.assignedId === userId && p.status === "Active",
  );
  const ids = new Set(cases.map((p) => p.id));
  const alerts = d.alerts.filter(
    (a) =>
      a.status === "Pending" &&
      (a.assignedId === userId ||
        (!a.assignedId && a.personId && ids.has(a.personId))),
  );
  return (
    <>
      <div className="stat-grid">
        {[
          ["My Cases", cases.length, "/members?assigned=" + userId],
          [
            "Alerts Due Today",
            alerts.filter((a) => alertGroup(a) === "Today").length,
            "/alerts?view=my&time=Today",
          ],
          [
            "Overdue Items",
            alerts.filter((a) => alertGroup(a) === "Overdue").length,
            "/alerts?view=my&time=Overdue",
          ],
          [
            "Unassigned Cases",
            d.people.filter(
              (p) =>
                p.kind === "Member" && p.status === "Active" && !p.assignedId,
            ).length,
            "/members?assigned=Unassigned",
          ],
        ].map(([name, n, href]) => (
          <Link className="stat" key={name} href={String(href)}>
            <small>{name}</small>
            <strong>{n}</strong>
            <span>View records →</span>
          </Link>
        ))}
      </div>
      <div className="stat-grid">
        <Link className="stat" href={`/grants?assigned=${userId}`}>
          <small>My grant follow-ups</small>
          <strong>
            {
              d.grants.filter(
                (g) =>
                  g.assignedId === userId &&
                  g.nextReviewDate &&
                  !["Rejected", "Expired", "Completed"].includes(g.status),
              ).length
            }
          </strong>
          <span>View assigned support records</span>
        </Link>
        <Link
          className="stat"
          href={`/reports?view=birthdays&assigned=${userId}`}
        >
          <small>Upcoming birthdays in my cases</small>
          <strong>
            {
              cases.filter(
                (p) => p.dob && birthday(new Date(p.dob), today()).days <= 30,
              ).length
            }
          </strong>
          <span>Next 30 days</span>
        </Link>
      </div>
      <h2>My follow-ups</h2>
      <Table
        headers={["Action", "Person", "Due", "Priority"]}
        rows={alerts.map((a) => ({
          id: a.id,
          sort: alertDue(a),
          cells: [
            <Link key="a" href="/alerts?view=my">
              {a.title}
            </Link>,
            a.personId ? (
              <PersonLink key="p" id={a.personId}>
                {label(d.people.find((p) => p.id === a.personId)!)}
              </PersonLink>
            ) : (
              "—"
            ),
            day(alertDue(a)),
            a.priority,
          ],
        }))}
      />
      <h2>Recently updated cases</h2>
      <Table
        headers={["Person", "Centre", "Updated", "Upcoming birthday"]}
        rows={cases.map((p) => ({
          id: p.id,
          sort: String(9999999999999 - Date.parse(p.updatedAt)).padStart(
            13,
            "0",
          ),
          cells: [
            <PersonLink key="p" id={p.id}>
              {label(p)}
            </PersonLink>,
            p.centre,
            day(p.updatedAt),
            p.dob && birthday(new Date(p.dob), today()).days <= 30
              ? birthday(new Date(p.dob), today()).date
              : "—",
          ],
        }))}
      />
      {manager && (
        <>
          <h2>Staff workload</h2>
          <Table
            headers={[
              "Staff",
              "Active cases",
              "Pending alerts",
              "Grant follow-ups",
            ]}
            rows={d.staff
              .filter((s) => s.active)
              .map((s) => ({
                id: s.id,
                sort: s.name,
                cells: [
                  s.name,
                  d.people.filter(
                    (p) => p.status === "Active" && p.assignedId === s.id,
                  ).length,
                  d.alerts.filter(
                    (a) => a.status === "Pending" && a.assignedId === s.id,
                  ).length,
                  d.grants.filter(
                    (g) => g.assignedId === s.id && g.nextReviewDate,
                  ).length,
                ],
              }))}
          />
        </>
      )}
    </>
  );
}
