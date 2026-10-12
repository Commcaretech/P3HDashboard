import { test } from "node:test";
import assert from "node:assert/strict";
import {
  match,
  MatchPerson,
  compareRecommendations,
} from "../src/lib/matching";
import { alertDue, alertGroup, completeness } from "../src/lib/workflow";
import { centreAllowed, personScope, programmeScope } from "../src/lib/access";
import { bulkReview, reviewCategory } from "../src/lib/import-review";
import type { Person } from "../src/lib/types";
const full: MatchPerson = {
  languages: ["Mandarin"],
  conditions: ["Dementia"],
  interests: ["Walking"],
  mobility: "Independent",
};
test("matching separates suitability, confidence and mobility eligibility", () => {
  const exact = match(full, full, full);
  assert.equal(exact.score, 100);
  assert.equal(exact.confidence, "High");
  assert.equal(exact.eligible, true);
  assert.equal(exact.reasons.length, 5);
  const blocked = match(full, { ...full, mobility: "Wheelchair" }, full);
  assert.equal(blocked.score, 0);
  assert.equal(blocked.eligible, false);
  assert.match(blocked.reasons[0], /Mobility requirement not met/);
  assert.equal(
    match(
      full,
      { ...full, mobility: "Wheelchair" },
      { ...full, mobility: "Wheelchair friendly" },
    ).score,
    100,
  );
  for (const key of ["conditions", "interests", "mobility"] as const) {
    const recipient = { ...full, [key]: key === "mobility" ? "" : [] };
    const result = match(full, recipient, full);
    assert.ok(result.score < 100);
    assert.ok(result.confidenceScore < 100);
    assert.ok(result.missing.length);
  }
  const blank: MatchPerson = {
    languages: [],
    conditions: [],
    interests: [],
    mobility: "",
  };
  const missing = match(blank, blank, full);
  assert.equal(missing.score, 0);
  assert.equal(missing.confidence, "Low");
  assert.equal(missing.confidenceScore, 0);
  assert.equal(
    match(full, { ...full, conditions: ["Dementia", "Dementia"] }, full).score,
    100,
  );
  assert.equal(match({ ...full, interests: [] }, full, full).score, 85);
  assert.equal(
    match({ ...full, languages: [] }, { ...full, languages: [] }, full).score,
    75,
  );
  const candidates = [
    { eligible: false, score: 90 },
    { eligible: true, score: 50 },
    { eligible: true, score: 100 },
  ].sort(compareRecommendations);
  assert.deepEqual(
    candidates.map((c) => c.score),
    [100, 50, 90],
  );
});
test("alerts group effective dates and preserve original dates when snoozed", () => {
  const now = "2026-10-12";
  for (const [date, group] of [
    ["2026-10-11", "Overdue"],
    ["2026-10-12", "Today"],
    ["2026-10-19", "Next 7 Days"],
    ["2026-11-11", "Next 30 Days"],
    ["2026-12-01", "Later"],
  ])
    assert.equal(alertGroup({ dueDate: date, snoozedUntil: null }, now), group);
  const snoozed = { dueDate: "2026-10-01", snoozedUntil: "2026-10-15" };
  assert.equal(alertDue(snoozed), "2026-10-15");
  assert.equal(alertGroup(snoozed, now), "Next 7 Days");
  assert.equal(snoozed.dueDate, "2026-10-01");
});
test("centre rules retain admin access and deny unrelated or blank person centres", () => {
  const staff = {
    id: "staff",
    role: "Staff",
    allCentres: false,
    allowedCentres: [{ centre: "Nanyang" }],
  };
  assert.equal(centreAllowed(staff, "Nanyang"), true);
  assert.equal(centreAllowed(staff, "Other"), false);
  assert.equal(centreAllowed(staff, ""), false);
  assert.equal(centreAllowed({ ...staff, role: "Admin" }, "Other"), true);
  assert.equal(
    centreAllowed({ ...staff, role: "Manager", allCentres: true }, "Other"),
    true,
  );
  assert.notDeepEqual(personScope(staff), {});
  assert.deepEqual(personScope({ ...staff, role: "Admin" }), {});
  assert.notDeepEqual(programmeScope(staff), {});
});
test("bulk review never updates an existing record without selection", () => {
  const rows = [
    { rowNumber: 2, action: "Skip", errors: [], warnings: [] },
    {
      rowNumber: 3,
      existingId: "p",
      action: "Skip",
      errors: [],
      warnings: ["Existing"],
    },
    { rowNumber: 4, action: "Skip", errors: ["Duplicate"], warnings: [] },
  ];
  assert.deepEqual(
    bulkReview(rows, "new").map((r) => r.action),
    ["Import", "Skip", "Skip"],
  );
  assert.equal(bulkReview(rows, "existing")[1].action, "Skip");
  assert.equal(
    bulkReview(rows, "existing", new Set([3]))[1].action,
    "Update existing",
  );
  assert.equal(reviewCategory(rows[1], "Duplicates"), true);
  assert.equal(reviewCategory(rows[2], "Ready"), false);
  assert.equal(bulkReview(rows, "errors")[2].action, "Skip");
});
test("profile completeness weights recommendation fields above optional details", () => {
  const person = {
    kind: "Care Recipient",
    preferredLanguage: "Mandarin",
    languages: [{ language: { name: "Mandarin" }, mode: "Spoken" }],
    interests: [{ interest: { name: "Walking" } }],
    conditions: [{ condition: { name: "Dementia" } }],
    mobility: "Independent",
    centre: "Nanyang",
    assignedId: "staff",
  } as Person;
  assert.equal(completeness(person).score, 100);
  const incomplete = completeness({
    ...person,
    mobility: "",
    preferredLanguage: "",
  });
  assert.equal(incomplete.score, 65);
  assert.deepEqual(incomplete.missing, ["Preferred language", "Mobility"]);
});
