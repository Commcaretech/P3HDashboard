"use client";
import { useEffect, useState } from "react";
import { request } from "./common";
import { Table, Modal } from "./ui";
type Batch = {
  id: string;
  filename: string;
  createdAt: string;
  uploadedBy: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
};
export default function ImportHistory({
  admin,
  revision,
}: {
  admin: boolean;
  revision?: object;
}) {
  const [batches, setBatches] = useState<Batch[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<{
      id: string;
      total: number;
      page: number;
      size: number;
      filename: string;
      rows: {
        id: string;
        rowNumber: number;
        memberId: string;
        action: string;
        raw: unknown;
      }[];
    } | null>(null);
  useEffect(() => {
    void request("/api/import-history")
      .then((j) => setBatches(j.batches))
      .catch(() => setError("Unable to load import history."));
  }, [revision]);
  const inspect = (id: string, page = 1, size = 20) =>
    void request(`/api/import-history?id=${id}&page=${page}&size=${size}`)
      .then((j) => setSelected(j.batch))
      .catch(() => setError("Unable to inspect import."));
  return (
    <section className="panel">
      <h2>Import history</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Table
        headers={[
          "Date",
          "Filename",
          "Uploaded by",
          "Created",
          "Updated",
          "Skipped",
          "Errors",
          "Actions",
        ]}
        rows={batches.map((b) => ({
          id: b.id,
          sort: String(9999999999999 - Date.parse(b.createdAt)).padStart(
            13,
            "0",
          ),
          cells: [
            b.createdAt.slice(0, 10),
            b.filename,
            b.uploadedBy,
            b.createdCount,
            b.updatedCount,
            b.skippedCount,
            b.errorCount,
            admin ? (
              <button
                key="inspect"
                className="secondary"
                onClick={() => inspect(b.id)}
              >
                Inspect import
              </button>
            ) : (
              "—"
            ),
          ],
        }))}
      />
      {selected && (
        <Modal title={selected.filename} onClose={() => setSelected(null)}>
          <p>
            {selected.total} reviewed rows. Original values remain preserved in
            the database.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Table
            server={{
              total: selected.total,
              page: selected.page,
              size: selected.size,
              onPage: (n) => inspect(selected.id, n, selected.size),
              onSize: (n) => inspect(selected.id, 1, n),
              onSort: () => {},
              sortableColumns: [],
            }}
            headers={["Row", "Member ID", "Decision", "Original values"]}
            rows={selected.rows.map((r) => ({
              id: r.id,
              sort: String(r.rowNumber).padStart(8, "0"),
              cells: [
                r.rowNumber,
                r.memberId,
                r.action,
                <details key="raw">
                  <summary>Inspect original cells</summary>
                  <pre>{JSON.stringify(r.raw, null, 2)}</pre>
                </details>,
              ],
            }))}
          />
        </Modal>
      )}
    </section>
  );
}
