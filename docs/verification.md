# Verification — 11 October 2026

Executed locally against the final application and isolated test databases.

| Check | Result |
| --- | --- |
| TypeScript strict check | Passed |
| ESLint | Passed, no warnings |
| Unit and database integration tests | 16 passed |
| Playwright production-browser workflows | 3 passed |
| Production process restart / session persistence | 1 passed |
| Prisma schema validation | Passed |
| Database migration deployment | Both migrations applied |
| SQLite integrity / foreign keys | Integrity OK; no violations |
| Production build | Passed |
| Dependency audit, including development dependencies | Zero reported vulnerabilities |
| Local backup | Timestamped backup created and integrity verified |

The Playwright workflows cover first-run setup/login, Excel mapping/preview/commit, refresh persistence, member creation/edit/archive/restore, care-recipient creation/linking, structured categories, programme creation/matching/participation, grant creation/edit confirmation, generated and custom reminders, completion/dismissal/reopening, duplicate preview/update, transactional rollback, search/combined filters, reports, all main navigation pages, read-only server rejection, and desktop/tablet/mobile navigation. The main valid workflow completed without browser console/page errors or external network requests.

The supplied workbook was uploaded, parsed, committed and re-previewed through localhost endpoints in a separate test database. Existing IDs were detected and defaulted to Skip. Workbook data was not used as seed/source code and the operational database remains empty for first-run setup. Test copies containing the sample data were removed after verification; the original workbook was left unchanged.

Desktop and tablet screenshots using fictional records were inspected for layout, legibility and chart rendering. Tests used Chromium. Other browsers, an operating-system reboot and actual staff-device LAN/HTTPS deployment were not tested. The process-restart test verified records and sessions after completely terminating and restarting the production server.

Run the commands in README to reproduce these checks. `test:e2e` requires the supplied workbook path or `SAMPLE_WORKBOOK`, and creates a local test copy containing its data; remove that copy after stopping the test server. Alert refresh occurs when the application is used. No external notification or AI integration is included.


## Cloud deployment preparation - 12 October 2026

Added separate PostgreSQL schema/migration, cloud build/start commands, Render port/origin configuration, a database health endpoint, and token-protected first administrator setup. Local SQLite configuration remains separate. TypeScript, ESLint, 18 unit/integration tests, three Chromium workflow tests, both Prisma schema validations, local migrations and both local/PostgreSQL-client production builds passed. The source-only deployment archive was inspected for excluded database files, workbooks and credentials. The PostgreSQL SQL migration was generated from the validated schema, but has not been applied to a live PostgreSQL server. Render hosting, Supabase connection/migration, actual HTTPS sessions and hosted backup restoration require the user accounts and remain unverified. No code, personal records or credentials were uploaded.


## Member-note support extraction - 12 October 2026

Added conservative Receiving/Received/Completed parsing, review-before-save bulk extraction, idempotent support creation with source notes and audit records, and support extraction during confirmed Excel imports. Existing schemes are skipped and never overwritten; unknown dates and amounts remain unset. TypeScript checks, ESLint, 22 unit/database tests, four production Chromium workflow tests, Prisma validation and the production build passed locally. Browser extraction checks cover preview without persistence, confirmation, duplicate prevention, stale-note rejection and read-only server rejection. No hosted database was accessed or modified. The updated source ZIP must be uploaded to the deployment repository and Render redeployed to use this feature online.


## Prefixed workbook compatibility - 12 October 2026

Reproduced the supplied P3H_Synthetic_Test_Data.xlsx failure: ExcelJS does not recognise the spreadsheet namespace prefix in workbook XML. Added namespace-aware, in-memory XML canonicalisation before ExcelJS loading, while source date serials continue to come from the original archive. The original file is never rewritten. Normal files retain their original byte buffer; document types remain rejected. Verified all 18 data rows in the supplied workbook through the production browser upload/preview flow, without console/page errors and with unchanged file bytes. 24 unit/database tests, five production Chromium tests, TypeScript, ESLint and the production build passed. The compatibility-specific tests verify multiline/Unicode/special-character text, relationship aliases, first-sheet selection and date serial preservation. Hosted Render has not been accessed; publish the updated source and redeploy before retrying online. Set SYNTHETIC_WORKBOOK to an alternate path when reproducing the supplied-workbook browser test elsewhere.

## Staff workspace upgrade - 12 October 2026

Retained the existing application and added action-first navigation/dashboard, case ownership and My Work, profile completeness, structured controls, matching eligibility/confidence, snoozing, bulk import comparison/history, grant timelines, global suggestions, report filters and server centre restrictions. The additive staff-workflows migration exists for both SQLite and PostgreSQL; local migration deployment reports three migrations and none pending.

| Final check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 30 unit/database tests passed |
| `npm run test:e2e` | 9 production Chromium workflows passed |
| `npm run test:persistence` | Production restart test passed |
| `npm run db:validate` / `npm run cloud:validate` | Both schemas passed |
| `npm run db:migrate` | Passed, no pending migrations |
| `npm run build` / `npm run cloud:build` | Both production builds passed |
| Operational SQLite integrity / foreign keys | OK; no violations |

New automated coverage exercises active/centre-authorised assignment and its audit trail, effective snooze dates and refresh preservation, matching eligibility/confidence/ranking, weighted completeness, bulk import decisions, scoped API reads/writes, scoped manager audit access, unsaved-edit cancellation, keyboard suggestions and out-of-range server pagination. All nine browser workflows assert no console/page errors. Desktop and tablet dashboard screenshots containing fictional records were visually inspected. Both supplied workbook formats were tested in isolated databases; their original files were not changed.

The operational database was backed up before migration and remains preserved. Source packaging excludes database files, uploaded workbooks and credentials. These checks do not prove live Render/Supabase connectivity, PostgreSQL migration execution, hosted HTTPS sessions, other browsers, or an operating-system reboot. No hosted service was contacted or deployed. Existing cloud deployment instructions remain applicable; redeploy the updated source to apply it online.

## Single birthday reminder - 12 October 2026

Birthday alerts now use one stable person/birthday key within the next 30 days, show the exact current countdown and have the birthday itself as their due date. Refresh updates that reminder instead of creating separate threshold reminders. Existing threshold records are consolidated by retaining the closest reminder (including its snooze, notes and completion status) and dismissing the other pending records; historical records are retained.

31 unit/database tests, TypeScript, ESLint, the production build and all nine Chromium workflows passed. Tests cover 30/7/2/1/0-day countdowns, stable keys, legacy duplicate consolidation, snooze/completion preservation, repeated refresh and one visible birthday row after browser refresh. The updated source archive must be redeployed before this behaviour is available on the hosted website. No database schema migration is required for this change.

## Centred pop-ups - 12 October 2026

The shared native dialog explicitly uses fixed viewport positioning, zero inset and automatic margins, overriding the CSS reset's zero-margin positioning. Its height is bounded by the dynamic viewport and content continues to scroll internally. All shared pop-ups use this style.

TypeScript, ESLint, 31 unit/database tests, the production build and nine Chromium workflows passed. The grant editor's horizontal and vertical centres were checked within two pixels at 1440x900, 1024x768 and 390x844, with its bounds inside the viewport. Desktop and mobile screenshots using fictional records were visually inspected. The hosted website requires redeployment of the updated source.
