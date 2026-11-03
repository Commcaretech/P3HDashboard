"use client";
import { useEffect, useState } from "react";
import { Staff } from "@/lib/types";
import { request } from "./common";
import { Table } from "./ui";
type Diagnostics = {
  configured: boolean;
  deliveries: {
    id: string;
    userId: string;
    status: string;
    scheduledDate: string;
    attempts: number;
    failureReason: string | null;
  }[];
};
export default function NotificationSettings({ staff }: { staff: Staff[] }) {
  const [data, setData] = useState<Diagnostics | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/api/notifications")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel">
      <h2>Email notifications</h2>
      <p>
        {data?.configured
          ? "Email provider configured. Run a test and check the recipient inbox before enabling the daily schedule."
          : "Email notifications are not configured. In-app reminders remain available."}
      </p>
      <p>
        Daily schedule: 8:30 AM Singapore time. Provider acceptance does not
        confirm inbox delivery.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        className="secondary"
        disabled={busy || !data?.configured}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await request("/api/notifications", {});
            setNotice(r.message);
            setData(await request("/api/notifications"));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Test failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        Send Test Email
      </button>
      {data && (
        <Table
          headers={["Date", "Staff", "Status", "Attempts", "Diagnostic"]}
          rows={data.deliveries.map((x) => ({
            id: x.id,
            cells: [
              x.scheduledDate,
              staff.find((s) => s.id === x.userId)?.name ?? "Former staff",
              x.status,
              x.attempts,
              x.failureReason || "No failure recorded",
            ],
          }))}
        />
      )}
    </section>
  );
}
