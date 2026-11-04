# Programme sync implementation record

Implemented a manual, one-way Program-SpaceBooking consumer: protected server fetch, full-feed Zod validation and fragment merging, stable source mappings, individual occurrences, transactional reconciliation, expiring database lock, history and audit records. Manual programmes, local suitability and participation history are retained. Missing source records are flagged without deletion.

The catalogue has configuration/history/counts, Sync Now feedback, source/review/status/date filters, actual next sessions and visible source badges. Source fields are protected on the server and separated from staff editing. Imported registration starts Unverified; explicit suitability review and confirmed dated sessions gate registration. Existing matching weights and manual programme behaviour remain.

## Files changed

New implementation files:

- src/lib/programme-sync.ts
- src/lib/programme-source.ts
- src/app/api/programmes/sync/route.ts
- prisma/migrations/202611040001_programme_sync/migration.sql
- prisma/cloud/migrations/202611040001_programme_sync/migration.sql

Updated application files:

- prisma/schema.prisma and prisma/cloud/schema.prisma
- src/lib/db.ts, domain.ts, types.ts, matching.ts and records.ts
- src/app/api/action/route.ts and src/app/globals.css
- src/components/app.tsx, programmes.tsx, matching.tsx, fields.ts and ui.tsx

Tests and configuration:

- tests/programme-sync.test.ts
- tests/migration-preservation.test.ts
- tests/e2e/workflows.spec.ts
- tests/e2e/programme-feed.mjs
- scripts/e2e-server.mjs and playwright.config.ts
- .env.example and .env.cloud.example

Documentation:

- docs/programme-sync-setup.md
- docs/cloud-deployment.md
- docs/programme-sync-implementation.md

## Database and environment

Both additive migrations add ExternalProgramme, ExternalOccurrence, ProgrammeSyncRun and ProgrammeSyncLock plus Programme.suitabilityReviewed. Existing Programme IDs and tables are retained; the SQLite migration uses ADD COLUMN. Preservation testing compares pre-upgrade stored values and relations after migration.

Required server variables: P3H_SYNC_ENABLED, P3H_PROGRAMME_FEED_URL, P3H_SYNC_SHARED_SECRET. Example files default to disabled. No credentials have been configured, no operational database has been reset, and no production migration or deployment has been performed.

## Security verification

Verified origin, authentication, role and centre guards; wrong-origin and oversized requests; upstream credential rejection; HTTPS URL allowlist; redirects disabled; response size/time limits; complete-pagination validation; lock conflicts and expiry recovery; concurrent requests; rollback on database failure; safe configuration errors; registration/recommendation gates; retained manual/suitability/participation records. Production browser assets were searched for the server feed URL variable, shared-secret variable and upstream token header; none were found.

## Validation results

- TypeScript: passed.
- ESLint: passed without warnings.
- Unit/integration suite: 64 passed, including existing caregiver, grant and reminder tests.
- Playwright: all 13 workflows passed, including real local authenticated sync API requests with fictional upstream data, role/centre restrictions, registration rejection, loading feedback and tablet viewport.
- Restart persistence: passed.
- Production build: passed.
- Local SQLite and cloud PostgreSQL Prisma schemas: both validated.
- Additive migration preservation and concurrent sync/rollback tests: passed.
- Git whitespace check: passed; only repository LF/CRLF notices.

No requested local check was omitted. Live PostgreSQL execution, the real protected source and physical-device checks were not performed.

## Deployment and operational limits

Follow [the exact production sequence](programme-sync-setup.md#exact-production-deployment-sequence): verified backup and centre-scope review, publish reviewed source and cloud migration, set server variables disabled initially, build with `npm ci --include=dev && npm run cloud:build`, start with `npm run cloud:start`, check health and retained records, then enable and manually Sync Now. The setup guide includes the shared feed contract, local commands, recovery, secret rotation and rollback.

Live upstream credentials, hosted PostgreSQL migration, provider deployment and physical tablet testing were not executed. Cloud validation checks the schema rather than a live database. Automated browser tests use a fictional server-only upstream fixture. Exact centre mappings require operator review because existing P3H centres are free text. Unknown mappings are skipped and flagged in history. Source fallback/independent key changes can create new entries and mark prior entries missing; names are never automatically linked. A process killed during sync can leave a historical Running entry; the database lease expires after three minutes and permits retry. Custom source domains are intentionally not allowed without code review. There is no scheduling, automatic sync, manual linking or ownership-conversion UI.
