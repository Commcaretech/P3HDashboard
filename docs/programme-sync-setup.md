# Manual programme synchronisation

P3HDashboard consumes the protected Program-SpaceBooking feed. It never writes upstream or sends personal records. Opening the catalogue only reads status; Sync Now explicitly starts a POST. No deployment was performed by this change.

## Server environment

Set these in the server environment only, without a NEXT_PUBLIC_ prefix:

```dotenv
P3H_SYNC_ENABLED=true
P3H_PROGRAMME_FEED_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/p3h-programmes
P3H_SYNC_SHARED_SECRET=YOUR_RANDOM_SHARED_SECRET_32_TO_512_CHARACTERS
```

Use the actual 20-character lowercase alphanumeric source project reference. The secret must match the source function. Missing/false P3H_SYNC_ENABLED disables execution. The URL requires HTTPS, the exact function path, no credentials, port, query or fragment, and a Supabase project host. Custom domains/local hosts require an explicit allowlist code change. Never commit secrets or put them in browser requests.

## Centre mapping and permissions

`src/lib/programme-source.ts` maps SEEN_BB to `SEEN Bukit Batok`, GLOW_BB to `GLOW Bukit Batok`, SEEN_NY to `SEEN Nanyang`, and GLOW_NY to `GLOW Nanyang`.

P3H uses exact free-text centre permissions, with no canonical centre table. Existing demo/test names do not establish permission aliases. Review actual scopes in Settings before enabling sync; no profile centres or staff permissions are changed automatically. Unknown mappings are skipped and counted in history for review. Resolve the mapping and rerun; never fuzzy-match names.

Admins sync all mapped centres. Managers change only permitted centres and skip other-centre items. A source programme moving from a previously unauthorised centre requires Admin review. Staff/Read Only users have scoped read-only information. Restricted users see their own run history. Permissions are rechecked transactionally before writes.

## Migrations and local testing

Migration `202611040001_programme_sync` adds ExternalProgramme, ExternalOccurrence, ProgrammeSyncRun, ProgrammeSyncLock and Programme.suitabilityReviewed (default false). Both SQLite and PostgreSQL migrations are additive. Existing programme IDs, accounts and relations remain; SQLite uses ADD COLUMN without rebuilding Programme.

Back up and rehearse restore before migrating an operational database. For local SQLite:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

Use the configured SQLite DATABASE_URL only for these commands. Automated tests use separate fictional databases under data/. Run typecheck, lint, test, build, test:e2e, test:persistence and db:validate scripts. For cloud:validate use a placeholder PostgreSQL URL; validation does not establish a working hosted connection. E2E mocks upstream fetch only through the test server's preload fixture, never application startup.

## Exact production deployment sequence

1. Verify a protected full PostgreSQL backup and restore rehearsal. Review centre mappings, staff scopes and the source function deployment.
2. Review and commit source, both schemas and both `202611040001_programme_sync` migration directories. Exclude .env, data/, credentials and test artifacts.
3. Add the three server variables to the existing Render service, initially setting P3H_SYNC_ENABLED=false. Retain DATABASE_URL, origin settings and staff credentials.
4. Build command: `npm ci --include=dev && npm run cloud:build`. Start command: `npm run cloud:start`. Startup applies the dedicated PostgreSQL migrations before starting. Never use reset, seed, truncate or db push against production.
5. Manually deploy the reviewed commit. Check /api/health, login, existing catalogue and existing records. Enable P3H_SYNC_ENABLED=true and restart as required by the host.
6. Open Programmes as Admin, check configuration and press Sync Now. Review counts, missing/suitability flags and actual next sessions. Repeat with the same feed: zero new programmes should be created. Verify restricted Manager access and preserved caregiver, grant and participation records.

Live source credentials, cloud migration and hosted/device checks require operator validation. See cloud-deployment.md for hosting setup.

## Shared feed contract, version 1

The source implementation is Program-SpaceBooking/supabase/functions/p3h-programmes/service.ts. The updated consumer also supports eligibilityRulesVersion 2, excludedItems and excludedOccurrences; see [catalogue and review workflow](programme-catalogue-review.md) for classification rules, persistent reviews and migration 202611040002_programme_review. GET the configured URL with limit=100 and optional opaque cursor. The server sends x-p3h-sync-token, no Origin, no request body, no P3H database IDs and no personal information. Redirects are rejected.

```json
{"version":1,"source":"program-spacebooking","generatedAt":"2026-11-04T00:00:00.000Z","items":[],"page":{"hasMore":false,"nextCursor":null}}
```

Items contain sourceProgrammeKey, name, centreId, category, sourceStatus, sourceUpdatedAt, recurrence, fragmentIndex, fragmentCount, occurrences and scheduleTemplates. Each occurrence contains occurrenceKey, sourceRecordIds, sessionDate (YYYY-MM-DD, or null for templates), day, startTime/endTime (24-hour HH:MM or null), venue, status, cancelled, sourceUpdatedAt and recurrence. Optional source strings/timestamps may be null. Additional source fields are ignored. Undated templates never establish dated availability.

Merge fragments by stable programme key only when all indexes exist and metadata agrees. Identical duplicates deduplicate; conflicting programme/occurrence keys reject the feed. hasMore must agree with nextCursor; repeated cursors, empty intermediate pages, invalid records, wrong versions/sources and incomplete fragments abort before catalogue writes. Source cursors bind a snapshot and Singapore date; upstream 409 means retry from page one.

Bounds: 50 pages, 100 items/page, 100 occurrences/templates per fragment, 2 MB/page, 20 MB total, 15-second requests, 90-second fetch phase and 60-second transaction. Oversized feeds fail safely. Stable source programme keys retain internal P3H IDs despite row ID replacement. Source fallback/independent identities can change on rename or row replacement: this produces a new imported entry and marks the old one missing. There is intentionally no automatic name-based link to manual programmes.

## Operation and registration safety

Imported registration defaults to Unverified; suitability is blank and local capacity unspecified. Source pax/capacity is ignored. Source name, category, centre and schedules are read-only; forged edit requests cannot change them. Staff maintain description, notes, languages, interests, conditions, mobility, local status and verified registration availability. Use Review Programme and Mark as Reviewed after completing the structured assessment. Care considerations may explicitly be Not Applicable; no condition-specific points are then awarded. Confirm registration availability independently before choosing Open.

Imported registration requires an explicit completed review, supported audience/mobility and a future occurrence passing the source eligibility and scheduling verification rules. Cancelled, inactive, mixed, TBC, missing and undated sessions do not establish upcoming availability. Dates/times use Asia/Singapore. Matching weights remain unchanged; imported missing suitability never establishes eligibility. Compatibility does not establish registration vacancies. Manual editing and registration behaviour remain available.

Sync Now disables until completion and refreshes data on success. History reports exact programme counts, skipped records and sanitised errors. Full-feed absence reconciliation flags records as missing without deletion, including after a valid empty feed. Reappearing keys clear missing flags. Suitability, notes, registration, archive state and participation history survive sync. Local-owned mappings are retained and skipped; no automatic ownership conversion/linking UI is included.

## Recovery, rotation and rollback

A unique database lease blocks concurrent workers, expires after three minutes and supports conditional takeover. Token checks stop an old worker releasing a newer lease. After interruption wait for expiry, then retry. A historical Running row can remain after process termination; compare lease expiry and newer completed runs. GET never repairs history or performs writes.

Rate limit: three recent completed/failed attempts per staff member per minute, stored in run history; overlap receives 409. Rejected/unauthenticated attempts are recorded in sync history without inventing staff identity; authenticated attempts also have audit records. Use hosting perimeter limits for unauthenticated traffic. POST requires the existing origin validation and a streamed body at most 1 KB. Status GET is authenticated, scoped and no-store.

For secret rotation disable sync, replace the shared secret on source and consumer, restart as required, then enable and test. Do not paste secrets into logs or screenshots. An upstream 401 reports credential rejection without returning its body.

Rollback: disable sync, retain additive schema/history, and roll application source back to the previous reviewed release. Do not drop imported records or run down migrations. Stop writes and rehearse separately before restoring a backup; restoring an old snapshot can lose later staff changes.

## Troubleshooting and security checklist

Disabled/incomplete configuration: check the three server variables and restart. Source credential rejection: check matching secret and deployed function. Validation/pagination/timeout: preserve catalogue and retry later from the beginning. Skipped centres: review explicit mapping/scopes and ask Admin to sync other centres. 409: wait for completion/expiry. 429: wait one minute. Database failure: resolve migration/connection privately, then retry. Missing dates: inspect occurrence details; templates and cancellations are not confirmed dates.

Check server-only secrets, no credential/API error leakage, no personal information upstream, HTTPS allowlist, redirects rejected, role/centre/origin enforcement, bounded bodies, transactional writes, unique source keys, database leases, Unverified registration, explicit suitability review, additive migrations and retained relationships. No scheduled jobs or automatic sync are introduced.
