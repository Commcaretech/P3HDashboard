import { calculateFollowUp } from "./follow-up";
import { parseDate } from "./domain";
// Suggestions only. The structured editor and existing save/alert service own writes.
export function grantDatesFromNotes(notes: string) {
  const suggestions: {
    scheme: string;
    applicationDate: string;
    followUp: string;
    source: string;
  }[] = [];
  for (const source of notes
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (/\b(not|never|unsure|possibly|maybe|may|might|not yet)\b/i.test(source))
      continue;
    const m = source.match(
      /\b(South\s*West(?:\s*CDC)?\s*\$?\s*(?:250|1,?000)|CHAS(?:\s+card)?|HPC\s*\+|MOW|Counsell?ing|SMF)\s+(?:applied|renewed|applied\/renewed|referred)(?:\s+on)?\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/i,
    );
    if (!m) continue;
    const date = parseDate(m[2]);
    if (!date) continue;
    const scheme = /south/i.test(m[1])
      ? /250/.test(m[1])
        ? "South West CDC $250"
        : "South West CDC $1,000"
      : /chas/i.test(m[1])
        ? "CHAS card application/renewal"
        : /hpc/i.test(m[1])
          ? "HPC+"
          : /counsell/i.test(m[1])
            ? "Counselling"
            : m[1].toUpperCase();
    if (
      !suggestions.some(
        (s) => s.scheme === scheme && s.applicationDate === date,
      )
    )
      suggestions.push({
        scheme,
        applicationDate: date,
        followUp: calculateFollowUp(scheme, date).date,
        source,
      });
  }
  return suggestions;
}
