"use client";

import { useEffect, useRef, useState } from "react";
import { request } from "./common";
import { Table } from "./ui";
import { useResource } from "./use-resource";
import { ncssFileLimit, readMatchedNCSS } from "@/lib/ncss-matched-csv";
import { surveyLanguages, type SurveyLanguage } from "@/lib/survey-csv";
import type { NCSSPreview, NCSSResult } from "@/lib/ncss-import";

export default function SurveyImport({
  onSaved,
  navigate,
}: {
  onSaved: () => void;
  navigate: (view: string, batch?: string) => void;
}) {
  const options = useResource<{
    centres: string[];
    ncssImportEnabled: boolean;
  }>("surveys", "/api/surveys?view=options");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<SurveyLanguage>("English");
  const [centre, setCentre] = useState("");
  const [review, setReview] = useState<{
    data: NCSSPreview;
    parsed: ReturnType<typeof readMatchedNCSS>;
  } | null>(null);
  const [result, setResult] = useState<NCSSResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const submitting = useRef(false);
  const activePreview = useRef<AbortController | null>(null);
  useEffect(() => () => activePreview.current?.abort(), []);
  const reset = () => {
    setReview(null);
    setResult(null);
    setError("");
  };
  const execute = async (action: "preview" | "import") => {
    if (
      submitting.current ||
      !file ||
      !centre ||
      !options.data?.ncssImportEnabled ||
      (action === "import" && !review)
    )
      return;
    const controller = action === "preview" ? new AbortController() : null;
    activePreview.current = controller;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (file.size > ncssFileLimit)
        throw new Error("Choose a CSV file no larger than 4 MB.");
      let parsed = review?.parsed;
      if (action === "preview" || !parsed) {
        let csv: string;
        try {
          csv = new TextDecoder("utf-8", { fatal: true }).decode(
            await file.arrayBuffer(),
          );
        } catch {
          throw new Error(
            "This file is not valid UTF-8. In Excel, save it as CSV UTF-8 and try again.",
          );
        }
        parsed = readMatchedNCSS(csv, language);
      }
      const body = {
        action,
        centre,
        language: parsed.language,
        rows: parsed.rows,
        excludedConsent: parsed.excluded.filter(
          (row) => row.status === "Consent excluded",
        ).length,
        excludedTest: parsed.excluded.filter(
          (row) => row.status === "Test excluded",
        ).length,
      };
      if (action === "preview") {
        const data: NCSSPreview = await request(
          "/api/surveys",
          body,
          controller?.signal,
        );
        setReview({ data, parsed });
        setPage(1);
      } else {
        const data: NCSSResult = await request("/api/surveys", {
          ...body,
          reviewToken: review!.data.reviewToken,
        });
        setResult(data);
        setReview(null);
        setFile(null);
        onSaved();
      }
    } catch (e) {
      if (!controller?.signal.aborted)
        setError(e instanceof Error ? e.message : "Survey import failed.");
    } finally {
      activePreview.current = null;
      setBusy(false);
      submitting.current = false;
    }
  };
  const rows = review
    ? [
        ...review.data.rows,
        ...review.parsed.excluded.map(({ rowNumber, status }) => ({
          rowNumber,
          status,
          surveyDate: null,
          phase: "",
          overall: null,
          zbi: null,
          warnings: [],
        })),
      ].sort((a, b) => a.rowNumber - b.rowNumber)
    : [];
  const counts = review?.data.summary;
  const ready = Boolean(
    file && centre && options.data?.ncssImportEnabled && !busy,
  );
  return (
    <section className="panel">
      <h3>Import NCSS Survey Results</h3>
      <h4>1. Prepare in Excel</h4>
      <p>
        Match survey names to existing Member IDs using the Excel template. In a
        new worksheet, paste columns A to AO as values and save as CSV UTF-8.
      </p>
      <a className="button secondary" href="/api/surveys/template" download>
        Download Excel Template
      </a>
      {options.error && (
        <p role="alert" className="error">
          {options.error}{" "}
          <button className="secondary" onClick={options.reload}>
            Retry
          </button>
        </p>
      )}
      {options.data && !options.data.ncssImportEnabled && (
        <p role="status">
          NCSS import is disabled pending organisational approval. You can
          download the Excel template.
        </p>
      )}
      <h4>2. Upload the matched survey CSV</h4>
      <div className="form-grid">
        <label>
          Import centre
          <select
            aria-label="Import centre"
            value={centre}
            disabled={busy}
            onChange={(e) => {
              setCentre(e.target.value);
              reset();
            }}
          >
            <option value="">Select centre</option>
            {options.data?.centres.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Survey language
          <select
            value={language}
            disabled={busy}
            onChange={(e) => {
              setLanguage(e.target.value as SurveyLanguage);
              reset();
            }}
          >
            {surveyLanguages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          Matched survey CSV
          <input
            type="file"
            accept=".csv,text/csv"
            key={result?.batchId || "upload"}
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
          />
        </label>
      </div>
      <h4>3. Review responses</h4>
      <button disabled={!ready} onClick={() => void execute("preview")}>
        Preview responses
      </button>
      {busy && <p role="status">Processing survey responses…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {review && counts && (
        <>
          <p role="status">
            {counts.submitted} submitted · {counts.eligible} eligible ·{" "}
            {counts.ready} ready · {counts.rejected} rejected ·{" "}
            {counts.duplicates} already imported
          </p>
          <p>
            {counts.consentExcluded} consent exclusions · {counts.testExcluded}{" "}
            test exclusions · {counts.conflicts} source conflicts ·{" "}
            {counts.incomplete} incomplete among ready responses
          </p>
          <Table
            headers={[
              "CSV row",
              "Survey date / phase",
              "WHOQOL Overall",
              "Six-item ZBI",
              "Status",
            ]}
            rows={rows.slice((page - 1) * 20, page * 20).map((r) => ({
              id: String(r.rowNumber),
              cells: [
                r.rowNumber,
                r.surveyDate
                  ? `${new Date(r.surveyDate).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })} / ${r.phase}`
                  : "—",
                r.overall ?? "—",
                r.zbi ?? "—",
                <div key="status">
                  {r.status}
                  {r.status === "Member ID unavailable" && (
                    <div>Verify the Member ID and centre in Excel.</div>
                  )}
                  {r.status === "Source conflict" && (
                    <div>
                      Ask an administrator to review the existing response.
                    </div>
                  )}
                  {r.warnings.length > 0 && (
                    <details>
                      <summary>{r.warnings.length} warnings</summary>
                      <ul>
                        {r.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>,
              ],
            }))}
            server={{
              page,
              size: 20,
              total: rows.length,
              onPage: setPage,
              onSize: () => {},
              onSort: () => {},
              sortableColumns: [],
            }}
          />
          <h4>4. Import</h4>
          <button
            disabled={!ready || !counts.ready}
            onClick={() => void execute("import")}
          >
            Import Valid Responses
          </button>
        </>
      )}
      {result && (
        <>
          <h4>5. Import results</h4>
          <p role="status">
            {result.summary.saved} responses imported successfully.{" "}
            {result.summary.missingMemberId} missing Member IDs,{" "}
            {result.summary.duplicates} already imported,{" "}
            {result.summary.rejected} rejected and{" "}
            {result.summary.consentExcluded + result.summary.testExcluded}{" "}
            excluded.
          </p>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => navigate("records", result.batchId)}
            >
              View imported survey records
            </button>
            <button className="secondary" onClick={() => navigate("results")}>
              View Results &amp; Trends
            </button>
          </div>
        </>
      )}
    </section>
  );
}
