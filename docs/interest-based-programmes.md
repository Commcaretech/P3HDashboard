# Simpler programme import and interest suggestions

The catalogue imports identifiable source programmes even without confirmed schedules. Seniors can receive interest-based suggestions without completing the optional staff review. Registration remains a separate, guarded action.

## Investigation: 271 scheduling concerns and zero upcoming sessions

The preceding implementation introduced two stricter interpretations:

- `schedulingConcern` returned true for every missing record, unverified series grouping or `not_checked` scheduling status. Those are unknown facts, not evidence of a room conflict. The review migration defaulted grouping to Unverified and scheduling to not_checked, so an older catalogue could acquire one concern per programme without any changed booking.
- `confirmedOccurrences` required source recommendationEligible=true, eligibilityStatus=confirmed_upcoming, schedulingStatus=verified and both visibility flags=true. Earlier imports lacked these newer fields. The migration defaulted the boolean fields to false and the statuses to unverified/not_checked. The protected API's transport version remained 1 while eligibilityRulesVersion 2 and its extra metadata were introduced. Valid saved dates could therefore stop being recognised, even though the occurrences were retained. Source operating-hours/venue metadata being unavailable also yields scheduling_review, which the earlier counter treated as unavailable rather than a known schedule with incomplete checks.

This is a demonstrated code regression, not a verified diagnosis of the hosted database. The configured local environment has no protected feed enabled/configured, and data/p3h.db predates the import tables. The hosted 271/945 records were not available for a read-only inspection. Automated fixtures reproduce the 271-programme/945-session pattern and verify the corrected interpretation. Do not claim that the live count is restored without checking the deployed database and source feed.

`scripts/programme-import-diagnostics.ts` provides read-only aggregate programme counts and occurrence groups without printing names, profile data, URLs or credentials. With the correct generated Prisma client and migrated database, an operator can run:

```powershell
# Local environment file:
node --env-file=.env --import tsx scripts/programme-import-diagnostics.ts
# Hosting shell where server variables already exist:
node --import tsx scripts/programme-import-diagnostics.ts
```

## Schedule interpretation

Missing dates, times, verification and uncertain grouping produce Schedule Not Confirmed or a neutral source-check note. They do not manufacture scheduling conflicts. Explicit room conflicts, closures, unavailable venues, mirror disagreements, unusually long sessions and present-but-malformed dates/times remain diagnostic issues. An upstream invalid_times reason caused solely by absent time values is treated as missing information, not an actual conflict.

Confirmed upcoming session counts require an explicit future Singapore date/time, a scheduled/confirmed/active source status and known visible calendar/timetable flags. Tentative, cancelled, hidden, incomplete, past and genuinely conflicting sessions cannot be counted as confirmed opportunities. A valid visible future schedule can count when operating-hours or venue verification is unavailable; the UI explicitly says Scheduled; source checks incomplete. This does not establish room availability or registration readiness.

Legacy visibility is never invented. Existing false defaults remain unknown unless the v2 contract or an explicit source visibility object establishes their meaning. A later legacy response cannot erase previously known hidden visibility. Unknown visibility keeps the saved dates visible as unconfirmed schedule information and supplies an import diagnostic explaining the need to refresh the feed. Use Sync Now against the updated source function to recover explicit visibility metadata. A genuine sync failure still appears in history and leaves the last catalogue intact.

## Deterministic classification

`src/lib/programme-interests.ts` contains independent subject rules and domain mappings. It supports the source taxonomy Physical, Cognitive, Social, Learning and Volunteerism. Rules cover movement, gentle exercise, sports, dance, nutrition, health education, technology, creative activities, music, games, memory, gardening, cooking, reading, language learning, outings, social activities and volunteering. These are maintainable keyword families rather than six fixed programme titles.

The source domain is never replaced. Suggested tags may supplement a broad or inconsistent domain, but they are not written over staff ProgrammeInterest links. Existing staff tags take precedence for displayed tags. Explicit corrections set interestTagsReviewed, allowing staff to suppress unwanted automatic suggestions, including saving an empty set. Corrections use the existing Interest dictionary and ProgrammeInterest relationships. There is no second interest database, AI request or external classification service.

Automatically derived tags describe interests only. They never establish supported languages, accessibility, mobility safety, medical suitability, intended audience, vacancies or capacity. Unknown/non-English subjects can require staff correction or future additions to the rule registry; there is no guessed translation.

## Recommendation rules

The Senior / care recipient tab uses the selected senior's own recorded interests. A caregiver is optional and can narrow the selector to linked seniors. The Caregiver tab uses the caregiver's own profile and is separate. Explicit audience restrictions exclude caregiver-only programmes from senior suggestions and vice versa. Existing centre-scoped data access applies before profiles or programmes reach the browser.

Interest relevance scoring is transparent and bounded at 100:

| Evidence                                                                                             | Maximum points |
| ---------------------------------------------------------------------------------------------------- | -------------- |
| Recorded interests or explicitly supplied preferred activities matching programme subject/staff tags | 60             |
| Relevant programme-name or detail keywords, unless explicitly overridden by corrected tags           | 15             |
| Source domain supporting a recorded interest                                                         | 10             |
| Same recorded centre, only after an interest/domain match                                            | 10             |
| Matching verified programme language, only after an interest/domain match                            | 5              |

A conflicting broad domain does not create a false match to an unrelated title. Centre or language alone cannot create a suggestion. Unknown language and accessibility earn no positive points. Medical conditions earn no points in this interest-based ranking, and no medical safety is inferred. The existing low-level legacy matching function remains available for its established callers/tests; the recommendation page uses the new interest matcher.

Explicit recorded mobility restrictions are honoured even before a full review is complete. Missing mobility/accessibility does not block an interest suggestion, but is shown as Not Assessed. Known incompatibilities exclude the activity. Location uses exact recorded centre information, with no invented travel times or distance calculations.

The current profile schema represents preferred activities through its existing interests. The helper accepts a separately verified preferredActivities list if supplied by a future structured profile field; it does not mine medical remarks or infer preferences from conditions.

Each card shows the name, centre, domain, relevant tags, matching reasons, next known session, schedule label, suitability gaps and separate registration status. Interest relevance is not a suitability score. Cancelled/hidden/missing source programmes are not offered as current suggestions. Undated identifiable activities can be suggested with Schedule Not Confirmed.

## Optional staff workflow and registration

The five centre tabs remain. Main metrics are imported programmes, programmes with confirmed upcoming sessions, programmes without confirmed schedules and interest tags to check. Actual scheduling problems appear separately in an expandable diagnostic section. Missing source visibility has its own import diagnostic. The main catalogue shows automatic matching tags instead of review queues. Optional assessment statuses remain available in expanded filters; none is a prerequisite for an interest suggestion.

Edit interest tags is a short independent form. Staff do not complete seven fields just to correct classification. The existing structured review still supports draft, approved and further-information states and preserves saved notes, reviewer/time, assessed fields and registration status. Sync never resets staff interest corrections or replaces local suitability values with guessed classifications.

Tag-only saves atomically update only ProgrammeInterest links and the correction marker, then audit the change. They retain completed review status/time, languages, conditions, description, notes and registration settings. Clearing all interest tags deliberately suppresses automatic tag regeneration; normal registration completeness checks still apply.

Register participation remains disabled until the existing appropriate checks pass: active programme, independently Open registration, completed suitability review for imports, assessed audience/mobility compatibility and a visible eligible future session whose source scheduling is verified. Actual capacity checks use local verified settings; source pax is never treated as registration capacity. Attendance and participation history are retained.

## Additive database migration

Both SQLite and PostgreSQL have migration `202611040003_interest_suggestions`:

- Programme.interestTagsReviewed: explicit staff tag correction marker, default false.
- ExternalProgramme.programmeType: source programme type when recorded, default empty.
- ExternalOccurrence.visibilityKnown: distinguishes absent legacy metadata from explicit visibility, default false. Existing v2 rows are backfilled as known because that contract requires visibility fields.

No tables are reset, rebuilt or deleted. Existing programmes, occurrences, local tags, staff reviews, registration information, profiles, conditions, participation history, grants and alerts are retained. Automatic tags are computed at read/match time, so existing classifications are not bulk-rewritten. No new environment variables or scheduled jobs are introduced.

## Deployment

No deployment or operational database migration was performed automatically.

1. Verify a protected backup and restore rehearsal. Review and publish the application changes, both Prisma schemas and both new migration directories. Exclude .env, real databases/workbooks and test artifacts.
2. Keep the existing P3H_PROGRAMME_FEED_URL, P3H_SYNC_SHARED_SECRET and P3H_SYNC_ENABLED server settings. Authentication, origin checks and centre permissions remain unchanged.
3. Build with `npm ci --include=dev && npm run cloud:build`; start with `npm run cloud:start`. Startup applies the dedicated cloud migration through migrate deploy. Do not use db push, reset, truncate or seed against production.
4. Verify /api/health, staff login and retained records. Run the read-only aggregate diagnostic using the production environment if available.
5. Verify that Program-SpaceBooking serves the updated contract and use Sync Now once. Review visibility/occurrence groups and the diagnostic counts. Do not turn unknown visibility into true merely to recover a numeric total.
6. Test a senior with recorded interests and incomplete programme suitability. Confirm interest suggestions, expandable information notes, the separate caregiver audience, tag correction, restricted centres and disabled unverified registration.

For local SQLite, back up first, run `npm.cmd run db:generate` and `npm.cmd run db:migrate`, then start the app. Use cloud commands for PostgreSQL. Rollback retains additive columns and all records; disable sync first if necessary and restore a reviewed application release without dropping tables.

## Changed files

Schemas and migrations: prisma/schema.prisma, prisma/cloud/schema.prisma and both 202611040003_interest_suggestions directories.

Logic: src/lib/programme-interests.ts, interest-matching.ts, programme-source.ts, programme-sync.ts, records.ts and types.ts.

API: src/app/api/programmes/[id]/interests/route.ts, programmes/catalogue/route.ts and action/route.ts.

UI: src/components/matching.tsx, programmes.tsx and programme-interest-tags.tsx.

Diagnostics: scripts/programme-import-diagnostics.ts. Tests: tests/interest-suggestions.test.ts, programme-review.test.ts, migration-preservation.test.ts and e2e/workflows.spec.ts. Documentation includes this guide and updates to the existing catalogue, sync and cloud deployment guides.

## Validation results

- 85 unit/integration tests passed, including deterministic rules, interest-first scoring, unknown suitability, explicit mobility/audience incompatibilities, legacy visibility retention, missing-versus-malformed schedules, 271/945 regression fixtures, additive migration preservation, source-date updates, idempotent sync and retained staff tags/reviews.
- All 15 Playwright workflows passed, including the senior selector without a caregiver, an unreviewed suggestion with missing dates/accessibility, disabled registration, independent tag correction, unchanged source domain/notes and rejected other-centre writes. Existing caregiver, grants, reminders, import and sync permission workflows passed.
- TypeScript, ESLint, production build, restart persistence and both SQLite/PostgreSQL Prisma schema validations passed.
- Tablet recommendation screenshots were inspected. Production browser assets were checked for server feed URL/shared-secret variable names and the upstream token header; none were found.
- No operational database migration, deployment, live hosted source comparison or physical-device test was performed. PostgreSQL validation verifies the schema, not a live production migration.

### Automatic import and matching

Sync Now imports programmes directly. Staff do not need to complete the suitability review form or add matching fields. Matching derives interest tags from the programme name, description, source programme type, active visible session names and source domain. Suggestions refresh from the current information, including programmes already imported. Existing staff tag corrections (including an intentionally empty selection) take precedence.

The catalogue displays automatic matching tags instead of a review queue. Optional suitability assessments remain under More programme actions for staff who have additional information. Unknown language, accessibility and medical suitability remain unknown; they do not block interest recommendations. Registration availability and source schedule checks remain separate.

Validation for the automatic matching update: 95 unit/integration tests and all 18 Playwright workflows passed locally. TypeScript, ESLint and the production build passed. No deployment was performed.
