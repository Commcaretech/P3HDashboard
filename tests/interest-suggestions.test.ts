import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { programmeInterestEvidence } from "../src/lib/programme-interests";
import { interestMatch, InterestProfile } from "../src/lib/interest-matching";
import {
  catalogueCounts,
  confirmedOccurrences,
  filterCatalogue,
  schedulingConcern,
  registrationReady,
  scheduleLabel,
  recommendationReady,
} from "../src/lib/programme-source";
import type { Programme } from "../src/lib/types";
const activity = (name = "Chair Yoga", category = "Physical"): Programme => ({
  id: "p",
  name,
  category,
  centre: "SEEN Bukit Batok",
  description: "",
  notes: "",
  mobility: "",
  venue: "",
  day: "",
  startTime: "",
  endTime: "",
  frequency: "",
  capacity: 0,
  registrationStatus: "Unverified",
  status: "Active",
  updatedAt: "2026-11-04T00:00:00Z",
  languages: [],
  conditions: [],
  interests: [],
  participations: [],
  external: {
    source: "program-spacebooking",
    centreId: "SEEN_BB",
    sourceStatus: "scheduled",
    missing: false,
    groupingStatus: "Unverified",
    eligibilityRulesVersion: 0,
    occurrences: [],
  },
});
const session = () => ({
  id: "o",
  date: "2099-12-01",
  day: "Tuesday",
  startTime: "10:00",
  endTime: "11:00",
  venue: "Hall",
  status: "scheduled",
  missing: false,
  eligibilityStatus: "scheduling_review",
  schedulingStatus: "required",
  recommendationEligible: false,
  reasonCodes: ["operating_hours_unverified", "venue_unverified"],
  visibilityKnown: true,
  timetableVisible: true,
  calendarVisible: true,
});
const senior: InterestProfile = {
  kind: "Care Recipient",
  interests: ["Exercise"],
  languages: ["English"],
  mobility: "Assisted",
  centre: "SEEN Bukit Batok",
};
test("transparent name rules cover subjects beyond the examples and preserve source domains", () => {
  for (const [name, category, tag] of [
    ["Chair Yoga", "Physical", "Gentle Movement"],
    ["Healthy Eating", "Learning", "Nutrition"],
    ["Digital Skills", "Learning", "Technology"],
    ["Arts and Crafts", "Social", "Creative Activities"],
    ["Karaoke", "Social", "Music"],
    ["Tai Chi", "Physical", "Movement"],
    ["Gardening", "Social", "Gardening"],
    ["Boccia", "Physical", "Exercise"],
    ["Memory Games", "Cognitive", "Cognitive Activities"],
    ["Community Volunteering", "Volunteerism", "Volunteering"],
  ]) {
    const p = activity(name, category);
    assert.ok(programmeInterestEvidence(p).tags.includes(tag), name);
    assert.equal(p.category, category);
    assert.equal(p.interests.length, 0);
  }
  const broad = activity("Chair Yoga", "Social");
  assert.equal(programmeInterestEvidence(broad).domainMismatch, true);
  assert.equal(broad.category, "Social");
  assert.ok(programmeInterestEvidence(broad).tags.includes("Exercise"));
});
test("an unreviewed programme is an interest suggestion, never verified suitability or registration", () => {
  const p = activity();
  const r = interestMatch(senior, p);
  assert.equal(r.eligible, true);
  assert.ok(r.score > 0);
  assert.equal(r.suitabilityVerified, false);
  assert.ok(r.missing.includes("Accessibility Not Assessed"));
  assert.ok(r.missing.includes("Registration availability unverified"));
  assert.ok(r.missing.includes("Schedule Not Confirmed"));
  assert.equal(registrationReady(p), false);
  assert.equal(p.conditions.length, 0);
});
test("specific interests outrank a broad domain; unknown language/accessibility give no bonus", () => {
  const p = activity("Digital Skills", "Learning"),
    profile = { ...senior, interests: ["Technology"] };
  const before = interestMatch(profile, p);
  p.languages = [{ language: { name: "English" } }];
  assert.equal(interestMatch(profile, p).score, before.score);
  p.mobility = "All";
  assert.equal(interestMatch(profile, p).score, before.score);
  assert.equal(interestMatch({ ...senior, interests: [] }, p).eligible, false);
  assert.equal(
    interestMatch(
      { ...senior, interests: ["Music"] },
      activity("Chair Yoga", "Social"),
    ).eligible,
    false,
  );
  const staff = activity();
  staff.interests = [{ interest: { name: "Gardening" } }];
  assert.deepEqual(programmeInterestEvidence(staff).tags, ["Gardening"]);
  assert.equal(interestMatch(senior, staff).matchedInterests.length, 0);
});
test("explicit assessed mobility/audience restrictions are enforced without guessing unknown accessibility", () => {
  const p = activity();
  p.mobility = "Independent";
  p.review = {
    status: "In Review",
    audience: "Caregivers",
    languageAssessment: "Not Assessed",
    interestAssessment: "Not Assessed",
    mobilityAssessment: "Assessed",
    conditionAssessment: "Not Assessed",
    accessibility: "Stairs",
    intensity: "Not Assessed",
    staffNotes: "",
    issues: [],
    sourceFingerprint: "",
    reviewedBy: null,
    reviewedByName: "",
    reviewedAt: null,
    updatedAt: "2026-11-04",
  };
  assert.equal(interestMatch(senior, p).eligible, false);
  p.review.audience = "Both";
  assert.equal(interestMatch(senior, p).eligible, false);
  p.review.mobilityAssessment = "Not Assessed";
  assert.equal(interestMatch(senior, p).eligible, false);
  p.mobility = "";
  assert.equal(interestMatch(senior, p).eligible, true);
  assert.equal(interestMatch(senior, p).suitabilityVerified, false);
});
test("missing facts and uncertain grouping are not scheduling conflicts; genuine problems stay diagnostic", () => {
  const p = activity();
  assert.equal(schedulingConcern(p), false);
  assert.equal(scheduleLabel(p), "Schedule Not Confirmed");
  p.external!.occurrences = [session()];
  assert.equal(schedulingConcern(p), false);
  assert.equal(confirmedOccurrences(p).length, 1);
  assert.equal(scheduleLabel(p), "Scheduled; source checks incomplete");
  assert.equal(registrationReady(p), false);
  p.external!.occurrences[0].reasonCodes = ["venue_conflict"];
  assert.equal(schedulingConcern(p), true);
  assert.equal(confirmedOccurrences(p).length, 0);
  assert.equal(scheduleLabel(p), "Scheduling check required");
});
test("271/945 regression: missing verification no longer manufactures 271 conflicts or suppresses 945 known source schedules", () => {
  const programmes = Array.from({ length: 271 }, (_, i) => {
    const p = activity();
    p.id = `p-${i}`;
    p.external!.occurrences = Array.from(
      { length: i < 132 ? 4 : 3 },
      (_, j) => ({ ...session(), id: `${i}-${j}` }),
    );
    return p;
  });
  const counts = catalogueCounts(programmes);
  assert.equal(counts.imported, 271);
  assert.equal(counts.upcoming, 945);
  assert.equal(counts.concerns, 0);
  assert.equal(counts.scheduledProgrammes, 271);
  for (const p of programmes)
    for (const o of p.external!.occurrences) {
      o.visibilityKnown = false;
      o.timetableVisible = false;
      o.calendarVisible = false;
    }
  assert.equal(catalogueCounts(programmes).upcoming, 0);
  assert.equal(catalogueCounts(programmes).concerns, 0);
  assert.equal(scheduleLabel(programmes[0]), "Schedule Not Confirmed");
  assert.equal(recommendationReady(programmes[0]), true);
});
test("cancellations, hidden activities and past dates never appear as confirmed opportunities", () => {
  for (const mode of ["cancelled", "hidden", "past"]) {
    const p = activity();
    p.external!.eligibilityRulesVersion = 2;
    p.external!.occurrences = [session()];
    const o = p.external!.occurrences[0];
    if (mode === "cancelled") {
      o.status = "cancelled";
      o.eligibilityStatus = "cancelled";
    }
    if (mode === "hidden") {
      o.calendarVisible = false;
      o.eligibilityStatus = "hidden";
    }
    if (mode === "past") {
      o.date = "2000-01-01";
      o.eligibilityStatus = "past";
    }
    assert.equal(confirmedOccurrences(p).length, 0);
    assert.equal(recommendationReady(p), false);
  }
});
test("centre identity and date filters remain separate across all four centres", () => {
  const centres = {
    SEEN_BB: "SEEN Bukit Batok",
    GLOW_BB: "GLOW Bukit Batok",
    SEEN_NY: "SEEN Nanyang",
    GLOW_NY: "GLOW Nanyang",
  };
  const ps = Object.entries(centres).map(([id, name]) => {
    const p = activity();
    p.id = id;
    p.centre = name;
    p.external!.centreId = id;
    p.external!.occurrences = [session()];
    return p;
  });
  for (const id of Object.keys(centres))
    assert.equal(filterCatalogue(ps, { centre: id }).length, 1);
  assert.equal(filterCatalogue(ps, { date: "2099-12-01" }).length, 4);
});

test("missing source date/time facts remain unconfirmed while malformed values produce genuine diagnostics", () => {
  const p = activity();
  p.external!.occurrences = [
    {
      ...session(),
      date: null,
      startTime: "",
      endTime: "",
      eligibilityStatus: "incomplete",
      reasonCodes: ["missing_date", "invalid_times", "missing_venue"],
    },
  ];
  assert.equal(schedulingConcern(p), false);
  assert.equal(scheduleLabel(p), "Schedule Not Confirmed");
  assert.equal(recommendationReady(p), true);
  p.external!.occurrences[0].date = "2099-02-31";
  assert.equal(schedulingConcern(p), true);
  p.external!.occurrences[0].date = null;
  p.external!.occurrences[0].startTime = "28:00";
  assert.equal(schedulingConcern(p), true);
});

test("additive metadata migration retains old records and never invents legacy visibility", () => {
  const copy = new DatabaseSync(":memory:");
  for (const name of readdirSync("prisma/migrations")
    .filter(
      (n) => n.startsWith("20") && n < "202611040003_interest_suggestions",
    )
    .sort())
    copy.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  copy.exec(`INSERT INTO Programme(id,name,notes,updatedAt) VALUES('legacy','Keep legacy','Keep notes',CURRENT_TIMESTAMP),('v2','Keep v2','Keep v2 notes',CURRENT_TIMESTAMP);
 INSERT INTO ExternalProgramme(id,programmeId,source,sourceKey,centreId,lastSeenAt,lastSyncAt,fingerprint,eligibilityRulesVersion) VALUES('e0','legacy','program-spacebooking','s0','SEEN_BB',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'f0',0),('e2','v2','program-spacebooking','s2','GLOW_BB',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'f2',2);
 INSERT INTO ExternalOccurrence(id,externalId,sourceKey,sourceRecordIds,timetableVisible,calendarVisible) VALUES('o0','e0','occ0','[]',false,false),('o2','e2','occ2','[]',true,false);`);
  const before = copy
    .prepare("SELECT id,name,notes FROM Programme ORDER BY id")
    .all();
  copy.exec(
    readFileSync(
      "prisma/migrations/202611040003_interest_suggestions/migration.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    copy.prepare("SELECT id,name,notes FROM Programme ORDER BY id").all(),
    before,
  );
  assert.equal(
    copy
      .prepare("SELECT visibilityKnown FROM ExternalOccurrence WHERE id='o0'")
      .get()?.visibilityKnown,
    0,
  );
  assert.equal(
    copy
      .prepare("SELECT visibilityKnown FROM ExternalOccurrence WHERE id='o2'")
      .get()?.visibilityKnown,
    1,
  );
  assert.equal(
    copy
      .prepare("SELECT calendarVisible FROM ExternalOccurrence WHERE id='o2'")
      .get()?.calendarVisible,
    0,
  );
  copy.close();
});
