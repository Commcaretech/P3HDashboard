import { z } from "zod";
export const roles = ["Admin", "Manager", "Staff", "Read Only"] as const;
export function can(
  role: string,
  action: "read" | "write" | "audit" | "admin",
) {
  return (
    action === "read" ||
    (action === "write" && ["Admin", "Manager", "Staff"].includes(role)) ||
    (action === "audit" && ["Admin", "Manager"].includes(role)) ||
    (action === "admin" && role === "Admin")
  );
}
export const clean = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
export function categories(value: string, separator: RegExp = /[,;\n]/) {
  return [
    ...new Set(
      value
        .split(separator)
        .map(clean)
        .filter(Boolean)
        .map((s) =>
          [
            "HCG",
            "SSS",
            "ZBI",
            "EASE",
            "ADHD",
            "ASD",
            "COPD",
            "HIV",
            "AIDS",
          ].includes(s.toUpperCase())
            ? s.toUpperCase()
            : s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()),
        ),
    ),
  ];
}
export function parseDate(value: unknown, date1904 = false): string {
  if (value === "" || value == null) return "";
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100000 ||
      (!date1904 && Math.floor(value) === 60)
    )
      return "";
    const offset = date1904
      ? Date.UTC(1904, 0, 1)
      : Date.UTC(1899, 11, value < 60 ? 31 : 30);
    return new Date(offset + Math.floor(value) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const s = clean(value);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = m
    ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}
export function medical(value: string) {
  const member: string[] = [];
  const recipient: string[] = [];
  let zbi: number | undefined;
  for (const part of value
    .split(/[;\n,]/)
    .map(clean)
    .filter(Boolean)) {
    const z = part.match(/^ZBI\s*=\s*(\d+(?:\.\d+)?)$/i);
    if (z) {
      zbi = Number(z[1]);
      continue;
    }
    const cr = part.match(/^CR\s*:\s*(.+)$/i);
    if (cr) recipient.push(...categories(cr[1]));
    else member.push(...categories(part));
  }
  return { member, recipient, zbi };
}
export function remarks(value: string) {
  const suggested: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const m = line.match(
      /^\s*(P3H\s+Onboarding\s+Date|CR|Receiving|Completed|Relationship(?: to care recipient)?)\s*:\s*(.+)\s*$/i,
    );
    if (m) suggested[m[1].toLowerCase()] = m[2].trim();
  }
  return suggested;
}
const text = z.string().max(12000).default("");
const date = z
  .string()
  .refine((v) => !v || Boolean(parseDate(v)), "Use a valid date")
  .default("");
export const personSchema = z
  .object({
    kind: z.enum(["Member", "Care Recipient"]),
    memberId: z.string().trim().max(100).default(""),
    name: text,
    alias: text,
    dob: date,
    centre: text,
    gender: text,
    race: text,
    workingStatus: text,
    preferredLanguage: text,
    onboardingDate: date,
    status: z.enum(["Active", "Inactive", "Archived"]).default("Active"),
    mobility: text,
    hearing: text,
    eyesight: text,
    dietaryPreference: text,
    foodAllergies: text,
    education: text,
    primaryCondition: text,
    tags: text,
    remarks: text,
    languages: text,
    spokenLanguages: text,
    understoodLanguages: text,
    interests: text,
    conditions: text,
    zbiDate: date,
    zbi: z
      .string()
      .refine(
        (v) => !v || (/^\d+(\.\d+)?$/.test(v) && Number(v) <= 88),
        "ZBI must be 0–88",
      )
      .default(""),
  })
  .superRefine((v, c) => {
    if (v.kind === "Member" && !v.memberId)
      c.addIssue({
        code: "custom",
        path: ["memberId"],
        message: "Member ID is required",
      });
    if (v.kind === "Care Recipient" && !v.name && !v.alias)
      c.addIssue({
        code: "custom",
        path: ["name"],
        message: "Provide a name or alias",
      });
    if (v.dob && v.dob > today())
      c.addIssue({
        code: "custom",
        path: ["dob"],
        message: "Date of birth cannot be in the future",
      });
  });
export const programmeSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: text,
    category: text,
    mobility: text,
    venue: text,
    centre: text,
    day: text,
    startTime: z
      .string()
      .refine((v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use HH:MM")
      .default(""),
    endTime: text,
    frequency: text,
    capacity: z.coerce.number().int().min(0).max(10000),
    registrationStatus: z.enum(["Open", "Closed", "Waitlist"]),
    status: z.enum(["Active", "Inactive", "Archived"]),
    notes: text,
    languages: text,
    interests: text,
    conditions: text,
  })
  .refine(
    (v) =>
      !v.endTime ||
      (/^([01]\d|2[0-3]):[0-5]\d$/.test(v.endTime) &&
        (!v.startTime || v.endTime > v.startTime)),
    {
      path: ["endTime"],
      message: "End time must be valid and after start time",
    },
  );
export const grantStatuses = [
  "Not Applied",
  "Preparing",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Expired",
  "Renewal Required",
  "Receiving",
  "Received",
  "Completed",
  "Recorded in notes",
] as const;
export const grantSchema = z.object({
  personId: z.string().min(1),
  scheme: z.string().trim().min(1).max(200),
  status: z.enum(grantStatuses),
  applicationDate: date,
  submissionDate: date,
  approvalDate: date,
  expiryDate: date,
  nextReviewDate: date,
  amount: z
    .string()
    .refine(
      (v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 10000000),
      "Use a non-negative amount",
    )
    .default(""),
  notes: text,
  assignedId: text,
});
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function birthday(dob: Date, now: string) {
  const year = Number(now.slice(0, 4));
  let d = `${year}-${dob.toISOString().slice(5, 10)}`;
  if (d.endsWith("02-29") && !parseDate(d)) d = `${year}-02-28`;
  if (d < now) {
    d = `${year + 1}-${dob.toISOString().slice(5, 10)}`;
    if (d.endsWith("02-29") && !parseDate(d)) d = `${year + 1}-02-28`;
  }
  return {
    date: d,
    days: Math.round(
      (new Date(d).getTime() - new Date(now).getTime()) / 86400000,
    ),
  };
}
export type MatchPerson = {
  languages: string[];
  interests: string[];
  conditions: string[];
  mobility: string;
};
export type MatchProgramme = MatchPerson;
export const weights = {
  condition: 35,
  language: 25,
  memberInterest: 15,
  recipientInterest: 15,
  mobility: 10,
};
export function match(
  member: MatchPerson,
  recipient: MatchPerson | undefined,
  p: MatchProgramme,
) {
  let score = 0;
  const reasons: string[] = [];
  const intersect = (a: string[], b: string[]) =>
    a.filter((x) => b.some((y) => y.toLowerCase() === x.toLowerCase()));
  const award = (a: string[], b: string[], points: number, label: string) => {
    const hit = intersect(a, b);
    if (hit.length) {
      score += points;
      reasons.push(`${label}: ${hit.join(", ")} (+${points}%)`);
    } else
      reasons.push(
        `${label}: ${a.length ? "no match" : "information missing"} (+0%)`,
      );
  };
  award(
    recipient?.conditions ?? [],
    p.conditions,
    weights.condition,
    "Care recipient conditions",
  );
  award(
    recipient?.languages.length ? recipient.languages : member.languages,
    p.languages,
    weights.language,
    "Language",
  );
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
  const mobile = Boolean(
    recipient?.mobility &&
    p.mobility &&
    (categories(p.mobility).some(
      (x) => x.toLowerCase() === recipient.mobility.toLowerCase(),
    ) ||
      p.mobility.toLowerCase() === "all"),
  );
  if (mobile) score += weights.mobility;
  reasons.push(
    `Mobility: ${mobile ? "suitable (+10%)" : recipient?.mobility ? "suitability not established (+0%)" : "information missing (+0%)"}`,
  );
  return { score, reasons };
}
