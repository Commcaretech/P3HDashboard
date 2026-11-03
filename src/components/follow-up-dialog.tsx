"use client";
import { useState } from "react";
import { Alert, Data } from "@/lib/types";
import { today } from "@/lib/domain";
import { addDays, addMonths } from "@/lib/follow-up";
import { Modal } from "./ui";
export function FollowUpDialog({
  alert,
  d,
  action,
  onClose,
}: {
  alert: Alert;
  d: Data;
  action: (a: string, v: Record<string, unknown>, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(today()),
    [outcome, setOutcome] = useState("Contacted"),
    [notes, setNotes] = useState(""),
    [resolved, setResolved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const g = d.grants.find((g) => g.id === alert.grantId);
  const next =
    !resolved && g?.recurring && date
      ? g.followUpMonths
        ? addMonths(date, g.followUpMonths)
        : g.followUpDays
          ? addDays(date, g.followUpDays)
          : ""
      : "";
  return (
    <Modal
      title="Mark Follow-up Done"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await action(
              "completeFollowUp",
              {
                completedAt: date,
                outcome,
                notes,
                resolution: resolved ? "Resolved" : "Open",
              },
              alert.id,
            );
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{alert.title}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-grid">
          <label>
            Follow-up date
            <input
              aria-label="Follow-up date"
              type="date"
              required
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Outcome
            <select
              aria-label="Outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              {[
                "Contacted",
                "Pending Response",
                "Approved",
                "Unsuccessful",
                "Other",
              ].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            Notes (optional)
            <textarea
              aria-label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={12000}
            />
          </label>
          <label>
            Resolution
            <select
              aria-label="Resolution"
              value={resolved ? "Resolved" : "Open"}
              onChange={(e) => setResolved(e.target.value === "Resolved")}
            >
              <option>Open</option>
              <option>Resolved</option>
            </select>
          </label>
        </div>
        <p role="status">
          {next
            ? `Next follow-up: ${next}. Calculated from the actual follow-up date.`
            : resolved
              ? "Future follow-ups will stop. Independent expiry reminders remain."
              : "One-time follow-up. No repeat will be scheduled."}
        </p>
        <div className="actions">
          <button disabled={busy}>
            {busy ? "Saving..." : "Save follow-up"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
