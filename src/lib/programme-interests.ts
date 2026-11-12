import type { Programme } from "./types";
export const normalizeInterest = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-_/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// Subject rules suggest interests only, never medical safety, language or capacity.
export const interestRules: {
  id: string;
  pattern: RegExp;
  tags: string[];
  domains: string[];
}[] = [
  {
    id: "gentle",
    pattern: /\b(chair yoga|chair exercise|seated|gentle|stretch\w*)\b/i,
    tags: ["Exercise", "Gentle Movement"],
    domains: ["Physical"],
  },
  {
    id: "movement",
    pattern:
      /\b(yoga|tai ?chi|taiji|qi ?gong|baduanjin|pilates|zumba|exercis\w*|fitness|aerobic\w*|strength|balance|movement|physical activit\w*)\b/i,
    tags: ["Exercise", "Movement"],
    domains: ["Physical"],
  },
  {
    id: "walking",
    pattern:
      /\b(walk\w*|hiking|cycling|swim\w*|sports?|badminton|boccia|bowling|table tennis|pickleball)\b/i,
    tags: ["Exercise", "Outdoor Activities"],
    domains: ["Physical"],
  },
  {
    id: "dance",
    pattern: /\b(danc\w*|line dance)\b/i,
    tags: ["Exercise", "Dance"],
    domains: ["Physical", "Social"],
  },
  {
    id: "nutrition",
    pattern:
      /\b(healthy eating|nutrition|dietary|food education|balanced diet)\b/i,
    tags: ["Nutrition", "Health Education"],
    domains: ["Learning"],
  },
  {
    id: "health",
    pattern:
      /\b(health education|health talks?|wellness talks?|health awareness|first aid)\b/i,
    tags: ["Health Education", "Learning"],
    domains: ["Learning"],
  },
  {
    id: "technology",
    pattern:
      /\b(digital|smartphones?|computers?|technology|internet|cyber\w*|online scams?|e payments?|singpass)\b/i,
    tags: ["Technology", "Learning"],
    domains: ["Learning", "Cognitive"],
  },
  {
    id: "creative",
    pattern:
      /\b(arts?|craft\w*|paint\w*|draw\w*|colou?r\w*|origami|calligraphy|knit\w*|crochet|creative activit\w*)\b/i,
    tags: ["Creative Activities"],
    domains: ["Social", "Learning", "Cognitive"],
  },
  {
    id: "music",
    pattern: /\b(karaoke|music|sing\w*|choir|ukulele|guitar|piano|drum\w*)\b/i,
    tags: ["Music", "Social Activities"],
    domains: ["Social", "Learning"],
  },
  {
    id: "games",
    pattern:
      /\b(puzzles?|sudoku|chess|mah ?jongg?|board games?|rummikub|scrabble|quizzes|quiz|trivia|bingo|brain games?|memory games?)\b/i,
    tags: ["Games", "Cognitive Activities"],
    domains: ["Cognitive", "Social"],
  },
  {
    id: "memory",
    pattern:
      /\b(reminiscence|reminiscing|memory|storytelling|brain training|cognitive)\b/i,
    tags: ["Cognitive Activities"],
    domains: ["Cognitive"],
  },
  {
    id: "gardening",
    pattern: /\b(garden\w*|horticulture|plants?)\b/i,
    tags: ["Gardening", "Outdoor Activities"],
    domains: ["Social", "Physical", "Learning"],
  },
  {
    id: "cooking",
    pattern: /\b(cook\w*|baking|bake|food preparation)\b/i,
    tags: ["Cooking", "Learning"],
    domains: ["Learning", "Social"],
  },
  {
    id: "reading",
    pattern: /\b(read\w*|books?|literature|poetry|libraries)\b/i,
    tags: ["Reading", "Learning"],
    domains: ["Cognitive", "Learning"],
  },
  {
    id: "languages",
    pattern:
      /\b(language|literacy|mandarin class|english class|dialect class)\b/i,
    tags: ["Languages", "Learning"],
    domains: ["Learning"],
  },
  {
    id: "outings",
    pattern: /\b(outings?|excursions?|tours?|travel|museum|heritage)\b/i,
    tags: ["Outings", "Social Activities"],
    domains: ["Social", "Learning"],
  },
  {
    id: "social",
    pattern:
      /\b(social|friendship|coffee|kopi|chit chat|celebrat\w*|festiv\w*|birthdays?|potluck|picnic|gathering)\b/i,
    tags: ["Social Activities"],
    domains: ["Social"],
  },
  {
    id: "volunteering",
    pattern:
      /\b(volunteer\w*|befriend\w*|community service|fundrais\w*|charity|meal delivery)\b/i,
    tags: ["Volunteering", "Social Activities"],
    domains: ["Volunteerism"],
  },
  {
    id: "learning",
    pattern: /\b(learn\w*|workshops?|lessons?|courses?|talks?|seminars?)\b/i,
    tags: ["Learning"],
    domains: ["Learning", "Cognitive", "Social", "Physical", "Volunteerism"],
  },
];
export const domainInterests: Record<string, string[]> = {
  Physical: ["Exercise", "Movement"],
  Cognitive: ["Cognitive Activities"],
  Social: ["Social Activities"],
  Learning: ["Learning"],
  Volunteerism: ["Volunteering"],
};
const unique = (values: string[]) => [
  ...new Map(
    values.filter(Boolean).map((v) => [normalizeInterest(v), v.trim()]),
  ).values(),
];
export function expandInterests(values: string[]) {
  return unique(
    values.flatMap((v) => [
      v,
      ...interestRules
        .filter((r) => r.pattern.test(normalizeInterest(v)))
        .flatMap((r) => r.tags),
      ...(domainInterests[v] || []),
    ]),
  );
}
export function programmeInterestEvidence(
  p: Pick<
    Programme,
    "name" | "category" | "interests" | "interestTagsReviewed"
  > &
    Partial<Pick<Programme, "description" | "external">>,
) {
  const nameRules = interestRules.filter((r) =>
      r.pattern.test(normalizeInterest(p.name)),
    ),
    details = [
      p.description,
      p.external?.programmeType,
      ...((p.external?.missing ? [] : p.external?.occurrences) || [])
        .filter(
          (o) =>
            !o.missing &&
            !["cancelled", "inactive", "closed"].includes(
              o.status.toLowerCase(),
            ) &&
            !["hidden", "cancelled", "past"].includes(
              o.eligibilityStatus || "",
            ) &&
            !(
              Array.isArray(o.reasonCodes) &&
              o.reasonCodes.some((c) => String(c).startsWith("hidden_"))
            ) &&
            !(
              (o.visibilityKnown ||
                p.external?.eligibilityRulesVersion === 2) &&
              (!o.timetableVisible || !o.calendarVisible)
            ),
        )
        .map((o) => o.sourceActivityName),
    ]
      .filter(Boolean)
      .join(" "),
    detailRules = interestRules.filter((r) =>
      r.pattern.test(normalizeInterest(details)),
    ),
    rules = interestRules.filter(
      (r) => nameRules.includes(r) || detailRules.includes(r),
    ),
    suggested = unique([
      ...rules.flatMap((r) => r.tags),
      ...(domainInterests[p.category] || []),
    ]),
    staff = p.interests.map((x) => x.interest.name),
    corrected = Boolean(staff.length || p.interestTagsReviewed);
  const subjectRules = rules.filter((r) => r.id !== "learning");
  const domainMismatch =
    subjectRules.length > 0 &&
    Object.hasOwn(domainInterests, p.category) &&
    !subjectRules.some((r) => r.domains.includes(p.category));
  return {
    tags: corrected ? unique(staff) : suggested,
    nameTags: unique(nameRules.flatMap((r) => r.tags)),
    detailTags: unique(detailRules.flatMap((r) => r.tags)),
    subjectTags: unique(rules.flatMap((r) => r.tags)),
    domainTags: domainInterests[p.category] || [],
    suggested,
    staffMaintained: corrected,
    rules: rules.map((r) => r.id),
    needsCorrection: !corrected && (!subjectRules.length || domainMismatch),
    domainMismatch,
  };
}
