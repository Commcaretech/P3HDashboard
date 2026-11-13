"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useResource } from "./use-resource";
import { useWorkspaceCache } from "./workspace-cache";
import { request, useFilters } from "./common";
import { apiFetch } from "@/lib/client-http";
import { Badge, Modal, Table } from "./ui";
import {
  questionKeys,
  scaleFor,
  scoreSurvey,
  SURVEY_POLICY,
  surveyQuestions,
} from "@/lib/survey-scoring";
import type {
  previewSurveys,
  listSurveys,
  surveyOverview,
  surveyHistory,
  surveyDetail,
  surveyCandidates,
} from "@/lib/surveys";
const SurveyTrend = dynamic(() => import("./survey-trend"), {
  loading: () => <p>Loading survey chart...</p>,
});
type Stats = Awaited<ReturnType<typeof surveyOverview>>;
type Listing = Awaited<ReturnType<typeof listSurveys>>;
type History = Awaited<ReturnType<typeof surveyHistory>>;
type Detail = Awaited<ReturnType<typeof surveyDetail>>;
type Preview = Awaited<ReturnType<typeof previewSurveys>>;
type Candidate = Awaited<ReturnType<typeof surveyCandidates>>["rows"][number];
const languageOptions = ["English", "Mandarin", "Malay / Tamil"] as const;
const scoreColumns = [
  "physical",
  "psychological",
  "social",
  "environment",
  "overall",
  "zbi",
] as const;
const labels = [
  "Physical",
  "Psychological",
  "Social Relations",
  "Environment",
  "Overall",
  "Six-item ZBI (0–24)",
];
const dateLabel = (value: Date | string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-SG", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "Date needs review";
const displayScore = (n: number | null) =>
  n === null ? "Incomplete" : n.toFixed(2).replace(/\.00$/, "");

import { TrashButton } from "./trash";
export default function Surveys({
  write,
  manager,
  revision = 0,
  personId,
  onChanged,
}: {
  write: boolean;
  manager: boolean;
  revision?: number;
  personId?: string;
  onChanged?: () => void;
}) {
  const [f, setF] = useFilters(),
    [selected, setSelected] = useState(""),
    [notice, setNotice] = useState(""),
    [exporting, setExporting] = useState(false);
  const cache = useWorkspaceCache();
  const mode = personId
    ? "records"
    : !write && f.view === "import"
      ? "overview"
      : f.view || "overview";
  const [searchFilter, setSearchFilter] = useState(f.q || "");
  useEffect(() => {
    const timer = setTimeout(() => setSearchFilter(f.q || ""), 250);
    return () => clearTimeout(timer);
  }, [f.q]);
  const query = new URLSearchParams({
    ...f,
    q: searchFilter,
    view:
      mode === "results"
        ? "overview"
        : ["overview", "history"].includes(mode)
          ? mode
          : "records",
    ...(mode === "review" ? { review: "1" } : {}),
    ...(personId ? { personId } : {}),
  });
  const resource = useResource<Listing & Stats & History>(
      "surveys",
      `/api/surveys?${query}`,
      revision,
      mode !== "import",
    ),
    data = resource.busy ? null : resource.data;
  const change = (key: string, value: string) =>
    setF({ ...f, [key]: value, page: "1" });
  const refreshed = () => {
    cache?.invalidate(
      (key) =>
        key.startsWith("resource:surveys:") ||
        key.startsWith("resource:people:") ||
        key.startsWith("data:dashboard") ||
        key.startsWith("data:people"),
    );
    resource.reload();
    onChanged?.();
  };
  const exportCSV = async (extended: boolean) => {
    setExporting(true);
    setNotice("");
    try {
      const response = await apiFetch("/api/surveys/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          ...(personId ? { personId } : {}),
          extended: extended ? "1" : "0",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = extended
        ? "p3h-survey-outcomes-extended.csv"
        : "p3h-survey-outcomes.csv";
      link.click();
      URL.revokeObjectURL(url);
      setNotice(
        "Exported verified linked responses. The export was recorded in the audit log.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="survey-workspace">
      {!personId && (
        <>
          <div className="section-head">
            <div>
              <h2>Surveys &amp; Outcomes</h2>
              <p>
                Import responses, verify identities and follow caregiver
                outcomes.
              </p>
            </div>
          </div>
          <nav className="tabs" aria-label="Survey sections">
            {[
              ["overview", "Overview"],
              ["import", "Import Surveys"],
              ["review", "Needs Review"],
              ["records", "Survey Records"],
              ["results", "Results & Trends"],
              ["history", "Import History"],
            ]
              .filter(([v]) => write || v !== "import")
              .map(([value, title]) => (
                <button
                  key={value}
                  className={mode === value ? "selected" : "secondary"}
                  aria-pressed={mode === value}
                  onClick={() => setF({ view: value })}
                >
                  {title}
                </button>
              ))}
          </nav>
        </>
      )}
      <div className="survey-method">
        P3H WHOQOL Survey Score (0–100). Six-item ZBI Survey (0–24). The
        existing ZBI Assessment (0–88) is separate. Scores use two decimal
        places.{" "}
        <details>
          <summary>Scoring and missing answers</summary>
          <p>
            {SURVEY_POLICY} Social Relations uses two questions. These results
            are not labelled as standard WHOQOL-BREF. Scores and changes are
            descriptive, with no clinical categories or claim of programme
            impact.
          </p>
        </details>
      </div>
      {!personId && !["import", "history"].includes(mode) && (
        <form
          className="panel survey-filters"
          onSubmit={(e) => e.preventDefault()}
        >
          <label>
            Search surveys
            <input
              aria-label="Search surveys"
              value={f.q || ""}
              onChange={(e) => change("q", e.target.value)}
              placeholder="Submitted name or confirmed Member ID"
            />
          </label>
          <label>
            Survey centre
            <input
              aria-label="Survey centre filter"
              value={f.centre || ""}
              onChange={(e) => change("centre", e.target.value)}
              placeholder="All permitted centres"
            />
          </label>
          <label>
            Survey language
            <select
              value={f.language || ""}
              onChange={(e) => change("language", e.target.value)}
            >
              <option value="">All</option>
              {languageOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Survey phase
            <select
              value={f.phase || ""}
              onChange={(e) => change("phase", e.target.value)}
            >
              <option value="">All</option>
              {["Baseline", "Annual", "Needs Review"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Matching status
            <select
              value={f.match || ""}
              onChange={(e) => change("match", e.target.value)}
            >
              <option value="">All</option>
              <option>Linked</option>
              <option>Unmatched</option>
              <option>Ambiguous</option>
            </select>
          </label>
          <label>
            From date
            <input
              type="date"
              value={f.from || ""}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              value={f.to || ""}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
          <button
            className="secondary"
            type="button"
            onClick={() => setF({ view: mode })}
          >
            Reset survey filters
          </button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {resource.error && (
        <p role="alert" className="error">
          {resource.error}{" "}
          <button className="secondary" onClick={resource.reload}>
            Retry surveys
          </button>
        </p>
      )}
      {mode === "import" ? (
        <SurveyImport
          onSaved={(message) => {
            setNotice(message);
            refreshed();
            setF({ view: "review" });
          }}
        />
      ) : resource.busy ? (
        <p role="status">Loading surveys...</p>
      ) : (
        data && (
          <>
            {["overview", "results"].includes(mode) && (
              <>
                <div className="stat-grid">
                  {[
                    ["Eligible responses", data.responses],
                    ["Linked responses", data.linked],
                    ["Unmatched Surveys", data.unmatched],
                    ["Responses with data warnings", data.invalid],
                    ["Unique linked caregivers", data.caregivers],
                    [
                      "Caregivers with baseline surveys",
                      data.baselineCaregivers,
                    ],
                    [
                      "Caregivers with multiple survey dates",
                      data.repeatedCaregivers,
                    ],
                  ].map(([label, value]) => (
                    <button
                      key={label}
                      className="panel metric-action"
                      onClick={() =>
                        setF({
                          ...f,
                          view:
                            label === "Unmatched Surveys"
                              ? "review"
                              : "records",
                          match:
                            label === "Unmatched Surveys"
                              ? "Unmatched"
                              : label === "Linked responses"
                                ? "Linked"
                                : f.match || "",
                          quality:
                            label === "Responses with data warnings"
                              ? "warnings"
                              : "",
                          page: "1",
                        })
                      }
                    >
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <section className="panel">
                  <h3>Data quality</h3>
                  <p>
                    Ambiguous identities: {data.quality.ambiguous}. Invalid
                    timestamps: {data.quality.invalidTimestamps}. Unknown
                    answers: {data.quality.unknownAnswers}. Incomplete WHOQOL
                    domains: {data.quality.incompleteDomains}. Birth dates to
                    verify: {data.quality.birthDates}. Phases to verify:{" "}
                    {data.quality.phases}.
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      setF({
                        ...f,
                        view: "records",
                        quality: "warnings",
                        page: "1",
                      })
                    }
                  >
                    Review survey data warnings
                  </button>
                </section>
                <section className="panel">
                  <h3>Results from verified linked responses</h3>
                  <p>
                    Only dated Baseline and Annual responses using the current
                    scoring method contribute. Each metric shows its own valid
                    observation count. Pending identities do not contribute.
                  </p>
                  <Table
                    headers={["Metric", "Average", "Valid responses"]}
                    rows={scoreColumns.map((k, i) => ({
                      id: k,
                      cells: [
                        labels[i],
                        displayScore(data.means[k].mean),
                        data.means[k].n,
                      ],
                    }))}
                  />
                </section>
                <section className="panel">
                  <h3>Changes within the same caregivers</h3>
                  <p>
                    Each comparison pairs a verified caregiver’s baseline with
                    their latest annual response on a later date, using the same
                    scoring version. {data.phaseConflicts} caregivers have
                    repeated baseline phases requiring review.
                  </p>
                  <Table
                    headers={[
                      "Metric",
                      "Paired caregivers",
                      "Baseline average",
                      "Latest average",
                      "Average change",
                    ]}
                    rows={scoreColumns.map((k, i) => ({
                      id: k,
                      cells: [
                        labels[i],
                        data.paired[k].n,
                        displayScore(data.paired[k].baseline),
                        displayScore(data.paired[k].latest),
                        data.paired[k].change === null
                          ? "No paired observations"
                          : `${data.paired[k].change! > 0 ? "+" : ""}${data.paired[k].change}`,
                      ],
                    }))}
                  />
                </section>
              </>
            )}
            {mode === "history" && (
              <Table
                headers={["File", "Centre", "Language", "Imported", "Summary"]}
                rows={(data.rows as unknown as History["rows"]).map((b) => ({
                  id: b.id,
                  cells: [
                    b.filename,
                    b.centre,
                    b.language,
                    dateLabel(b.createdAt),
                    <details key="summary">
                      <summary>View import counts and row outcomes</summary>
                      <pre className="survey-summary">
                        {JSON.stringify(b.summary, null, 2)}
                      </pre>
                    </details>,
                  ],
                }))}
                server={{
                  onSort: () => {},
                  sortableColumns: [],
                  page: data.page,
                  size: data.size,
                  total: data.total,
                  onPage: (p) => change("page", String(p)),
                  onSize: () => {},
                }}
              />
            )}
            {["records", "review"].includes(mode) && (
              <>
                <div className="section-head">
                  <h3>
                    {mode === "review"
                      ? "Unmatched Surveys and data review"
                      : "Survey Records"}{" "}
                    ({data.total})
                  </h3>
                  {manager && (
                    <div className="actions">
                      <button
                        disabled={exporting}
                        className="secondary"
                        onClick={() => void exportCSV(false)}
                      >
                        Export outcomes
                      </button>
                      <button
                        disabled={exporting}
                        className="secondary"
                        onClick={() => void exportCSV(true)}
                      >
                        Extended export
                      </button>
                    </div>
                  )}
                </div>
                {mode === "review" && (
                  <p>
                    These eligible responses are securely stored. Names and
                    nicknames only suggest candidates. Each survey needs a
                    staff-confirmed identity before it appears in a caregiver’s
                    history.
                  </p>
                )}
                {personId && data.rows.length > 0 && (
                  <SurveyTrend rows={data.rows} />
                )}
                <Table
                  headers={[
                    "Submitted name / Member ID",
                    "Survey date",
                    "Phase / language",
                    ...labels,
                    "Data quality",
                    "Actions",
                  ]}
                  rows={data.rows.map((r) => ({
                    id: r.id,
                    cells: [
                      <div key="name">
                        {r.personId ? (
                          <Link href={`/people/${r.personId}`}>
                            {r.person?.name || r.cleanedName}
                          </Link>
                        ) : (
                          r.cleanedName || "Name missing"
                        )}
                        <small>{r.confirmedMemberId || r.matchStatus}</small>
                      </div>,
                      dateLabel(r.surveyDate),
                      `${r.phase} / ${r.language}`,
                      ...scoreColumns.map((k) => displayScore(r[k])),
                      <Badge key="quality">
                        {Array.isArray(r.warnings) && r.warnings.length
                          ? `${r.warnings.length} warnings`
                          : "Complete responses"}
                      </Badge>,
                      <div className="row-actions" key="open">
                        <button
                          className="secondary"
                          onClick={() => setSelected(r.id)}
                        >
                          {write && !r.personId
                            ? "Review identity"
                            : "View survey"}
                        </button>
                        {manager && (
                          <TrashButton
                            type="survey"
                            id={r.id}
                            onChanged={refreshed}
                          />
                        )}
                      </div>,
                    ],
                  }))}
                  server={{
                    onSort: () => {},
                    sortableColumns: [],
                    page: data.page,
                    size: data.size,
                    total: data.total,
                    onPage: (p) => change("page", String(p)),
                    onSize: (n) => change("size", String(n)),
                  }}
                />
                {data.total === 0 && (
                  <p className="panel">
                    No survey responses match these filters.
                  </p>
                )}
                {personId && (
                  <SurveyAliases
                    personId={personId}
                    aliases={data.aliases}
                    write={write}
                    manager={manager}
                    onSaved={refreshed}
                  />
                )}
              </>
            )}
          </>
        )
      )}
      {selected && (
        <SurveyDetail
          id={selected}
          write={write}
          manager={manager}
          onClose={() => setSelected("")}
          onSaved={() => {
            setSelected("");
            refreshed();
          }}
        />
      )}
    </div>
  );
}

function SurveyImport({ onSaved }: { onSaved: (message: string) => void }) {
  const [files, setFiles] = useState<
      {
        name: string;
        language: (typeof languageOptions)[number];
        content: string;
      }[]
    >([]),
    [centre, setCentre] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [previewPage, setPreviewPage] = useState(1);
  const choices =
    useResource<Listing>("surveys", "/api/surveys?view=options").data
      ?.centres || [];
  const body = { centre, files };
  const execute = async (action: "preview" | "import") => {
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/surveys", { action, ...body });
      if (action === "preview") {
        setPreview(result);
        setPreviewPage(1);
      } else {
        setFiles([]);
        setPreview(null);
        onSaved(
          `Survey import saved. ${result.batches.reduce((n: number, b: { saved: number }) => n + b.saved, 0)} responses added to the identity review queue.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Survey import failed.");
    } finally {
      setBusy(false);
    }
  };
  const previewRows =
    preview?.files.flatMap((f) =>
      f.rows.map((r) => ({ ...r, file: f.name })),
    ) || [];
  const counts = preview
    ? {
        submitted: previewRows.length,
        eligible: previewRows.filter((r) => !r.exclusion).length,
        excludedConsent: previewRows.filter(
          (r) => r.exclusion === "Consent not granted",
        ).length,
        excludedTest: previewRows.filter((r) => r.exclusion === "Test record")
          .length,
        duplicates: previewRows.filter(
          (r) => r.disposition === "Already imported",
        ).length,
        conflicts: previewRows.filter((r) =>
          r.disposition.startsWith("Source conflict"),
        ).length,
        review: previewRows.filter(
          (r) => r.disposition === "Ready for identity review",
        ).length,
        invalid: previewRows.filter((r) => r.warnings?.length).length,
      }
    : null;
  return (
    <section className="panel">
      <h3>Import survey CSV files</h3>
      <p>
        Upload UTF-8 CSV exports. Preview cleaning, scores and exclusions before
        saving. Names do not create or overwrite caregiver records.
      </p>
      <label>
        Import centre
        <input
          aria-label="Import centre"
          list="survey-centre-options"
          required
          value={centre}
          disabled={busy}
          onChange={(e) => {
            setCentre(e.target.value);
            setPreview(null);
          }}
        />
      </label>
      <datalist id="survey-centre-options">
        {choices.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <label>
        Survey CSV files
        <input
          aria-label="Survey CSV files"
          type="file"
          accept=".csv,text/csv"
          multiple
          disabled={busy}
          onChange={async (e) => {
            setError("");
            setPreview(null);
            try {
              const selected = Array.from(e.target.files || []);
              if (
                selected.length > 5 ||
                selected.some((f) => f.size > 4 * 1024 * 1024) ||
                selected.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024
              )
                throw new Error(
                  "Choose up to five files, 4 MB each and 8 MB combined.",
                );
              setFiles(
                await Promise.all(
                  selected.map(async (file) => ({
                    name: file.name,
                    content: new TextDecoder("utf-8", { fatal: true }).decode(
                      await file.arrayBuffer(),
                    ),
                    language: /mandarin/i.test(file.name)
                      ? ("Mandarin" as const)
                      : /malay|tamil/i.test(file.name)
                        ? ("Malay / Tamil" as const)
                        : ("English" as const),
                  })),
                ),
              );
            } catch (err) {
              setFiles([]);
              setError(err instanceof Error ? err.message : "Cannot read CSV.");
            }
          }}
        />
      </label>
      {files.map((f, i) => (
        <label key={i}>
          {f.name} — source language/export
          <select
            aria-label={`Language for ${f.name}`}
            disabled={busy}
            value={f.language}
            onChange={(e) => {
              setFiles((xs) =>
                xs.map((v, j) =>
                  j === i
                    ? { ...v, language: e.target.value as typeof f.language }
                    : v,
                ),
              );
              setPreview(null);
            }}
          >
            {languageOptions.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          disabled={busy || !files.length || !centre.trim()}
          onClick={() => void execute("preview")}
        >
          {busy ? "Processing surveys..." : "Preview surveys"}
        </button>
        {preview && (
          <button disabled={busy} onClick={() => void execute("import")}>
            Confirm survey import
          </button>
        )}
      </div>
      {preview && counts && (
        <>
          <h4>Import preview</h4>
          <p role="status">
            Submitted {counts.submitted}; eligible {counts.eligible}; consent
            excluded {counts.excludedConsent}; test excluded{" "}
            {counts.excludedTest}; already imported {counts.duplicates}; source
            conflicts {counts.conflicts}; identity review {counts.review};
            invalid or incomplete {counts.invalid}; linked 0.
          </p>
          <p>
            Excluded rows show only their row number and reason. Eligible
            responses remain unmatched until staff confirm identity.
          </p>
          <Table
            headers={[
              "File / row",
              "Cleaned name",
              "Date / phase",
              "WHOQOL Overall",
              "Six-item ZBI",
              "Outcome / warnings",
            ]}
            rows={previewRows
              .slice((previewPage - 1) * 20, previewPage * 20)
              .map((r, i) => ({
                id: `${previewPage}-${i}`,
                cells: [
                  `${r.file} / ${r.rowNumber}`,
                  r.cleanedName || "Excluded — identity not retained",
                  r.surveyDate
                    ? `${dateLabel(r.surveyDate)} / ${r.phase}`
                    : r.exclusion
                      ? "Excluded"
                      : "Needs date review",
                  r.scores ? displayScore(r.scores.overall) : "",
                  r.scores ? displayScore(r.scores.zbi) : "",
                  <div key="status">
                    {r.disposition}
                    {Boolean(r.warnings?.length) && (
                      <details>
                        <summary>{r.warnings!.length} warnings</summary>
                        <ul>
                          {r.warnings!.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>,
                ],
              }))}
            server={{
              onSort: () => {},
              sortableColumns: [],
              page: previewPage,
              size: 20,
              total: previewRows.length,
              onPage: setPreviewPage,
              onSize: () => {},
            }}
          />
        </>
      )}
    </section>
  );
}

function SurveyDetail({
  id,
  write,
  manager,
  onClose,
  onSaved,
}: {
  id: string;
  write: boolean;
  manager: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detail = useResource<Detail>(
    "surveys",
    `/api/surveys?view=detail&id=${encodeURIComponent(id)}`,
  );
  return (
    <Modal title="Survey details and identity" onClose={onClose}>
      {detail.error ? (
        <p role="alert">{detail.error}</p>
      ) : !detail.data || detail.busy ? (
        <p>Loading survey...</p>
      ) : (
        <SurveyDetailForm
          key={String(detail.data.updatedAt)}
          r={detail.data}
          write={write}
          manager={manager}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}
function SurveyDetailForm({
  r,
  write,
  manager,
  onSaved,
}: {
  r: Detail;
  write: boolean;
  manager: boolean;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [candidate, setCandidate] = useState<Candidate | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [saveAlias, setSaveAlias] = useState(false),
    [notes, setNotes] = useState(""),
    [phase, setPhase] = useState(r.phase),
    [date, setDate] = useState(
      r.surveyDate
        ? new Date(new Date(r.surveyDate).getTime() + 8 * 3600000)
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [dob, setDob] = useState(
      r.dob ? new Date(r.dob).toISOString().slice(0, 10) : "",
    ),
    [answers, setAnswers] = useState<Record<string, number | null>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const candidates = useResource<{ rows: Candidate[] }>(
    "surveys",
    `/api/surveys?view=candidates&id=${encodeURIComponent(r.id)}&q=${encodeURIComponent(debounced)}`,
    0,
    write && !r.personId,
  );
  const execute = async (
    action: "link" | "unlink" | "correct" | "ambiguous",
  ) => {
    setBusy(true);
    setError("");
    try {
      await request("/api/surveys", {
        action,
        id: r.id,
        version: r.updatedAt,
        notes,
        personId: candidate?.id,
        confirmed,
        saveAlias,
        phase,
        ...(date !==
        (r.surveyDate
          ? new Date(new Date(r.surveyDate).getTime() + 8 * 3600000)
              .toISOString()
              .slice(0, 16)
          : "")
          ? { surveyDate: date ? date + ":00+08:00" : "" }
          : {}),
        ...(dob !== (r.dob ? new Date(r.dob).toISOString().slice(0, 10) : "")
          ? { dob }
          : {}),
        answers,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot save survey.");
    } finally {
      setBusy(false);
    }
  };
  const effective = scoreSurvey(r.answers as Record<string, unknown>);
  return (
    <div className="survey-detail">
      <h3>{r.cleanedName || "Name not supplied"}</h3>
      <p>
        Original submission: {r.submittedName}
        <br />
        Birth date submitted: {r.dobText || "Not supplied"}
        <br />
        Survey date: {dateLabel(r.surveyDate)}
        <br />
        Recorded phase: {r.phaseText || "Missing"}
        <br />
        Centre: {r.centre} / Export: {r.language}
      </p>
      <p>
        {r.personId
          ? `Linked to ${r.person?.name} (${r.confirmedMemberId})`
          : "Unmatched — not shown in any caregiver history"}
      </p>
      {Array.isArray(r.warnings) && r.warnings.length > 0 && (
        <div className="notice">
          <strong>Data quality</strong>
          <ul>
            {r.warnings.map((w, i) => (
              <li key={i}>{String(w)}</li>
            ))}
          </ul>
        </div>
      )}
      <Table
        headers={["Metric", "Score"]}
        rows={scoreColumns.map((k, i) => ({
          id: k,
          cells: [labels[i], displayScore(r[k])],
        }))}
      />
      {write && !r.personId && (
        <section>
          <h3>Confirm caregiver identity</h3>
          <label>
            Find caregiver
            <input
              aria-label="Find caregiver for survey"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCandidate(null);
                setConfirmed(false);
              }}
              placeholder="Member ID, name, alias, contact number or birth date"
            />
          </label>
          <p>
            Search is limited to authorised caregivers in {r.centre}. A name,
            alias or birth date is evidence for review, not automatic proof of
            identity.
          </p>
          {candidates.error && <p role="alert">{candidates.error}</p>}
          {!candidates.busy &&
            search === debounced &&
            candidates.data?.rows?.map((p) => (
              <label key={p.id} className="survey-candidate">
                <input
                  type="radio"
                  name="survey-candidate"
                  checked={candidate?.id === p.id}
                  onChange={() => {
                    setCandidate(p);
                    setConfirmed(false);
                  }}
                />
                <span>
                  <strong>
                    {p.name} — {p.memberId}
                  </strong>
                  <br />
                  {p.alias} / {p.centre} /{" "}
                  {p.contactNumber || "No contact recorded"} /{" "}
                  {p.dob ? dateLabel(p.dob) : "No birth date"}
                  <br />
                  {p.evidence.join(". ") ||
                    "Search candidate — verify all identifiers"}
                  {p.conflicts.length > 0 && (
                    <strong className="error"> {p.conflicts.join(". ")}</strong>
                  )}
                </span>
              </label>
            ))}
          {!candidates.busy &&
            search === debounced &&
            candidates.data?.rows?.length === 0 && (
              <p>
                No candidates found. Search a Member ID or another authorised
                identifier.
              </p>
            )}
          <p className="notice">
            Confirm that this survey belongs to the selected caregiver.
            Incorrect matching affects survey results and reports.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I verified this identity using the organisation’s approved process.
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={saveAlias}
              onChange={(e) => setSaveAlias(e.target.checked)}
            />
            Save these submitted initials/name as a verified alias for future
            suggestions.
          </label>
        </section>
      )}
      {write && (
        <label>
          Review notes / reason
          <textarea
            aria-label="Survey review notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Required for links, corrections and unlinking"
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {write && !r.personId && (
        <div className="actions">
          <button
            disabled={busy || !candidate || !confirmed || !notes.trim()}
            onClick={() => void execute("link")}
          >
            Confirm &amp; Link Survey
          </button>
          <button
            className="secondary"
            disabled={busy || !notes.trim()}
            onClick={() => void execute("ambiguous")}
          >
            Mark identity ambiguous
          </button>
        </div>
      )}
      {manager && r.personId && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm unlinking. The original response and review history will
            be retained.
          </label>
          <button
            className="secondary"
            disabled={busy || !confirmed || !notes.trim()}
            onClick={() => void execute("unlink")}
          >
            Unlink survey
          </button>
        </>
      )}
      <details>
        <summary>Source answers and corrections</summary>
        <p>
          Original answers are preserved. Correct only against verified
          information and record a reason.
        </p>
        <div className="form-grid">
          <label>
            Corrected phase
            <select
              aria-label="Corrected survey phase"
              disabled={!write}
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
            >
              {["Baseline", "Annual", "Needs Review"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Survey timestamp (Singapore)
            <input
              type="datetime-local"
              disabled={!write}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Verified birth date
            <input
              type="date"
              disabled={!write}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </label>
        </div>
        {questionKeys.map((key, i) => (
          <label key={key}>
            {key}: {surveyQuestions[i]}
            <small>
              Original:{" "}
              {String(
                (r.rawAnswers as Record<string, unknown>)[key] ?? "Missing",
              )}
            </small>
            <select
              aria-label={`Correct ${key}`}
              disabled={!write}
              value={
                Object.hasOwn(answers, key)
                  ? (answers[key] ?? "")
                  : (effective.values[key] ?? "")
              }
              onChange={(e) =>
                setAnswers((xs) => ({
                  ...xs,
                  [key]: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            >
              <option value="">Missing / not scored</option>
              {scaleFor(key).map((label, i) => (
                <option key={i} value={i + (key.startsWith("Z") ? 0 : 1)}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {write && (
          <button
            disabled={busy || !notes.trim()}
            onClick={() => void execute("correct")}
          >
            Save survey corrections
          </button>
        )}
      </details>
      <details>
        <summary>Identity review history and scoring version</summary>
        <p>{r.method}</p>
        {r.corrections.map((h) => (
          <details key={h.id}>
            <summary>
              {h.action} by {h.user.name} / {dateLabel(h.timestamp)}
            </summary>
            <pre className="survey-summary">
              {JSON.stringify(h.changes, null, 2)}
            </pre>
          </details>
        ))}
        {r.reviews.map((h) => (
          <p key={h.id}>
            {h.action} / {h.memberId || "Unmatched"} /{" "}
            {new Date(h.reviewedAt).toLocaleString("en-SG", {
              timeZone: "Asia/Singapore",
            })}{" "}
            / Staff {h.reviewedBy}
            <br />
            {h.notes}
          </p>
        ))}
      </details>
    </div>
  );
}
function SurveyAliases({
  personId,
  aliases,
  write,
  manager,
  onSaved,
}: {
  personId: string;
  aliases: Listing["aliases"];
  write: boolean;
  manager: boolean;
  onSaved: () => void;
}) {
  const [text, setText] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async (alias: string, verified: boolean) => {
    setBusy(true);
    setError("");
    try {
      await request("/api/surveys", {
        action: "alias",
        personId,
        text: alias,
        verified,
        notes,
      });
      setText("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot save alias.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <h3>Verified survey aliases</h3>
      <p>
        Several caregivers may share an alias. Future surveys always require
        manual identity confirmation.
      </p>
      {aliases.map((a) => (
        <p key={a.id}>
          {a.text} — {a.verified ? "Verified" : "Revoked"}{" "}
          {manager && a.verified && (
            <button
              className="secondary"
              disabled={busy || !notes.trim()}
              onClick={() => void save(a.text, false)}
            >
              Revoke alias
            </button>
          )}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      {write && (
        <>
          <label>
            Verified alias
            <input
              aria-label="Verified survey alias"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label>
            Alias verification notes
            <input
              aria-label="Alias verification notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !text.trim() || !notes.trim()}
            onClick={() => void save(text, true)}
          >
            Add verified alias
          </button>
        </>
      )}
    </section>
  );
}
