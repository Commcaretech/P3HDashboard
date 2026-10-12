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
