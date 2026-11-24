import { parseDate } from "./domain";
export function addDays(date: string, days: number) {
  if (!parseDate(date))
    throw new Error("Enter a valid application or submission date.");
  return new Date(Date.parse(date) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function addMonths(date: string, months: number) {
  if (!parseDate(date))
    throw new Error("Enter a valid application or submission date.");
  const d = new Date(date),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function followUpRule(scheme: string, frequency = "") {
  if (frequency === "Once")
    return {
      days: null,
      months: null,
      recurring: false,
      label: "One-time follow-up; choose a date",
    };
  if (frequency && frequency !== "Automatic") {
    const days = Number(frequency);
    if (![7, 14, 30, 90].includes(days))
      throw new Error("Choose a follow-up frequency.");
    return { days, months: null, recurring: true, label: `Every ${days} days` };
  }
  if (/south\s*west/i.test(scheme))
    return {
      days: null,
      months: 2,
      recurring: false,
      label: "South West CDC two-calendar-month rule",
    };
  if (/\bchas\b/i.test(scheme))
    return {
      days: 14,
      months: null,
      recurring: false,
      label: "CHAS fourteen-day rule",
    };
  if (/hpc\s*\+|\bmow\b|counsell?ing|\bsmf\b/i.test(scheme))
    return {
      days: 7,
      months: null,
      recurring: true,
      label: "Weekly referral rule",
    };
  return {
    days: null,
    months: null,
    recurring: false,
    label: "Choose a frequency and follow-up date",
  };
}
export function calculateFollowUp(
  scheme: string,
  reference: string,
  frequency = "",
) {
  const rule = followUpRule(scheme, frequency);
  return {
    ...rule,
    date: !reference
      ? ""
      : rule.months
        ? addMonths(reference, rule.months)
        : rule.days
          ? addDays(reference, rule.days)
          : "",
  };
}
const closedGrantStatuses = ["Rejected", "Expired", "Completed"];
export const openGrantFilter = {
  resolvedAt: null,
  status: { notIn: closedGrantStatuses },
};
export const closedGrant = (g: { resolvedAt?: unknown; status: string }) =>
  Boolean(g.resolvedAt) || closedGrantStatuses.includes(g.status);
