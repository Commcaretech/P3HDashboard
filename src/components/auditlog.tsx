"use client";
import { Data } from "@/lib/types";
import { Table } from "./ui";
import { useFilters, FilterBar } from "./common";
export default function AuditLog({ d }: { d: Data }) {
  const [f, setF] = useFilters();
  const rows = d.audit.filter(
    (a) =>
      !f.q ||
      [a.action, a.entityType, a.user.name]
        .join(" ")
        .toLowerCase()
        .includes(f.q.toLowerCase()),
  );
  return (
    <>
      <p>
        Latest 500 actions. Original values are retained in the database for
        authorised review.
      </p>
      <FilterBar search={f.q ?? ""} values={f} onChange={setF} options={[]} />
      <Table
        headers={["Action", "Entity", "Staff", "Timestamp", "Changes"]}
        rows={rows.map((a) => ({
          id: a.id,
          sort: a.timestamp,
          cells: [
            a.action,
            `${a.entityType} · ${a.entityId}`,
            a.user.name,
            a.timestamp.replace("T", " ").slice(0, 19),
            <details key="changes">
              <summary>Review changed values</summary>
              <pre>{JSON.stringify(a.changes, null, 2)}</pre>
            </details>,
          ],
        }))}
      />
    </>
  );
}
