"use client";
import { useEffect, useRef, useState } from "react";
import { calculateFollowUp } from "@/lib/follow-up";
import Link from "next/link";
import { Children, isValidElement } from "react";
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "time"
    | "number"
    | "password"
    | "textarea"
    | "select"
    | "chips";
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
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
    >
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
  const isGrant =
    fields.some((f) => f.key === "scheme") &&
    fields.some((f) => f.key === "followUpFrequency");
  const plan = isGrant
    ? calculateFollowUp(
        values.scheme,
        values.submissionDate || values.applicationDate,
        values.followUpFrequency || "Automatic",
      )
    : null;
  const changeValue = (key: string, value: string) => {
    const next = { ...values, [key]: value };
    if (
      isGrant &&
      ([
        "scheme",
        "applicationDate",
        "submissionDate",
        "followUpFrequency",
      ].includes(key) ||
        (key === "resolution" && value === "Open") ||
        (key === "status" && !next.nextReviewDate))
    ) {
      next.nextReviewDate = calculateFollowUp(
        next.scheme,
        next.submissionDate || next.applicationDate,
        next.followUpFrequency || "Automatic",
      ).date;
    }
    setValues(next);
  };
  const sections = [...new Set(fields.map((f) => f.section ?? "Details"))];
  const dirty = fields.some(
    (f) => values[f.key] !== String(initial[f.key] ?? ""),
  );
  const close = () => {
    if (!busy && (!dirty || window.confirm("Discard unsaved changes?")))
      onClose();
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <Modal title={title} onClose={close}>
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
          const invalid = fields.find(
            (f) => f.required && !values[f.key]?.trim(),
          );
          if (invalid) {
            setTab(invalid.section ?? "Details");
            setError(`${invalid.label} is required.`);
            return;
          }
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
        {isGrant && (
          <p className="notice" role="status">
            {values.nextReviewDate
              ? `Next follow-up: ${values.nextReviewDate}. ${values.nextReviewDate === plan?.date ? `Calculated from ${plan.label}.` : "Staff-selected date override."}`
              : "Enter an application or submission date. Other schemes require a frequency or a one-time follow-up date."}
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
              {f.type === "chips" ? (
                <ChipInput
                  label={f.label}
                  value={values[f.key]}
                  options={f.options ?? []}
                  onChange={(v) => changeValue(f.key, v)}
                />
              ) : f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  aria-required={f.required}
                  aria-invalid={Boolean(
                    error && (error.includes(f.key) || error.includes(f.label)),
                  )}
                  readOnly={f.key === "comparison" || f.key === "original"}
                  value={values[f.key]}
                  onChange={(e) => changeValue(f.key, e.target.value)}
                />
              ) : f.type === "select" ? (
                <select
                  aria-label={f.label}
                  aria-required={f.required}
                  aria-invalid={Boolean(
                    error && (error.includes(f.key) || error.includes(f.label)),
                  )}
                  value={values[f.key]}
                  onChange={(e) => changeValue(f.key, e.target.value)}
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
                  aria-invalid={Boolean(
                    error && (error.includes(f.key) || error.includes(f.label)),
                  )}
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "any" : undefined}
                  value={values[f.key]}
                  maxLength={f.type === "text" || !f.type ? 12000 : undefined}
                  list={f.options ? `field-${f.key}` : undefined}
                  onChange={(e) => changeValue(f.key, e.target.value)}
                />
              )}{" "}
              {f.type !== "select" && f.type !== "chips" && f.options && (
                <datalist id={`field-${f.key}`}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value} />
                  ))}
                </datalist>
              )}
              {f.hint && <small>{f.hint}</small>}
              {error && (error.includes(f.key) || error.includes(f.label)) && (
                <small className="error">{error}</small>
              )}
            </label>
          ))}
        </div>
        <p className="muted">
          Fields marked * are required. Category entries may be separated with
          commas.
        </p>
        <div className="actions">
          <button disabled={busy}>{busy ? "Saving…" : "Save record"}</button>
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  const text = String(children).toLowerCase();
  const tone = /overdue|expired|rejected|high|not recommended/.test(text)
    ? "danger"
    : /pending|waitlist|review|unverified|low confidence|due soon/.test(text)
      ? "warning"
      : /inactive|archived|dismissed|closed|unassigned/.test(text)
        ? "neutral"
        : /submitted|scheduled|receiv|recorded|registered/.test(text)
          ? "info"
          : "success";
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function ChipInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const tokens = value
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const id = `choices-${label.replace(/[^a-z0-9]/gi, "-")}`;
  const [showChoices, setShowChoices] = useState(false);
  const query =
    value
      .split(/[,;\n]/)
      .at(-1)
      ?.trim()
      .toLowerCase() ?? "";
  const choices = options
    .filter(
      (o) =>
        !tokens.some((t) => t.toLowerCase() === o.value.toLowerCase()) &&
        (!query || o.label.toLowerCase().includes(query)),
    )
    .slice(0, 10);
  return (
    <div className="chip-input">
      <input
        aria-label={label}
        value={value}
        list={id}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowChoices(true)}
        placeholder="Search or add categories, separated by commas"
      />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o.value} value={o.value} />
        ))}
      </datalist>
      <div className="chips">
        {tokens.map((t, i) => (
          <button
            key={`${t}-${i}`}
            type="button"
            className="filter-chip"
            aria-label={`Remove ${t}`}
            onClick={() =>
              onChange(tokens.filter((_, j) => j !== i).join(", "))
            }
          >
            {t} ×
          </button>
        ))}
      </div>
      {showChoices && choices.length > 0 && (
        <div className="category-choices">
          <small>Select a category</small>
          {choices.map((o) => (
            <button
              type="button"
              key={o.value}
              className="secondary"
              onClick={() => {
                const parts = value
                  .split(/[,;\n]/)
                  .map((t) => t.trim())
                  .filter(Boolean);
                if (
                  query &&
                  o.label.toLowerCase().includes(query) &&
                  !options.some((x) => x.value.toLowerCase() === query)
                )
                  parts.pop();
                onChange([...new Set([...parts, o.value])].join(", "));
                setShowChoices(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function ActionMenu({
  children,
  label = "Record actions",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <details className="action-menu">
      <summary aria-label={label}>•••</summary>
      <div>{children}</div>
    </details>
  );
}
export function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading records">
      <div className="stat-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
export type Row = {
  id: string;
  cells: React.ReactNode[];
  sort?: string;
  sortValues?: (string | number)[];
};
function cellText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: React.ReactNode }>(node))
    return cellText(node.props.children);
  return Children.toArray(node)
    .map((n) =>
      isValidElement<{ children?: React.ReactNode }>(n)
        ? cellText(n.props.children)
        : String(n ?? ""),
    )
    .join(" ");
}
export type ServerTable = {
  total: number;
  page: number;
  size: number;
  onPage: (n: number) => void;
  onSize: (n: number) => void;
  onSort: (column: number, direction: number) => void;
  sortableColumns?: number[];
};
export function Table({
  headers,
  rows,
  server,
}: {
  headers: string[];
  rows: Row[];
  server?: ServerTable;
}) {
  const [page, setPage] = useState(1),
    [size, setSize] = useState(20),
    [column, setColumn] = useState(-1),
    [direction, setDirection] = useState(1);
  const sorted = server
    ? rows
    : [...rows].sort((a, b) => {
        const av =
          column < 0
            ? (a.sort ?? a.id)
            : (a.sortValues?.[column] ?? cellText(a.cells[column]));
        const bv =
          column < 0
            ? (b.sort ?? b.id)
            : (b.sortValues?.[column] ?? cellText(b.cells[column]));
        return (
          String(av).localeCompare(String(bv), undefined, { numeric: true }) *
          direction
        );
      });
  const effectiveSize = server?.size ?? size;
  const total = server?.total ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / effectiveSize)),
    active = Math.min(server?.page ?? page, pages);
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={h}
                  aria-sort={
                    column === i
                      ? direction === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {/action/i.test(h) ||
                  (server?.sortableColumns &&
                    !server.sortableColumns.includes(i)) ? (
                    h
                  ) : (
                    <button
                      className="sort"
                      onClick={() => {
                        setColumn(i);
                        setDirection(column === i ? -direction : 1);
                        setPage(1);
                        server?.onSort(i, column === i ? -direction : 1);
                      }}
                    >
                      {h} {column === i ? (direction === 1 ? "↑" : "↓") : "↕"}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(server
              ? sorted
              : sorted.slice((active - 1) * size, active * size)
            ).map((r) => (
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
          {total} results · Page {active} of {pages}
        </span>
        <label>
          Rows per page
          <select
            aria-label="Rows per page"
            value={effectiveSize}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
              server?.onSize(Number(e.target.value));
            }}
          >
            {[20, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div>
          <button
            className="secondary"
            disabled={active === 1}
            onClick={() =>
              server ? server.onPage(active - 1) : setPage(active - 1)
            }
          >
            Previous
          </button>{" "}
          <button
            className="secondary"
            disabled={active === pages}
            onClick={() =>
              server ? server.onPage(active + 1) : setPage(active + 1)
            }
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
