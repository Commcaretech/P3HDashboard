// Bulk imports are confirmed in small sequential batches instead of one
// giant transaction. The live deployment runs its functions far from the
// Singapore database, so one 291-row transaction makes thousands of
// sequential round-trips and fails; a 25-row batch stays well inside a
// serverless invocation. A failed batch keeps the batches already saved
// and reports how far the import got, so staff can re-upload the same file
// (saved rows then appear as existing records and are skipped) and confirm
// the rest.
export const IMPORT_COMMIT_CHUNK_SIZE = 25;
export function chunkRows<T>(rows: T[], size = IMPORT_COMMIT_CHUNK_SIZE): T[][] {
  if (size < 1) throw new Error("Chunk size must be at least 1.");
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size)
    chunks.push(rows.slice(i, i + size));
  return chunks;
}
export type ImportChunkSummary = {
  created: number;
  updated: number;
  skipped: number;
};
export type ImportChunkResult = ImportChunkSummary & {
  /** Rows in batches that completed before any failure. */
  attempted: number;
  /** All rows the caller asked to confirm. */
  total: number;
  /** The first failing batch's error, or null when every batch saved. */
  error: string | null;
};
export async function commitImportChunks<T extends object>(
  rows: T[],
  filename: string,
  post: (body: {
    action: "commit";
    filename: string;
    rows: T[];
  }) => Promise<ImportChunkSummary>,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportChunkResult> {
  const chunks = chunkRows(rows),
    result: ImportChunkResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      attempted: 0,
      total: rows.length,
      error: null,
    };
  for (const chunk of chunks) {
    try {
      const j = await post({ action: "commit", filename, rows: chunk });
      result.created += j.created;
      result.updated += j.updated;
      result.skipped += j.skipped;
      result.attempted += chunk.length;
      onProgress?.(result.attempted, result.total);
    } catch (e) {
      result.error = e instanceof Error ? e.message : "Import failed";
      return result;
    }
  }
  return result;
}
