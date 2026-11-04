// Loaded only by scripts/e2e-server.mjs, never by application startup.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname !== "abcdefghijklmnopqrst.supabase.co")
    return realFetch(input, init);
  if (
    new Headers(init?.headers).get("x-p3h-sync-token") !==
    "fictional-e2e-sync-secret-at-least-32-characters"
  )
    return new Response("Unauthorized", { status: 401 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  return Response.json({
    version: 1,
    eligibilityRulesVersion: 2,
    source: "program-spacebooking",
    generatedAt: new Date().toISOString(),
    items: [
      {
        sourceProgrammeKey: "e2e-stable",
        name: "Fictional synced programme",
        centreId: "SEEN_BB",
        category: "Social",
        sourceStatus: "confirmed",
        sourceUpdatedAt: null,
        recurrence: null,
        fragmentIndex: 0,
        fragmentCount: 1,
        scheduleTemplates: [],
        occurrences: [
          {
            occurrenceKey: "e2e-occ",
            sourceRecordIds: ["classes:fake"],
            sessionDate: "2099-12-01",
            day: "Tuesday",
            startTime: "10:00",
            endTime: "11:00",
            venue: "Fictional hall",
            status: "confirmed",
            cancelled: false,
            sourceUpdatedAt: null,
            recurrence: null,
            sourceActivityName: "Fictional synced programme",
            independentSession: false,
            sourceVisibility: { timetableVisible: true, calendarVisible: true },
            eligibility: {
              eligibilityStatus: "confirmed_upcoming",
              recommendationEligible: true,
              identifiableProgramme: true,
              inUpcomingCatalogue: true,
              confirmed: true,
              schedulingVerification: { status: "verified", reasonCodes: [] },
              reasonCodes: [],
            },
          },
        ],
      },
    ],
    page: { hasMore: false, nextCursor: null },
  });
};
