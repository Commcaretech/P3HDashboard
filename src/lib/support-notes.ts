export type SupportSuggestion = {
  scheme: string;
  status: "Receiving" | "Received" | "Completed" | "Recorded in notes";
  source: string;
};
const schemes: [string, RegExp][] = [
  ["HCG", /\bHCG\b/gi],
  ["SSS", /\bSSS\b/gi],
  ["PioneerDAS", /\bPioneer\s*DAS\b/gi],
  ["Home Therapy", /\bHome\s+Therapy\b/gi],
  ["EASE", /\bEASE\b/gi],
  ["Financial assistance", /\bFinancial\s+assistance\b/gi],
  ["South West", /\bSouth\s+West\b/gi],
];
export const schemeKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function supportFromNotes(notes: string): SupportSuggestion[] {
  const results = new Map<string, SupportSuggestion>();
  for (const source of notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    const match = source.match(
      /^(Receiving|Received|Completed)\b\s*:?\s*(.+)$/i,
    );
    if (!match) continue;
    // Negation and uncertain statements must not become received support.
    if (
      /\b(not|no|never|pending|applied|applying|may|might|possibly|unsure|awaiting|stopped|ceased)\b/i.test(
        match[2],
      )
    )
      continue;
    const status = (match[1][0].toUpperCase() +
      match[1].slice(1).toLowerCase()) as SupportSuggestion["status"];
    for (const [scheme, pattern] of schemes) {
      pattern.lastIndex = 0;
      if (!pattern.test(match[2])) continue;
      const key = schemeKey(scheme);
      const previous = results.get(key);
      if (!previous) results.set(key, { scheme, status, source });
      else if (!previous.source.split("\n").includes(source)) {
        results.set(key, {
          scheme,
          status: previous.status === status ? status : "Recorded in notes",
          source: `${previous.source}\n${source}`,
        });
      }
    }
  }
  return [...results.values()];
}
