"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useResource } from "./use-resource";
import { useWorkspaceCache } from "./workspace-cache";
import { request, useFilters } from "./common";
import { apiFetch } from "@/lib/client-http";
import SurveyImport from "./ncss-import";
import { ncssImportMode } from "@/lib/ncss-matched-csv";
import { surveyPhases } from "@/lib/survey-csv";
import { Badge, Modal, Table } from "./ui";
import {
  questionKeys,
  scaleFor,
  scoreSurvey,
  SURVEY_POLICY,
  surveyQuestions,
} from "@/lib/survey-scoring";
import type {
  listSurveys,
  surveyOverview,
  surveyHistory,
  surveyDetail,
  lookupSurveyMember,
} from "@/lib/surveys";
const SurveyTrend = dynamic(() => import("./survey-trend"), {
  loading: () => <p>Loading survey chart...</p>,
});
const SurveyMonthlyTrend = dynamic(
  () => import("./survey-trend").then((module) => module.SurveyMonthlyTrend),
  {
    loading: () => <p>Loading survey trends...</p>,
  },
);
type Stats = Awaited<ReturnType<typeof surveyOverview>>;
type Listing = Awaited<ReturnType<typeof listSurveys>>;
type History = Awaited<ReturnType<typeof surveyHistory>>;
type Detail = Awaited<ReturnType<typeof surveyDetail>>;
type Candidate = Awaited<ReturnType<typeof lookupSurveyMember>>;
type SurveyAction =
  "link" | "unlink" | "correct" | "reject" | "correct-name" | "reassign-import";
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
    [reviewingIdentity, setReviewingIdentity] = useState(false),
    [queue, setQueue] = useState<Record<string, string> | null>(null),
    [openingNext, setOpeningNext] = useState(false),
    [notice, setNotice] = useState(""),
    [exporting, setExporting] = useState(false);
  const cache = useWorkspaceCache();
  const mode = personId
    ? "records"
    : !write && (f.view === "import" || f.view === "review")
      ? "records"
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
        ? "trends"
        : ["overview", "history"].includes(mode)
          ? mode
          : mode === "review"
            ? "identity"
            : "records",
    ...(mode === "review" && !f.match ? { review: "1" } : {}),
    ...(personId ? { personId } : {}),
  });
  const resource = useResource<Listing & Stats & History>(
      "surveys",
      `/api/surveys?${query}`,
      revision,
      mode !== "import",
      mode !== "review" && mode !== "history",
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
  const closeReview = () => {
    setSelected("");
    setReviewingIdentity(false);
    setQueue(null);
  };
  const openNext = async (filters: Record<string, string>, after = "") => {
    setOpeningNext(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ ...filters, view: "queue", after });
      const next: { id: string } | null = await request(
        `/api/surveys?${params}`,
      );
      if (!next) {
        closeReview();
        setNotice(
          after
            ? "You’ve reached the end of this review queue."
            : "No unmatched surveys match these filters.",
        );
        return;
      }
      setQueue(filters);
      setReviewingIdentity(true);
      setSelected(next.id);
    } catch (e) {
      closeReview();
      setNotice(
        e instanceof Error ? e.message : "Could not open the next survey.",
      );
    } finally {
      setOpeningNext(false);
    }
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
                Import Member ID–matched responses and follow caregiver
                outcomes.
              </p>
            </div>
          </div>
          <nav className="tabs" aria-label="Survey sections">
            {[
              ["overview", "Overview"],
              ["import", "Import Surveys"],
              ["records", "Survey Records"],
              ["results", "Results & Trends"],
              ["history", "Import History"],
            ]
              .filter(([v]) => write || (v !== "import" && v !== "review"))
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
              placeholder="Response reference or Member ID"
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
              {surveyPhases.map((v) => (
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
              <option value="Linked">Verified</option>
              <option>Unmatched</option>
              <option>Ambiguous</option>
              <option>Needs Review</option>
              <option>Corrected</option>
            </select>
          </label>
          <label>
            Data quality
            <select
              value={f.quality || ""}
              onChange={(e) => change("quality", e.target.value)}
            >
              <option value="">All</option>
              <option value="warnings">Responses with data warnings</option>
              <option value="timestamp">Invalid timestamps</option>
              <option value="whoqol">Incomplete WHOQOL domains</option>
              <option value="phase">Phases to verify</option>
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
          onSaved={refreshed}
          navigate={(view, batch) =>
            setF({ view, ...(batch ? { batch } : {}) })
          }
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
                    ["Total Imported Responses", data.responses],
                    ["Complete Surveys", data.completeResponses],
                    [
                      "Incomplete Surveys",
                      data.responses - data.completeResponses,
                    ],
                    ["Linked responses", data.linked],
                    ["Unmatched Surveys", data.unmatched],
                    ["Responses with data warnings", data.invalid],
                    ["Unique Caregivers Surveyed", data.caregivers],
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
                    {data.completeResponses} of {data.responses} eligible
                    responses have complete WHOQOL and six-item ZBI scores
                    {data.responses > 0
                      ? ` (${Math.round((data.completeResponses / data.responses) * 100)}%).`
                      : "."}
                  </p>
                  <div className="actions">
                    {(
                      [
                        [
                          "Ambiguous identities",
                          data.quality.ambiguous,
                          { match: "Ambiguous" },
                        ],
                        [
                          "Invalid timestamps",
                          data.quality.invalidTimestamps,
                          { quality: "timestamp" },
                        ],
                        [
                          "Incomplete WHOQOL domains",
                          data.quality.incompleteDomains,
                          { quality: "whoqol" },
                        ],
                        [
                          "Phases to verify",
                          data.quality.phases,
                          { quality: "phase" },
                        ],
                      ] as const
                    ).map(([label, total, filter]) => (
                      <button
                        key={label}
                        className="secondary"
                        onClick={() =>
                          setF({ ...f, ...filter, view: "review", page: "1" })
                        }
                      >
                        {label} ({total})
                      </button>
                    ))}
                    <button
                      className="secondary"
                      onClick={() => setF({ view: "history", page: "1" })}
                    >
                      Review duplicate uploads in Import History
                    </button>
                  </div>
                  <p>
                    {data.quality.unknownAnswers} responses have unknown
                    answers. {data.quality.birthDates} responses have birth
                    dates to verify.
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
                    Dated Baseline, Annual and Follow-up responses using the
                    current scoring method contribute. Each metric shows its own
                    valid observation count. Pending identities do not
                    contribute.
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
                    their latest Annual or Follow-up response on a later date,
                    using the same scoring version. {data.phaseConflicts}{" "}
                    caregivers have repeated baseline phases requiring review.
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
            {mode === "results" && <SurveyMonthlyTrend rows={data.monthly} />}
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
                      <summary>
                        {b.linkedCount} currently linked · View import counts
                        and row outcomes
                      </summary>
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
                    {mode === "review" ? "Identity Review" : "Survey Records"} (
                    {data.total})
                  </h3>
                  {write && !personId && (
                    <button
                      className="secondary"
                      disabled={openingNext || f.match === "Linked"}
                      onClick={() => void openNext({ ...f, q: searchFilter })}
                    >
                      Review unmatched surveys
                    </button>
                  )}
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
                    Search for the respondent in CaritaHub, verify their Member
                    ID and link the survey to an existing caregiver.
                  </p>
                )}
                {personId && data.rows.length > 0 && (
                  <SurveyTrend rows={data.rows} />
                )}
                <Table
                  headers={[
                    mode === "review"
                      ? "Reference / submitted name / Member ID"
                      : "Reference / Member ID",
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
                        <span>{r.id}</span>
                        {mode === "review" && r.identityStage && (
                          <small>
                            {r.identityStage.submittedName ||
                              "Name not supplied"}
                          </small>
                        )}
                        {mode === "review" &&
                          r.identityStage?.correctedName && (
                            <small>
                              Corrected name: {r.identityStage.correctedName}
                            </small>
                          )}
                        {r.personId ? (
                          <small>
                            <Link href={`/people/${r.personId}?tab=surveys`}>
                              {r.confirmedMemberId || "View caregiver"}
                            </Link>
                            {" · "}Verified
                          </small>
                        ) : (
                          <small>
                            {r.matchStatus === "Ambiguous"
                              ? "Needs Review · Ambiguous identity"
                              : "Unmatched"}
                          </small>
                        )}
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
                        {mode !== "review" && (
                          <button
                            className="secondary"
                            disabled={openingNext}
                            onClick={() => {
                              setReviewingIdentity(false);
                              setSelected(r.id);
                            }}
                          >
                            View survey
                          </button>
                        )}
                        {write && (
                          <button
                            className="secondary"
                            disabled={openingNext}
                            onClick={() => {
                              setReviewingIdentity(true);
                              setSelected(r.id);
                            }}
                          >
                            {r.importMode === ncssImportMode
                              ? "Review import"
                              : "Review identity"}
                          </button>
                        )}
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
                    onSort: (column, direction) =>
                      setF({
                        ...f,
                        sort: column === 1 ? "date" : "phase",
                        direction: direction === 1 ? "asc" : "desc",
                        page: "1",
                      }),
                    sortableColumns: personId ? [] : [1, 2],
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
                {personId &&
                  (data.aliases.length > 0 ||
                    data.rows.some(
                      (row) => row.importMode !== ncssImportMode,
                    )) && (
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
          key={`${selected}:${reviewingIdentity}`}
          id={selected}
          identity={reviewingIdentity && write}
          write={write}
          manager={manager}
          onClose={() => {
            if (!openingNext) closeReview();
          }}
          openingNext={openingNext}
          onNext={queue ? () => void openNext(queue, selected) : undefined}
          onSaved={(action) => {
            refreshed();
            if (action === "correct-name") return;
            if (queue) void openNext(queue, selected);
            else closeReview();
          }}
        />
      )}
    </div>
  );
}

function SurveyDetail({
  id,
  identity,
  write,
  manager,
  onClose,
  onSaved,
  onNext,
  openingNext,
}: {
  id: string;
  identity: boolean;
  write: boolean;
  manager: boolean;
  onClose: () => void;
  onSaved: (action: SurveyAction) => void;
  onNext?: () => void;
  openingNext: boolean;
}) {
  const [nameSaved, setNameSaved] = useState(false);
  const detail = useResource<Detail>(
    "surveys",
    `/api/surveys?view=detail&id=${encodeURIComponent(id)}&identity=${identity ? "1" : "0"}`,
    0,
    true,
    !identity,
  );
  return (
    <Modal
      title={identity ? "Survey identity review" : "Survey details"}
      onClose={onClose}
    >
      {nameSaved && <p role="status">Name change saved.</p>}
      {detail.error ? (
        <p role="alert">
          {detail.error}{" "}
          <button className="secondary" onClick={detail.reload}>
            Reload survey
          </button>
        </p>
      ) : !detail.data || detail.busy || openingNext ? (
        <p>Loading survey...</p>
      ) : (
        <SurveyDetailForm
          key={String(detail.data.updatedAt)}
          r={detail.data}
          write={write}
          manager={manager}
          onNext={onNext}
          onReload={detail.reload}
          onViewHistory={onClose}
          onSaved={(action) => {
            onSaved(action);
            if (action === "correct-name") {
              setNameSaved(true);
              detail.reload();
            }
          }}
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
  onNext,
  onReload,
  onViewHistory,
}: {
  r: Detail;
  write: boolean;
  manager: boolean;
  onSaved: (action: SurveyAction) => void;
  onNext?: () => void;
  onReload: () => void;
  onViewHistory: () => void;
}) {
  const matchedImport = r.importMode === ncssImportMode;
  const identity = matchedImport ? null : r.identity;
  const [memberId, setMemberId] = useState(""),
    [candidate, setCandidate] = useState<Candidate | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [notes, setNotes] = useState(""),
    [editingName, setEditingName] = useState(false),
    [correctedName, setCorrectedName] = useState(
      identity?.correctedName ?? identity?.cleanedName ?? "",
    ),
    [nameReason, setNameReason] = useState(""),
    [phase, setPhase] = useState(r.phase),
    [date, setDate] = useState(
      r.surveyDate
        ? new Date(new Date(r.surveyDate).getTime() + 8 * 3600000)
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [dob, setDob] = useState(
      identity?.dob ? new Date(identity.dob).toISOString().slice(0, 10) : "",
    ),
    [answers, setAnswers] = useState<Record<string, number | null>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const checkMember = async () => {
    if (busy || editingName || !memberId.trim()) return;
    setBusy(true);
    setError("");
    setCandidate(null);
    setConfirmed(false);
    try {
      setCandidate(
        await request("/api/surveys", { action: "lookup", id: r.id, memberId }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The Member ID could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  };
  const execute = async (action: SurveyAction, name?: string | null) => {
    setBusy(true);
    setError("");
    try {
      await request("/api/surveys", {
        action,
        id: r.id,
        version: r.updatedAt,
        ...(action === "correct-name"
          ? { notes: nameReason, correctedName: name }
          : {
              notes,
              personId: candidate?.id,
              memberId: candidate?.memberId,
              confirmed,
              ...(action === "link" ? { verificationMethod: "CaritaHub" } : {}),
              phase,
              ...(date !==
              (r.surveyDate
                ? new Date(new Date(r.surveyDate).getTime() + 8 * 3600000)
                    .toISOString()
                    .slice(0, 16)
                : "")
                ? { surveyDate: date ? date + ":00+08:00" : "" }
                : {}),
              ...(dob !==
              (identity?.dob
                ? new Date(identity.dob).toISOString().slice(0, 10)
                : "")
                ? { dob }
                : {}),
              answers,
            }),
      });
      onSaved(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot save survey.");
    } finally {
      setBusy(false);
    }
  };
  const effective = identity
    ? scoreSurvey(r.answers as Record<string, unknown>)
    : null;
  return (
    <div className="survey-detail">
      {identity && (
        <h3>
          {identity.correctedName ||
            identity.cleanedName ||
            "Name not supplied"}
        </h3>
      )}
      <p>
        <br />
        Response reference: {r.id}
        {identity && (
          <>
            <br />
            Original submission: {identity.submittedName || "Not supplied"}
            <br />
            Birth date submitted: {identity.dobText || "Not supplied"}
          </>
        )}
        <br />
        Survey date: {dateLabel(r.surveyDate)}
        <br />
        Recorded phase: {(identity ? r.phaseText : r.phase) || "Missing"}
        <br />
        Centre: {r.centre} / Export: {r.language}
      </p>
      {r.personId && (
        <Link
          href={`/people/${r.personId}?tab=surveys`}
          onClick={onViewHistory}
        >
          View Survey History
        </Link>
      )}
      {matchedImport && (
        <section>
          <p>
            Verified Member ID <strong>{r.confirmedMemberId}</strong> ? Matched
            in Excel
          </p>
          {r.canReassign && (
            <details>
              <summary>Correct Member ID</summary>
              <label>
                Replacement Member ID
                <input
                  value={memberId}
                  onChange={(e) => {
                    setMemberId(e.target.value);
                    setCandidate(null);
                    setConfirmed(false);
                  }}
                />
              </label>
              <button
                className="secondary"
                disabled={busy || !memberId.trim()}
                onClick={() => void checkMember()}
              >
                Check Member ID
              </button>
              {candidate && (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I verified that this response belongs to{" "}
                    {candidate.memberId} in {candidate.centre}.
                  </label>
                  <label>
                    Reason for Member ID correction
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !confirmed || !notes.trim()}
                    onClick={() => void execute("reassign-import")}
                  >
                    Confirm Member ID correction
                  </button>
                </>
              )}
            </details>
          )}
          {!!r.identity?.reviews.length && (
            <details>
              <summary>Member ID correction history</summary>
              <ul>
                {r.identity.reviews.map((review) => (
                  <li key={review.id}>
                    {review.action} {review.memberId} ?{" "}
                    {dateLabel(review.reviewedAt)} ? {review.reviewerName} ?{" "}
                    {review.notes}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {write && identity && (
        <section>
          <button
            className="secondary"
            disabled={busy}
            aria-expanded={editingName}
            onClick={() => {
              setCorrectedName(identity.correctedName ?? identity.cleanedName);
              setNameReason("");
              setError("");
              setEditingName(!editingName);
            }}
          >
            {editingName ? "Cancel name edit" : "Correct Display Name"}
          </button>
          {editingName && (
            <div className="form-grid">
              <label>
                Corrected display name
                <input
                  aria-label="Corrected display name"
                  value={correctedName}
                  maxLength={150}
                  onChange={(e) => setCorrectedName(e.target.value)}
                />
              </label>
              <label>
                Reason for name correction (optional)
                <textarea
                  aria-label="Reason for name correction (optional)"
                  value={nameReason}
                  maxLength={2000}
                  onChange={(e) => setNameReason(e.target.value)}
                />
              </label>
              <div className="actions">
                <button
                  disabled={busy || !correctedName.trim()}
                  onClick={() => void execute("correct-name", correctedName)}
                >
                  Save Name
                </button>
                {identity.correctedName && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void execute("correct-name", null)}
                  >
                    Reverse Name Correction
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
      <p>
        {r.personId
          ? `Linked to Member ID ${r.confirmedMemberId}`
          : "Unmatched"}
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
      {write && identity && !r.personId && (
        <section>
          <h3>Verify the Member ID in CaritaHub</h3>
          <p>
            Search for this caregiver in CaritaHub and verify their Member ID
            before linking the survey.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void checkMember();
            }}
          >
            <label>
              Enter Member ID
              <input
                value={memberId}
                maxLength={150}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => {
                  setMemberId(event.target.value);
                  setCandidate(null);
                  setConfirmed(false);
                  setError("");
                }}
              />
            </label>
            <div className="actions">
              <button
                className="secondary"
                disabled={busy || editingName || !memberId.trim()}
              >
                Check Member ID
              </button>
            </div>
          </form>
          {candidate && (
            <>
              <div className="notice">
                <div>
                  P3H record found for Member ID{" "}
                  <strong>{candidate.memberId}</strong>
                  <br />
                  {candidate.centre} · {candidate.status}
                </div>
              </div>
              {candidate.birthDateConflict && (
                <p className="notice">
                  The submitted birth date differs from the P3H record. Recheck
                  the identity before confirming.
                </p>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || editingName}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I verified this respondent and Member ID in CaritaHub.
              </label>
            </>
          )}
        </section>
      )}
      {write && identity && (
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
          {error.startsWith("This survey changed") && (
            <button className="secondary" onClick={onReload}>
              Reload survey
            </button>
          )}
        </p>
      )}
      {write && identity && !r.personId && (
        <div className="actions">
          <button
            disabled={
              busy || editingName || !candidate || !confirmed || !notes.trim()
            }
            onClick={() => void execute("link")}
          >
            {onNext ? "Confirm Match & Next" : "Confirm Match"}
          </button>
          <button
            className="secondary"
            disabled={busy || editingName || !notes.trim()}
            onClick={() => void execute("reject")}
          >
            Reject Match
          </button>
          {onNext && (
            <button
              className="secondary"
              disabled={busy || editingName}
              onClick={onNext}
            >
              Skip to Next Survey
            </button>
          )}
        </div>
      )}
      {manager && identity && r.personId && (
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
            disabled={busy || editingName || !confirmed || !notes.trim()}
            onClick={() => void execute("unlink")}
          >
            Unlink Survey
          </button>
        </>
      )}
      <Table
        headers={["Metric", "Score"]}
        rows={scoreColumns.map((k, i) => ({
          id: k,
          cells: [labels[i], displayScore(r[k])],
        }))}
      />
      {identity && (
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
                {surveyPhases.map((p) => (
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
                    : (effective?.values[key] ?? "")
                }
                onChange={(e) =>
                  setAnswers((xs) => ({
                    ...xs,
                    [key]:
                      e.target.value === "" ? null : Number(e.target.value),
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
              disabled={busy || editingName || !notes.trim()}
              onClick={() => void execute("correct")}
            >
              Save survey corrections
            </button>
          )}
        </details>
      )}
      {identity && identity.nameHistory.length > 0 && (
        <details>
          <summary>Name correction history</summary>
          <ul>
            {identity.nameHistory.map((entry) => (
              <li key={entry.id}>
                {entry.reviewerName} ·{" "}
                {new Date(entry.timestamp).toLocaleString("en-SG", {
                  timeZone: "Asia/Singapore",
                })}
                <br />
                {entry.previous ?? identity.submittedName} →{" "}
                {entry.corrected ?? identity.submittedName}
                {entry.notes && <small>{entry.notes}</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {identity && (
        <details>
          <summary>View Matching History</summary>
          <p>{r.method}</p>
          {identity.corrections.map((h) => (
            <details key={h.id}>
              <summary>
                {h.action} by {h.user.name} / {dateLabel(h.timestamp)}
              </summary>
              <pre className="survey-summary">
                {JSON.stringify(h.changes, null, 2)}
              </pre>
            </details>
          ))}
          {identity.reviews.map((h) => (
            <p key={h.id}>
              {h.action} / {h.memberId || "Unmatched"} /{" "}
              {new Date(h.reviewedAt).toLocaleString("en-SG", {
                timeZone: "Asia/Singapore",
              })}{" "}
              / {h.reviewerName} / {h.method}
              <br />
              {h.notes}
            </p>
          ))}
        </details>
      )}
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
