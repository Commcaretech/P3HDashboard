import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateFollowUp,
  addMonths,
  closedGrant,
} from "../src/lib/follow-up";
for (const [scheme, date, expected] of [
  ["South West CDC $250", "2026-11-05", "2027-01-05"],
  ["South West CDC $1,000", "2026-11-05", "2027-01-05"],
  ["CHAS card application", "2026-11-05", "2026-11-19"],
  ["CHAS card renewal", "2026-11-05", "2026-11-19"],
  ["HPC+ referral", "2026-11-05", "2026-11-12"],
  ["MOW referral", "2026-11-05", "2026-11-12"],
  ["Counselling referral", "2026-11-05", "2026-11-12"],
  ["SMF referral", "2026-11-05", "2026-11-12"],
  ["South West CDC $250", "2026-12-31", "2027-02-28"],
  ["South West CDC $250", "2023-12-31", "2024-02-29"],
])
  test(`${scheme}: ${date} -> ${expected}`, () =>
    assert.equal(calculateFollowUp(scheme, date).date, expected));
test("missing dates prompt, custom intervals and one-time overrides", () => {
  assert.equal(calculateFollowUp("CHAS", "").date, "");
  assert.equal(
    calculateFollowUp("Other", "2026-11-05", "14").date,
    "2026-11-19",
  );
  assert.equal(
    calculateFollowUp("HPC+", "2026-11-05", "Once").recurring,
    false,
  );
  assert.equal(calculateFollowUp("Other", "2026-11-05").date, "");
  assert.throws(() => calculateFollowUp("Other", "2026-11-05", "-5"));
  assert.throws(() => addMonths("2026-02-30", 2));
  assert.equal(closedGrant({ status: "Approved" }), false);
  assert.equal(
    closedGrant({ status: "Approved", resolvedAt: new Date() }),
    true,
  );
});
