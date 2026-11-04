"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { needsReview, nextOccurrence } from "@/lib/programme-source";
import { request } from "./common";
import { Data, Programme, Staff } from "@/lib/types";
import { Table, Badge } from "./ui";
import { useFilters, FilterBar, names } from "./common";
export default function Programmes({
  d,
  write,
  onEdit,
  onArchive,
  user,
  onRefresh,
}: {
  d: Data;
  user: Pick<Staff, "role">;
  onRefresh: () => Promise<void>;
  write: boolean;
  onEdit: (p?: Programme) => void;
  onArchive: (p: Programme) => void;
}) {
  const [f, setF] = useFilters();
  const [info, setInfo] = useState<{
    configuration: string;
    canSync: boolean;
    running: boolean;
    imported: number;
    upcoming: number;
    review: number;
    lastSuccess: string | null;
    history: {
      id: string;
      status: string;
      startedAt: string;
      created: number;
      updated: number;
      unchanged: number;
      skipped: number;
      errors: number;
      errorSummary: string;
    }[];
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    request("/api/programmes/sync")
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch(() => {
        if (active) setMessage("Sync status could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);
  const sync = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await request("/api/programmes/sync", {});
      setMessage(
        `Imported ${result.created}; updated ${result.updated}; unchanged ${result.unchanged}; skipped ${result.skipped}.`,
      );
      await onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed. Please retry.");
    } finally {
      try {
        setInfo(await request("/api/programmes/sync"));
      } catch {}
      inFlight.current = false;
      setBusy(false);
    }
  };
  const rows = d.programmes.filter(
    (p) =>
      (!f.q ||
        JSON.stringify([p.name, p.description, p.category, p.notes])
          .toLowerCase()
          .includes(f.q.toLowerCase())) &&
      (!f.source || (p.external ? "Synced" : "Manual") === f.source) &&
      (!f.review ||
        (needsReview(p) ? "Needs review" : "Reviewed / manual") === f.review) &&
      (!f.sourceStatus || p.external?.sourceStatus === f.sourceStatus) &&
      (!f.dates ||
        (nextOccurrence(p) ? "Upcoming sessions" : "No confirmed dates") ===
          f.dates) &&
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
      <section className="panel" aria-busy={busy}>
        <div className="section-head">
          <h2>Program-SpaceBooking</h2>
          {["Admin", "Manager"].includes(user.role) ? (
            <button
              disabled={
                busy ||
                info?.running ||
                !info?.canSync ||
                info.configuration !== "Configured"
              }
              onClick={() => void sync()}
            >
              {busy && (
                <LoaderCircle
                  size={16}
                  className="sync-spinner"
                  aria-hidden="true"
                />
              )}
              {busy ? "Syncing programmes..." : "Sync Now"}
            </button>
          ) : (
            <span>View only</span>
          )}
        </div>
        <p>{info?.configuration ?? "Checking configuration..."}</p>
        {info?.running && !busy && (
          <button
            className="secondary"
            onClick={() =>
              void request("/api/programmes/sync")
                .then(setInfo)
                .catch(() => setMessage("Sync status could not be loaded."))
            }
          >
            Refresh sync status
          </button>
        )}
        {info && (
          <>
            <p>
              Last successful sync:{" "}
              {info.lastSuccess
                ? new Date(info.lastSuccess).toLocaleString()
                : "Never"}{" "}
              | Last outcome: {info.history[0]?.status ?? "No runs"}
            </p>
            <p>
              {info.imported} imported programmes | {info.upcoming} upcoming
              sessions | {info.review} requiring review
            </p>
            <details>
              <summary>Recent sync history</summary>
              {info.history.map((r) => (
                <p key={r.id}>
                  {new Date(r.startedAt).toLocaleString()} | {r.status} |
                  Imported {r.created}, updated {r.updated}, unchanged{" "}
                  {r.unchanged}, skipped {r.skipped}, errors {r.errors}
                  {r.errorSummary ? ` | ${r.errorSummary}` : ""}
                </p>
              ))}
            </details>
          </>
        )}
        <p role="status" aria-live="polite">
          {message}
        </p>
      </section>
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
          { key: "source", label: "Source", values: ["Manual", "Synced"] },
          {
            key: "review",
            label: "Suitability review",
            values: ["Needs review", "Reviewed / manual"],
          },
          {
            key: "sourceStatus",
            label: "Source status",
            values: d.programmes.flatMap((p) =>
              p.external ? [p.external.sourceStatus] : [],
            ),
          },
          {
            key: "dates",
            label: "Dates",
            values: ["Upcoming sessions", "No confirmed dates"],
          },
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
            values: ["Open", "Closed", "Waitlist", "Unverified"],
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
              <summary>
                <span>{p.name}</span>{" "}
                <Badge>{p.external ? "Program-SpaceBooking" : "Manual"}</Badge>
              </summary>
              {p.external && (
                <p>
                  {needsReview(p)
                    ? "Suitability review required"
                    : "Suitability reviewed"}{" "}
                  |{" "}
                  {p.external.missing
                    ? "Missing from source - review"
                    : p.external.sourceStatus}
                </p>
              )}
              {p.external && (
                <p>
                  Source name, centre and schedule are maintained by
                  Program-SpaceBooking. Edit local suitability and availability
                  below.
                </p>
              )}
              {p.external && (
                <ul>
                  {p.external.occurrences.map((o) => (
                    <li key={o.id}>
                      {o.date || "Date unconfirmed"} {o.startTime}-{o.endTime} |{" "}
                      {o.venue} | {o.missing ? "Missing - review" : o.status}
                    </li>
                  ))}
                </ul>
              )}
              <p>{p.description}</p>
              <p>
                Category: {p.category || "—"} · Centre: {p.centre || "—"}
              </p>
              <p>Interests: {names(p).interests.join(", ") || "—"}</p>
              <p>
                Capacity: {p.capacity || "Unspecified"} · Enrolled:{" "}
                {p.registeredCount ??
                  p.participations.filter((x) => x.status === "Registered")
                    .length}
              </p>
              <p>{p.notes}</p>
            </details>,
            p.external
              ? nextOccurrence(p)
                ? `${nextOccurrence(p)!.date} ${nextOccurrence(p)!.startTime}-${nextOccurrence(p)!.endTime} | ${nextOccurrence(p)!.venue}`
                : "No confirmed upcoming dates"
              : `${p.day} ${p.startTime}–${p.endTime} · ${p.frequency} · ${p.venue}`,
            `${names(p).languages.join(", ")} · ${names(p).conditions.join(", ")} · ${p.mobility}`,
            <Badge key="registration">
              {p.capacity > 0 &&
              (p.registeredCount ??
                p.participations.filter((x) => x.status === "Registered")
                  .length) >= p.capacity
                ? "Full"
                : p.registrationStatus}
            </Badge>,
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
