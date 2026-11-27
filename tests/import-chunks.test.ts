import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_COMMIT_CHUNK_SIZE,
  chunkRows,
  commitImportChunks,
} from "../src/lib/import-chunks";
test("chunkRows splits into full batches plus a remainder", () => {
  assert.equal(IMPORT_COMMIT_CHUNK_SIZE, 25);
  assert.deepEqual(chunkRows([]), []);
  assert.deepEqual(chunkRows([1, 2, 3]), [[1, 2, 3]]);
  const rows = Array.from({ length: 60 }, (_, i) => i);
  const chunks = chunkRows(rows);
  assert.deepEqual(
    chunks.map((c) => c.length),
    [25, 25, 10],
  );
  assert.deepEqual(
    chunks.flat(),
    rows,
  );
});
test("commitImportChunks posts one batch at a time and totals the results", async () => {
  const seen: number[][] = [];
  const result = await commitImportChunks(
    Array.from({ length: 60 }, (_, i) => ({ n: i })),
    "members.xlsx",
    async (body) => {
      seen.push(body.rows.map((r) => r.n));
      return { created: body.rows.length, updated: 0, skipped: 0 };
    },
  );
  assert.deepEqual(
    seen.map((c) => c.length),
    [25, 25, 10],
  );
  assert.equal(result.created, 60);
  assert.equal(result.attempted, 60);
  assert.equal(result.total, 60);
  assert.equal(result.error, null);
});
test("commitImportChunks reports progress and keeps completed batches after a failure", async () => {
  const progress: [number, number][] = [];
  let calls = 0;
  const result = await commitImportChunks(
    Array.from({ length: 60 }, (_, i) => ({ n: i })),
    "members.xlsx",
    async (body) => {
      calls++;
      if (calls === 2) throw new Error("Unable to save.");
      return { created: body.rows.length, updated: 1, skipped: 2 };
    },
    (done, total) => progress.push([done, total]),
  );
  assert.equal(calls, 2);
  assert.equal(result.created, 25);
  assert.equal(result.updated, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.attempted, 25);
  assert.equal(result.total, 60);
  assert.equal(result.error, "Unable to save.");
  assert.deepEqual(progress, [[25, 60]]);
});
