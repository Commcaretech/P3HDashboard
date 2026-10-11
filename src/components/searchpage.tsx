"use client";
import Link from "next/link";
import { Data, label } from "@/lib/types";
import { Table, PersonLink } from "./ui";
import { useFilters, FilterBar, names } from "./common";
export default function SearchPage({ d }: { d: Data }) {
  const [f, setF] = useFilters();
  const q = (f.q ?? "").toLowerCase();
  const people = d.people.filter(
    (p) =>
      q &&
      JSON.stringify([
        p.memberId,
        p.name,
        p.alias,
        p.tags,
        p.remarks,
        ...names(p).conditions,
        ...names(p).languages,
        ...names(p).interests,
      ])
        .toLowerCase()
        .includes(q),
  );
  const programmes = d.programmes.filter(
    (p) =>
      q &&
      JSON.stringify([
        p.name,
        p.description,
        ...names(p).conditions,
        ...names(p).interests,
      ])
        .toLowerCase()
        .includes(q),
  );
  return (
    <>
      <FilterBar search={f.q ?? ""} values={f} onChange={setF} options={[]} />
      <Table
        headers={["Record", "Type", "Centre / venue", "Status"]}
        rows={[
          ...people.map((p) => ({
            id: p.id,
            sort: label(p),
            cells: [
              <PersonLink key="p" id={p.id}>
                {label(p)}
              </PersonLink>,
              p.kind,
              p.centre,
              p.status,
            ],
          })),
          ...programmes.map((p) => ({
            id: p.id,
            sort: p.name,
            cells: [
              <Link
                key="p"
                href={`/programmes?q=${encodeURIComponent(p.name)}`}
              >
                {p.name}
              </Link>,
              "Programme",
              p.venue,
              p.status,
            ],
          })),
        ]}
      />
    </>
  );
}
