// Read-only aggregate diagnosis. Never prints names, profile information, URLs or credentials.
import { db, programmeInclude } from "../src/lib/db";
import { catalogueCounts } from "../src/lib/programme-source";
try {
  const programmes = await db.programme.findMany({
    where: { external: { isNot: null } },
    include: programmeInclude,
  });
  const counts = catalogueCounts(JSON.parse(JSON.stringify(programmes)));
  const occurrences = await db.externalOccurrence.groupBy({
    by: ["eligibilityStatus", "schedulingStatus", "visibilityKnown", "status"],
    _count: true,
  });
  console.log(
    JSON.stringify({ counts, occurrenceGroups: occurrences }, null, 2),
  );
} catch {
  console.error(
    "Import diagnostics unavailable. Check that the configured database has the latest migrations; no database details were printed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
