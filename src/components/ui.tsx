"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
export type Field = {
  key: string;
  label: string;
  type?:
    "text" | "date" | "time" | "number" | "password" | "textarea" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  section?: string;
  hint?: string;
};
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="dialog-title">
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="secondary"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Editor({
  title,
  fields,
  initial = {},
  onSave,
  onClose,
  confirm,
}: {
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onSave: (v: Record<string, string>) => Promise<void>;
  onClose: () => void;
  confirm?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map((f) => [f.key, String(initial[f.key] ?? "")]),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState(fields[0]?.section ?? "Details");
  const sections = [...new Set(fields.map((f) => f.section ?? "Details"))];
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            (confirm ||
              (values.status === "Archived" &&
                initial.status !== "Archived")) &&
            !window.confirm(
              "Save these changes? Review the dates, amount and status before continuing.",
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await onSave(values);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="tabs" role="tablist">
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === tab}
              className={s === tab ? "selected" : "secondary"}
              onClick={() => setTab(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-grid">
          {fields.map((f) => (
            <label
              key={f.key}
              style={{
                display: (f.section ?? "Details") === tab ? undefined : "none",
              }}
            >
              {f.label}
              {f.required ? " *" : ""}
              {f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  aria-required={f.required}
                  readOnly={f.key === "comparison" || f.key === "original"}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              ) : f.type === "select" ? (
                <select
                  aria-label={f.label}
                  aria-required={f.required}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={f.label}
                  aria-required={f.required}
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "any" : undefined}
                  value={values[f.key]}
                  maxLength={f.type === "text" || !f.type ? 12000 : undefined}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              )}{" "}
              {f.hint && <small>{f.hint}</small>}
            </label>
          ))}
        </div>
        <p className="muted">
          Fields marked * are required. Category entries may be separated with
          commas.
        </p>
        <div className="actions">
          <button disabled={busy}>{busy ? "Saving…" : "Save record"}</button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
export type Row = { id: string; cells: React.ReactNode[]; sort?: string };
export function Table({ headers, rows }: { headers: string[]; rows: Row[] }) {
  const [page, setPage] = useState(1),
    [direction, setDirection] = useState(1);
  const sorted = [...rows].sort(
    (a, b) => (a.sort ?? a.id).localeCompare(b.sort ?? b.id) * direction,
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const active = Math.min(page, pages);
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h}>
                  {i === 0 ? (
                    <button
                      className="sort"
                      onClick={() => setDirection(-direction)}
                    >
                      {h} {direction === 1 ? "↑" : "↓"}
                    </button>
                  ) : (
                    h
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice((active - 1) * 20, active * 20).map((r) => (
              <tr key={r.id}>
                {r.cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            No matching records. Change your filters or add a record.
          </div>
        )}
      </div>
      <div className="pagination">
        <span>
          {rows.length} results · Page {active} of {pages}
        </span>
        <div>
          <button
            className="secondary"
            disabled={active === 1}
            onClick={() => setPage(active - 1)}
          >
            Previous
          </button>{" "}
          <button
            className="secondary"
            disabled={active === pages}
            onClick={() => setPage(active + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
export function PersonLink({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return <Link href={`/people/${id}`}>{children}</Link>;
}
