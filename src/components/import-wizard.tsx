"use client";
import {apiFetch} from "@/lib/client-http";
import { bulkReview, reviewCategory } from "@/lib/import-review";
import {
  IMPORT_COMMIT_CHUNK_SIZE,
  commitImportChunks,
} from "@/lib/import-chunks";
import { useState } from "react";
import Link from "next/link";
import type { ImportRow } from "@/lib/importer";
import { columns } from "@/lib/import-fields";
import { supportFromNotes } from "@/lib/support-notes";
import { Table, Editor, Badge } from "./ui";
type ReviewRow = ImportRow & {
  excel?: Record<string, string>;
  confirmedRecipient?: boolean;
  recipientName?: string;
  recipientRelationship?: string;
  assessmentOwner?: string;
};
async function post(body: unknown) {
  const r = await apiFetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}
export default function ImportWizard({
  onImported,
}: {
  onImported: () => Promise<void>;
}) {
  const [book, setBook] = useState<{
      headers: string[];
      rawRows: Record<string, string | number>[];
      filename: string;
      date1904: boolean;
    } | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [rows, setRows] = useState<ReviewRow[]>([]),
    [review, setReview] = useState<ReviewRow | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<{
      done: number;
      total: number;
    } | null>(null),
    [summary, setSummary] = useState<{
      created: number;
      updated: number;
      skipped: number;
    } | null>(null),
    [stage, setStage] = useState(1);
  const [category, setCategory] = useState("All"),
    [selected, setSelected] = useState<Set<number>>(new Set());
  const work = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };
  const update = (row: ReviewRow) =>
    setRows((r) => r.map((x) => (x.rowNumber === row.rowNumber ? row : x)));
  return (
    <>
      <div className="steps">
        {[
          "Select workbook",
          "Map columns",
          "Review records",
          "Import summary",
        ].map((s, i) => (
          <span key={s} className={stage === i + 1 ? "current" : ""}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {stage === 1 && (
        <section className="panel">
          <h2>Import member records</h2>
          <p>
            Upload an Excel workbook (.xlsx, up to 10 MB and 10,000 records).
            Nothing is saved until you review and confirm.
          </p>
          <label>
            Excel workbook
            <input
              aria-label="Excel workbook"
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void work(async () => {
                  const fd = new FormData();
                  fd.set("file", f);
                  const r = await apiFetch("/api/import", {
                    method: "POST",
                    body: fd,
                  });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error);
                  setBook(j);
                  setMapping(
                    Object.fromEntries(
                      columns.map((c) => [c, j.headers.includes(c) ? c : ""]),
                    ),
                  );
                  setStage(2);
                });
              }}
            />
          </label>
          <p className="muted">
            Original cells and remarks are retained alongside structured fields.
            Older .xls files must be saved as .xlsx first.
          </p>
        </section>
      )}
      {stage === 2 && book && (
        <section className="panel">
          <h2>Map columns · {book.rawRows.length} rows</h2>
          <div className="form-grid">
            {columns.map((c) => (
              <label key={c}>
                {c}
                {c === "Member ID" ? " *" : ""}
                <select
                  aria-label={`Map ${c}`}
                  value={mapping[c]}
                  onChange={(e) =>
                    setMapping({ ...mapping, [c]: e.target.value })
                  }
                >
                  <option value="">Do not map</option>
                  {book.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const j = await post({ ...book, mapping, action: "preview" });
                  setRows(
                    j.rows.map((r: ReviewRow) => ({
                      ...r,
                      excel: Object.fromEntries(
                        Object.keys(r.existing ?? {})
                          .filter((k) => k !== "updatedAt")
                          .map((k) => [
                            k,
                            String(r[k as keyof ReviewRow] ?? ""),
                          ]),
                      ),
                    })),
                  );
                  setStage(3);
                })
              }
            >
              {busy ? "Validating…" : "Parse and preview"}
            </button>
            <button className="secondary" onClick={() => setStage(1)}>
              Choose another file
            </button>
          </div>
        </section>
      )}
      {stage === 3 && book && (
        <>
          <div className="stat-grid">
            {[
              ["Total rows", rows.length],
              ["Valid rows", rows.filter((r) => !r.errors.length).length],
              ["Warnings", rows.filter((r) => r.warnings.length).length],
              ["Errors", rows.filter((r) => r.errors.length).length],
              [
                "Possible duplicates",
                rows.filter(
                  (r) =>
                    r.existingId ||
                    r.errors.some((e) => e.includes("Duplicate")),
                ).length,
              ],
              ["New records", rows.filter((r) => !r.existingId).length],
              ["Existing records", rows.filter((r) => r.existingId).length],
            ].map(([k, v]) => (
              <div className="stat" key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <p>
            Review each row. Existing records default to Skip. Updates replace
            the mapped fields, including blanks; inspect the comparison before
            choosing Update existing.
          </p>
          <div className="tabs">
            {[
              "All",
              "Ready",
              "Warnings",
              "Errors",
              "Duplicates",
              "Existing",
              "New",
            ].map((c) => (
              <button
                key={c}
                className={category === c ? "selected" : "secondary"}
                onClick={() => setCategory(c)}
              >
                {c} {rows.filter((r) => reviewCategory(r, c)).length}
              </button>
            ))}
          </div>
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setRows(bulkReview(rows, "new"))}
            >
              Import all valid new records
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setRows(bulkReview(rows, "errors"))}
            >
              Skip all errors
            </button>
            <button
              className="secondary"
              disabled={busy || !selected.size}
              onClick={() => {
                if (
                  window.confirm(
                    "Update selected existing records using the reviewed values?",
                  )
                )
                  setRows(bulkReview(rows, "existing", selected));
              }}
            >
              Update selected existing records
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setRows(bulkReview(rows, "duplicates"))}
            >
              Skip all duplicates
            </button>
          </div>
          <Table
            headers={[
              "Row / Member ID",
              "Parsed information",
              "Issues",
              "Action",
              "Review",
            ]}
            rows={rows
              .filter((r) => reviewCategory(r, category))
              .map((r) => ({
                id: String(r.rowNumber),
                sort: String(r.rowNumber).padStart(6, "0"),
                cells: [
                  <span key="id">
                    <label className="row-select">
                      <input
                        type="checkbox"
                        aria-label={`Select row ${r.rowNumber}`}
                        checked={selected.has(r.rowNumber)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.rowNumber);
                            else next.delete(r.rowNumber);
                            return next;
                          })
                        }
                      />
                      {r.rowNumber} · {r.memberId || "Missing ID"}
                    </label>
                  </span>,
                  <span key="info">
                    {r.dob || "No date"} · {r.languages || "No language"}
                    <br />
                    {r.interests}
                    <br />
                    Suggested CR:{" "}
                    {r.recipientConditions || r.suggested.cr || "None"}
                    <br />
                    Support:{" "}
                    {supportFromNotes(r.remarks)
                      .map((s) => `${s.scheme} (${s.status})`)
                      .join(", ") || "None identified"}
                  </span>,
                  <span key="issues">
                    {[...r.errors, ...r.warnings].map((s, i) => (
                      <p key={i}>
                        <Badge>{s}</Badge>
                      </p>
                    ))}
                  </span>,
                  <select
                    aria-label={`Action for row ${r.rowNumber}`}
                    key="action"
                    value={r.action}
                    onChange={(e) =>
                      update({
                        ...r,
                        action: e.target.value as ReviewRow["action"],
                      })
                    }
                  >
                    <option>Skip</option>
                    <option>
                      {r.existingId ? "Update existing" : "Import"}
                    </option>
                  </select>,
                  <div key="review">
                    {r.existing && (
                      <details className="comparison">
                        <summary>Compare changed fields</summary>
                        <table>
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Current Record</th>
                              <th>Excel Record</th>
                              <th>Decision</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(r.existing)
                              .filter(
                                ([k, v]) =>
                                  k !== "updatedAt" &&
                                  (r.excel?.[k] ??
                                    String(r[k as keyof ReviewRow] ?? "")) !==
                                    v,
                              )
                              .map(([key, current]) => (
                                <tr key={key}>
                                  <td>{key}</td>
                                  <td>{current || "Not recorded"}</td>
                                  <td>
                                    {(r.excel?.[key] ??
                                      String(
                                        r[key as keyof ReviewRow] ?? "",
                                      )) ||
                                      "Blank"}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() =>
                                        update({ ...r, [key]: current })
                                      }
                                    >
                                      Keep Current
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() => {
                                        setReview(r);
                                      }}
                                    >
                                      Review Manually
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() =>
                                        update({
                                          ...r,
                                          [key]:
                                            r.excel?.[key] ??
                                            String(
                                              r[key as keyof ReviewRow] ?? "",
                                            ),
                                          action: "Update existing",
                                        })
                                      }
                                    >
                                      Use Excel Value
                                    </button>
                                    <small>
                                      Reviewed:{" "}
                                      {String(
                                        r[key as keyof ReviewRow] ?? "",
                                      ) || "Blank"}
                                    </small>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        <button
                          className="secondary"
                          onClick={() => update({ ...r, action: "Skip" })}
                        >
                          Skip Record
                        </button>
                      </details>
                    )}
                    <button
                      key="review"
                      className="secondary"
                      onClick={() => setReview(r)}
                    >
                      Review / correct
                    </button>
                  </div>,
                ],
              }))}
          />
          <p>
            Confirming import also adds recognised Receiving, Received and
            Completed support from member remarks to Grants &amp; Support.
            Existing schemes are skipped; original text is retained and dates
            and amounts require staff review. Rows are saved in batches of{" "}
            {IMPORT_COMMIT_CHUNK_SIZE}, so a large file uploads all at once
            without one long transaction failing.
          </p>
          <div className="actions">
            <button
              disabled={busy || !rows.some((r) => r.action !== "Skip")}
              onClick={() =>
                void work(async () => {
                  if (
                    !window.confirm(
                      `Import ${rows.filter((r) => r.action !== "Skip").length} selected rows? They will be saved in batches of ${IMPORT_COMMIT_CHUNK_SIZE}. Existing rows selected for update will be replaced with the reviewed values.`,
                    )
                  )
                    return;
                  setProgress({ done: 0, total: rows.length });
                  const result = await commitImportChunks(
                    rows,
                    book.filename,
                    post,
                    (done) => setProgress({ done, total: rows.length }),
                  );
                  setProgress(null);
                  setSummary({
                    created: result.created,
                    updated: result.updated,
                    skipped: result.skipped,
                  });
                  if (result.error) {
                    setError(
                      `Saved ${result.attempted} of ${result.total} rows before the server stopped responding (${result.error}). Nothing already saved was lost. Re-upload the same file and preview again — the saved rows will appear as existing records and be skipped — then confirm the rest.`,
                    );
                    return;
                  }
                  setStage(4);
                  await onImported();
                })
              }
            >
              {busy
                ? progress
                  ? `Saving… ${progress.done}/${progress.total} rows`
                  : "Saving transaction…"
                : "Confirm import"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setStage(2)}
            >
              Back to mapping
            </button>
          </div>
        </>
      )}
      {review && (
        <Editor
          title={`Review row ${review.rowNumber}`}
          initial={{
            ...review,
            confirmedRecipient: String(review.confirmedRecipient ?? false),
            comparison: JSON.stringify(review.existing ?? {}, null, 2),
            original: JSON.stringify(review.raw, null, 2),
          }}
          fields={[
            ...[
              "memberId",
              "name",
              "dob",
              "centre",
              "gender",
              "race",
              "workingStatus",
              "languages",
              "interests",
              "conditions",
              "onboardingDate",
              "tags",
              "remarks",
            ].map((key) => ({
              key,
              label: (
                {
                  memberId: "Member ID",
                  name: "Name",
                  dob: "Date of birth",
                  centre: "Centre",
                  gender: "Gender",
                  race: "Race",
                  workingStatus: "Working status",
                  languages: "Languages",
                  interests: "Interests",
                  conditions: "Member conditions",
                  onboardingDate: "P3H onboarding date",
                  tags: "Tags",
                  remarks: "Remarks",
                } as Record<string, string>
              )[key],
              type: (key === "dob" || key === "onboardingDate"
                ? "date"
                : key === "remarks"
                  ? "textarea"
                  : "text") as "date" | "textarea" | "text",
              section: "Member",
            })),
            {
              key: "recipientName",
              label: "Confirmed care-recipient name or alias",
              section: "Suggested care recipient",
            },
            {
              key: "zbi",
              label: "ZBI assessment (0–88)",
              type: "number",
              section: "Suggested care recipient",
            },
            {
              key: "assessmentOwner",
              label: "Confirmed assessment owner",
              type: "select",
              options: [
                { value: "", label: "Keep as suggestion only" },
                { value: "Member", label: "Member / caregiver" },
                { value: "Care Recipient", label: "Confirmed care recipient" },
              ],
              section: "Suggested care recipient",
            },
            {
              key: "recipientConditions",
              label: "Care-recipient conditions",
              section: "Suggested care recipient",
            },
            {
              key: "recipientRelationship",
              label: "Relationship to member",
              section: "Suggested care recipient",
            },
            {
              key: "confirmedRecipient",
              label: "Create and link this care recipient?",
              type: "select",
              options: [
                {
                  value: "false",
                  label: "No — keep as suggestion in original text",
                },
                { value: "true", label: "Yes — confirmed by staff" },
              ],
              section: "Suggested care recipient",
            },
            {
              key: "comparison",
              label: "Existing values (reference only)",
              type: "textarea",
              section: "Comparison",
              hint: "Compare these values before selecting Update existing.",
            },
            {
              key: "original",
              label: "Original cells (reference only)",
              type: "textarea",
              section: "Original data",
            },
          ]}
          onClose={() => setReview(null)}
          onSave={async (values) => {
            const memberId = values.memberId.trim();
            const errors: string[] = [];
            if (!memberId) errors.push("Member ID is required");
            if (
              rows.some(
                (r) =>
                  r.rowNumber !== review.rowNumber &&
                  r.memberId === memberId &&
                  r.action !== "Skip",
              )
            )
              errors.push("Duplicate selected Member ID");
            update({
              ...review,
              ...values,
              memberId,
              errors,
              confirmedRecipient: values.confirmedRecipient === "true",
            });
          }}
          key={review.rowNumber}
        />
      )}
      {stage === 4 && summary && (
        <section className="panel">
          <h2>Import saved</h2>
          <p>
            {summary.created} new records · {summary.updated} updated ·{" "}
            {summary.skipped} skipped.
          </p>
          <p>
            Original imported data is retained in each member profile and the
            import history.
          </p>
          <Link href="/members">View members</Link>
          <div className="actions">
            <button
              onClick={() => {
                setStage(1);
                setBook(null);
                setRows([]);
                setSummary(null);
              }}
            >
              Import another workbook
            </button>
          </div>
        </section>
      )}
    </>
  );
}
