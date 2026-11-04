"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LoaderCircle,
  RefreshCw,
  ClipboardCheck,
  CalendarDays,
  AlertCircle,
  Layers,
} from "lucide-react";
import { Programme, Data, Staff } from "@/lib/types";
import {
  catalogueCounts,
  reviewStatus,
  reviewStatuses,
  nextOccurrence,
  eligibilityLabels,
  sourceStates,
  suitabilityIssues,
} from "@/lib/programme-source";
import { request, useFilters } from "./common";
import { Table, Badge, ActionMenu } from "./ui";
import ProgrammeReview, {
  ProgrammeSessions,
  Vocabulary,
} from "./programme-review";
type Counts = ReturnType<typeof catalogueCounts>;
type Catalogue = {
  rows: Programme[];
  total: number;
  page: number;
  size: number;
  counts: Counts;
  centres: {
    id: string;
    label: string;
    allowed: boolean;
    counts: Counts | null;
  }[];
  categories: string[];
  vocabulary: Vocabulary;
};
type SyncInfo = {
  configuration: string;
  canSync: boolean;
  running: boolean;
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
    diagnostics?: {
      excludedByReason: Record<string, number>;
      schedulingReviewCount: number;
    } | null;
  }[];
};
export default function Programmes({
  d,
  write,
  onEdit,
  onArchive,
  user,
  onRefresh,
}: {
  d: Data;
  write: boolean;
  user: Pick<Staff, "role">;
  onRefresh: () => Promise<void>;
  onEdit: (p?: Programme) => void;
  onArchive: (p: Programme) => void;
}) {
  const [f, setF] = useFilters(),
    [result, setResult] = useState<{ key: string; data: Catalogue } | null>(
      null,
    ),
    [info, setInfo] = useState<SyncInfo | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState<Programme | null>(null),
    [revision, setRevision] = useState(0),
    [expanded, setExpanded] = useState(false);
  const inFlight = useRef(false),
    query = new URLSearchParams(f).toString();
  useEffect(() => {
    let active = true;
    request(`/api/programmes/catalogue?${query}`)
      .then((data) => {
        if (active) {
          setResult({ key: query, data });
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Unable to load programmes",
          );
          setResult(null);
        }
      });
    return () => {
      active = false;
    };
  }, [query, d, revision]);
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
  }, [revision, d]);
  const refresh = async () => {
    await onRefresh();
    setRevision((v) => v + 1);
  };
  const sync = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await request("/api/programmes/sync", {});
      setMessage(
        `Imported ${r.created}; updated ${r.updated}; unchanged ${r.unchanged}; skipped ${r.skipped}.`,
      );
      await refresh();
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
  const catalog = result?.data,
    current = result?.key === query,
    rows = current ? (catalog?.rows ?? []) : [],
    counts = current ? catalog?.counts : undefined,
    latest = info?.history[0];
  const change = (key: string, value: string) =>
    setF({ ...f, [key]: value, page: "1" });
  const filter = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={f[key] || ""}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const options = (values: string[]) =>
    values.map((value) => ({ value, label: value }));
  return (
    <div className="programme-catalogue">
      <section className="panel catalogue-integration" aria-busy={busy}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Programme integration</p>
            <h2>Program-SpaceBooking</h2>
            <p className="muted">
              {info?.configuration || "Checking connection configuration..."}
            </p>
          </div>
          <div className="row-actions">
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
                {busy ? (
                  <LoaderCircle
                    size={16}
                    className="sync-spinner"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw size={16} aria-hidden="true" />
                )}
                {busy ? "Syncing programmes..." : "Sync Now"}
              </button>
            ) : (
              <span>Sync: view only</span>
            )}
            {info?.running && !busy && (
              <button
                className="secondary"
                onClick={() =>
                  void request("/api/programmes/sync").then(setInfo)
                }
              >
                Refresh sync status
              </button>
            )}
          </div>
        </div>
        <div className="sync-meta">
          <span>
            Last successful sync:{" "}
            <strong>
              {info?.lastSuccess
                ? new Date(info.lastSuccess).toLocaleString("en-SG", {
                    timeZone: "Asia/Singapore",
                  })
                : "Never"}
            </strong>
          </span>
          <span>
            Last result: <strong>{latest?.status || "No runs"}</strong>
          </span>
        </div>
        <div className="catalogue-metrics">
          <div className="catalogue-metric">
            <Layers size={18} />
            <strong>{counts?.imported ?? 0}</strong>
            <span>Imported programmes</span>
          </div>
          <div className="catalogue-metric">
            <CalendarDays size={18} />
            <strong>{counts?.upcoming ?? 0}</strong>
            <span>Upcoming confirmed sessions</span>
          </div>
          <button
            className={`catalogue-metric metric-action ${f.review === "Pending Review" ? "selected" : ""}`}
            onClick={() => change("review", "Pending Review")}
            aria-label={`Pending Reviews: ${counts?.pending ?? 0}`}
          >
            <ClipboardCheck size={18} />
            <strong>{counts?.pending ?? 0}</strong>
            <span>Pending Reviews</span>
            <small>Open review queue</small>
          </button>
          <button
            className={`catalogue-metric metric-action ${f.concerns ? "selected" : ""}`}
            onClick={() => change("concerns", f.concerns ? "" : "1")}
          >
            <AlertCircle size={18} />
            <strong>{counts?.concerns ?? 0}</strong>
            <span>Scheduling concerns</span>
            <small>View flagged programmes</small>
          </button>
        </div>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {info && (
          <details className="sync-history">
            <summary>Recent sync results</summary>
            {info.history.map((r) => (
              <p key={r.id}>
                {new Date(r.startedAt).toLocaleString("en-SG", {
                  timeZone: "Asia/Singapore",
                })}{" "}
                / {r.status}: imported {r.created}, updated {r.updated},
                unchanged {r.unchanged}, skipped {r.skipped}, errors {r.errors}
                {r.errorSummary ? ` / ${r.errorSummary}` : ""}
                {r.diagnostics && (
                  <span>
                    {" "}
                    Source exclusions:{" "}
                    {Object.entries(r.diagnostics.excludedByReason)
                      .map(
                        ([key, value]) =>
                          `${key.replaceAll("_", " ")} ${value}`,
                      )
                      .join(", ")}
                    ; scheduling flags {r.diagnostics.schedulingReviewCount}.
                    Source-wide totals.
                  </span>
                )}
              </p>
            ))}
          </details>
        )}
      </section>
      <nav
        className="centre-tabs"
        aria-label="Programme centres"
        role="tablist"
      >
        {catalog?.centres.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={(f.centre || "") === c.id}
            aria-label={c.label}
            disabled={!c.allowed}
            className={(f.centre || "") === c.id ? "selected" : "secondary"}
            onClick={() => change("centre", c.id)}
          >
            <strong>{c.label}</strong>
            {c.counts ? (
              <>
                <span>
                  {c.counts.programmes} programmes / {c.counts.upcoming}{" "}
                  sessions
                </span>
                <small>
                  {c.counts.pending + c.counts.inReview + c.counts.recheck}{" "}
                  awaiting review / {c.counts.reviewed} reviewed /{" "}
                  {c.counts.concerns} scheduling concerns
                </small>
              </>
            ) : (
              <span>Restricted centre</span>
            )}
          </button>
        ))}
      </nav>
      <div className="catalogue-toolbar">
        <div>
          <h2>Programme Catalogue</h2>
          <p>
            Source schedules, suitability review and registration availability
            are separate.
          </p>
        </div>
        <div className="row-actions">
          <Link
            className="secondary link-button"
            href={`/matching${f.centre ? `?centre=${encodeURIComponent(f.centre)}` : ""}`}
          >
            Find recommendations
          </Link>
          {write && <button onClick={() => onEdit()}>+ Add programme</button>}
        </div>
      </div>
      <nav className="review-views" aria-label="Programme review queues">
        {["All Programmes", ...reviewStatuses].map((status) => (
          <button
            key={status}
            className={
              (f.review || "All Programmes") === status
                ? "selected"
                : "secondary"
            }
            aria-pressed={(f.review || "All Programmes") === status}
            onClick={() =>
              change("review", status === "All Programmes" ? "" : status)
            }
          >
            {status}
          </button>
        ))}
      </nav>
      <form
        className="catalogue-filters panel"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="catalogue-search">
          <label>
            Search programmes
            <input
              aria-label="Search records"
              placeholder="Programme name, category or notes"
              value={f.q || ""}
              onChange={(e) => change("q", e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            Filters
          </button>
          <button type="button" className="secondary" onClick={() => setF({})}>
            Reset Filters
          </button>
        </div>
        <div className="catalogue-filter-fields" hidden={!expanded}>
          {filter(
            "centre",
            "Centre",
            catalog?.centres
              .filter((c) => c.allowed && c.id)
              .map((c) => ({ value: c.id, label: c.label })) || [],
          )}
          {filter("review", "Review status", options([...reviewStatuses]))}
          {filter("source", "Programme source", options(["Manual", "Synced"]))}
          {filter("category", "Category", options(catalog?.categories || []))}
          <label>
            Upcoming from
            <input
              aria-label="Upcoming from"
              type="date"
              value={f.date || ""}
              onChange={(e) => change("date", e.target.value)}
            />
          </label>
          {filter(
            "eligibility",
            "Source eligibility",
            Object.entries(eligibilityLabels).map(([value, label]) => ({
              value,
              label,
            })),
          )}
          {filter(
            "registration",
            "Registration status",
            options(["Unverified", "Open", "Closed", "Waitlist"]),
          )}
          {filter(
            "completeness",
            "Suitability completeness",
            options(["Incomplete", "Complete"]),
          )}
          {filter("sort", "Sort programmes", [
            { value: "name", label: "Programme name" },
            { value: "centre", label: "Centre" },
            { value: "next", label: "Next session" },
            { value: "category", label: "Category" },
            { value: "review", label: "Review status" },
          ])}
          {filter(
            "status",
            "Programme status",
            options(["Active", "Inactive", "Archived"]),
          )}
        </div>
        <div className="catalogue-active-filters">
          {Object.entries(f)
            .filter(
              ([k, v]) =>
                v && !["page", "size", "sort", "direction"].includes(k),
            )
            .map(([key, value]) => (
              <button
                type="button"
                className="filter-chip"
                key={key}
                aria-label={`Remove ${key} filter`}
                onClick={() => change(key, "")}
              >
                {key}:{" "}
                {key === "eligibility"
                  ? eligibilityLabels[value] || value
                  : value}{" "}
                <span aria-hidden="true">x</span>
              </button>
            ))}
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="catalogue-result-count" role="status">
        {current
          ? `${catalog?.total ?? 0} matching programmes`
          : error
            ? "Catalogue unavailable"
            : "Updating programme results..."}
      </p>
      {current && rows.length === 0 ? (
        <section className="panel empty">
          <h3>No programmes match these filters</h3>
          <p>Try another review queue or category, or reset the filters.</p>
          <button className="secondary" onClick={() => setF({})}>
            Reset Filters
          </button>
        </section>
      ) : (
        <Table
          headers={[
            "Programme",
            "Centre",
            "Next Session",
            "Category",
            "Review Status",
            "Registration Status",
            "Actions",
          ]}
          server={{
            total: catalog?.total || 0,
            page: catalog?.page || 1,
            size: catalog?.size || 20,
            onPage: (n) => setF({ ...f, page: String(n) }),
            onSize: (n) => setF({ ...f, size: String(n), page: "1" }),
            onSort: (column, direction) =>
              setF({
                ...f,
                sort: [
                  "name",
                  "centre",
                  "next",
                  "category",
                  "review",
                  "registration",
                ][column],
                direction: String(direction),
                page: "1",
              }),
            sortableColumns: [0, 1, 2, 3, 4, 5],
          }}
          rows={rows.map((p) => {
            const next = nextOccurrence(p, f.date);
            return {
              id: p.id,
              cells: [
                <details key="programme">
                  <summary>
                    <span>{p.name}</span>{" "}
                    <Badge>{p.external ? "Synced" : "Manual"}</Badge>
                    {p.external && p.external.groupingStatus !== "Verified" && (
                      <small>Series grouping unverified</small>
                    )}
                  </summary>
                  <Badge>
                    {p.external ? "Program-SpaceBooking" : "Manual"}
                  </Badge>
                  <p>
                    {p.description || "No additional programme information"}
                  </p>
                  <p>
                    Source eligibility:{" "}
                    {sourceStates(p)
                      .map((s) => eligibilityLabels[s] || s)
                      .join(", ")}
                  </p>
                  <p>
                    Languages:{" "}
                    {p.languages.map((x) => x.language.name).join(", ") ||
                      "Not yet assessed"}
                  </p>
                  <p>
                    Interests:{" "}
                    {p.interests.map((x) => x.interest.name).join(", ") ||
                      "Not yet assessed"}
                  </p>
                  <p>Mobility: {p.mobility || "Not yet assessed"}</p>
                  <p>
                    Care considerations:{" "}
                    {p.review?.conditionAssessment || "Not yet assessed"}
                  </p>
                  {p.external && p.external.groupingStatus !== "Verified" && (
                    <p className="notice">
                      Series grouping uncertain; kept separate from other
                      programme instances.
                    </p>
                  )}
                  <ProgrammeSessions p={p} />
                </details>,
                p.centre || "Shared programme",
                next ? (
                  <div key="next">
                    <strong>{next.date}</strong>
                    <p>
                      {next.startTime} - {next.endTime}
                    </p>
                    <small>{next.venue}</small>
                  </div>
                ) : p.external ? (
                  "No upcoming sessions"
                ) : (
                  [p.day, p.startTime, p.venue].filter(Boolean).join(" / ") ||
                  "No confirmed dates"
                ),
                p.category || "Uncategorised",
                <div key="review">
                  <Badge>{reviewStatus(p)}</Badge>
                  {p.external && suitabilityIssues(p).length > 0 && (
                    <small>
                      {suitabilityIssues(p).length} suitability items
                      outstanding
                    </small>
                  )}
                </div>,
                <Badge key="registration">{p.registrationStatus}</Badge>,
                <div className="row-actions" key="actions">
                  {p.external ? (
                    <>
                      <button
                        className={
                          reviewStatus(p) === "Reviewed" ? "secondary" : ""
                        }
                        onClick={() => setReview(p)}
                      >
                        {write ? "Review Programme" : "View review"}
                      </button>
                      {write && (
                        <ActionMenu label="More programme actions">
                          <button
                            className="secondary"
                            onClick={() => onEdit(p)}
                          >
                            Edit local details
                          </button>
                          {p.status !== "Archived" && (
                            <button
                              className="secondary"
                              onClick={() => onArchive(p)}
                            >
                              Archive in P3H
                            </button>
                          )}
                        </ActionMenu>
                      )}
                    </>
                  ) : write ? (
                    <>
                      <button className="secondary" onClick={() => onEdit(p)}>
                        Edit
                      </button>
                      {p.status !== "Archived" && (
                        <button
                          className="secondary"
                          onClick={() => onArchive(p)}
                        >
                          Archive
                        </button>
                      )}
                    </>
                  ) : (
                    "View only"
                  )}
                </div>,
              ],
            };
          })}
        />
      )}
      {review && catalog && (
        <ProgrammeReview
          p={review}
          vocabulary={catalog.vocabulary}
          write={write}
          onClose={() => setReview(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
