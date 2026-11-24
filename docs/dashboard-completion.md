# P3H Dashboard completion report

## Workspace and workflows

The `codex/p3h-dashboard-completion` branch repairs the committed merge conflict in `36984fe`. The repair retains the integrated Surveys & Outcomes and Trash workflows from `cebce88`, including their existing routes, access checks, history and tests.

- Survey import saves eligible responses in bounded inserts within one transaction for the entire upload. It preserves batch audit counts, rejects source conflicts and keeps unmatched rows available for identity review. Re-uploading the same source does not create another response.
- The survey quality panel opens filtered records for ambiguous identities, invalid timestamps, incomplete WHOQOL domains and phases requiring verification. Staff can also open Import History to see duplicate counts.
- The dashboard displays the signed-in staff member's centre scope, coverage among active caregivers and a count of care recipients linked to visible active caregivers. It loads recent people and task labels while the database aggregates the caseload and grant counts. Management charts render when their section is opened. The caregiver directory returns grouped filter values and matches verified aliases using the same normalisation as identity review.
- Grants retain two calendar months for South West CDC applications, 14 days for CHAS, and seven-day recurring reviews for HPC+, MOW, Counselling and SMF. The existing remarks review, follow-up completion and notification flows continue to own grant changes.
- Next.js is updated to 16.4.6 and Prisma's configuration dependency Effect is pinned to a patched 3.22.5 release after the dependency audit. [Next.js release](https://github.com/vercel/next.js/releases/tag/v16.4.6) · [Effect advisory](https://github.com/advisories/GHSA-7589-6fvf-x4pw)

## CaritaHub identity management

Staff look up the respondent in CaritaHub using their existing account, then enter the verified Member ID in P3H. P3H checks the exact ID against its existing caregivers in the survey centre and returns the ID, centre and status. The staff member confirms the match. Missing IDs and unverified responses stay in the review queue. Managers can unlink a mistake and staff can then verify a replacement ID. Existing confirmed links retain their recorded matching method. New links record staff confirmation in CaritaHub.

The migration moves existing submitted and corrected names and birth-date details into a restricted staging table. Reviewers can record and reverse name corrections without changing the source answers or scores. Ordinary survey lists, profile survey results and exports display response references or Member IDs. Identity details bypass the workspace cache. General audit views show event metadata, while the restricted review provides the previous link and name history.

- [Survey service](../src/lib/surveys.ts) and [survey API](../src/app/api/surveys/route.ts) implement scoped staging, exact ID checks, linkage, batch counts and Member ID exports.
- [Surveys & Outcomes](../src/components/surveys.tsx) provides the review interface. [Resource loading](../src/components/use-resource.ts) bypasses the workspace cache for restricted identity responses. [Audit redaction](../src/lib/records.ts) protects historical payloads in general views.
- [Survey integration tests](../tests/surveys.test.ts) and [browser workflows](../tests/e2e/workflows.spec.ts) cover role and centre access, missing IDs, corrections, rejection, reassignment and original-data preservation. The [illustrated staff guide](caritahub-staff-quick-guide.md) shows the workflow with fictional records.

### CaritaHub benchmark comparison

Values are local milliseconds, before → after. Each fixture contains one linked recipient and grant, and two surveys per caregiver. API times are medians of three requests. Import commits and navigation are single samples.

| Caregivers | Dashboard API | Caregiver search | Profile API | Grants API | Survey list | Survey summary | CSV import commit | Navigate to surveys |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 26 → 25 | 33 → 33 | 23 → 19 | 17 → 15 | 14 → 12 | 23 → 18 | 117 → 78 | 922 → 486 |
| 1,000 | 88 → 31 | 42 → 31 | 22 → 21 | 30 → 17 | 22 → 18 | 86 → 57 | 508 → 553 | 927 → 477 |
| 5,000 | 132 → 127 | 65 → 54 | 24 → 21 | 45 → 41 | 51 → 38 | 277 → 300 | 2,312 → 3,086 | 911 → 982 |

At the largest workload, a 20-row survey response fell from 11,234 to 8,370 bytes. Name staging adds a second write to the import transaction. Survey summary and import timings increased in the largest sample. Dashboard, directory and profile code was held constant for this update, and their timing variations reflect local run conditions. The benchmark uses disposable SQLite fixtures and says nothing about hosted latency. Reproduce it using `node --import tsx scripts/measure-surveys.mjs caritahub-after . --with-surveys`.

### CaritaHub verification

- The baseline and final unit/integration suites each passed 129 tests. The final suite verifies the populated SQLite staging migration, multilingual imports, exact Member ID checks, permissions, rejection, reassignment, original answers and duplicate handling.
- All 22 production-browser workflows passed. They include a missing ID, an explicitly confirmed match, two-score caregiver charts, unlinking, name reversal and responsive layout checks from 375 to 1440 px. Earlier test runs surfaced assertions that treated an expected missing-ID response as a console error and searched private names in general records. The final suite checks the expected error and uses response references for general searches.
- `npm ci` completed in an isolated directory with install scripts disabled. Both Prisma schema validations, TypeScript, lint, both production builds and restart persistence passed. The PostgreSQL-client build ran in that isolated directory.
- All 11 cloud migrations executed in isolated PGlite, with the contents of 32 existing tables preserved and an existing survey's identifiers moved into staging. Hosted PostgreSQL connectivity and migration, live programme sync and live reminder email delivery remain deployment checks.

Before deploying with real data, obtain P3H’s Data Protection Officer approval for access, processing locations and retention and disposal. Pending and matched staging records remain protected until the organisation approves a disposal procedure. [Data protection review](survey-data-protection.md)

## Staff workflow and scoring

Preview each upload in **Surveys & Outcomes → Import Surveys**, check the consent exclusions, duplicates and warnings, and confirm the import. In **Identity Review**, verify the caregiver separately in CaritaHub, enter the exact Member ID and choose **Confirm Match**. Authorised staff can correct survey metadata. Managers can unlink mistakes while keeping the original response and review history.

The caregiver's **Surveys & Outcomes** tab shows linked results and trends. The P3H WHOQOL calculation uses the workbook's four domains and two-question Social Relations score. It reverses I, J and AF, averages the required items per domain, and transforms each domain and the overall mean to 0–100 once. The method stores two decimal places and requires complete domains provisionally. The six-item ZBI sum uses AG–AL for a separate 0–24 score. The existing 0–88 assessment stays in its original workflow. Managers and administrators can export verified linked results in the workbook or extended CSV format.

Read the [staff guide](surveys-staff-guide.md), [scoring and implementation report](surveys-outcomes.md) and [data protection review](survey-data-protection.md).

## Original source verification

The source ZIP contained both workbook tabs and all three CSV exports. Both tabs were inspected, and the current parser read the original UTF-8 CSVs in memory.

| Source | Submitted | Eligible | Consent excluded | Test excluded | Complete WHOQOL and ZBI |
| --- | ---: | ---: | ---: | ---: | ---: |
| English | 14 | 8 | 5 | 1 | 8 |
| Mandarin | 12 | 10 | 1 | 1 | 10 |
| Malay and Tamil | 11 | 8 | 2 | 1 | 8 |

All 26 eligible birth-date strings require verification. One Mandarin survey phase requires review. The Mandarin and Malay/Tamil exports carry damaged translated characters and usable English question prefixes. No unknown scored answers were found in the supplied eligible rows. No source rows were written to a database.

## Local performance measurements

The checked-in starting commit failed both schema validations, TypeScript and lint because it contained merge markers. The comparison uses the conflict-free first parent `cebce88`. Its build emitted runnable output before stopping on the Next.js security advisory. Each fictional SQLite workload contains one linked care recipient and grant per caregiver, with two linked surveys per caregiver. Times are milliseconds, shown as before → after.

| Caregivers | Dashboard API | Caregiver search | Profile API | Grants API | Survey list | Survey summary |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 71 → 32 | 66 → 43 | 44 → 32 | 46 → 19 | 44 → 16 | 44 → 22 |
| 1,000 | 218 → 54 | 78 → 46 | 66 → 26 | 69 → 25 | 61 → 26 | 85 → 197 |
| 5,000 | 313 → 188 | 72 → 97 | 21 → 34 | 109 → 84 | 67 → 110 | 384 → 516 |

| Caregivers | CSV parse and score | CSV import and commit | Navigate to caregivers | Navigate to grants | Navigate to dashboard | Navigate to surveys |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 38 → 13 | 817 → 99 | 725 → 204 | 655 → 160 | 373 → 86 | 1,438 → 911 |
| 1,000 | 63 → 101 | 2,528 → 651 | 211 → 201 | 210 → 158 | 134 → 81 | 993 → 891 |
| 5,000 | 221 → 471 | 8,765 → 7,005 | 152 → 184 | 209 → 288 | 123 → 152 | 962 → 1,426 |

API values are medians of three requests. CSV and browser values are single samples. Both runs used the same parser, and the before and after builds used different Next.js patch versions. The 5,000-caregiver dashboard API and import commit were faster in this comparison. At that workload, directory search, survey requests and measured browser navigation were slower. These results describe local test runs. The survey summary still reads a scoped scoring projection for its calculations.

Run `node --import tsx scripts/measure-surveys.mjs after` from a built checkout to recreate the workloads. For a prior build that includes the survey module, run the current benchmark script from that build's checkout with `repaired-baseline . --with-surveys`. JSON results from this run are under the ignored `data/survey-performance-*.json` paths.

## Original dashboard release verification

| Check | Result |
| --- | --- |
| `npm ci` | Clean install completed from the starting lockfile. A targeted install updated the Next.js and Effect entries. |
| `npm run db:validate`, `npm run cloud:validate` | Both schemas passed. |
| `npm run typecheck`, `npm run lint` | Passed. |
| `npm test` | 127 passed, including scoring, consent and duplicates, batch boundaries, matching, centre scope, reminders and SQLite migration preservation. |
| `npm run build` | SQLite-client production build passed. |
| `npm run cloud:build` | PostgreSQL-client production build passed in a separate checkout. The SQLite client was regenerated for the working checkout. |
| `npm run test:e2e` | All 21 Chromium workflows passed. Responsive checks covered 1440, 1280, 1024, 768, 390 and 375 px. Desktop dashboard, mobile survey records and mobile follow-up screenshots were inspected. |
| `npm run test:persistence` | Records and authenticated sessions survived a production-server restart. |
| `node scripts/check-postgres-migrations.mjs` | All nine cloud migrations executed in isolated PGlite. The check preserved the contents of 32 existing tables and verified foreign keys and survey source uniqueness. |
| `npm audit --omit=dev` | npm reported zero vulnerabilities after the dependency updates. |

The browser suite also exercised slow and failed requests, session expiry, Back and Forward, centre-permission changes and simultaneous edits. Browser and migration tests use fictional records.

## Deployment

Apply the pending migrations after a verified protected backup and rehearsal on a restored copy. The CaritaHub migration copies verification identifiers into staging and clears their legacy columns. Original answers, linked Member IDs and prior review records remain available.

| Migration | SQLite | PostgreSQL |
| --- | --- | --- |
| Surveys & Outcomes | [202611130001 SQL](../prisma/migrations/202611130001_surveys_outcomes/migration.sql) | [202611130001 SQL](../prisma/cloud/migrations/202611130001_surveys_outcomes/migration.sql) |
| Record Trash | [202611130002 SQL](../prisma/migrations/202611130002_record_trash/migration.sql) | [202611130002 SQL](../prisma/cloud/migrations/202611130002_record_trash/migration.sql) |
| Survey Name Corrections | [202611230001 SQL](../prisma/migrations/202611230001_survey_name_corrections/migration.sql) | [202611230001 SQL](../prisma/cloud/migrations/202611230001_survey_name_corrections/migration.sql) |
| CaritaHub identity staging | [202611230002 SQL](../prisma/migrations/202611230002_caritahub_identity_stage/migration.sql) | [202611230002 SQL](../prisma/cloud/migrations/202611230002_caritahub_identity_stage/migration.sql) |

For SQLite use `npm run db:generate`, `npm run db:migrate` and `npm run build` before restarting. For PostgreSQL use `npm run cloud:build` and the existing `npm run cloud:start` deployment command. Cloud start applies the cloud migration tree. Use the existing database, session, origin, programme feed and email configuration. Hosted Prisma/PostgreSQL and pooler connectivity, the operational upgrade, the protected programme feed and live email delivery through the scheduler require deployment-environment checks. Physical devices and assistive technology require separate checks.

P3H approval is pending for minimum valid answers per domain, how staff verify identities, who can import/link/export, and retention periods for eligible responses, audit records and downloaded exports.
