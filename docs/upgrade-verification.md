# Care-management upgrade verification - 26 October 2026

Implemented in the existing P3HDashboard repository. No live cloud records were accessed, reset or migrated. The operational local SQLite database was backed up read-only and was not migrated by development tests.

## Delivered changes and major files

| Area | Main files |
| --- | --- |
| Follow-up rules and history | src/lib/follow-up.ts, src/lib/follow-up-service.ts, src/lib/alerts.ts, src/app/api/action/route.ts |
| Email and independent scheduler entry | src/lib/email.ts, src/lib/notifications.ts, src/app/api/jobs/notifications/route.ts, src/app/api/notifications/route.ts |
| Dashboard and daily work | src/lib/dashboard.ts, src/app/api/data/route.ts, src/components/overview.tsx, src/components/my-work.tsx, src/components/alerts.tsx, src/components/follow-up-dialog.tsx |
| Registration, profile and staff settings | src/lib/records.ts, src/lib/domain.ts, src/components/app.tsx, src/components/fields.ts, src/components/profile.tsx, src/components/grants.tsx, src/components/notification-settings.tsx, src/components/ui.tsx, src/app/globals.css |
| Database changes | prisma/schema.prisma, prisma/cloud/schema.prisma, both 202610260001_follow_up_notifications migration directories |
| Tests and migration rehearsal | tests/automation.test.ts, tests/email-adapter.test.ts, tests/follow-up.test.ts, tests/migration-preservation.test.ts, tests/e2e/workflows.spec.ts, scripts/verify-upgrade-copy.mjs |
| Security patches | package.json, package-lock.json: Next.js and eslint-config-next 16.4.3; Zod 4.6.7 |

The original Person.kind values, IDs, care relationships, imported grant statuses, programme matching, imports, existing routes and audit records remain supported. Partial person edits preserve omitted scalar fields, links, vocabulary IDs and condition notes. Partial grant edits preserve omitted dates, amounts, assignment and resolution information. An existing grant stays attached to its original person to protect case history.

## Database additions

- User: optional unique email; email notifications and care recipient birthdays default disabled.
- Person: optional contact number, represented by an empty string when not recorded.
- GrantApplication: follow-up frequency, day/month intervals, recurrence flag, resolution date and optional override reason. Existing review dates and statuses are not rewritten by migration.
- FollowUp: unique completion per alert, grant, completing staff ID, actual follow-up date, outcome, notes, next date and resolution.
- Alert: unique active follow-up key and an automatic-dismissal flag. Automated source changes preserve staff notes and completed history. Legacy completed reminders retain their IDs while a changed/reopened cycle can create or move its outstanding task.
- NotificationDelivery: unique staff/date/type key, reminder references, frozen minimal email payload, provider acceptance ID, status, attempts, last attempt, failure reason and conditional dispatch lease.

Both migration paths are additive. No destructive reset or production migration was run. The copied local backup contains zero operational rows; a separate populated fictional pre-upgrade fixture verifies every original value, ID, date, grant status, relationship, programme registration, import row, session and audit row across migration and restore. SQLite integrity and foreign-key checks pass.

## Executed checks

| Command or check | Final result |
| --- | --- |
| npm.cmd run db:validate | Passed |
| npm.cmd run cloud:validate with a PostgreSQL-shaped test URL | Passed; validates schema only, not a real connection |
| npm.cmd run typecheck | Passed |
| npm.cmd run lint | Passed |
| npm.cmd test | 57 passed |
| npm.cmd run build | Passed |
| npm.cmd run cloud:build with a PostgreSQL-shaped test URL | Passed; compilation only, no live database verification |
| npm.cmd run test:e2e | 12 Chromium workflows passed |
| npm.cmd run test:persistence | 1 production-process restart/session persistence test passed |
| npm.cmd audit | Zero reported vulnerabilities after patching the two affected direct dependencies |
| npm.cmd run backup | Unique local snapshot created; integrity verified |
| node scripts/verify-upgrade-copy.mjs backups/<verified-backup>.db | Passed against a new isolated copy; all original values and counts preserved; integrity OK; no foreign-key violations |
| Populated fictional legacy SQLite restore/migration fixture | Passed |
| git diff --check | Passed |

The full automated tests cover every requested named scheme, calendar-month clamping, leap/cross-year dates, missing reference dates, custom frequency, overrides, recurring completion, resolution/reopening, preserving legacy completed reminders, date changes, duplicate suppression, notes and partial-edit preservation, birthday stages and opt-in, reassignment, centre access, inactive/missing/invalid email, disabled email configuration, provider failure, bounded retries, provider idempotency headers, concurrent scheduled jobs and delivery claims.

Browser workflows cover setup/login/logout, caregiver creation/edit/archive/restore, duplicate checks, recipient linking, programme creation/matching/registration, Excel parsing/review/commit and namespace compatibility, import history, search/filters, reports, audit access, staff/manager/read-only centre boundaries, grant scheduling and overrides, follow-up completion/recurrence/resolution/reopening/history, secure notification endpoints and disabled email diagnostics. Tested widths: 1440, 1024, 768, 390 and 375 pixels. Dashboard and follow-up dialog bounds and page overflow checks pass. Fictional 1024px dashboard and 375px dashboard/dialog screenshots were visually inspected. Tested journeys produced no unexpected browser page or console errors.

The namespace-prefixed workbook workflow still requires the fictional SYNTHETIC_WORKBOOK fixture, defaulting to Downloads/P3H_Synthetic_Test_Data.xlsx. The ordinary sample import now uses a generated fictional workbook so layout artifacts contain no operational workbook records.

### Baseline and intermediate issues

Initial local schema validation passed. Initial cloud validation used the local SQLite environment and failed on the URL provider; it passed once a PostgreSQL-shaped validation URL was supplied. The first unit run overlapped schema/client work and was not a clean pre-edit baseline. A temporary Windows Prisma engine DLL lock cleared when the running test process exited and the client was regenerated. Intermediate failures exposed outdated test labels/fixtures, missing explicit follow-up control labels, a save-completion race in the browser test, and a partial-edit condition-note preservation case; these were corrected and the final full checks above passed. No test was deleted to obtain a pass.

## Setup and remaining deployment work

Use [automatic reminders and email setup](automatic-reminders.md), [migration and recovery](upgrade-migration.md), and [the staff guide](staff-workflows.md). README and both environment examples are updated.

New server variables: EMAIL_ENABLED (default false), RESEND_API_KEY, EMAIL_FROM and NOTIFICATION_JOB_SECRET. Existing APP_ORIGIN must explicitly contain the HTTPS dashboard origin when email is enabled. Keep COOKIE_SECURE=true for HTTPS deployment. Staff email preferences are stored in the database, never in browser secrets.

The independent job is POST /api/jobs/notifications with a protected Bearer job secret. Schedule 30 0 * * * UTC, daily at 8:30 AM Singapore time. Configure up to two retries at five-minute intervals. At most three dispatch attempts per staff/date/type are allowed. Old ambiguous failures require provider-log review; never clear accepted records simply to resend. Settings distinguishes configuration failure from provider acceptance; inbox delivery is not asserted.

Remaining environment-dependent verification:

1. An administrator must create a protected PostgreSQL export and restore it to an isolated test database. No PostgreSQL test database, pg_dump/pg_restore installation, Docker service or live connection was available here. Set DATABASE_URL to that isolated database and run npm.cmd run cloud:migrate, npm.cmd run cloud:validate and npm.cmd run cloud:build. Compare original table counts, IDs, dates, relations and audit data before/after; rehearse the workflows against that hosted test deployment. Do not substitute a live production URL.
2. Apply the reviewed migration through the deployment process after backup/restore rehearsal. The operational local database still needs the migration before this application revision is started against it. Do not run db:seed or reset.
3. Obtain an organisation-approved email account, verified sending identity and server API key. Configure staff email/centre access, send an administrator test, inspect provider acceptance and check the actual inbox. No real mail was sent during development.
4. Provision the external scheduler, monitor failed/missed runs, test a real scheduled run while all staff are signed out, and verify retry/idempotency behavior with the real provider. Free-host availability and email quotas were not rehearsed.
5. Approve hosting, provider contracts, HTTPS configuration, restricted encrypted/off-site backup storage, retention and data-protection arrangements before operational use. Technical safeguards do not establish PDPA compliance.
6. Rehearse on actual staff tablets/phones and any required browsers. Chromium viewport tests do not prove physical touch behavior, Safari/Firefox compatibility, every screen-reader interaction or a formal WCAG 2.2 AA audit.

No production deployment, live Supabase migration/restore, real provider acceptance, inbox delivery or physical-device result is claimed by these local checks.
