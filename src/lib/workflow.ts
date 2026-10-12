import type { Alert, Person } from "./types";
import { today } from "./domain";
export const alertDue = (a: Pick<Alert, "dueDate" | "snoozedUntil">) =>
  (a.snoozedUntil || a.dueDate).slice(0, 10);
export function alertGroup(
  a: Pick<Alert, "dueDate" | "snoozedUntil">,
  now = today(),
) {
  const days = Math.round(
    (Date.parse(alertDue(a)) - Date.parse(now)) / 86400000,
  );
  return days < 0
    ? "Overdue"
    : days === 0
      ? "Today"
      : days <= 7
        ? "Next 7 Days"
        : days <= 30
          ? "Next 30 Days"
          : "Later";
}
export const alertGroups = [
  "Overdue",
  "Today",
  "Next 7 Days",
  "Next 30 Days",
  "Later",
];
export function completeness(p: Person, recipients: Person[] = []) {
  const checks: [string, boolean, number][] = [
    ["Preferred language", Boolean(p.preferredLanguage), 20],
    ["Languages", p.languages.length > 0, 15],
    ["Interests", p.interests.length > 0, 20],
    ["Centre", Boolean(p.centre), 5],
    ["Assigned staff", Boolean(p.assignedId), 5],
  ];
  if (p.kind === "Care Recipient")
    checks.push(
      ["Conditions", p.conditions.length > 0, 20],
      ["Mobility", Boolean(p.mobility), 15],
    );
  else
    checks.push(
      ["Linked care recipient", recipients.length > 0, 10],
      [
        "Care recipient conditions",
        recipients.some((r) => r.conditions.length > 0),
        15,
      ],
      [
        "Care recipient mobility",
        recipients.some((r) => Boolean(r.mobility)),
        10,
      ],
    );
  return {
    score: checks.reduce(
      (sum, [, present, weight]) => sum + (present ? weight : 0),
      0,
    ),
    missing: checks.filter(([, present]) => !present).map(([name]) => name),
  };
}
