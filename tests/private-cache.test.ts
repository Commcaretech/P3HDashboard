import { test } from "node:test";
import assert from "node:assert/strict";
import { PrivateCache } from "../src/lib/private-cache";

test("private workspace cache deduplicates requests and isolates account permissions", async () => {
  const cache = new PrivateCache();
  cache.setScope("staff-a:centre-a");
  let finish!: (value: string) => void;
  let calls = 0;
  const loader = () => {
    calls++;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  };
  const first = cache.fetch("profile", loader);
  const second = cache.fetch("profile", loader);
  assert.equal(calls, 1);
  finish("Centre A record");
  assert.deepEqual(await Promise.all([first, second]), [
    "Centre A record",
    "Centre A record",
  ]);
  assert.equal(cache.get("profile"), "Centre A record");
  cache.setScope("staff-a:centre-b");
  assert.equal(cache.get("profile"), undefined);
  const obsolete = cache.fetch("profile", loader);
  cache.setScope("staff-b:centre-b");
  finish("Old permissions");
  await obsolete;
  assert.equal(cache.get("profile"), undefined);
});

test("invalidating an in-flight save prevents obsolete data from returning to cache", async () => {
  const cache = new PrivateCache();
  cache.setScope("staff");
  let finish!: (value: string) => void;
  const old = cache.fetch(
    "people",
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  cache.invalidate((key) => key === "people");
  await cache.fetch("people", async () => "Saved version");
  finish("Before save");
  await old;
  assert.equal(cache.get("people"), "Saved version");
  cache.clear();
  assert.equal(cache.get("people"), undefined);
});

test("private cache expires data and bounds retained query results", async () => {
  const cache = new PrivateCache();
  await cache.fetch("expired", async () => "old", false, -1);
  assert.equal(cache.get("expired"), undefined);
  for (let i = 0; i < 45; i++) await cache.fetch(`query-${i}`, async () => i);
  assert.equal(cache.get("query-0"), undefined);
  assert.equal(cache.get("query-44"), 44);
});
