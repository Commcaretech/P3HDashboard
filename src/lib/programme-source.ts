import type { Programme } from "./types";
// P3H centres are exact free-text permission values; never infer aliases.
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
export function needsReview(
  p: Pick<
    Programme,
    | "mobility"
    | "languages"
    | "interests"
    | "conditions"
    | "suitabilityReviewed"
    | "external"
  >,
) {
  return Boolean(
    p.external &&
    (!p.suitabilityReviewed ||
      !p.mobility ||
      !p.languages.length ||
      !p.interests.length ||
      !p.conditions.length ||
      p.external.missing ||
      !Object.hasOwn(sourceCentres, p.external.centreId)),
  );
}
export function nextOccurrence(p: Pick<Programme, "external">) {
  const now = Date.now();
  return p.external?.occurrences
    .filter(
      (o) =>
        !o.missing &&
        o.date &&
        ["confirmed", "scheduled", "active"].includes(o.status.toLowerCase()) &&
        Date.parse(`${o.date}T${o.startTime || "00:00"}:00+08:00`) >= now,
    )
    .sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    )[0];
}
