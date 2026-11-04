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
export function confirmedOccurrences(
  p: Pick<Programme, "external">,
  now = Date.now(),
) {
  if (!p.external || p.external.missing) return [];
  return p.external.occurrences
    .filter(
      (o) =>
        !o.missing &&
        o.date &&
        o.startTime &&
        o.endTime &&
        o.venue &&
        o.recommendationEligible === true &&
        o.eligibilityStatus === "confirmed_upcoming" &&
        o.schedulingStatus === "verified" &&
        o.timetableVisible === true &&
        o.calendarVisible === true &&
        ["confirmed", "scheduled", "active"].includes(o.status.toLowerCase()) &&
        Date.parse(`${o.date}T${o.startTime}:00+08:00`) > now,
    )
    .sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    );
}
export const nextOccurrence = (p: Pick<Programme, "external">, fromDate = "") =>
  confirmedOccurrences(p).find((o) => o.date! >= fromDate);
export function sourceStates(p: Pick<Programme, "external">) {
  if (!p.external) return ["manual"];
  if (p.external.missing) return ["missing"];
  const states = [
    ...new Set(
      p.external.occurrences
        .filter((o) => !o.missing)
        .map((o) =>
          o.date &&
          Date.parse(`${o.date}T${o.startTime || "00:00"}:00+08:00`) <=
            Date.now() &&
          o.eligibilityStatus === "confirmed_upcoming"
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
    (p.external.missing ||
      p.external.groupingStatus !== "Verified" ||
      p.external.occurrences.some(
        (o) =>
          !o.missing &&
          ["required", "not_checked"].includes(
            o.schedulingStatus || "not_checked",
          ),
      )),
  );
}
export function recommendationReady(p: Programme) {
  return (
    p.status === "Active" &&
    (!p.external || (!needsReview(p) && Boolean(nextOccurrence(p))))
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
      (!f.ready || recommendationReady(p)) &&
      (!f.status ? p.status !== "Archived" : p.status === f.status),
  );
}
