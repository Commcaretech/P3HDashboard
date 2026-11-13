"use client";
import { useEffect, useRef, useState } from "react";
import { useResource } from "./use-resource";
import Link from "next/link";
import {
  LoaderCircle,
  RefreshCw,
  ClipboardCheck,
  CalendarDays,
  Layers,
} from "lucide-react";
import ProgrammeInterestTags from "./programme-interest-tags";
import { programmeInterestEvidence } from "@/lib/programme-interests";
import { scheduleLabel } from "@/lib/programme-source";
import { Programme, Staff } from "@/lib/types";
import {
  catalogueCounts,
  reviewStatuses,
  nextOccurrence,
  futureOccurrences,
  eligibilityLabels,
  sourceStates,
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
  diagnostics: { unknownVisibility: number; undated: number };
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
import { TrashButton } from "./trash";
export default function Programmes({
  write,
  onEdit,
  onArchive,
  user,
  onRefresh,
  dataRevision = 0,
}: {
  dataRevision?: number;
  write: boolean;
  user: Pick<Staff, "role">;
  onRefresh: () => Promise<void>;
  onEdit: (p?: Programme) => void;
  onArchive: (p: Programme) => void;
}) {
  const [f, setF] = useFilters(),
    [info, setInfo] = useState<SyncInfo | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [review, setReview] = useState<Programme | null>(null),
    [tagEditor, setTagEditor] = useState<Programme | null>(null),
    [revision, setRevision] = useState(0),
    [expanded, setExpanded] = useState(false);
  const inFlight = useRef(false),
    query = new URLSearchParams(f).toString();
  const resource = useResource<Catalogue>(
    "programmes",
    `/api/programmes/catalogue?${query}`,
    `${dataRevision}:${revision}`,
  );
  const result = resource.data
    ? { key: resource.busy ? "pending" : query, data: resource.data }
    : null;
  const error = resource.error;
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
  }, [revision, dataRevision]);
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
          <button
            className="catalogue-metric metric-action"
            onClick={() => change("schedule", "confirmed")}
          >
            <CalendarDays size={18} />
            <strong>{counts?.scheduledProgrammes ?? 0}</strong>
            <span>Programmes with confirmed upcoming sessions</span>
            <small>{counts?.upcoming ?? 0} upcoming sessions</small>
          </button>
          <button
            className="catalogue-metric metric-action"
            onClick={() => change("schedule", "unconfirmed")}
          >
            <CalendarDays size={18} />
            <strong>{counts?.unconfirmed ?? 0}</strong>
            <span>Programmes without confirmed schedules</span>
            <small>Dates or source confirmation may be missing</small>
          </button>
          <button
            className="catalogue-metric metric-action"
            onClick={() =>
              change("tagCorrections", f.tagCorrections ? "" : "1")
            }
          >
            <ClipboardCheck size={18} />
            <strong>{counts?.tagCorrections ?? 0}</strong>
            <span>Interest tags to check</span>
            <small>Optional staff corrections</small>
          </button>
        </div>
        <p className="muted">
          Sync Now imports programmes and makes them available for automatic
          interest matching. No review form or extra programme fields are
          required.
        </p>
        {Boolean(counts?.concerns) && (
          <details className="notice">
            <summary>
              Scheduling diagnostics: {counts?.concerns} programmes need a
              source check
            </summary>
            <p>
              Only explicit source problems such as room conflicts, closures,
              invalid times or unavailable venues are counted here. Missing
              verification and uncertain series grouping are not scheduling
              conflicts.
            </p>
            <button
              className="secondary"
              onClick={() => change("concerns", "1")}
            >
              View source scheduling issues
            </button>
          </details>
        )}
        {Boolean(catalog?.diagnostics.unknownVisibility) && (
          <details className="sync-history">
            <summary>Import diagnostics: source metadata incomplete</summary>
            <p>
              {catalog?.diagnostics.unknownVisibility} sessions have no explicit
              source visibility metadata. Dates are retained, but these sessions
              are not advertised as confirmed. Run Sync Now against the updated
              feed to refresh visibility; a failed or legacy response is not
              treated as a room conflict.
            </p>
          </details>
        )}
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
                  {c.counts.scheduledProgrammes} dated programmes /{" "}
                  {c.counts.unconfirmed} schedule not confirmed
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
            Interests are matched automatically from programme names and
            available details. You can adjust the suggested tags at any time.
          </p>
        </div>
        <div className="row-actions">
          <Link
            className="secondary link-button"
            href={`/matching${f.centre ? `?centre=${encodeURIComponent(f.centre)}` : ""}`}
          >
            Find Recommendations
          </Link>
          {write && <button onClick={() => onEdit()}>+ Add programme</button>}
        </div>
      </div>
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
          <p>Try another category or reset the filters.</p>
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
            "Automatic matching",
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
            sortableColumns: [0, 1, 2, 3, 5],
          }}
          rows={rows.map((p) => {
            const evidence = programmeInterestEvidence(p);
            const next =
              nextOccurrence(p, f.date) ||
              futureOccurrences(p).find((o) => !f.date || o.date! >= f.date);
            return {
              id: p.id,
              cells: [
                <details key="programme">
                  <summary>
                    <span>{p.name}</span>{" "}
                    <Badge>{p.external ? "Synced" : "Manual"}</Badge>
                    <small>
                      Interests:{" "}
                      {evidence.tags.join(", ") || "No interest tags yet"}
                    </small>
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
                    Source status: {p.external?.sourceStatus || p.status} /
                    Schedule: {scheduleLabel(p)} / Programme type:{" "}
                    {p.external?.programmeType || "Not recorded"}
                    <br />
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
                    {evidence.tags.join(", ") ||
                      "No specific information supplied"}
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
                  {p.external && !write && (
                    <button className="secondary" onClick={() => setReview(p)}>
                      View optional suitability assessment
                    </button>
                  )}
                </details>,
                p.centre || "Shared programme",
                next ? (
                  <div key="next">
                    <strong>{next.date}</strong>
                    <p>
                      {next.startTime} - {next.endTime}
                    </p>
                    <small>{next.venue || "Venue not confirmed"}</small>
                    <small>{scheduleLabel(p)}</small>
                  </div>
                ) : p.external ? (
                  "Schedule Not Confirmed"
                ) : (
                  [p.day, p.startTime, p.venue].filter(Boolean).join(" / ") ||
                  "No confirmed dates"
                ),
                p.category || "Uncategorised",
                <div key="matching">
                  <Badge>
                    {evidence.staffMaintained ? "Staff tags" : "Automatic"}
                  </Badge>
                  <small>
                    {evidence.tags.join(", ") ||
                      "Uses available programme information"}
                  </small>
                </div>,
                <Badge key="registration">{p.registrationStatus}</Badge>,
                <div className="row-actions" key="actions">
                  {["Admin", "Manager"].includes(user.role) && (
                    <TrashButton
                      type="programme"
                      id={p.id}
                      onChanged={refresh}
                    />
                  )}
                  {p.external ? (
                    <>
                      {write && (
                        <button
                          className="secondary"
                          onClick={() => setTagEditor(p)}
                        >
                          Edit interest tags
                        </button>
                      )}
                      {write && (
                        <ActionMenu label="More programme actions">
                          <button
                            className="secondary"
                            onClick={() => setReview(p)}
                          >
                            Optional suitability assessment
                          </button>
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
      {tagEditor && catalog && (
        <ProgrammeInterestTags
          p={tagEditor}
          vocabulary={catalog.vocabulary.interests}
          onClose={() => setTagEditor(null)}
          onSaved={refresh}
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
