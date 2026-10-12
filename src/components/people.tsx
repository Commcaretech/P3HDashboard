"use client";
import { useEffect, useState } from "react";
import { Data, Person, label } from "@/lib/types";
import { Table, Badge, PersonLink, ActionMenu } from "./ui";
import { useFilters, FilterBar, names } from "./common";
export default function People({
  d,
  kind,
  write,
  onEdit,
  onArchive,
}: {
  d: Data;
  kind: string;
  write: boolean;
  onEdit: (p?: Person, kind?: string) => void;
  onArchive: (p: Person) => void;
}) {
  const [f, setF] = useFilters();
  const [result, setResult] = useState<{
      people: (Person & { alerts: Data["alerts"] })[];
      total: number;
      filters: Record<string, string[]>;
    }>({ people: [], total: 0, filters: {} }),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const query = new URLSearchParams({ ...f, kind }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/people?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error);
        setResult(json);
        setError("");
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setError(e instanceof Error ? e.message : "Unable to load records.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, d]);
  const people = result.people,
    filtered = people;
  const change = (v: Record<string, string>) => setF({ ...v, page: "1" });
  return (
    <>
      <div className="section-head">
        <p>
          {kind === "Member"
            ? "Caregiver and member records"
            : "Separate profiles linked to caregivers"}
        </p>
        {write && (
          <button onClick={() => onEdit(undefined, kind)}>
            + Add {kind.toLowerCase()}
          </button>
        )}
      </div>
      <FilterBar
        search={f.q ?? ""}
        values={f}
        onChange={change}
        options={[
          {
            key: "assigned",
            label: "Assigned staff",
            values: ["Unassigned", ...d.staff.map((s) => s.name)],
          },
          {
            key: "centre",
            label: "Centre",
            values: result.filters.centre ?? [],
          },
          {
            key: "language",
            label: "Language",
            values: result.filters.language ?? [],
          },
          {
            key: "condition",
            label: "Condition",
            values: result.filters.condition ?? [],
          },
          {
            key: "interest",
            label: "Interest",
            values: result.filters.interest ?? [],
          },
          {
            key: "mobility",
            label: "Mobility",
            values: result.filters.mobility ?? [],
          },
          {
            key: "scheme",
            label: "Grant / support scheme",
            values: d.schemes.map((s) => s.name),
          },
          {
            key: "tag",
            label: "Tag",
            values: result.filters.tag ?? [],
          },
          {
            key: "status",
            label: "Status",
            values: ["Active", "Inactive", "Archived"],
          },
        ]}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading records…</p>}
      <Table
        server={{
          sortableColumns: [0, 1, 2, 4, 6, 7],
          total: result.total,
          page: Number(f.page) || 1,
          size: Number(f.size) || 20,
          onPage: (n) => setF({ ...f, page: String(n) }),
          onSize: (n) => setF({ ...f, size: String(n), page: "1" }),
          onSort: (column, direction) =>
            setF({
              ...f,
              page: "1",
              sort:
                [
                  "name",
                  "memberId",
                  "centre",
                  "name",
                  "preferredLanguage",
                  "name",
                  "status",
                  "assigned",
                  "updatedAt",
                ][column] ?? "name",
              direction: direction === 1 ? "asc" : "desc",
            }),
        }}
        headers={[
          "Member / Person",
          "P3H ID",
          "Centre",
          "Care relationship",
          "Preferred language",
          "Conditions",
          "Status",
          "Assigned staff",
          "Next action",
          "Actions",
        ]}
        rows={filtered.map((p) => ({
          id: p.id,
          sort: label(p),
          cells: [
            <PersonLink id={p.id} key="name">
              {label(p)}
              <small>{p.kind === "Member" ? p.memberId : p.alias}</small>
            </PersonLink>,
            p.memberId || "Not applicable",
            p.centre || "—",
            (p.kind === "Member" ? p.caregiverLinks : p.recipientLinks)
              .map((l) => l.relationship)
              .join(", ") || "Not linked",
            p.preferredLanguage ||
              names(p).languages.join(", ") ||
              "Not recorded",
            names(p).conditions.join(", ") || "—",
            <Badge key="status">{p.status}</Badge>,
            p.assigned?.name ?? "Unassigned",
            p.alerts
              .sort((a, b) =>
                (a.snoozedUntil || a.dueDate).localeCompare(
                  b.snoozedUntil || b.dueDate,
                ),
              )
              .slice(0, 1)
              .map((a) => (
                <span key={a.id}>
                  {a.title}
                  <small>{(a.snoozedUntil || a.dueDate).slice(0, 10)}</small>
                </span>
              )),
            write ? (
              <ActionMenu key="actions" label={`Actions for ${label(p)}`}>
                <PersonLink id={p.id}>View profile</PersonLink>
                <button className="secondary" onClick={() => onEdit(p)}>
                  Edit
                </button>
                {p.status !== "Archived" && (
                  <button className="secondary" onClick={() => onArchive(p)}>
                    Archive
                  </button>
                )}
              </ActionMenu>
            ) : (
              <span key="read">View only</span>
            ),
          ],
        }))}
      />
    </>
  );
}
