import { programmeInterestEvidence } from "./programme-interests";
import type { Programme } from "./types";
export const sourceCentres: Record<string, string> = {
  SEEN_BB: "SEEN Bukit Batok",
  GLOW_BB: "GLOW Bukit Batok",
  SEEN_NY: "SEEN Nanyang",
  GLOW_NY: "GLOW Nanyang",
};
export const sourceFields = [
  "name",
  "category",
  "centre",
  "venue",
  "day",
  "startTime",
  "endTime",
  "frequency",
];
export const reviewStatuses = [
  "Pending Review",
  "In Review",
  "Reviewed",
  "Needs Recheck",
] as const;
export const eligibilityLabels: Record<string, string> = {
  confirmed_upcoming: "Confirmed upcoming",
  tentative: "Tentative",
  cancelled: "Cancelled",
  past: "Past",
  hidden: "Hidden",
  incomplete: "Incomplete",
  scheduling_review: "Scheduling review",
  unverified: "Unverified",
  missing: "Missing from source",
};
type Suitability = {
  external?: Programme["external"];
  review?: Programme["review"];
  mobility: string;
  languages: readonly unknown[];
  interests: readonly unknown[];
  conditions: readonly unknown[];
};
export function reviewStatus(p: Pick<Programme, "external" | "review">) {
  return p.review?.status ?? (p.external ? "Pending Review" : "Manual");
}
export function suitabilityIssues(p: Suitability) {
  const r = p.review,
    issues: string[] = [];
  if (!r?.audience) issues.push("Choose the intended audience");
  if (r?.languageAssessment !== "Assessed" || !p.languages.length)
    issues.push("Record supported languages");
  if (r?.interestAssessment !== "Assessed" || !p.interests.length)
    issues.push("Record relevant interests");
  if (r?.mobilityAssessment !== "Assessed" || !p.mobility.trim())
    issues.push("Assess mobility suitability");
  if (!r?.accessibility.trim()) issues.push("Record physical accessibility");
  if (!r || r.intensity === "Not Assessed" || !r.intensity)
    issues.push("Assess intensity or select Not Applicable");
  if (
    !r ||
    r.conditionAssessment === "Not Assessed" ||
    (r.conditionAssessment === "Assessed" && !p.conditions.length)
  )
    issues.push(
      "Assess care considerations or explicitly select Not Applicable",
    );
  return issues;
}
export function needsReview(p: Suitability) {
  return Boolean(
    p.external &&
    (reviewStatus(p) !== "Reviewed" || suitabilityIssues(p).length),
  );
}
type Occurrence = NonNullable<Programme["external"]>["occurrences"][number];
export const actualSchedulingReasons = new Set([
  "venue_conflict",
  "centre_closed",
  "outside_operating_hours",
  "venue_unavailable",
  "mirror_schedule_conflict",
  "long_duration",
]);
export const occurrenceReasons = (o: Occurrence) =>
  Array.isArray(o.reasonCodes) ? o.reasonCodes.map(String) : [];
export function explicitlyHidden(
  p: Pick<Programme, "external">,
  o: Occurrence,
) {
  return (
    o.eligibilityStatus === "hidden" ||
    occurrenceReasons(o).some((s) => s.startsWith("hidden_")) ||
    Boolean(
      (o.visibilityKnown || p.external?.eligibilityRulesVersion === 2) &&
      (!o.timetableVisible || !o.calendarVisible),
    )
  );
}
export function occurrenceConflict(o: Occurrence) {
  const dateInvalid = Boolean(
    o.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) ||
      !Number.isFinite(Date.parse(`${o.date}T00:00:00Z`)) ||
      new Date(`${o.date}T00:00:00Z`).toISOString().slice(0, 10) !== o.date),
  );
  const timeInvalid = Boolean(
    (o.startTime && !validClock(o.startTime)) ||
    (o.endTime && !validClock(o.endTime)) ||
    (o.startTime && o.endTime && o.endTime <= o.startTime),
  );
  return (
    dateInvalid ||
    timeInvalid ||
    occurrenceReasons(o).some((code) => actualSchedulingReasons.has(code))
  );
}
function validClock(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function futureOccurrences(
  p: Pick<Programme, "external">,
  now = Date.now(),
) {
  if (!p.external || p.external.missing) return [];
  return p.external.occurrences
    .filter(
      (o) =>
        !o.missing &&
        !explicitlyHidden(p, o) &&
        !["cancelled", "inactive", "closed"].includes(o.status.toLowerCase()) &&
        !["cancelled", "past", "hidden"].includes(o.eligibilityStatus || "") &&
        o.date &&
        /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
        validClock(o.startTime) &&
        validClock(o.endTime) &&
        o.endTime > o.startTime &&
        Number.isFinite(Date.parse(`${o.date}T00:00:00Z`)) &&
        new Date(`${o.date}T00:00:00Z`).toISOString().slice(0, 10) === o.date &&
        Date.parse(`${o.date}T${o.startTime}:00+08:00`) > now,
    )
    .sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    );
}
export function confirmedOccurrences(
  p: Pick<Programme, "external">,
  now = Date.now(),
) {
  return futureOccurrences(p, now).filter(
    (o) =>
      ["confirmed", "scheduled", "active"].includes(o.status.toLowerCase()) &&
      !["tentative", "incomplete", "unverified"].includes(
        o.eligibilityStatus || "unverified",
      ) &&
      !occurrenceConflict(o) &&
      Boolean(o.visibilityKnown || p.external?.eligibilityRulesVersion === 2) &&
      o.timetableVisible === true &&
      o.calendarVisible === true,
  );
}
export const nextOccurrence = (p: Pick<Programme, "external">, fromDate = "") =>
  confirmedOccurrences(p).find((o) => o.date! >= fromDate);
export function scheduleLabel(p: Pick<Programme, "external">) {
  const next = nextOccurrence(p);
  if (next)
    return next.schedulingStatus === "verified"
      ? "Confirmed upcoming"
      : "Scheduled; source checks incomplete";
  if (p.external?.missing) return "Missing from source";
  if (p.external?.occurrences.some((o) => !o.missing && occurrenceConflict(o)))
    return "Scheduling check required";
  if (
    futureOccurrences(p).some(
      (o) => o.status === "tbc" || o.eligibilityStatus === "tentative",
    )
  )
    return "Tentative schedule";
  return "Schedule Not Confirmed";
}
export function sourceStates(p: Pick<Programme, "external">) {
  if (!p.external) return ["manual"];
  if (p.external.missing) return ["missing"];
  const states = [
    ...new Set(
      p.external.occurrences
        .filter((o) => !o.missing)
        .map((o) =>
          explicitlyHidden(p, o)
            ? "hidden"
            : o.status === "cancelled"
              ? "cancelled"
              : o.date &&
                  validClock(o.startTime) &&
                  Date.parse(`${o.date}T${o.startTime}:00+08:00`) <= Date.now()
                ? "past"
                : o.eligibilityStatus || "unverified",
        ),
    ),
  ];
  return states.length ? states : ["unverified"];
}
export function schedulingConcern(p: Pick<Programme, "external">) {
  return Boolean(
    p.external &&
    !p.external.missing &&
    p.external.occurrences.some(
      (o) => !o.missing && !explicitlyHidden(p, o) && occurrenceConflict(o),
    ),
  );
}
export function recommendationReady(p: Programme) {
  if (p.status !== "Active") return false;
  if (!p.external) return true;
  if (
    p.external.missing ||
    ["cancelled", "inactive", "hidden", "closed"].includes(
      p.external.sourceStatus.toLowerCase(),
    )
  )
    return false;
  const current = p.external.occurrences.filter((o) => !o.missing);
  return (
    !current.length ||
    current.some(
      (o) =>
        !explicitlyHidden(p, o) &&
        !["cancelled", "inactive", "closed"].includes(o.status.toLowerCase()) &&
        !["cancelled", "hidden", "past"].includes(o.eligibilityStatus || "") &&
        (!o.date ||
          !validClock(o.startTime) ||
          Date.parse(`${o.date}T${o.startTime}:00+08:00`) > Date.now()),
    )
  );
}
export function registrationReady(
  p: Suitability & Pick<Programme, "status" | "registrationStatus">,
) {
  return (
    p.status === "Active" &&
    p.registrationStatus === "Open" &&
    (!p.external ||
      (!needsReview(p) &&
        confirmedOccurrences(p).some(
          (o) =>
            o.recommendationEligible === true &&
            o.schedulingStatus === "verified",
        )))
  );
}
export function catalogueCounts(programmes: Programme[], fromDate = "") {
  return {
    programmes: programmes.length,
    imported: programmes.filter((p) => p.external).length,
    upcoming: programmes.reduce(
      (n, p) =>
        n + confirmedOccurrences(p).filter((o) => o.date! >= fromDate).length,
      0,
    ),
    scheduledProgrammes: programmes.filter(
      (p) =>
        p.external &&
        nextOccurrence(p) &&
        (!fromDate || confirmedOccurrences(p).some((o) => o.date! >= fromDate)),
    ).length,
    unconfirmed: programmes.filter((p) => p.external && !nextOccurrence(p))
      .length,
    tagCorrections: programmes.filter(
      (p) => p.external && programmeInterestEvidence(p).needsCorrection,
    ).length,
    pending: programmes.filter((p) => reviewStatus(p) === "Pending Review")
      .length,
    inReview: programmes.filter((p) => reviewStatus(p) === "In Review").length,
    reviewed: programmes.filter((p) => reviewStatus(p) === "Reviewed").length,
    recheck: programmes.filter((p) => reviewStatus(p) === "Needs Recheck")
      .length,
    concerns: programmes.filter(schedulingConcern).length,
  };
}
export function filterCatalogue(
  programmes: Programme[],
  f: Record<string, string>,
) {
  return programmes.filter(
    (p) =>
      (!f.centre ||
        p.external?.centreId === f.centre ||
        p.centre === (sourceCentres[f.centre] || f.centre)) &&
      (!f.q ||
        [p.name, p.description, p.notes, p.category, p.review?.staffNotes]
          .join(" ")
          .toLowerCase()
          .includes(f.q.toLowerCase())) &&
      (!f.review || reviewStatus(p) === f.review) &&
      (!f.source || (p.external ? "Synced" : "Manual") === f.source) &&
      (!f.category || p.category === f.category) &&
      (!f.registration || p.registrationStatus === f.registration) &&
      (!f.eligibility || sourceStates(p).includes(f.eligibility)) &&
      (!f.completeness ||
        (suitabilityIssues(p).length ? "Incomplete" : "Complete") ===
          f.completeness) &&
      (!f.date || confirmedOccurrences(p).some((o) => o.date! >= f.date)) &&
      (!f.concerns || schedulingConcern(p)) &&
      (!f.tagCorrections || programmeInterestEvidence(p).needsCorrection) &&
      (!f.schedule ||
        (f.schedule === "confirmed"
          ? Boolean(nextOccurrence(p))
          : !nextOccurrence(p))) &&
      (!f.ready || recommendationReady(p)) &&
      (!f.status ? p.status !== "Archived" : p.status === f.status),
  );
}
