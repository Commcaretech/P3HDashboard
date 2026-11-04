import { Field } from "./ui";
import { Data, Person, Programme, Grant, label, day } from "@/lib/types";
import { grantStatuses, roles } from "@/lib/domain";
const opts = (v: readonly string[]) => v.map((x) => ({ value: x, label: x }));
export function personFields(kind: string): Field[] {
  const core: Field[] = [
    {
      key: "memberId",
      label: "Member ID",
      required: kind === "Member",
      section: "Overview",
    },
    { key: "name", label: "Name", section: "Overview" },
    {
      key: "contactNumber",
      label: "Contact number (optional)",
      section: "Overview",
    },
    { key: "alias", label: "Alias", section: "Overview" },
    { key: "dob", label: "Date of birth", type: "date", section: "Overview" },
    { key: "centre", label: "Centre", section: "Overview" },
    { key: "gender", label: "Gender", section: "Overview" },
    { key: "race", label: "Race", section: "Overview" },
    { key: "workingStatus", label: "Working status", section: "Overview" },
    {
      key: "onboardingDate",
      label: "P3H onboarding date",
      type: "date",
      section: "Overview",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: opts(["Active", "Inactive", "Archived"]),
      section: "Overview",
    },
    {
      key: "preferredLanguage",
      label: "Preferred language",
      section: "Overview",
    },
    {
      key: "spokenLanguages",
      label: "Spoken languages",
      section: "Languages & interests",
    },
    {
      key: "understoodLanguages",
      label: "Understood languages",
      section: "Languages & interests",
    },
    {
      key: "languages",
      label: "Other spoken / understood languages",
      section: "Languages & interests",
    },
    { key: "interests", label: "Interests", section: "Languages & interests" },
    { key: "tags", label: "Tags", section: "Languages & interests" },
    { key: "primaryCondition", label: "Primary condition", section: "Health" },
    {
      key: "conditions",
      label: "Medical / mental health conditions",
      section: "Health",
    },
    {
      key: "zbi",
      label: "New ZBI assessment (0–88)",
      type: "number",
      section: "Health",
    },
    {
      key: "mobility",
      label: "Mobility",
      type: "select",
      options: opts(["", "Independent", "Assisted", "Wheelchair", "Bedbound"]),
      section: "Health",
    },
    {
      key: "zbiDate",
      label: "ZBI assessment date (if known)",
      type: "date",
      section: "Health",
    },
    { key: "hearing", label: "Hearing", section: "Health" },
    { key: "eyesight", label: "Eyesight", section: "Health" },
    {
      key: "dietaryPreference",
      label: "Dietary preference",
      section: "Health",
    },
    { key: "foodAllergies", label: "Food allergies", section: "Health" },
    { key: "education", label: "Education", section: "Health" },
    {
      key: "remarks",
      label: "Remarks / notes",
      type: "textarea",
      section: "Notes",
    },
  ];
  return core.filter(
    (f) =>
      kind === "Member" ||
      !["memberId", "onboardingDate", "workingStatus"].includes(f.key),
  );
}
export const personValues = (p: Person) => ({
  ...p,
  assignedId: p.assignedId ?? "",
  dob: p.dob?.slice(0, 10) ?? "",
  onboardingDate: p.onboardingDate?.slice(0, 10) ?? "",
  languages: p.languages
    .filter((x) => x.mode === "Spoken / understood")
    .map((x) => x.language.name)
    .join(", "),
  spokenLanguages: p.languages
    .filter((x) => x.mode === "Spoken")
    .map((x) => x.language.name)
    .join(", "),
  understoodLanguages: p.languages
    .filter((x) => x.mode === "Understood")
    .map((x) => x.language.name)
    .join(", "),
  interests: p.interests.map((x) => x.interest.name).join(", "),
  conditions: p.conditions.map((x) => x.condition.name).join(", "),
  zbi: "",
});
export const programmeFields: Field[] = [
  { key: "name", label: "Programme name", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "category", label: "Category" },
  { key: "centre", label: "Centre" },
  { key: "venue", label: "Venue" },
  { key: "languages", label: "Supported languages" },
  { key: "conditions", label: "Suitable conditions" },
  { key: "interests", label: "Related interests" },
  {
    key: "mobility",
    label: "Suitable mobility levels",
    type: "chips",
    options: opts(["Independent", "Assisted", "Wheelchair friendly", "All"]),
    hint: "Select supported levels; All means all mobility levels",
  },
  {
    key: "day",
    label: "Day",
    type: "select",
    options: opts([
      "",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]),
  },
  { key: "startTime", label: "Start time", type: "time" },
  { key: "endTime", label: "End time", type: "time" },
  {
    key: "frequency",
    label: "Frequency",
    options: opts(["Weekly", "Fortnightly", "Monthly", "One-off", "Custom"]),
  },
  { key: "capacity", label: "Capacity (0 = unspecified)", type: "number" },
  {
    key: "registrationStatus",
    label: "Registration",
    type: "select",
    options: opts(["Open", "Waitlist", "Closed", "Unverified"]),
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: opts(["Active", "Inactive", "Archived"]),
  },
  { key: "notes", label: "Notes", type: "textarea" },
];
export const programmeValues = (p: Programme) => ({
  ...p,
  languages: p.languages.map((x) => x.language.name).join(", "),
  conditions: p.conditions.map((x) => x.condition.name).join(", "),
  interests: p.interests.map((x) => x.interest.name).join(", "),
});
export const peopleOptions = (d: Data) => [
  { value: "", label: "Select person" },
  ...d.people
    .filter((p) => p.status !== "Archived")
    .map((p) => ({ value: p.id, label: `${label(p)} · ${p.kind}` })),
];
export const staffOptions = (d: Data) => [
  { value: "", label: "Unassigned" },
  ...d.staff
    .filter((u) => u.active)
    .map((u) => ({ value: u.id, label: u.name })),
];
export function grantFields(d: Data): Field[] {
  return [
    {
      key: "personId",
      label: "Person",
      type: "select",
      required: true,
      options: peopleOptions(d),
    },
    {
      key: "scheme",
      label: "Scheme name",
      required: true,
      hint: "HCG, SSS, PioneerDAS, Home Therapy, EASE or another scheme",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: opts([
        ...new Set([...grantStatuses, ...d.grants.map((g) => g.status)]),
      ]),
    },
    ...[
      "applicationDate",
      "submissionDate",
      "approvalDate",
      "expiryDate",
      "nextReviewDate",
    ].map((key) => ({
      key,
      label: (
        {
          applicationDate: "Application date",
          submissionDate: "Submission date",
          approvalDate: "Approval date",
          expiryDate: "Expiry date",
          nextReviewDate: "Next review date",
        } as Record<string, string>
      )[key],
      type: "date" as const,
    })),
    {
      key: "followUpFrequency",
      label: "Follow-up frequency",
      type: "select",
      options: opts(["Automatic", "Once", "7", "14", "30", "90"]),
      hint: "Automatic uses scheme rules. Numbers are days; custom intervals repeat until resolved.",
    },
    { key: "overrideReason", label: "Date override reason (optional)" },
    {
      key: "resolution",
      label: "Follow-up resolution",
      type: "select",
      options: opts(["Open", "Resolved"]),
      hint: "Approval alone does not resolve outstanding payout or follow-up work.",
    },
    { key: "amount", label: "Amount (SGD)", type: "number" },
    {
      key: "assignedId",
      label: "Assigned staff",
      type: "select",
      options: staffOptions(d),
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
}
export const grantValues = (g: Grant) => ({
  ...g,
  scheme: g.scheme.name,
  followUpFrequency: g.followUpFrequency || "Automatic",
  resolution: g.resolvedAt ? "Resolved" : "Open",
  amount: g.amount ?? "",
  assignedId: g.assignedId ?? "",
  ...Object.fromEntries(
    [
      "applicationDate",
      "submissionDate",
      "approvalDate",
      "expiryDate",
      "nextReviewDate",
    ].map((k) => [
      k,
      day(g[k as keyof Grant] as string | null) === "—"
        ? ""
        : day(g[k as keyof Grant] as string | null),
    ]),
  ),
});
export function alertFields(d: Data): Field[] {
  return [
    { key: "title", label: "Title", required: true },
    {
      key: "personId",
      label: "Person",
      type: "select",
      options: peopleOptions(d),
    },
    {
      key: "type",
      label: "Alert type",
      type: "select",
      options: opts([
        "Custom reminder",
        "Case review",
        "Programme follow-up",
        "Grant follow-up",
      ]),
    },
    { key: "dueDate", label: "Due date", type: "date", required: true },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: opts(["Normal", "High", "Low"]),
    },
    {
      key: "assignedId",
      label: "Assigned staff",
      type: "select",
      options: staffOptions(d),
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
}
export const userFields: Field[] = [
  { key: "name", label: "Staff name", required: true },
  { key: "username", label: "Username", required: true },
  {
    key: "password",
    label: "Initial password (at least 12 characters)",
    type: "password",
    required: true,
  },
  { key: "role", label: "Role", type: "select", options: opts(roles) },
  {
    key: "allCentres",
    label: "Centre access",
    type: "select",
    options: opts(["Selected centres", "All centres"]),
  },
  {
    key: "centres",
    label: "Allowed centres",
    type: "chips",
    hint: "Enter exact centre names. Required for selected-centre access.",
  },
];
