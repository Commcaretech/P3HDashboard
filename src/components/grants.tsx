"use client";
import { Data, Grant, label, day } from "@/lib/types";
import { Table, Badge, PersonLink } from "./ui";
import { useFilters, FilterBar } from "./common";
export default function Grants({
  d,
  write,
  onEdit,
}: {
  d: Data;
  write: boolean;
  onEdit: (g?: Grant) => void;
}) {
  const [f, setF] = useFilters();
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
      (!f.status || g.status === f.status) &&
      (!f.scheme || g.scheme.name === f.scheme),
  );
  return (
    <>
      {write && (
        <div className="actions">
          <button onClick={() => onEdit()}>+ Add grant / support</button>
        </div>
      )}
      <FilterBar
        search={f.q ?? ""}
        values={f}
        onChange={setF}
        options={[
          {
            key: "status",
            label: "Status",
            values: d.grants.map((g) => g.status),
          },
          {
            key: "scheme",
            label: "Scheme",
            values: d.schemes.map((s) => s.name),
          },
        ]}
      />
      <Table
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
              <p>
                Applied: {day(g.applicationDate)} · Submitted:{" "}
                {day(g.submissionDate)} · Approved: {day(g.approvalDate)}
              </p>
              <p className="preserve">{g.notes}</p>
            </details>,
            <PersonLink key="person" id={g.personId}>
              {label(d.people.find((p) => p.id === g.personId)!)}
            </PersonLink>,
            <Badge key="status">{g.status}</Badge>,
            `${day(g.nextReviewDate)} / ${day(g.expiryDate)}`,
            g.amount === null ? "—" : `S$${g.amount.toFixed(2)}`,
            g.assigned?.name ?? "Unassigned",
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
    </>
  );
}
