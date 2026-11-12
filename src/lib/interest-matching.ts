import type { Programme } from "./types";
import {
  interestRules,
  normalizeInterest,
  programmeInterestEvidence,
  domainInterests,
} from "./programme-interests";
import { mobilityCompatible } from "./matching";
import {
  needsReview,
  recommendationReady,
  scheduleLabel,
} from "./programme-source";
export type InterestProfile = {
  interests: string[];
  preferredActivities?: string[];
  languages: string[];
  mobility: string;
  centre?: string;
  kind: "Member" | "Care Recipient";
};
export function profileInterestTokens(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((v) => [
          v,
          ...interestRules
            .filter((r) => r.pattern.test(normalizeInterest(v)))
            .map((r) => r.tags[0]),
          ...(domainInterests[v] || []),
        ])
        .map(normalizeInterest),
    ),
  ];
}
export function interestMatch(profile: InterestProfile, p: Programme) {
  const evidence = programmeInterestEvidence(p),
    preferences = [
      ...profile.interests,
      ...(profile.preferredActivities || []),
    ],
    tokens = profileInterestTokens(preferences),
    primary = evidence.staffMaintained
      ? profileInterestTokens(evidence.tags)
      : evidence.subjectTags.map(normalizeInterest),
    matched = preferences.filter((value) =>
      profileInterestTokens([value]).some((t) => primary.includes(t)),
    );
  const reasons: string[] = [],
    missing: string[] = [];
  let score = 0;
  if (matched.length) {
    score += 60;
    reasons.push(`Matches recorded interests: ${matched.join(", ")} (+60)`);
  }
  const nameHit =
    !evidence.staffMaintained &&
    evidence.nameTags.some((tag) => tokens.includes(normalizeInterest(tag)));
  if (nameHit) {
    score += 15;
    reasons.push(
      `Programme name suggests ${evidence.nameTags.join(", ")} (+15)`,
    );
  }
  const detailHit =
    !evidence.staffMaintained &&
    !nameHit &&
    evidence.detailTags.some((tag) => tokens.includes(normalizeInterest(tag)));
  if (detailHit) {
    score += 15;
    reasons.push(
      `Programme details suggest ${evidence.detailTags.join(", ")} (+15)`,
    );
  }
  const domainHit = evidence.domainTags.some((tag) =>
    tokens.includes(normalizeInterest(tag)),
  );
  if (
    domainHit &&
    !evidence.staffMaintained &&
    (!evidence.domainMismatch || matched.length)
  ) {
    score += 10;
    reasons.push(
      `Source domain: ${p.category}; supports a recorded interest (+10)`,
    );
  }
  if (profile.centre && p.centre === profile.centre && score > 0) {
    score += 10;
    reasons.push(
      `Same recorded centre: ${p.centre} (+10). Travel time is not assessed.`,
    );
  }
  const languageVerified = Boolean(
      (p.review?.languageAssessment === "Assessed" || !p.external) &&
      p.languages.length,
    ),
    languageHit =
      languageVerified &&
      profile.languages.some((l) =>
        p.languages.some(
          (x) => normalizeInterest(x.language.name) === normalizeInterest(l),
        ),
      );
  if (languageHit && score > 0) {
    score += 5;
    reasons.push("Matches an assessed programme language (+5)");
  }
  if (!preferences.length) missing.push("Senior interests not recorded");
  if (!languageVerified) missing.push("Programme language not verified");
  const knownMobility = [
    "independent",
    "assisted",
    "wheelchair",
    "wheelchair friendly",
    "all",
    "all mobility levels",
  ];
  const mobilityRecorded = p.mobility
    .split(/[,;\n]/)
    .some((v) => knownMobility.includes(normalizeInterest(v)));
  const mobilityAssessed = Boolean(
    (p.review?.mobilityAssessment === "Assessed" || !p.external) &&
    mobilityRecorded,
  );
  const mobilityConflict = Boolean(
    mobilityRecorded &&
    profile.mobility.trim() &&
    !mobilityCompatible(profile.mobility, p.mobility),
  );
  if (!mobilityAssessed || !p.review?.accessibility)
    missing.push("Accessibility Not Assessed");
  else if (!profile.mobility)
    missing.push("Senior mobility not recorded; confirm accessibility needs");
  if (mobilityConflict)
    reasons.unshift(
      "Explicit incompatibility with the participant's recorded mobility requirement",
    );
  const audience = p.review?.audience,
    audienceAllowed =
      !audience ||
      audience === "Both" ||
      audience ===
        (profile.kind === "Member" ? "Caregivers" : "Care Recipients");
  if (!audience) missing.push("Intended audience not verified");
  if (!audienceAllowed)
    reasons.unshift("Intended audience does not include this participant");
  if (p.review?.conditionAssessment !== "Assessed")
    missing.push(
      "Medical suitability not assessed; no medical safety is inferred",
    );
  if (p.registrationStatus !== "Open")
    missing.push(
      p.registrationStatus === "Unverified"
        ? "Registration availability unverified"
        : `Registration ${p.registrationStatus.toLowerCase()}`,
    );
  const schedule = scheduleLabel(p);
  if (schedule !== "Confirmed upcoming") missing.push(schedule);
  const eligible =
    recommendationReady(p) && audienceAllowed && !mobilityConflict && score > 0;
  return {
    score: eligible ? Math.min(100, score) : 0,
    eligible,
    reasons,
    missing,
    matchedInterests: matched,
    tags: evidence.tags,
    suitabilityVerified: Boolean(
      p.review?.status === "Reviewed" && !needsReview(p),
    ),
    languageVerified,
  };
}
