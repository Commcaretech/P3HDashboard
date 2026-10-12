import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSetupAccess } from "../src/lib/setup-access";

test("remote setup requires a strong correct secret; local setup remains available", () => {
  const secret = "fictional-test-secret-that-is-over-32-characters";
  assert.doesNotThrow(() => checkSetupAccess("http://127.0.0.1:3100", ""));
  assert.throws(
    () => checkSetupAccess("https://example.onrender.com", ""),
    /requires a setup token/,
  );
  assert.throws(
    () => checkSetupAccess("https://example.onrender.com", "wrong", secret),
    /incorrect/,
  );
  assert.throws(
    () => checkSetupAccess("https://example.onrender.com", "short", "short"),
    /32 characters/,
  );
  assert.doesNotThrow(() =>
    checkSetupAccess("https://example.onrender.com", secret, secret),
  );
  assert.throws(
    () => checkSetupAccess("http://localhost:3100", "", secret),
    /incorrect/,
  );
});
