"use client";
import { useState } from "react";
import { Table, Badge } from "./ui";
import { request } from "./common";
import type { SupportSuggestion } from "@/lib/support-notes";
type Row = SupportSuggestion & {
  personId: string;
  personLabel: string;
  version: string;
  existing: boolean;
};
const key = (r: Row) => `${r.personId}:${r.scheme}`;

export default function SupportExtraction({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to extract support.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const result: { rows: Row[] } = await request(
              "/api/support-extraction",
              { action: "preview" },
            );
            setRows(result.rows);
            setSelected(result.rows.filter((r) => !r.existing).map(key));
          })
        }
      >
        {busy ? "Please wait…" : "Extract from member notes"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {rows && (
        <section className="panel">
          <h2>Review support found in member notes</h2>
          <p>
            Recognised schemes only. Original notes remain unchanged. Existing
            support will be skipped. Dates and amounts remain unset; review the
            source text before confirming.
          </p>
          <p>
            {rows.length} suggestions · {rows.filter((r) => r.existing).length}{" "}
            already recorded · {selected.length} selected
          </p>
          <Table
            headers={[
              "Select",
              "Member",
              "Scheme",
              "Status from notes",
              "Original text",
              "Action",
            ]}
            rows={rows.map((r) => ({
              id: key(r),
              cells: [
                <input
                  key="select"
                  type="checkbox"
                  aria-label={`Extract ${r.scheme} for ${r.personLabel}`}
                  checked={selected.includes(key(r))}
                  disabled={r.existing || busy}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, key(r)]
                        : selected.filter((s) => s !== key(r)),
                    )
                  }
                />,
                r.personLabel,
                r.scheme,
                <Badge key="status">{r.status}</Badge>,
                <span key="source" className="preserve">
                  {r.source}
                </span>,
                r.existing ? "Skip existing" : "Create support record",
              ],
            }))}
          />
          <div className="actions">
            <button
              disabled={busy || !selected.length}
              onClick={() =>
                run(async () => {
                  const result: { created: number; skipped: number } =
                    await request("/api/support-extraction", {
                      action: "commit",
                      selections: rows
                        .filter((r) => selected.includes(key(r)))
                        .map(({ personId, version, scheme }) => ({
                          personId,
                          version,
                          scheme,
                        })),
                    });
                  await onSaved();
                  setRows(null);
                  setMessage(
                    `${result.created} support records created; ${result.skipped} existing records skipped.`,
                  );
                })
              }
            >
              Confirm extraction
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setRows(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
