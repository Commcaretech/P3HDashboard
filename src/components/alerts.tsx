"use client";
import { FollowUpDialog } from "./follow-up-dialog";
import { CheckInDialog } from "./checkin-dialog";
import { Alert } from "@/lib/types";
import { useState } from "react";
import { today } from "@/lib/domain";
import { alertDue, alertGroup, alertGroups } from "@/lib/workflow";
import { Data, label, day } from "@/lib/types";
import { Table, Badge, PersonLink, Modal } from "./ui";
import { useFilters, FilterBar } from "./common";
export default function Alerts({
  d,
  write,
  action,
  onCreate,
  userId,
  followUpAction,
}: {
  d: Data;
  write: boolean;
  action: (
    a: string,
    v?: Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
  onCreate: () => void;
  userId: string;
  followUpAction?: (
    a: string,
    v: Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
}) {
  const [followUp, setFollowUp] = useState<Alert | null>(null);
  const [checkIn, setCheckIn] = useState<Alert | null>(null);
  const [f, setF] = useFilters();
  const [snooze, setSnooze] = useState<string | null>(null),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false);
  const choose = async (value: string) => {
    if (!snooze) return;
    setBusy(true);
    try {
      await action("snooze", { date: value }, snooze);
      setSnooze(null);
    } finally {
      setBusy(false);
    }
  };
  const future = (days: number) =>
    new Date(Date.parse(today()) + days * 86400000).toISOString().slice(0, 10);
  const rows = d.alerts.filter(
    (a) =>
      (!f.q || a.title.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.status
        ? a.status === (f.view === "completed" ? "Completed" : "Pending")
        : a.status === f.status) &&
      (!f.time || alertGroup(a) === f.time) &&
      (f.view !== "my" ||
        a.assignedId === userId ||
        (!a.assignedId &&
          d.people.some(
            (p) => p.id === a.personId && p.assignedId === userId,
          ))) &&
      (f.view !== "unassigned" || !a.assignedId) &&
      (f.view !== "high" || a.priority === "High") &&
      (f.view !== "overdue" || alertGroup(a) === "Overdue") &&
      (!f.type || a.type.includes(f.type)) &&
      (!f.priority || a.priority === f.priority),
  );
  return (
    <>
      {write && (
        <div className="actions">
          <button onClick={() => onCreate()}>+ Create reminder</button>
          <button className="secondary" onClick={() => void action("refresh")}>
            Refresh Alerts
          </button>
        </div>
      )}
      <p>
        Birthday, grant and monthly check-in reminders run through the
        scheduled job and after record changes. Repeated refreshes do not
        create duplicate alerts.
      </p>
      <div className="tabs">
        {[
          ["", "All Alerts"],
          ["my", "My Alerts"],
          ["unassigned", "Unassigned"],
          ["high", "High Priority"],
          ["overdue", "Overdue"],
          ["completed", "Completed"],
        ].map(([view, name]) => (
          <button
            key={view}
            className={(f.view ?? "") === view ? "selected" : "secondary"}
            onClick={() => setF({ ...f, view, status: "" })}
          >
            {name}
          </button>
        ))}
      </div>
      <FilterBar
        search={f.q ?? ""}
        values={f}
        onChange={setF}
        options={[
          { key: "time", label: "Due period", values: alertGroups },
          {
            key: "status",
            label: "Status",
            values: ["Pending", "Completed", "Dismissed"],
          },
          {
            key: "type",
            label: "Type",
            values: [...d.alerts.map((a) => a.type), "Grant"],
          },
          {
            key: "priority",
            label: "Priority",
            values: ["High", "Normal", "Low"],
          },
        ]}
      />
      {alertGroups.map((group) => {
        const grouped = rows.filter((a) => alertGroup(a) === group);
        return (
          grouped.length > 0 && (
            <section key={group} className="alert-group">
              <h2>
                <Badge>{group}</Badge> <small>{grouped.length} actions</small>
              </h2>
              <Table
                headers={[
                  "Alert",
                  "Person",
                  "Due",
                  "Priority",
                  "Assigned staff",
                  "Status",
                  "Actions",
                ]}
                rows={grouped.map((a) => ({
                  id: a.id,
                  sort: alertDue(a),
                  cells: [
                    <details key="title">
                      <summary>{a.title}</summary>
                      <p>{a.type}</p>
                      <p className="preserve">{a.notes || "No notes"}</p>
                    </details>,
                    a.personId ? (
                      <PersonLink key="person" id={a.personId}>
                        {label(d.people.find((p) => p.id === a.personId)!)}
                      </PersonLink>
                    ) : (
                      "—"
                    ),
                    <span key="due">
                      {day(alertDue(a))}
                      {a.snoozedUntil && (
                        <small>Snoozed · originally {day(a.dueDate)}</small>
                      )}
                    </span>,
                    <Badge key="priority">{a.priority}</Badge>,
                    a.assigned?.name ?? "Unassigned",
                    a.status,
                    write ? (
                      <div key="actions" className="row-actions">
                        {a.status === "Pending" ? (
                          <>
                            <button
                              className="secondary"
                              onClick={() =>
                                a.grantId && a.type === "Grant review"
                                  ? setFollowUp(a)
                                  : a.type === "Monthly check-in"
                                    ? setCheckIn(a)
                                    : void action(
                                        "alertStatus",
                                        { status: "Completed" },
                                        a.id,
                                      )
                              }
                            >
                              {a.grantId && a.type === "Grant review"
                                ? "Mark Follow-up Done"
                                : a.type === "Monthly check-in"
                                  ? "Record check-in"
                                  : "Complete"}
                            </button>
                            <button
                              className="secondary"
                              onClick={() => {
                                setSnooze(a.id);
                                setDate(future(1));
                              }}
                            >
                              Snooze
                            </button>
                            <button
                              className="secondary"
                              onClick={() =>
                                void action(
                                  "alertStatus",
                                  { status: "Dismissed" },
                                  a.id,
                                )
                              }
                            >
                              Dismiss
                            </button>
                          </>
                        ) : (
                          <button
                            className="secondary"
                            onClick={() =>
                              void action(
                                "alertStatus",
                                { status: "Pending" },
                                a.id,
                              )
                            }
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    ) : (
                      "View only"
                    ),
                  ],
                }))}
              />
            </section>
          )
        );
      })}
      {!rows.length && (
        <div className="empty">
          No matching records. Change your filters or create a reminder.
        </div>
      )}
      {followUp && (
        <FollowUpDialog
          alert={followUp}
          d={d}
          action={followUpAction ?? action}
          onClose={() => setFollowUp(null)}
        />
      )}
      {checkIn && checkIn.personId && (
        <CheckInDialog
          personId={checkIn.personId}
          personName={label(
            d.people.find((p) => p.id === checkIn.personId)!,
          )}
          action={action}
          onClose={() => setCheckIn(null)}
        />
      )}
      {snooze && (
        <Modal
          title="Snooze alert"
          onClose={() => {
            if (!busy) setSnooze(null);
          }}
        >
          <p>
            The original due date is preserved. The alert will appear on its new
            reminder date.
          </p>
          <div className="actions">
            <button disabled={busy} onClick={() => void choose(future(1))}>
              Tomorrow
            </button>
            <button disabled={busy} onClick={() => void choose(future(7))}>
              Next Week
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void choose(date);
            }}
          >
            <label>
              Choose Date
              <input
                type="date"
                aria-label="Snooze until"
                value={date}
                min={future(1)}
                required
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <div className="actions">
              <button disabled={busy}>
                {busy ? "Saving…" : "Snooze until date"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
