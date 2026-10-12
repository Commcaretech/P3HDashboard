"use client";
import { Data, Grant, label, day } from "@/lib/types";
import { Table, Badge, PersonLink } from "./ui";
import { useFilters, FilterBar } from "./common";
import SupportExtraction from "./support-extraction";
export default function Grants({
  d,
  write,
  onEdit,
  onSaved,
}: {
  d: Data;
  write: boolean;
  onEdit: (g?: Grant) => void;
  onSaved: () => Promise<void>;
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
      (!f.assigned ||
        g.assignedId === f.assigned ||
        d.staff.find((s) => s.id === g.assignedId)?.name === f.assigned) &&
      (!f.scheme || g.scheme.name === f.scheme),
  );
  return (
    <>
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
