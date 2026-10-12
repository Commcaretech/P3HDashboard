"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Person, Programme } from "@/lib/types";
import { Field } from "./ui";
export type Editing = {
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  action: string;
  id?: string;
  version?: string;
  extra?: Record<string, unknown>;
  confirm?: boolean;
};
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const j = await r.json();
  if (!r.ok) throw new RequestError(j.error ?? "Unable to load", r.status);
  return j;
}
export const names = (p: Person | Programme) => ({
  languages: p.languages.map((x) => x.language.name),
  interests: p.interests.map((x) => x.interest.name),
  conditions: p.conditions.map((x) => x.condition.name),
  mobility: p.mobility,
});
export function count(values: string[]) {
  const map = new Map<string, number>();
  for (const v of values.filter(Boolean)) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
export type Filters = Record<string, string>;
export function FilterBar({
  search,
  values,
  onChange,
  options,
}: {
  search: string;
  values: Filters;
  onChange: (v: Filters) => void;
  options: { key: string; label: string; values: string[] }[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <form className="filters" onSubmit={(e) => e.preventDefault()}>
      <label className="filter-search">
        Search
        <input
          aria-label="Search records"
          value={search}
          onChange={(e) => onChange({ ...values, q: e.target.value })}
          placeholder="ID, name, notes or category"
        />
      </label>
      <button
        className="secondary"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Filters
      </button>
      <div className="filter-options" hidden={!expanded}>
        {options.map((o) => (
          <label key={o.key}>
            {o.label}
            <select
              aria-label={o.label}
              value={values[o.key] ?? ""}
              onChange={(e) => onChange({ ...values, [o.key]: e.target.value })}
            >
              <option value="">All</option>
              {[...new Set(o.values.filter(Boolean))].sort().map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="chips">
        {options
          .filter((o) => values[o.key])
          .map((o) => (
            <button
              key={o.key}
              type="button"
              className="filter-chip"
              aria-label={`Remove ${o.label} filter`}
              onClick={() => onChange({ ...values, [o.key]: "" })}
            >
              {o.label}: {values[o.key]} ×
            </button>
          ))}
      </div>
      <button className="secondary" type="button" onClick={() => onChange({})}>
        Clear Filters
      </button>
    </form>
  );
}
export function useFilters() {
  const params = useSearchParams(),
    router = useRouter();
  const f = Object.fromEntries(params.entries());
  return [
    f,
    (v: Filters) =>
      router.replace(
        `?${new URLSearchParams(Object.entries(v).filter(([, v]) => v))}`,
        { scroll: false },
      ),
  ] as const;
}
