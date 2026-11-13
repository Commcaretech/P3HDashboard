"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, Table } from "./ui";
import { request, useFilters } from "./common";
import { useResource } from "./use-resource";
import { useWorkspaceCache } from "./workspace-cache";
import type { TrashRow, TrashType } from "@/lib/trash";

export function TrashButton({
  type,
  id,
  onChanged,
}: {
  type: TrashType;
  id: string;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        Move to Trash
      </button>
      {open && (
        <TrashDialog
          type={type}
          id={id}
          intent="move"
          onClose={() => setOpen(false)}
          onChanged={async () => {
            setOpen(false);
            await onChanged();
          }}
        />
      )}
    </>
  );
}
function TrashDialog({
  type,
  id,
  intent,
  onClose,
  onChanged,
}: {
  type: TrashType;
  id: string;
  intent: "move" | "restore";
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [record, setRecord] = useState<TrashRow | null>(null),
    [error, setError] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const cache = useWorkspaceCache();
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    request(
      `/api/trash?action=preview&type=${type}&id=${encodeURIComponent(id)}`,
      undefined,
      abort.signal,
    )
      .then((r) => {
        if (active) setRecord(r);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Cannot load Trash preview.",
          );
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [type, id, reload]);
  const save = async () => {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/trash", {
        action: intent,
        type,
        id,
        version: record.version,
        confirmed,
        reason,
      });
      cache?.invalidate(() => true);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot update Trash.");
    } finally {
      setBusy(false);
    }
  };
  const mismatch = Boolean(
    record && (intent === "move" ? record.deletedAt : !record.deletedAt),
  );
  return (
    <Modal
      title={intent === "move" ? "Move record to Trash" : "Restore record"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!record && !error && (
        <p role="status">Checking record and related history...</p>
      )}
      {record && (
        <div className="trash-preview">
          <h3>{record.label}</h3>
          <p>
            {record.kind} / {record.centre || "Shared centre"}
          </p>
          <p>
            {intent === "move"
              ? "The selected record will be hidden from normal lists and calculations. You can restore it from Trash. Nothing is permanently erased."
              : "The record will return with its existing status and retained history. Other records that you separately moved to Trash stay in Trash."}
          </p>
          <ul>
            {record.impact.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {mismatch && (
            <p className="notice">
              This record is already{" "}
              {record.deletedAt ? "in Trash" : "restored"}. Close this preview
              and refresh the list.
            </p>
          )}
          {intent === "restore" && record.parentTrashed && (
            <p className="notice">
              Restore the linked caregiver or care recipient first.
            </p>
          )}
          <label>
            Reason or note (optional)
            <textarea
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {intent === "move"
              ? "I confirm moving this record to Trash, while retaining its linked history."
              : "I confirm restoring this record."}
          </label>
          <div className="actions">
            <button
              disabled={
                busy ||
                !confirmed ||
                mismatch ||
                (intent === "restore" && record.parentTrashed)
              }
              onClick={() => void save()}
            >
              {busy
                ? "Saving..."
                : intent === "move"
                  ? "Confirm Move to Trash"
                  : "Confirm Restore"}
            </button>
            <button className="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setRecord(null);
            setError("");
            setConfirmed(false);
            setReload((n) => n + 1);
          }}
        >
          Reload Trash preview
        </button>
      )}
    </Modal>
  );
}
export default function Trash({
  revision = 0,
  onChanged,
}: {
  revision?: number;
  onChanged: () => void | Promise<void>;
}) {
  const [f, setF] = useFilters(),
    [search, setSearch] = useState(f.q || ""),
    [debounced, setDebounced] = useState(f.q || ""),
    [selected, setSelected] = useState<TrashRow | null>(null),
    [previous, setPrevious] = useState<string[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = new URLSearchParams({
    type: f.type || "all",
    q: debounced,
    ...(debounced === (f.q || "") && f.cursor ? { cursor: f.cursor } : {}),
  });
  const resource = useResource<{
    rows: TrashRow[];
    total: number;
    nextCursor: string | null;
  }>("trash", `/api/trash?${query}`, revision);
  const data = resource.busy ? null : resource.data;
  return (
    <div className="trash-workspace">
      <section className="panel">
        <h2>Trash</h2>
        <p>
          Restore caregivers, care recipients, grants, programmes and survey
          responses moved here. Linked history stays stored. Records hidden
          because their caregiver is in Trash return when that caregiver is
          restored.
        </p>
        <p>
          Admin and Manager accounts can move or restore records within their
          permitted centres. There is no permanent-delete action or automatic
          emptying.
        </p>
      </section>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          Search Trash
          <input
            aria-label="Search Trash"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPrevious([]);
              setF({ type: f.type || "all", q: e.target.value });
            }}
          />
        </label>
        <label>
          Record type
          <select
            value={f.type || "all"}
            onChange={(e) => {
              setPrevious([]);
              setF({ type: e.target.value, q: search });
            }}
          >
            <option value="all">All record types</option>
            <option value="person">Caregivers and care recipients</option>
            <option value="grant">Grants and referrals</option>
            <option value="programme">Programmes</option>
            <option value="survey">Surveys</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={resource.reload}>
          Refresh Trash
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {resource.error && (
        <p className="error" role="alert">
          {resource.error}
        </p>
      )}
      {resource.busy && <p role="status">Loading Trash...</p>}
      {data && (
        <>
          <p>{data.total} records in Trash matching these filters.</p>
          <Table
            hidePagination
            headers={["Record", "Type", "Centre", "Moved to Trash", "Action"]}
            rows={data.rows.map((r) => ({
              id: r.type + ":" + r.id,
              cells: [
                r.label,
                r.kind,
                r.centre || "Shared centre",
                new Date(r.deletedAt!).toLocaleString("en-SG", {
                  timeZone: "Asia/Singapore",
                }),
                <div key="restore">
                  {r.parentTrashed && (
                    <small>Restore linked person first</small>
                  )}
                  <button className="secondary" onClick={() => setSelected(r)}>
                    Restore
                  </button>
                </div>,
              ],
            }))}
            server={{
              total: data.total,
              page: 1,
              size: 20,
              onSort: () => {},
              sortableColumns: [],
              onPage: () => {},
              onSize: () => {},
            }}
          />
          {!data.rows.length && (
            <section className="panel">
              <h3>Trash is empty</h3>
              <p>
                Use Move to Trash from a record’s actions when you need to
                remove it from normal views.
              </p>
              <Link href="/dashboard">Return to dashboard</Link>
            </section>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={!previous.length}
              onClick={() => {
                const stack = [...previous],
                  cursor = stack.pop()!;
                setPrevious(stack);
                setF({ ...f, q: debounced, cursor });
              }}
            >
              Previous Trash results
            </button>
            <button
              className="secondary"
              disabled={!data.nextCursor}
              onClick={() => {
                setPrevious([...previous, f.cursor || ""]);
                setF({ ...f, q: debounced, cursor: data.nextCursor! });
              }}
            >
              Next Trash results
            </button>
          </div>
        </>
      )}
      {selected && (
        <TrashDialog
          type={selected.type}
          id={selected.id}
          intent="restore"
          onClose={() => setSelected(null)}
          onChanged={async () => {
            setSelected(null);
            setMessage("Record restored with its retained history.");
            resource.reload();
            await onChanged();
          }}
        />
      )}
    </div>
  );
}
