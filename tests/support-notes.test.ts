import { test } from "node:test";
import assert from "node:assert/strict";
import { supportFromNotes } from "../src/lib/support-notes";

test("extracts the supplied note format without inventing amounts or approvals", () => {
  const notes =
    "P3H Onboarding Date: 2026-05-15\nCR: Mother (dementia) and Sister (mental illness)\nReceiving HCG, SSS, PioneerDAS, Home Therapy\nReceived South West $250 and $1000\nCompleted EASE";
  const result = supportFromNotes(notes);
  assert.deepEqual(
    result.map((s) => [s.scheme, s.status]),
    [
      ["HCG", "Receiving"],
      ["SSS", "Receiving"],
      ["PioneerDAS", "Receiving"],
      ["Home Therapy", "Receiving"],
      ["South West", "Received"],
      ["EASE", "Completed"],
    ],
  );
  assert.equal(result[4].source, "Received South West $250 and $1000");
});
test("supports colons and casing, avoids uncertain statements and programme completions", () => {
  assert.equal(supportFromNotes("Receiving: hcg; pioneer das").length, 2);
  assert.deepEqual(
    supportFromNotes(
      "Not receiving HCG\nReceiving possibly SSS\nCompleted Exercise\nHCG applied\nReceived no HCG",
    ),
    [],
  );
});
test("deduplicates schemes and flags conflicting historical statements", () => {
  const result = supportFromNotes(
    "Receiving HCG\nReceiving HCG\nReceived HCG last year",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "Recorded in notes");
  assert.equal(result[0].source, "Receiving HCG\nReceived HCG last year");
});
