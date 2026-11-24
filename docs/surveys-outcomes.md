# Surveys & Outcomes implementation and deployment report

This report captures the original survey release. The current CaritaHub identity workflow, staging and Member ID exports are described in the [dashboard completion report](dashboard-completion.md) and [staff guide](surveys-staff-guide.md).

Branch: `feat/surveys-outcomes-workspace`. Work extends the existing staff application. The operational database, caregiver identifiers, existing ZBI assessments, programmes, grants, reminders, sessions and history are retained. No production deployment or operational database migration is performed by development tests.

## Supplied sources and precedence

Both **P3H Requests** and **Grant Details for Alert System** in `P3H Requests.xlsx` were inspected, including the WHOQOL conversion formulas. All three supplied UTF-8 CSV files were parsed in memory with the implemented parser. No real respondents were copied into fixtures, source, screenshots or documentation. `scripts/check-survey-sources.ts <zip-path>` repeats the compatibility check and prints only aggregate counts.

| Export        | Submitted | Eligible | Consent excluded | Test excluded | Unknown scored labels | Complete WHOQOL / ZBI |
| ------------- | --------: | -------: | ---------------: | ------------: | --------------------: | --------------------: |
| English       |        14 |        8 |                5 |             1 |                     0 |                 8 / 8 |
| Mandarin      |        12 |       10 |                1 |             1 |                     0 |               10 / 10 |
| Malay / Tamil |        11 |        8 |                2 |             1 |                     0 |                 8 / 8 |

The translated text in the supplied Mandarin and Malay/Tamil exports contains literal question marks where some original characters were lost. The retained English prefixes allow the actual files to be recognised and scored. Missing original translations cannot be reconstructed. One eligible Mandarin response has an after-programme phase outside the two requested normalised phases. All 26 eligible submitted birth-date strings require verification under the strict four-digit-year/date policy. None is guessed. These are source-quality findings, not a claim that identities have been established.

The pasted user request takes precedence over the workbook's older requests to hard-code full names and relabel repeated submissions by order. Neither is implemented. Existing `Person.memberId` remains authoritative. Every new identity link requires staff confirmation. Recorded phases are retained until an audited correction.

## New functions and architecture

- **Surveys & Outcomes** navigation contains Overview, Import Surveys, Needs Review, Survey Records, Results & Trends and Import History. Staff see relevant actions; manager/admin exports and unlinking are restricted by the server.
- Multi-file imports validate encoding, quoting, row widths, size limits, consent and the complete question template. Known English question prefixes plus validated suffixes handle reordered questions, multilingual exports and the supplied `sastified` spelling variation. No positional guessing occurs if a required question is absent or ambiguous.
- Preview and confirmation both parse source files on the server. Confirmation does not trust client-calculated scores or supplied identity links. Eligible rows, including invalid/incomplete answers and unmatched identities, are saved transactionally. Structurally invalid files need correction; no partially parsed file is silently imported.
- Consent/test exclusions retain only aggregate counts and record number/reason in the batch audit. Excluded identities, birth dates and answers are not stored. Eligible original names, original phase/date/birth-date text and original question answers are access controlled. The original uploaded CSV is not retained.
- Source identity is SHA-256 of the source language/export namespace, response ID and original submission timestamp. IDs are unique across the 37 supplied rows; ongoing source-ID stability across future exports is not independently established. A no-ID response falls back to canonical row content plus occurrence ordinal, preserving multiple identical submissions within one export. The strategy does not use a name as identity. Conflicting source contents are reported and retain the existing record. Concurrent duplicate imports fail atomically at the unique constraint and can be re-previewed safely.
- Candidates come from the existing caregiver database, restricted to the survey's centre and current staff permissions. Member IDs, verified aliases, existing aliases, names, contact numbers and valid dates support search. Evidence and conflicting birth dates are shown. Suggestions never create a verified link automatically. One verified alias may belong to several caregivers.
- Link/unlink decisions, staff IDs, times, prior Member IDs and reasons are retained. Corrections preserve originals and recompute scores with an audit trail. Optimistic revisions prevent simultaneous edits overwriting each other. Verification/unlink/revocation recheck the actor's current role and centre permissions inside the transaction.
- The caregiver profile adds a Surveys & Outcomes tab and a verified alias registry. Survey lists use server pagination, lean selections and stable ordering. Profile charts show one bounded history page, explicitly labelled. Unmatched responses never appear on a caregiver profile.
- Aggregates use valid, dated, linked Baseline/Annual responses of the current method. Every metric reports its observation count. Unique caregiver metrics deduplicate person IDs. Paired changes use the same verified caregiver, one baseline and their latest annual survey on a later Singapore calendar date. Multiple baseline phases are flagged and excluded from pairing. Incompatible methods are not combined.
- Requested and extended CSV exports include all filtered linked rows within the 10,000-row limit, enforce role/centre access and create an audit entry. Text cells are protected against spreadsheet formula injection. Unmatched identities do not enter caregiver-level exports.

## Scoring methodology

`src/lib/survey-scoring.ts` is the pure scoring engine. Method identifier: `P3H_WHOQOL_ZBI6_v1_complete_domains`. The original 0–88 `Assessment` remains unchanged. Six-item survey totals live in `SurveyResponse.zbi`, not `Assessment.value` or the existing import ZBI field.

WHOQOL question IDs Q1–Q26 correspond to G–AF. Conversion uses each question's workbook scale, including quality, satisfaction, amount, extent, capacity and frequency. Numeric responses must be integers within 1–5. `99`, blank and not-applicable answers are missing, never score 99. Q3, Q4 and Q26 (I, J and AF) reverse by `6 - value`, leaving missing values missing.

| Domain           | Questions after required reverse coding |
| ---------------- | --------------------------------------- |
| Physical         | Q3, Q4, Q10, Q15, Q16, Q17, Q18         |
| Psychological    | Q5, Q6, Q7, Q11, Q19, Q26               |
| Social Relations | Q20, Q22                                |
| Environment      | Q8, Q9, Q12, Q13, Q14, Q23, Q24, Q25    |

The overall raw mean is the unrounded average of the four raw domain means. Each domain and the overall mean are independently transformed with `(mean - 1) * 25`, once. Scores round to two decimal places only at final storage/display. The provisional missing-data policy requires all items in a domain and all four domains for Overall; there is no imputation. A blank domain does not prevent another complete domain from being reported. P3H must approve this minimum-response policy before operational use. The UI labels the policy provisional. The two-question Social Relations method is not represented as standard WHOQOL-BREF.

Z1–Z6 correspond to AG–AL and map Never/Rarely/Sometimes/Quite frequently/Nearly always to 0/1/2/3/4. All six answers are required for a 0–24 total. No severity categories or diagnoses are generated. An independently calculated varied-answer fixture expects WHOQOL scores 71.43, 58.33, 50, 40.63, Overall 55.10 and ZBI 12; tests verify the engine against those results.

## Existing workflow improvements

The directory now searches verified aliases and contact numbers, within existing centre permissions. Directory responses select list fields instead of full personal/medical profiles and long remarks. Edit fetches the full current profile before opening the existing editor, preserving optional fields and current version checks. Existing tabs and forms remain available.

The dashboard adds Import Survey, eligible response/unmatched/linked-caregiver counts and links into the survey module. Existing urgent tasks, birthday reminders, grants, reports, programme matching and automatic import/tagging remain in place. The survey code uses the existing persistent shell, private cache, HTTP session guards, UI controls and audit service. Searches are debounced and bounded; cached survey results and directory data are invalidated after writes, and account/permission changes clear protected state.

Grant follow-up rules already matched the workbook: South West CDC two calendar months; CHAS 14 days; HPC+, MOW, Counselling and SMF seven-day recurrence. Those rules and the existing reminder/email infrastructure are retained. A new pure remarks parser proposes explicit known application dates in the profile Notes tab. A staff-reviewed normal grant form owns the final save. Negated/uncertain statements and impossible dates are not extracted. Existing schemes are not silently overwritten or duplicated by the suggestion action.

## Additive database changes

Migration `202611130001_surveys_outcomes` exists in both `prisma/migrations` and `prisma/cloud/migrations` and creates:

1. `SurveyImportBatch`: source file/language, centre, uploader, counts and minimal row dispositions.
2. `SurveyResponse`: source uniqueness, original/effective answers and metadata, current identity, method, quality warnings and separate scores.
3. `SurveyIdentityReview`: append-only link/unlink/ambiguity decisions.
4. `PersonAlias`: multiple verified/revoked aliases per existing caregiver, including verifier/source metadata.

Indexes support centre/status/date lists, person/method/date history, source deduplication, review history and exact verified alias lookup. No existing tables are rebuilt or reset. A populated pre-survey SQLite snapshot test compares all original tables after migration and checks foreign keys and integrity. Source files, `.env`, operational databases and backup files remain outside version-controlled artifacts.

## Performance and verification

The repeatable `scripts/measure-surveys.mjs` uses separate disposable fictional SQLite databases for 100, 1,000 and 5,000 caregivers. Each includes the same number of linked recipients/grants and twice as many linked surveys. Three API samples provide a median; navigation includes browser overhead. The baseline application cannot expose survey endpoints; those measurements have no baseline counterpart. The same current CSV parser is measured in both phases, so its timing is throughput evidence, not an optimisation claim.

Baseline: 95 unit/integration tests, 18 Playwright workflows, production build, TypeScript, ESLint, local/cloud schema validation and production-server restart persistence passed from an untouched source snapshot. Dependency installation initially delayed the baseline; installation errors were rerun and resolved, rather than classified as source failures.

Current measurements and final verification results are recorded below. All browser checks use fictional records and local Chromium, not hosted or physical-device evidence.

## Deployment configuration and P3H decisions

No new secrets, scheduled jobs or external scoring service are required. Keep existing database/session/origin/email/feed configuration. Use a verified protected backup, rehearse the additive migrations on a restored copy and deploy application plus both schema/migration trees. For local SQLite run `npm.cmd run db:generate`, `npm.cmd run db:migrate`, `npm.cmd run build`, then restart. For cloud PostgreSQL retain `cloud:build` and `cloud:start`; the latter deploys the dedicated cloud migrations. Never use reset, destructive db push or seed against operational data. Check `/api/health`, sign-in, permissions, one reviewed survey import, caregiver edit, grant follow-up and scheduled notifications after deployment.

P3H must approve the complete-domain missing-data policy, identity-verification process, authorised import/link/export roles and retention periods for eligible survey data, audit records and downloaded exports. The safe defaults are manual confirmation, no inferred birth centuries, no automatic phase changes, no retained declined/test identities, manager/admin exports and manager/admin unlinking/revocation. Damaged translations should be corrected at source for future exports. Unknown translated-only templates remain rejected or unscored until a validated mapping is provided. No regulatory, WCAG certification, live email delivery or clinical-validation claim is made.

## Measured local workloads

Median authenticated API time (three samples), in milliseconds. Each workload includes an equal number of recipients and grants, and two linked survey responses per caregiver. The baseline migration/data fixture also contains those surveys, while the baseline application has no survey endpoints.

| Caregivers | Dashboard before / after | Directory search before / after | Profile before / after | Grants before / after | Survey list after | Survey summary after |
| ---------- | -----------------------: | ------------------------------: | ---------------------: | --------------------: | ----------------: | -------------------: |
| 100        |                  27 / 27 |                         23 / 29 |                18 / 21 |               13 / 16 |                11 |                   17 |
| 1,000      |                  61 / 81 |                         30 / 28 |                18 / 17 |               17 / 22 |                14 |                   77 |
| 5,000      |                245 / 339 |                         65 / 81 |                17 / 31 |               43 / 67 |                31 |                  340 |

The 20-row caregiver-directory payload fell from approximately 50.7 KB to 13.1 KB (74.1% smaller), largely by removing full remarks/profile fields from list responses. Full profile responses remained approximately 4 KB. Survey lists returned approximately 10.3 KB for a 20-row page even in the 10,000-response workload; the benchmark asserts that these are populated lists, not empty-result timings.

The extra dashboard survey counts and outcomes calculations add work. These runs do not demonstrate uniformly faster endpoint latency. The 5,000-caregiver dashboard median was 245 ms before and 339 ms after; its body stayed below 9 KB. Directory search remained bounded in these samples, but its 5,000-caregiver timing rose from 65 to 81 ms despite the payload reduction. Machine load and concurrent local checks vary. No hosted capacity/latency guarantee follows from these figures.

| Caregivers | CSV parse/validate/score after | Navigate to caregivers before / after | Grants before / after | Dashboard before / after | First survey navigation after |
| ---------- | -----------------------------: | ------------------------------------: | --------------------: | -----------------------: | ----------------------------: |
| 100        |                          12 ms |                             135 / 208 |             124 / 141 |                 94 / 141 |                           460 |
| 1,000      |                          56 ms |                             156 / 184 |             112 / 152 |                143 / 131 |                           990 |
| 5,000      |                         431 ms |                             166 / 153 |             153 / 165 |                 97 / 145 |                           961 |

Navigation samples include browser click/render overhead and are single runs, not medians. The cold survey navigation includes its deferred component and aggregation request. CSV timings cover parsing, validation and scoring, not transactional database insertion or staff identity review. They use the same current parser in both phases, so no before/after parser speedup is claimed. Baseline and after JSON reports are retained under ignored `data/survey-performance-*.json`. The benchmark uses only disposable fictional databases and never connects to an operational database.


## Final verification results (13 November 2026)

- `npm.cmd ci --no-audit --prefer-offline`: completed from the lockfile. The initial default install was stopped while delayed by registry/audit traffic, then the clean install completed. No application dependency or lockfile was changed.
- `npm.cmd run db:validate` and `npm.cmd run cloud:validate`: passed. Cloud validation used a fictional PostgreSQL URL; no remote database was contacted.
- `npm.cmd test`: all 115 unit/integration tests passed, including 20 new survey/scoring/security/migration tests. A final focused survey integration rerun also passed after the last filter refinements.
- `npm.cmd run typecheck` and `npm.cmd run lint`: passed. One parallel lint attempt collided with Playwright recreating `test-results`; lint was rerun successfully after browser testing finished.
- `npm.cmd run build`: passed with the restored SQLite client. `npm.cmd run cloud:build`: passed with the PostgreSQL client. A separate PostgreSQL-client typecheck passed, followed by regeneration of the local SQLite client.
- `npm.cmd run test:e2e`: all 20 production-browser workflows passed. This includes the 18 existing workflows plus survey import/link/export/permission/layout coverage and correction/unlink/source-preservation coverage. The browser suite caught and drove fixes for a dropped care-recipient kind in the new Edit handler and the survey section's stray not-found fallback.
- `npm.cmd run test:persistence`: passed across a complete production-server restart, including the linked survey, retained Member ID and six-item ZBI total.
- `scripts/check-survey-sources.ts`: all three supplied CSVs passed actual-format parsing with the aggregate results above. No operational import occurred.
- `scripts/check-postgres-migrations.mjs`: all eight cloud migrations executed in an isolated in-memory PGlite PostgreSQL WASM engine (0.5.13), with all 32 original tables' contents preserved. New foreign keys, source uniqueness and JSON/numeric aggregation checks passed. PGlite is installed outside the repository for this test; it is not an application dependency.
- Responsive browser checks covered 1440, 1280, 1024, 768, 390 and 375 px. The survey mobile screenshot was visually inspected after converting rows to labelled cards and removing the not-found fallback. These are Chromium simulations, not physical-device/screen-reader certification.
- `git diff --check`: passed. Work remains on the requested separate feature branch; no merge, deployment, operational migration or real-data import was performed.

For the optional isolated SQL check, install `@electric-sql/pglite@0.5.13` into a temporary tool directory and pass its `dist/index.js` path to `node scripts/check-postgres-migrations.mjs`. The default script path is the temporary `p3h-postgres-check` installation used during development. This is a SQL-engine migration check, not a Prisma TCP/pooler integration test.

Outstanding deployment checks: the actual hosted Prisma/PostgreSQL connection, pooler behaviour and upgrade on an organisation-controlled restored database; the deployed protected programme feed, scheduler/email provider/inbox; physical-device and assistive-technology checks; and P3H's policy approvals listed above. Source CSV compatibility and local functional tests are verified separately from those deployment checks. See [the data protection review](survey-data-protection.md) and [staff guide](surveys-staff-guide.md).
