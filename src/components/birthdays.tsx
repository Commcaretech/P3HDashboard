"use client";
import { useState } from "react";
import { Staff } from "@/lib/types";
import { PersonLink } from "./ui";
import { useResource } from "./use-resource";
type Result = {
  rows: {
    id: string;
    name: string;
    alias: string;
    memberId: string | null;
    date: string;
    days: number;
    assigned: { name: string } | null;
  }[];
  total: number;
  page: number;
  centres: string[];
};
export default function Birthdays({
  staff,
  revision,
}: {
  staff: Staff[];
  revision?: unknown;
}) {
  const [centre, setCentre] = useState(""),
    [owner, setOwner] = useState(""),
    [page, setPage] = useState(1);
  const query = new URLSearchParams({
    centre,
    assigned: owner,
    page: String(page),
  }).toString();
  const { data, error, reload } = useResource<Result>(
    "birthdays",
    `/api/dashboard/birthdays?${query}`,
    revision,
  );
  return (
    <section className="panel" id="upcoming-birthdays">
      <div className="section-head">
        <h2>Upcoming Caregiver Birthdays</h2>
        <span>Next 30 days / {data?.total ?? 0} caregivers</span>
      </div>
      <div className="filters">
        <label>
          Centre
          <select
            aria-label="Birthday centre"
            value={centre}
            onChange={(e) => {
              setCentre(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All permitted centres</option>
            {data?.centres.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Assigned staff
          <select
            aria-label="Birthday assigned staff"
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All staff</option>
            {staff
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}{" "}
          <button className="secondary" onClick={reload}>
            Retry birthdays
          </button>
        </p>
      )}
      {data?.rows.map((p) => (
        <div className="attention-item" key={p.id}>
          <PersonLink id={p.id}>{p.name || p.alias || p.memberId}</PersonLink>
          <span>
            {p.date.slice(8, 10)}/{p.date.slice(5, 7)} /{" "}
            {p.days === 0 ? "Today" : `${p.days} days remaining`}
          </span>
          <span>{p.assigned?.name || "Unassigned"}</span>
        </div>
      ))}
      {data && !data.rows.length && (
        <p className="empty">
          No upcoming caregiver birthdays for these filters.
        </p>
      )}
      <div className="pagination">
        <span>
          Page {data?.page || 1} of{" "}
          {Math.max(1, Math.ceil((data?.total || 0) / 20))}
        </span>
        <button
          className="secondary"
          disabled={!data || page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous birthdays
        </button>
        <button
          className="secondary"
          disabled={!data || page * 20 >= data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next birthdays
        </button>
      </div>
    </section>
  );
}
