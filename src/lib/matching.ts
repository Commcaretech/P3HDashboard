export type MatchPerson = {
  languages: string[];
  interests: string[];
  conditions: string[];
  mobility: string;
};
export type MatchProgramme = MatchPerson & {
  imported?: boolean;
  reviewRequired?: boolean;
  conditionAssessment?: string;
};
export const weights = {
  condition: 35,
  language: 25,
  memberInterest: 15,
  recipientInterest: 15,
  mobility: 10,
};
export const compareRecommendations = (
  a: { eligible: boolean; score: number },
  b: { eligible: boolean; score: number },
) => Number(b.eligible) - Number(a.eligible) || b.score - a.score;
const normalize = (s: string) => s.trim().toLowerCase();
export function mobilityCompatible(person: string, programme: string) {
  const mobility = normalize(person),
    levels = programme.split(/[,;\n]/).map(normalize);
  return Boolean(
    mobility &&
    programme &&
    (levels.includes("all") ||
      levels.includes("all mobility levels") ||
      levels.includes(mobility) ||
      (mobility === "wheelchair" && levels.includes("wheelchair friendly"))),
  );
}
export function match(
  member: MatchPerson,
  recipient: MatchPerson | undefined,
  p: MatchProgramme,
) {
  let score = 0;
  const reasons: string[] = [],
    missing: string[] = [];
  const language = recipient?.languages.length
    ? recipient.languages
    : member.languages;
  const award = (a: string[], b: string[], points: number, label: string) => {
    const hit = [
      ...new Set(a.filter((x) => b.some((y) => normalize(y) === normalize(x)))),
    ];
    if (hit.length) {
      score += points;
      reasons.push(`${label}: ${hit.join(", ")} (+${points}%)`);
    } else
      reasons.push(
        `${label}: ${a.length ? "no match" : "information missing"} (+0%)`,
      );
    if (!a.length || !b.length)
      missing.push(!b.length ? `Programme ${label.toLowerCase()}` : label);
  };
  if (p.imported && p.conditionAssessment !== "Assessed")
    reasons.push(
      "Care considerations: no condition-specific suitability assessment (+0%); staff review remains necessary for individual needs",
    );
  else
    award(
      recipient?.conditions ?? [],
      p.conditions,
      weights.condition,
      "Care recipient conditions",
    );
  award(language, p.languages, weights.language, "Language");
  award(
    member.interests,
    p.interests,
    weights.memberInterest,
    "Member interests",
  );
  award(
    recipient?.interests ?? [],
    p.interests,
    weights.recipientInterest,
    "Care recipient interests",
  );
  const levels = p.mobility.split(/[,;\n]/).map(normalize);
  const unrestricted =
    levels.includes("all") || levels.includes("all mobility levels");
  const mobility = normalize(
    recipient?.mobility ?? (p.imported ? member.mobility : ""),
  );
  const mobile = Boolean(
    mobility &&
    p.mobility &&
    (unrestricted ||
      levels.includes(mobility) ||
      (mobility === "wheelchair" && levels.includes("wheelchair friendly"))),
  );
  if (mobile) score += weights.mobility;
  if (!mobility) missing.push("Care recipient mobility");
  const eligible =
    !(mobility && p.mobility && !mobile) &&
    !(
      p.imported &&
      (!mobility ||
        p.reviewRequired ||
        !p.mobility ||
        !p.languages.length ||
        (p.conditionAssessment !== "Not Applicable" && !p.conditions.length) ||
        !p.interests.length)
    );
  reasons.push(
    `Mobility: ${mobile ? "suitable (+10%)" : mobility ? "suitability not established (+0%)" : "information missing (+0%)"}`,
  );
  if (!eligible)
    reasons.unshift(
      p.imported &&
        (!mobility ||
          p.reviewRequired ||
          !p.mobility ||
          !p.languages.length ||
          (p.conditionAssessment !== "Not Applicable" &&
            !p.conditions.length) ||
          !p.interests.length)
        ? "Staff suitability review required; compatibility does not confirm registration availability"
        : "Not Recommended: Mobility requirement not met",
    );
  const confidenceScore =
    (recipient?.conditions.length ? 35 : 0) +
    (language.length ? 25 : 0) +
    (member.interests.length ? 15 : 0) +
    (recipient?.interests.length ? 15 : 0) +
    (mobility ? 10 : 0);
  return {
    score: eligible ? score : 0,
    reasons,
    eligible,
    confidenceScore,
    confidence:
      confidenceScore >= 85 ? "High" : confidenceScore >= 60 ? "Medium" : "Low",
    missing,
  };
}
