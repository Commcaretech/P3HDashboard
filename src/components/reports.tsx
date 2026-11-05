"use client";
import { Data } from "@/lib/types";
import { Table, PersonLink } from "./ui";
import { useFilters, FilterBar } from "./common";
import { useResource } from "./use-resource";
import type { ReportCell } from "@/lib/report-data";
export default function Reports({ d }: { d: Data }) {
  const [f, setF] = useFilters(),
    view = f.view || "caseload";
  const { data, error, busy, reload } = useResource<{
    headers: string[];
    rows: { id: string; cells: ReportCell[] }[];
    total: number;
    page: number;
    size: number;
    filters: Record<string, string[]>;
  }>("reports", `/api/reports?${new URLSearchParams(f)}`, d);
  return (
    <>
      <section className="panel">
        <label>
          Report
          <select
            aria-label="Report"
            value={view}
            onChange={(e) => setF({ ...f, view: e.target.value, page: "1" })}
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
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Operational summaries from permitted records. People may belong to
          more than one category.
        </p>
      </section>
      <FilterBar
        search={f.q || ""}
        values={f}
        onChange={(v) => setF({ ...v, page: "1" })}
        options={[
          {
            key: "centre",
            label: "Centre",
            values: data?.filters.centre || [],
          },
          {
            key: "programme",
            label: "Programme",
            values: data?.filters.programme || [],
          },
          {
            key: "condition",
            label: "Condition",
            values: data?.filters.condition || [],
          },
          {
            key: "assigned",
            label: "Assigned staff",
            values: d.staff.map((s) => s.name),
          },
        ]}
      />
      <div className="actions">
        <label>
          Recorded from
          <input
            aria-label="Report from date"
            type="date"
            value={f.from || ""}
            onChange={(e) => setF({ ...f, from: e.target.value, page: "1" })}
          />
        </label>
        <label>
          Recorded through
          <input
            aria-label="Report to date"
            type="date"
            value={f.to || ""}
            onChange={(e) => setF({ ...f, to: e.target.value, page: "1" })}
          />
        </label>
      </div>
      <p className="muted">
        Dates refer to when profiles were recorded. No full caregiver dataset is
        sent to this report page.
      </p>
      {error && (
        <p role="alert" className="error">
          {error} <button onClick={reload}>Retry report</button>
        </p>
      )}
      {busy && (
        <p className="inline-progress" role="status">
          Preparing report summary...
        </p>
      )}
      <Table
        headers={data?.headers || ["Group", "Count"]}
        server={{
          total: data?.total || 0,
          page: data?.page || 1,
          size: data?.size || 20,
          onPage: (n) => setF({ ...f, page: String(n) }),
          onSize: (n) => setF({ ...f, size: String(n), page: "1" }),
          onSort: () => {},
          sortableColumns: [],
        }}
        rows={(data?.rows || []).map((r) => ({
          ...r,
          cells: r.cells.map((cell, i) =>
            typeof cell === "object" ? (
              <PersonLink key={i} id={cell.personId}>
                {cell.text}
              </PersonLink>
            ) : (
              cell
            ),
          ),
        }))}
      />
    </>
  );
}
