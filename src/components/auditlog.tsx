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
        headers={[
          "Action",
          "Entity",
          "Staff",
          "Timestamp",
          "Summary",
          "Changes",
        ]}
        rows={rows.map((a) => ({
          id: a.id,
          sort: String(9999999999999 - Date.parse(a.timestamp)).padStart(
            13,
            "0",
          ),
          cells: [
            a.action,
            `${a.entityType} · ${a.entityId}`,
            a.user.name,
            a.timestamp.replace("T", " ").slice(0, 19),
            a.changes.after && typeof a.changes.after === "object"
              ? Object.keys(a.changes.after)
                  .filter((k) => {
                    const previous =
                      a.changes.before && typeof a.changes.before === "object"
                        ? (a.changes.before as Record<string, unknown>)
                        : {};
                    return (
                      JSON.stringify(previous[k]) !==
                      JSON.stringify(
                        (a.changes.after as Record<string, unknown>)[k],
                      )
                    );
                  })
                  .join(", ") || "No field values changed"
              : a.action,
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
