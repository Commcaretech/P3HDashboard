"use client";
import { useResource } from "./use-resource";
import Link from "next/link";
import { closedGrant } from "@/lib/follow-up";
import { Data, Grant, label, day } from "@/lib/types";
import { Table, Badge, PersonLink } from "./ui";
import { useFilters, FilterBar } from "./common";
import SupportExtraction from "./support-extraction";
export default function Grants({
  d: baseData,
  revision = 0,
  write,
  onEdit,
  onSaved,
}: {
  d: Data;
  revision?: number;
  write: boolean;
  onEdit: (g?: Grant) => void;
  onSaved: () => Promise<void>;
}) {
  const [f, setF] = useFilters();
  const query = new URLSearchParams(f).toString();
  const {
    data: result,
    error,
    busy,
    reload,
  } = useResource<{
    grants: Data["grants"];
    people: Data["people"];
    total: number;
    page: number;
    size: number;
    statuses: string[];
    counts: { active: number; due: number; overdue: number; completed: number };
  }>("grants", `/api/grants?${query}`, revision);
  const d = {
    ...baseData,
    grants: result?.grants ?? [],
    people: result?.people ?? [],
  };
  const rows = d.grants.filter(
    (g) =>
      (!f.q ||
        [
          g.scheme.name,
          label(d.people.find((p) => p.id === g.personId)!),
          g.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(f.q.toLowerCase())) &&
      (!f.open || !closedGrant(g)) &&
      (!f.status || g.status === f.status) &&
      (!f.assigned ||
        (g.assignedId ||
          d.people.find((p) => p.id === g.personId)?.assignedId) ===
          f.assigned ||
        d.staff.find(
          (s) =>
            s.id ===
            (g.assignedId ||
              d.people.find((p) => p.id === g.personId)?.assignedId),
        )?.name === f.assigned) &&
      (!f.scheme || g.scheme.name === f.scheme),
  );
  return (
    <div className="grants-workspace">
      <div className="stat-grid grant-metrics">
        {[
          [
            "Active Applications",
            result?.counts.active ?? 0,
            "/grants?open=true",
          ],
          ["Follow-ups Due", result?.counts.due ?? 0, "/alerts?type=Grant"],
          [
            "Overdue Follow-ups",
            result?.counts.overdue ?? 0,
            "/grants?time=Overdue",
          ],
          ["Completed Applications", result?.counts.completed ?? 0, "/grants"],
        ].map(([name, value, href]) => (
          <Link className="stat" key={name} href={String(href)}>
            <small>{name}</small>
            <strong>{value}</strong>
            <span>View support records</span>
          </Link>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error} <button onClick={reload}>Retry grants</button>
        </p>
      )}
      {busy && (
        <p className="inline-progress" role="status">
          Refreshing grants...
        </p>
      )}
      {write && (
        <div className="actions">
          <button onClick={() => onEdit()}>+ Add grant / support</button>
        </div>
      )}
      {write && <SupportExtraction onSaved={onSaved} />}
      <FilterBar
        search={f.q ?? ""}
        values={f}
        onChange={setF}
        options={[
          {
            key: "assigned",
            label: "Assigned staff",
            values: d.staff.map((s) => s.name),
          },
          {
            key: "status",
            label: "Status",
            values: result?.statuses ?? [],
          },
          {
            key: "scheme",
            label: "Scheme",
            values: d.schemes.map((s) => s.name),
          },
        ]}
      />
      <Table
        server={{
          total: result?.total ?? 0,
          page: result?.page ?? 1,
          size: result?.size ?? 20,
          onPage: (n) => setF({ ...f, page: String(n) }),
          onSize: (n) => setF({ ...f, size: String(n), page: "1" }),
          onSort: () => {},
          sortableColumns: [],
        }}
        headers={[
          "Scheme",
          "Person",
          "Status",
          "Next review / expiry",
          "Amount",
          "Staff",
          "Action",
        ]}
        rows={rows.map((g) => ({
          id: g.id,
          sort: g.scheme.name,
          cells: [
            <details key="details">
              <summary>{g.scheme.name}</summary>
              <ol className="timeline">
                {[
                  ["Applied", g.applicationDate],
                  ["Submitted", g.submissionDate],
                  ["Approved", g.approvalDate],
                  ["Next review", g.nextReviewDate],
                  ["Expiry", g.expiryDate],
                ]
                  .filter(([, date]) => date)
                  .map(([name, date]) => (
                    <li key={name}>
                      <strong>{name}</strong>
                      <span>{day(date)}</span>
                    </li>
                  ))}
                <li>
                  <strong>Current Status</strong>
                  <Badge>{g.status}</Badge>
                </li>
              </ol>
              <p className="preserve">{g.notes}</p>
              <p>
                {g.resolvedAt
                  ? `Resolved ${day(g.resolvedAt)}`
                  : "Open follow-up workflow"}
              </p>
              {g.followUps?.map((h) => (
                <div key={h.id}>
                  <strong>
                    {day(h.completedAt)} ? {h.outcome}
                  </strong>
                  <p>
                    Completed by{" "}
                    {d.staff.find((s) => s.id === h.completedBy)?.name ??
                      "Staff"}
                    {h.resolved ? " ? Resolved" : ""}
                  </p>
                  <p className="preserve">{h.notes}</p>
                  {h.nextDate && (
                    <small>Next follow-up: {day(h.nextDate)}</small>
                  )}
                </div>
              ))}
            </details>,
            <PersonLink key="person" id={g.personId}>
              {label(d.people.find((p) => p.id === g.personId)!)}
            </PersonLink>,
            <Badge key="status">{g.status}</Badge>,
            `${day(g.nextReviewDate)} / ${day(g.expiryDate)}`,
            g.amount === null ? "—" : `S$${g.amount.toFixed(2)}`,
            g.assigned?.name ??
              d.people.find((p) => p.id === g.personId)?.assigned?.name ??
              "Unassigned",
            write ? (
              <button
                key="edit"
                className="secondary"
                onClick={() => onEdit(g)}
              >
                Edit
              </button>
            ) : (
              "View only"
            ),
          ],
        }))}
      />
    </div>
  );
}
