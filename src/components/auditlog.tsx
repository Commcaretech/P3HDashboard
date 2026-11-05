"use client";
import { useResource } from "./use-resource";
import { Data } from "@/lib/types";
import { Table } from "./ui";
import { useFilters, FilterBar } from "./common";
export default function AuditLog({ d: baseData }: { d: Data }) {
  const [f, setF] = useFilters();
  const {
    data: result,
    error,
    busy,
    reload,
  } = useResource<{
    audit: Data["audit"];
    total: number;
    page: number;
    size: number;
  }>("audit", `/api/audit?${new URLSearchParams(f)}`, baseData);
  const d = { ...baseData, audit: result?.audit ?? [] };
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
        All permitted actions, with server pagination. Original values are
        retained in the database for authorised review.
      </p>
      <FilterBar search={f.q ?? ""} values={f} onChange={setF} options={[]} />
      {error && (
        <p role="alert" className="error">
          {error} <button onClick={reload}>Retry audit</button>
        </p>
      )}
      {busy && (
        <p className="inline-progress" role="status">
          Refreshing audit entries...
        </p>
      )}
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
