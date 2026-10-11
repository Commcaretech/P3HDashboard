"use client";
import { Data, label, day } from "@/lib/types";
import { Table, Badge, PersonLink } from "./ui";
import { useFilters, FilterBar } from "./common";
export default function Alerts({
  d,
  write,
  action,
  onCreate,
}: {
  d: Data;
  write: boolean;
  action: (
    a: string,
    v?: Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
  onCreate: () => void;
}) {
  const [f, setF] = useFilters();
  const rows = d.alerts.filter(
    (a) =>
      (!f.q || a.title.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.status ? a.status === "Pending" : a.status === f.status) &&
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
        Birthday and grant reminders refresh when records load. Repeated
        refreshes do not create duplicate alerts.
      </p>
      <FilterBar
        search={f.q ?? ""}
        values={f}
        onChange={setF}
        options={[
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
        rows={rows.map((a) => ({
          id: a.id,
          sort: a.dueDate,
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
            day(a.dueDate),
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
                        void action(
                          "alertStatus",
                          { status: "Completed" },
                          a.id,
                        )
                      }
                    >
                      Complete
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
                      void action("alertStatus", { status: "Pending" }, a.id)
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
    </>
  );
}
