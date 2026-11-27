"use client";
import { useState } from "react";
import { today } from "@/lib/domain";
import { Modal } from "./ui";
export function CheckInDialog({
  personId,
  personName,
  action,
  onClose,
}: {
  personId: string;
  personName?: string;
  action: (
    a: string,
    v: Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(today()),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Record monthly check-in"
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
            await action("recordCheckIn", { date, notes }, personId);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {personName
            ? `Record contact with ${personName}.`
            : "Record contact with this caregiver."}{" "}
          The next check-in is due 30 days after this date.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-grid">
          <label>
            Check-in date
            <input
              aria-label="Check-in date"
              type="date"
              required
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
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
        </div>
        <div className="actions">
          <button disabled={busy}>
            {busy ? "Saving..." : "Save check-in"}
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
