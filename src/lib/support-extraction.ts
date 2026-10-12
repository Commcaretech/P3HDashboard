import type { Prisma } from "@prisma/client";
import { audit } from "./records";
import { schemeKey, supportFromNotes } from "./support-notes";

export async function extractMemberSupport(
  tx: Prisma.TransactionClient,
  userId: string,
  personId: string,
  selected?: string[],
) {
  const person = await tx.person.findUniqueOrThrow({ where: { id: personId } });
  if (person.kind !== "Member" || person.status === "Archived")
    return { created: 0, skipped: 0 };
  const suggestions = supportFromNotes(person.remarks);
  if (!suggestions.length) return { created: 0, skipped: 0 };
  const existing = await tx.grantApplication.findMany({
    where: { personId },
    include: { scheme: true },
  });
  const keys = new Set(existing.map((g) => schemeKey(g.scheme.name)));
  const known = await tx.supportScheme.findMany();
  let created = 0,
    skipped = 0;
  for (const suggestion of suggestions) {
    if (selected && !selected.includes(suggestion.scheme)) continue;
    const key = schemeKey(suggestion.scheme);
    if (keys.has(key)) {
      skipped++;
      continue;
    }
    const scheme =
      known.find((s) => schemeKey(s.name) === key) ??
      (await tx.supportScheme.create({ data: { name: suggestion.scheme } }));
    const grant = await tx.grantApplication.create({
      data: {
        personId,
        schemeId: scheme.id,
        status: suggestion.status,
        notes: `Extracted from member remarks. Dates, amounts and current eligibility require staff confirmation.\nOriginal text:\n${suggestion.source}`,
      },
    });
    await audit(
      tx,
      userId,
      "Support extracted from notes",
      "Grant",
      grant.id,
      null,
      {
        scheme: suggestion.scheme,
        status: suggestion.status,
        source: suggestion.source,
      },
    );
    keys.add(key);
    created++;
  }
  return { created, skipped };
}
