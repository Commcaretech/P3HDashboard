"use client";
import Link from "next/link";
import { Data } from "@/lib/types";
import { Table } from "./ui";
import { useFilters, FilterBar } from "./common";
import { useResource } from "./use-resource";
export default function SearchPage({ d }: { d: Data }) {
  const [f, setF] = useFilters();
  const { data, error, busy, reload } = useResource<{
    results: {
      id: string;
      title: string;
      detail: string;
      group: string;
      href: string;
    }[];
    total: number;
    page: number;
    size: number;
  }>("search", `/api/search?${new URLSearchParams({ ...f, full: "1" })}`, d);
  return (
    <>
      <FilterBar
        search={f.q || ""}
        values={f}
        onChange={(v) => setF({ ...v, page: "1" })}
        options={[]}
      />
      <p>
        Search permitted caregivers, care recipients and programmes directly.
        Enter at least two characters.
      </p>
      {busy && (
        <p className="inline-progress" role="status">
          Searching records...
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error} <button onClick={reload}>Retry search</button>
        </p>
      )}
      <Table
        headers={["Record", "Type", "Centre / identifier"]}
        server={{
          total: data?.total || 0,
          page: data?.page || 1,
          size: data?.size || 20,
          onPage: (n) => setF({ ...f, page: String(n) }),
          onSize: (n) => setF({ ...f, size: String(n), page: "1" }),
          onSort: () => {},
          sortableColumns: [],
        }}
        rows={(data?.results || []).map((r) => ({
          id: r.id,
          cells: [
            <Link key="name" href={r.href}>
              {r.title}
            </Link>,
            r.group,
            r.detail,
          ],
        }))}
      />
    </>
  );
}
