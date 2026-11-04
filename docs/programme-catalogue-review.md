# Programme Catalogue and suitability reviews

The catalogue keeps four separate decisions: source eligibility, source scheduling verification, P3H suitability approval and registration availability. It preserves manual programmes and all existing programme IDs, vocabulary links and participation records.

## Staff workflow

Open Programmes and choose All Centres or one of the four named centre tabs. Restricted tabs disclose no counts and cannot be selected. Each permitted tab shows programmes, confirmed upcoming sessions, awaiting review, reviewed and scheduling concerns.

The Pending Reviews metric opens the Pending Review queue while retaining the selected centre and other filters. The queues are All Programmes, Pending Review, In Review, Reviewed and Needs Recheck. Search combines with centre, category, source, review, upcoming-from date, source eligibility, registration, completeness and local status filters. Reset Filters clears the selection. Sorting and 20/50/100-row pagination happen on the server; tablets use labelled programme cards with visible review actions.

Review Programme opens read-only source name, centre, category, source status and individual dated sessions. The subdued More programme actions menu retains Edit local details and Archive in P3H without making archive a primary action. The staff form groups audience/communication, mobility/accessibility, care considerations and registration/notes. Languages, interests and assessed conditions use the existing P3H dictionaries and relationships.

- Save Draft saves local fields and moves the record to In Review.
- Mark as Reviewed requires an audience, assessed languages/interests/mobility with actual values, physical accessibility notes, assessed intensity or Not Applicable, and care considerations marked Assessed with actual conditions or explicitly Not Applicable.
- Needs Further Information saves the work as Needs Recheck, retaining outstanding issues and notes.
- Cancel discards the unsaved form after confirmation. Opening or viewing a review never saves it.

Not Assessed is allowed in drafts. Not Applicable for care considerations does not imply medical suitability for everyone and awards no condition-specific matching points. Review completion does not open registration. Staff independently verify registration and choose Open; Unverified, Waitlist and Closed remain distinct.

Review status, reviewer ID/name, approval time, update time, outstanding issues, assessment states, audience, accessibility, intensity, notes and source fingerprint persist in ProgrammeReview. A previous approval remains in the record when recheck is required. Draft/review writes reject stale programme versions, stale review versions and source revisions changed by sync. An atomic revision claim prevents two reviewers overwriting the same saved version.

Migration backfills Pending Review for existing imported records without legacy approval. New sync imports also create a persistent Pending Review row. Manual programmes receive no automatic review record or status change.

## Counts and centre access

The server applies programmeScope before filtering, computing counts or returning records. A direct request for an unauthorised centre returns 403. Review POST also checks the current active account, write role and exact centre inside the transaction. Read Only accounts cannot save reviews. Shared unassigned manual records do not acquire a new centre-write exception through the review endpoint.

Centre-tab counts describe all non-archived programmes in that permitted centre. Header metrics follow the selected centre, search and active filters, while ignoring the currently selected review queue so Pending Reviews remains actionable. Clicking it therefore returns that pending subset under the same other filters. Awaiting review in centre tabs is Pending Review + In Review + Needs Recheck. Reviewed counts use explicit persistent Reviewed status; field presence and the legacy boolean never establish approval. Upcoming session counts use confirmed occurrences and honour an active upcoming-from date. A source record with two eligible sessions is one programme and two sessions.

## Updated source contract

The protected feed remains version 1 and now advertises eligibilityRulesVersion 2. P3H validates and merges both items and excludedItems across all pages and fragments. It retains occurrences, scheduleTemplates and excludedOccurrences without duplicating source occurrence keys. An excluded-only intermediate page is valid pagination. Conflicting fragments/keys, changed eligibility rules during pagination and missing classification data on version-2 occurrences fail before catalogue writes.

Persisted classifications are confirmed_upcoming, tentative, cancelled, past, hidden, incomplete and scheduling_review, together with scheduling verification, reason codes, source activity name, independent-session identity and calendar/timetable visibility. A missing record is flagged rather than deleted. Source diagnostics report exclusion counts and scheduling flags; source-wide diagnostics are shown only to users authorised for all centres. Restricted users do not receive other-centre diagnostic totals.

Legacy feeds/previously imported sessions without the updated eligibility metadata remain Unverified for recommendation purposes until a successful updated sync. Non-identifiable new placeholders are skipped and counted rather than receiving invented programme names; existing identifiable records can be retained with incomplete classifications. Structurally invalid complete eligibility records abort safely. Off-site is valid when the source verifies the session and staff assess its local accessibility; P3H invents no travel times.

One stable source programme key remains one P3H programme, with expandable individual source occurrences. Different keys, instructors/groups/levels represented by distinct source identities, independent sessions and manual programmes are never merged by title. Unverified source grouping is visibly flagged. A source identity change may create a new mapped programme and mark the old one missing; staff must review rather than automatically link records.

## Approval preservation and recommendations

Routine last-seen timestamps, source update timestamps and source row ID replacement do not reset approval. A separate material fingerprint covers name, centre, category, recurrence and actual dates/times, venue, status, eligibility, scheduling verification, visibility and independent-session context. Changes to that fingerprint or source disappearance move Reviewed to Needs Recheck. Local suitability edits through the older programme-save path also invalidate approval. No sync overwrites local suitability, review notes, registration, local archive state or participations.

Imported recommendations require a confirmed future occurrence, source recommendation eligibility, verified scheduling, visible calendar/timetable flags, Active local status and completed P3H suitability review. Cancelled, TBC, hidden, past, incomplete, missing and scheduling-review occurrences do not establish upcoming availability. Audience and assessed mobility restrictions are respected. Missing personal or programme mobility never establishes imported compatibility. Registration POST repeats the review, future-session, audience, mobility and availability guards; attendance/history actions retain the existing workflow.

The matching weights remain condition 35, language 25, member interest 15, recipient interest 15 and mobility 10. No condition-specific points are awarded without an assessed condition basis. Reasons and information gaps remain visible. Manual programmes retain their established workflow because the manual model has no dated occurrence feed.

## Database migration and deployment

Migration `202611040002_programme_review` exists in both local SQLite and cloud PostgreSQL directories. It creates ProgrammeReview and adds source eligibility/grouping/fingerprint fields, occurrence eligibility/visibility fields and sync diagnostics. SQLite uses ADD COLUMN and CREATE TABLE without rebuilding existing tables. Existing explicit legacy approvals receive a one-time Needs Recheck record rather than being silently assumed complete under the new assessment requirements. Existing boolean fields remain for compatibility.

No new environment variables are needed; retain the three server-only sync variables documented in programme-sync-setup.md. No deployment or operational database migration is performed automatically by this task.

Production update:

1. Verify a full protected PostgreSQL backup and restore rehearsal. Review the commit and exact centre mappings/scopes.
2. Publish both schemas, both new migration directories and the updated application source. Keep secrets, real workbooks, databases and test artifacts out of source control.
3. Deploy manually using build command `npm ci --include=dev && npm run cloud:build` and start command `npm run cloud:start`. Startup applies the dedicated PostgreSQL migrations with migrate deploy. Never reset, seed or db push against the operational database.
4. Check /api/health, staff login, existing manual programmes, caregiver/grant data and participation history. Confirm legacy approvals appear as Needs Recheck where applicable.
5. Deploy/verify the updated source feed separately, then use Sync Now once. Review excluded/flagged source totals, centre counts, grouping warnings and eligibility classifications.
6. Test one draft and completed review, reload persistence, a restricted staff account, and separately verified registration availability before using recommendations operationally.

For local SQLite, back up first, then run `npm.cmd run db:generate` and `npm.cmd run db:migrate` before starting the updated app. Cloud commands must use the cloud schema; SQLite commands must not point at PostgreSQL. Rollback retains additive columns/tables and history; disable sync first and restore a reviewed application release without dropping data. See programme-sync-setup.md for secret rotation, lock recovery and existing hosting instructions.

## Known limits

Live source credentials, hosted PostgreSQL execution and physical tablet/browser testing require operator verification. Automated browser tests use fictional source data and separate local databases. Pagination bounds browser payloads; aggregate metrics currently scan the permitted programme scope on the server, so substantially larger installations may need database-specific aggregation. Centre names remain explicit free-text permission mappings. Historical missing/excluded records remain available rather than being deleted. There is no automatic identity merge, scheduling job or automatic sync.

## Validation

- Unit/integration suite: 72 passing tests, including migration preservation, persistent review transitions, approval retention/recheck, source classifications, excluded-only pagination, safe legacy metadata, vocabulary reuse, stable grouping, Off-site sessions, centre filters/counts, personal mobility gaps and retained participation history.
- Existing caregiver, grant, reminder and import tests remain in the passing suite.
- Browser suite: 14 passing Playwright workflows, including authenticated sync permissions and the tablet catalogue/review workflow, draft persistence, approval after reload, combined filters, centre counts, restricted tabs and forged other-centre API requests.
- Production build, TypeScript, ESLint, restart persistence and both Prisma schema validations passed locally.
- Tablet screenshots were inspected; review actions remain visible in labelled cards without the catalogue's nested vertical scrolling. Production browser assets contain no server feed URL variable, shared-secret variable or upstream token header.
- No live source credentials, operational database migration, hosted PostgreSQL execution, deployment or physical-device check was performed.

## Files changed

Schemas and migrations: prisma/schema.prisma, prisma/cloud/schema.prisma and both 202611040002_programme_review migration directories.

Server: src/lib/programme-source.ts, programme-sync.ts, programme-review.ts, records.ts, matching.ts, db.ts, types.ts; src/app/api/programmes/catalogue/route.ts, programmes/[id]/review/route.ts, programmes/sync/route.ts, data/route.ts and action/route.ts.

UI: src/components/programmes.tsx, programme-review.tsx, app.tsx, matching.tsx, ui.tsx and src/app/globals.css.

Tests: tests/programme-review.test.ts, programme-sync.test.ts, migration-preservation.test.ts, e2e/workflows.spec.ts and e2e/programme-feed.mjs. Documentation: this guide and the linked programme-sync-setup.md/cloud-deployment.md updates.
