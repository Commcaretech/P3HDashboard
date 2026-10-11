"use client";
import { Data, Programme } from "@/lib/types";
import { Table, Badge } from "./ui";
import { useFilters, FilterBar, names } from "./common";
export default function Programmes({
  d,
  write,
  onEdit,
  onArchive,
}: {
  d: Data;
  write: boolean;
  onEdit: (p?: Programme) => void;
  onArchive: (p: Programme) => void;
}) {
  const [f, setF] = useFilters();
  const rows = d.programmes.filter(
    (p) =>
      (!f.q ||
        JSON.stringify([p.name, p.description, p.category, p.notes])
          .toLowerCase()
          .includes(f.q.toLowerCase())) &&
      (!f.centre || p.centre === f.centre) &&
      (!f.category || p.category === f.category) &&
      (!f.language || names(p).languages.includes(f.language)) &&
      (!f.day || p.day === f.day) &&
      (!f.venue || p.venue === f.venue) &&
      (!f.registration || p.registrationStatus === f.registration) &&
      (!f.status ? p.status !== "Archived" : p.status === f.status),
  );
  return (
    <>
      {write && (
        <div className="actions">
          <button onClick={() => onEdit()}>+ Add programme</button>
        </div>
      )}
      <FilterBar
        search={f.q ?? ""}
        values={f}
        onChange={setF}
        options={[
          {
            key: "centre",
            label: "Centre",
            values: d.programmes.map((p) => p.centre),
          },
          {
            key: "category",
            label: "Category",
            values: d.programmes.map((p) => p.category),
          },
          {
            key: "language",
            label: "Language",
            values: d.programmes.flatMap((p) => names(p).languages),
          },
          { key: "day", label: "Day", values: d.programmes.map((p) => p.day) },
          {
            key: "venue",
            label: "Venue",
            values: d.programmes.map((p) => p.venue),
          },
          {
            key: "registration",
            label: "Registration",
            values: ["Open", "Closed", "Waitlist"],
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
          "Programme",
          "Schedule / venue",
          "Languages / suitability",
          "Registration",
          "Status",
          "Actions",
        ]}
        rows={rows.map((p) => ({
          id: p.id,
          sort: p.name,
          cells: [
            <details key="name">
              <summary>{p.name}</summary>
              <p>{p.description}</p>
              <p>
                Category: {p.category || "—"} · Centre: {p.centre || "—"}
              </p>
              <p>Interests: {names(p).interests.join(", ") || "—"}</p>
              <p>
                Capacity: {p.capacity || "Unspecified"} · Enrolled:{" "}
                {
                  p.participations.filter((x) => x.status === "Registered")
                    .length
                }
              </p>
              <p>{p.notes}</p>
            </details>,
            `${p.day} ${p.startTime}–${p.endTime} · ${p.frequency} · ${p.venue}`,
            `${names(p).languages.join(", ")} · ${names(p).conditions.join(", ")} · ${p.mobility}`,
            p.registrationStatus,
            <Badge key="status">{p.status}</Badge>,
            write ? (
              <div className="row-actions" key="actions">
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
              "View only"
            ),
          ],
        }))}
      />
    </>
  );
}
