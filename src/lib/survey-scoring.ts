// P3H Requests workbook, rows 15–57. This is a P3H-specific instrument.
export const SURVEY_METHOD = "P3H_WHOQOL_ZBI6_v1_complete_domains";
export const SURVEY_POLICY =
  "Provisional: all items in each domain and all six ZBI items are required. No imputation. P3H approval pending.";
export const surveyQuestions = [
  "How would you rate your quality of life",
  "How satisfied are you with your health",
  "To what extent do you feel that physical pain prevents you from doing what you need to do",
  "How much do you need any medical treatment to function in your daily life",
  "How much do you enjoy life",
  "To what extent do you feel your life to be meaningful",
  "How well are you able to concentrate",
  "How safe do you feel in your daily life",
  "How healthy is your physical environment",
  "Do you have enough energy for everyday life",
  "Are you able to accept your bodily appearance",
  "Have you enough money to meet your needs",
  "How available to you is the information that you need in your day-to-day life",
  "To what extent do you have the opportunity for leisure activities",
  "How well are you able to get around",
  "How satisfied are you with your sleep",
  "How satisfied are you with your ability to perform your daily living activities",
  "How satisfied are you with your capacity for work",
  "How satisfied are you with yourself",
  "How satisfied are you with your personal relationships",
  "How satisfied are you with your sex life",
  "How satisfied are you with the support you get from your friends",
  "How satisfied are you with the conditions of your living place",
  "How satisfied are you with your access to health and social services",
  "How satisfied are you with your transport",
  "How often do you have negative feelings such as blue mood, despair, anxiety, depression",
  "You don't have enough time for yourself",
  "Stressed between caring and meeting other responsibilities",
  "Your child/ward affects your relationship with others in a negative way",
  "Strained when you are around your child/ward",
  "Your health has suffered because of your involvement with your child/ward",
  "You have lost control of your life since your child/ward developed a condition",
] as const;
export const questionKeys = surveyQuestions.map((_, i) =>
  i < 26 ? `Q${i + 1}` : `Z${i - 25}`,
);
export const normaliseSurveyText = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/sastified/g, "satisfied")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const scales = {
  quality: ["Very poor", "Poor", "Neither poor nor good", "Good", "Very good"],
  satisfied: [
    "Very dissatisfied",
    "Dissatisfied",
    "Neither satisfied nor dissatisfied",
    "Satisfied",
    "Very satisfied",
  ],
  amount: [
    "Not at all",
    "A little",
    "A moderate amount",
    "Very much",
    "An extreme amount",
  ],
  extent: [
    "Not at all",
    "A little",
    "A moderate amount",
    "Very much",
    "Extremely",
  ],
  capacity: ["Not at all", "A little", "Moderately", "Mostly", "Completely"],
  frequency: ["Never", "Seldom", "Quite often", "Very often", "Always"],
  burden: ["Never", "Rarely", "Sometimes", "Quite frequently", "Nearly always"],
};
export function scaleFor(key: string) {
  if (/^Z[1-6]$/.test(key)) return scales.burden;
  const n = Number(key.slice(1));
  if (n === 1 || n === 15) return scales.quality;
  if (n === 2 || (n >= 16 && n <= 25)) return scales.satisfied;
  if (n >= 3 && n <= 6) return scales.amount;
  if (n >= 7 && n <= 9) return scales.extent;
  if (n >= 10 && n <= 14) return scales.capacity;
  return scales.frequency;
}
export function surveyAnswer(
  key: string,
  input: unknown,
): { value: number | null; issue?: string } {
  if (!questionKeys.includes(key))
    return { value: null, issue: "Unknown question" };
  const s = String(input ?? "").trim();
  if (
    !s ||
    s === "99" ||
    /^not applicable\s*\/\s*i do not wish to answer(?:\s|$)/i.test(s)
  )
    return { value: null, issue: "Missing response" };
  const offset = key.startsWith("Z") ? 0 : 1;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= offset && n <= offset + 4
      ? { value: n }
      : { value: null, issue: "Invalid numerical response" };
  }
  // Exact known English option, optionally followed by the supplied translated
  // suffix. Never map an arbitrary substring or guess a translation.
  const option = scaleFor(key).findIndex(
    (label) =>
      s.toLowerCase() === label.toLowerCase() ||
      (s.toLowerCase().startsWith(label.toLowerCase()) &&
        /^[([\u4e00-\u9fff\u0b80-\u0bff?]/u.test(
          s.slice(label.length).trimStart(),
        )),
  );
  return option < 0
    ? { value: null, issue: "Unknown answer label" }
    : { value: option + offset };
}
export const surveyDomains = {
  physical: [3, 4, 10, 15, 16, 17, 18],
  psychological: [5, 6, 7, 11, 19, 26],
  social: [20, 22],
  environment: [8, 9, 12, 13, 14, 23, 24, 25],
} as const;
export const roundSurvey = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export function scoreSurvey(answers: Record<string, unknown>) {
  const values: Record<string, number | null> = {},
    warnings: string[] = [];
  for (const key of questionKeys) {
    const a = surveyAnswer(key, answers[key]);
    values[key] = a.value;
    if (a.issue) warnings.push(`${key}: ${a.issue}`);
  }
  const reversed = { ...values };
  for (const q of ["Q3", "Q4", "Q26"])
    if (reversed[q] !== null) reversed[q] = 6 - reversed[q]!;
  const means = Object.fromEntries(
    Object.entries(surveyDomains).map(([name, questions]) => {
      const vs = questions.map((q) => reversed[`Q${q}`]);
      return [
        name,
        vs.every((v) => v !== null)
          ? vs.reduce<number>((n, v) => n + v!, 0) / vs.length
          : null,
      ];
    }),
  ) as Record<keyof typeof surveyDomains, number | null>;
  const domainValues = Object.values(means);
  const meanOverall = domainValues.every((v) => v !== null)
    ? domainValues.reduce<number>((a, b) => a + b!, 0) / 4
    : null;
  const burden = [1, 2, 3, 4, 5, 6].map((i) => values[`Z${i}`]);
  return {
    method: SURVEY_METHOD,
    values,
    warnings,
    physical:
      means.physical === null ? null : roundSurvey((means.physical - 1) * 25),
    psychological:
      means.psychological === null
        ? null
        : roundSurvey((means.psychological - 1) * 25),
    social: means.social === null ? null : roundSurvey((means.social - 1) * 25),
    environment:
      means.environment === null
        ? null
        : roundSurvey((means.environment - 1) * 25),
    overall: meanOverall === null ? null : roundSurvey((meanOverall - 1) * 25),
    zbi: burden.every((v) => v !== null)
      ? burden.reduce<number>((a, b) => a + b!, 0)
      : null,
  };
}

export const surveyDay = (value: Date | string) =>
  new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
