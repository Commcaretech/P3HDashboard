"use client";
import { useState } from "react";
import Link from "next/link";
import { Data, Alert, label, day } from "@/lib/types";
import { Table, PersonLink, Badge } from "./ui";
import { useFilters } from "./common";
import { useResource } from "./use-resource";
import { FollowUpDialog } from "./follow-up-dialog";
import { alertDue, alertGroup } from "@/lib/workflow";
export default function MyWork({
  d,
  userId,
  manager,
  write,
  action,
}: {
  d: Data;
  userId: string;
  manager: boolean;
  write: boolean;
  action: (a: string, v: Record<string, unknown>, id?: string) => Promise<void>;
}) {
  const [f, setF] = useFilters(),
    [followUp, setFollowUp] = useState<Alert | null>(null);
  const {
    data: result,
    error,
    busy,
    reload,
  } = useResource<{
    alerts: Data["alerts"];
    people: Data["people"];
    grants: Data["grants"];
    total: number;
    page: number;
    size: number;
    counts: Record<string, number>;
  }>("my-work", `/api/tasks?${new URLSearchParams(f)}`, d);
  const summary = d.myWorkSummary,
    context = {
      ...d,
      people: [...d.people, ...(result?.people || [])],
      grants: result?.grants || [],
      alerts: result?.alerts || [],
    };
  return (
    <>
      <div className="stat-grid">
        {[
          ["My Cases", summary?.cases ?? 0, `/members?assigned=${userId}`],
          ["Tasks Due Today", result?.counts.Today ?? 0, "/my-work?time=Today"],
          [
            "Overdue Items",
            result?.counts.Overdue ?? 0,
            "/my-work?time=Overdue",
          ],
          [
            "Unassigned Cases",
            summary?.unassigned ?? 0,
            "/members?assigned=Unassigned",
          ],
        ].map(([name, count, href]) => (
          <Link className="stat" key={name} href={String(href)}>
            <small>{name}</small>
            <strong>{count}</strong>
            <span>View records</span>
          </Link>
        ))}
      </div>
      <div className="review-views" aria-label="Task periods">
        {["All tasks", "Overdue", "Today", "Upcoming", "Completed"].map(
          (time) => (
            <button
              key={time}
              className={
                (f.time || "All tasks") === time ? "selected" : "secondary"
              }
              aria-pressed={(f.time || "All tasks") === time}
              onClick={() =>
                setF({
                  ...f,
                  time: time === "All tasks" ? "" : time,
                  page: "1",
                })
              }
            >
              {time}
              {time !== "All tasks" ? ` (${result?.counts[time] || 0})` : ""}
            </button>
          ),
        )}
      </div>
      <h2>My follow-ups</h2>
      {error && (
        <p role="alert" className="error">
          {error} <button onClick={reload}>Retry tasks</button>
        </p>
      )}
      {busy && (
        <p className="inline-progress" role="status">
          Refreshing tasks...
        </p>
      )}
      <Table
        headers={[
          "Action",
          "Person",
          "Due",
          "Assigned staff",
          "Status",
          "Complete",
        ]}
        server={{
          total: result?.total || 0,
          page: result?.page || 1,
          size: result?.size || 20,
          onPage: (n) => setF({ ...f, page: String(n) }),
          onSize: (n) => setF({ ...f, size: String(n), page: "1" }),
          onSort: () => {},
          sortableColumns: [],
        }}
        rows={(result?.alerts || []).map((a) => ({
          id: a.id,
          cells: [
            <Link
              key="action"
              href={`/alerts?q=${encodeURIComponent(a.title)}`}
            >
              {a.title}
            </Link>,
            a.personId ? (
              <PersonLink key="person" id={a.personId}>
                {label(context.people.find((p) => p.id === a.personId)!)}
              </PersonLink>
            ) : (
              "No linked profile"
            ),
            day(alertDue(a)),
            a.assigned?.name || "Unassigned",
            <Badge key="status">
              {a.status === "Pending" ? alertGroup(a) : a.status}
            </Badge>,
            write &&
            a.status === "Pending" &&
            a.grantId &&
            a.type === "Grant review" ? (
              <button
                key="complete"
                className="secondary"
                onClick={() => setFollowUp(a)}
              >
                Mark Follow-up Done
              </button>
            ) : (
              "View only"
            ),
          ],
        }))}
      />
      {followUp && (
        <FollowUpDialog
          alert={followUp}
          d={context}
          action={action}
          onClose={() => setFollowUp(null)}
        />
      )}
      <div className="section-head">
        <h2>Recently updated cases</h2>
        <Link href={`/members?assigned=${userId}`}>View all my cases</Link>
      </div>
      <Table
        headers={["Person", "Centre", "Updated"]}
        rows={d.people.map((p) => ({
          id: p.id,
          sort: String(9999999999999 - Date.parse(p.updatedAt)),
          cells: [
            <PersonLink key="person" id={p.id}>
              {label(p)}
            </PersonLink>,
            p.centre,
            day(p.updatedAt),
          ],
        }))}
      />
      {manager && (
        <details className="panel">
          <summary>Staff workload</summary>
          <Table
            headers={[
              "Staff",
              "Active cases",
              "Pending alerts",
              "Grant follow-ups",
            ]}
            rows={(summary?.workload || []).map((s) => ({
              id: s.id,
              cells: [s.name, s.cases, s.alerts, s.grants],
            }))}
          />
        </details>
      )}
      <div className="actions">
        <Link href={`/grants?assigned=${userId}`}>
          {summary?.grantFollowups || 0} assigned grant follow-ups
        </Link>
        <Link href={`/reports?view=birthdays&assigned=${userId}`}>
          {summary?.birthdays || 0} upcoming caregiver birthdays
        </Link>
      </div>
    </>
  );
}
