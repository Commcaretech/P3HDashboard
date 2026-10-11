"use client";
import { Data, Person, label } from "@/lib/types";
import { Table, Badge, PersonLink } from "./ui";
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
  const people = d.people.filter((p) => p.kind === kind);
  const filtered = people.filter((p) => {
    const grantNames = d.grants
      .filter((g) => g.personId === p.id)
      .map((g) => g.scheme.name);
    return (
      (!f.q ||
        JSON.stringify([
          label(p),
          p.memberId,
          p.remarks,
          p.tags,
          ...names(p).conditions,
        ])
          .toLowerCase()
          .includes(f.q.toLowerCase())) &&
      (!f.centre || p.centre === f.centre) &&
      (!f.status ? p.status !== "Archived" : p.status === f.status) &&
      (!f.language ||
        p.languages.some((x) => x.language.name === f.language)) &&
      (!f.condition ||
        p.conditions.some((x) => x.condition.name === f.condition)) &&
      (!f.interest ||
        p.interests.some((x) => x.interest.name === f.interest)) &&
      (!f.mobility || p.mobility === f.mobility) &&
      (!f.tag || p.tags.toLowerCase().includes(f.tag.toLowerCase())) &&
      (!f.scheme || grantNames.includes(f.scheme))
    );
  });
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
        onChange={setF}
        options={[
          {
            key: "centre",
            label: "Centre",
            values: people.map((p) => p.centre),
          },
          {
            key: "language",
            label: "Language",
            values: people.flatMap((p) => names(p).languages),
          },
          {
            key: "condition",
            label: "Condition",
            values: people.flatMap((p) => names(p).conditions),
          },
          {
            key: "interest",
            label: "Interest",
            values: people.flatMap((p) => names(p).interests),
          },
          {
            key: "mobility",
            label: "Mobility",
            values: people.map((p) => p.mobility),
          },
          {
            key: "scheme",
            label: "Grant / support scheme",
            values: d.schemes.map((s) => s.name),
          },
          {
            key: "tag",
            label: "Tag",
            values: people.flatMap((p) =>
              p.tags.split(/[,;\n]/).map((s) => s.trim()),
            ),
          },
          {
            key: "status",
            label: "Status",
            values: ["Active", "Inactive", "Archived"],
          },
        ]}
      />
      <Table
        headers={[
          "Member / Person",
          "Centre",
          "Languages",
          "Conditions",
          "Status",
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
            p.centre || "—",
            names(p).languages.join(", ") || "—",
            names(p).conditions.join(", ") || "—",
            <Badge key="status">{p.status}</Badge>,
            write ? (
              <div key="actions" className="row-actions">
                <button className="secondary" onClick={() => onEdit(p)}>
                  Edit
                </button>
                {p.status !== "Archived" && (
                  <button className="secondary" onClick={() => onArchive(p)}>
                    Archive
                  </button>
                )}
              </div>
            ) : (
              <span key="read">View only</span>
            ),
          ],
        }))}
      />
    </>
  );
}
