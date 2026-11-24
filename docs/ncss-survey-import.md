# NCSS survey imports

The **Surveys & Outcomes** workspace imports consented NCSS responses that staff have matched to existing Member IDs in Excel. The workflow uses the existing caregiver registry, survey history, permissions, and scoring code.

## How to Import NCSS Survey Results into P3H Dashboard

1. Go to **Surveys & Outcomes → Import Surveys**. Select **Download Excel Template**. Keep the workbook and source exports in approved organisational storage.
2. Export only **Full Name** and **Member ID** from CaritaHub. On **CaritaHub Mapping**, paste these as values starting at **A2**. Keep Member IDs as text. For a CSV source, use **Data → From Text/CSV** and set the ID column to **Text** before loading. For example, fictional Member ID `000017` must stay `000017`.
3. In Excel, import the original NCSS CSV as text so Excel preserves source IDs, timestamps, and answers. Paste the 40 source columns, including the original headings, as values into **NCSS Matched Survey** starting at **A1**. Keep all fields in their original order. The template has space for 5,000 mapping entries and 1,000 survey responses. For larger survey exports, use separate copies of the template.
4. Check each **Suggested Member ID**. The template trims spacing and ignores case. It suggests an ID for a unique, full-name-looking match and flags duplicates and review cases. Verify initials, single names, nicknames, misspellings, and ambiguous names in CaritaHub. Enter the verified ID in **Manual Member ID** (AQ) when needed. Leave the final ID blank if you cannot verify the identity.
5. Select **A1:AO** through the last response, and copy the range. In a **new workbook**, set column AO to **Text** and use **Paste Special → Values** at A1. Check that the last header is **Member ID** and that the sheet includes exactly 41 columns. Save this workbook as **CSV UTF-8 (Comma delimited)**. Keep the CaritaHub mapping and template helper columns in Excel.
6. In the dashboard, select the **Import centre**, **Survey language**, and **Matched survey CSV**. Select **Preview responses** and check warnings and row numbers. Correct missing and unavailable Member IDs in Excel before re-exporting. If a row shows **Source conflict**, ask an administrator to review the existing response.
7. Select **Import Valid Responses**. The result shows saved, rejected, excluded, and already-imported counts. Open **View imported survey records** or **View Results & Trends**. To see one caregiver’s timeline, open their profile and select **Surveys & Outcomes**.

| Fictional row | Excel status | Staff action |
| --- | --- | --- |
| Fictional Lin Hua | Exact Match | Verify suggested `000017` before export |
| F. L. H. | Needs Review | Verify by approved records, then enter the corresponding Member ID manually |
| Fictional Duplicate | Duplicate Name | Check the available identities. Keep the final ID blank until confirmed |

An administrator can open a linked record’s review details, expand **Correct Member ID**, check an exact replacement ID in the same centre, confirm the identity, and record a reason. The audit history records both IDs, the reviewer, and when the correction was made. Source answers and the import batch are retained.

## What the system receives and stores

The browser parses UTF-8 CSV locally. It excludes rows without consent and rows with “test” in the submitted name, then sends only eligible row numbers, an NCSS response ID, Member ID, Singapore timestamp converted to UTC, recorded phase, consent, source language, and 32 scoreable answer values. It also sends exclusion totals and the selected centre. Unknown answer labels become a warning marker before transmission. The file name, CSV text, names, birth dates, and demographic columns stay on the device.

The server checks the strict payload, staff role, centre, active caregiver status, and exact Member ID before preview and commit. Outside-centre or unavailable caregivers get the same error. Each import is transactional. Re-uploading an identical response skips it, while changes to an existing source ID, assignment, timestamp, or scoreable answers trigger a conflict. If records changed after review, preview again. Imports accept one file at a time, up to 4 MB and 5,000 responses. Responses with an unknown phase or incomplete scores can be saved with warnings when the identity and source timestamp are valid.

The existing `SurveyImportBatch` and `SurveyResponse` models store batches, source identity, scored answers, and linked caregiver history. New records use provenance `NCSS Excel Member ID`. Identity staging and its review controls are available for historical uploads. The new SQLite and PostgreSQL migration adds the provenance field and indexes for Member ID/date and source response ID.

## Scoring and analytics

The scoring version is `P3H_WHOQOL_ZBI6_v1_complete_domains`, based on **P3H Requests.xlsx**. WHOQOL uses question-specific 1–5 response scales and reverses I, J and AF using `6 − answer`. The calculation uses four domain means.

| Domain | NCSS columns |
| --- | --- |
| Physical | I, J, P, U, V, W, X |
| Psychological | K, L, M, Q, Y, AF |
| Social Relations | Z, AB |
| Environment | N, O, R, S, T, AC, AD, AE |

The P3H WHOQOL score transforms each mean with `(mean − 1) × 25`. Overall applies the same transformation to the average of the four unrounded means. Final scores round to two decimals. The Social Relations domain uses the two questions specified by P3H. Six-item ZBI sums AG–AL, each scored 0–4. Its range is 0–24 and the existing 0–88 ZBI assessment remains separate. Under the provisional policy, a missing or unknown required item leaves its domain or ZBI total incomplete. Outcome CSVs leave incomplete values blank and include Member IDs without caregiver names.

Overview counts imported responses and unique caregivers separately. Averages show the number of valid observations by metric. Results & Trends shows monthly averages on separate scales and compares Baseline with a later Annual or Follow-up response for the same verified caregiver. The comparisons are descriptive.

## Deploying on Render and Supabase

1. Document organisational approval for the NCSS survey-processing purpose, role and centre access, hosting region and infrastructure, retention, backups, and disposal. Survey scores linked to Member IDs are personal data.
2. Back up Supabase and rehearse the migration on an organisation-controlled copy. The additive production migration is [`prisma/cloud/migrations/202611240001_ncss_matched_csv/migration.sql`](../prisma/cloud/migrations/202611240001_ncss_matched_csv/migration.sql). Use the existing Render PostgreSQL settings and `npm run cloud:migrate` to apply the migration chain. The matching local migration is [`prisma/migrations/202611240001_ncss_matched_csv/migration.sql`](../prisma/migrations/202611240001_ncss_matched_csv/migration.sql) and runs through `npm run db:migrate` on the intended SQLite copy.
3. Use `npm ci && npm run cloud:build` for Render’s build and `npm run cloud:start` for startup. Keep secrets in the Render environment. Use approved TLS-enabled database connectivity and configure `APP_ORIGIN` for the hosted dashboard. Limit database credentials, backup access, and survey export permissions.
4. Leave `NCSS_SURVEY_IMPORT_APPROVAL` unset until approval is recorded. When approved, put the organisation’s approval reference in that server-only environment variable and redeploy. Disable the intake by clearing it and redeploying. Prior outcomes remain available to permitted users.
5. Test template download, an approved fictional upload, duplicate handling, access with two scoped users, an outcome export, and profile history before admitting live records. Keep application and proxy request-body logging disabled for these routes.

The workbook can be rebuilt with `node --import tsx scripts/build-ncss-template.ts` using `P3H_SPREADSHEET_DEPENDENCIES` set to the installed spreadsheet authoring runtime’s Node directory. The bundled asset is a blank template. Render serves the bundled template directly.


## Local verification

The three supplied NCSS exports passed the matched format check in memory. Their 26 eligible responses had complete WHOQOL and six-item ZBI scores. Native Excel recalculated the five matching statuses, enforced cell protection, and exported a fictional 41-column ASCII CSV with leading zeros intact. The installed Excel automation exposed the older CSV format. Confirm CSV UTF-8 export on the organisation's staff Excel build.

The 131 unit and integration tests, 23 Playwright workflows, restart-persistence test, both Prisma schema checks, and both production builds passed. PGlite applied all 12 PostgreSQL migrations in isolation, preserving the fictional legacy data. The 5,000-caregiver SQLite benchmark used 10,000 existing fictional survey records. Median record-list and overview requests took 38 ms and 334 ms, and a 5,000-response commit took 4.1 seconds. These measurements apply to the local fixture. Hosted connectivity and deployment validation remain pending.

## Implementation files

- Import flow and Excel download in `src/components/ncss-import.tsx`, `src/app/api/surveys/route.ts`, `src/app/api/surveys/template/route.ts`, and `assets/ncss-member-id-template.xlsx`.
- CSV parsing, import validation, and outcomes in `src/lib/survey-csv.ts`, `src/lib/survey-parser.ts`, `src/lib/ncss-matched-csv.ts`, `src/lib/ncss-import.ts`, and `src/lib/surveys.ts`.
- Staff workspace and charts in `src/components/surveys.tsx` and `src/components/survey-trend.tsx`.
- Model updates in both Prisma schemas and the paired `202611240001_ncss_matched_csv` migrations.
- Verification and packaging in `tests/surveys.test.ts`, `tests/survey-scoring.test.ts`, `tests/e2e/workflows.spec.ts`, `playwright.config.ts`, `scripts/check-survey-sources.ts`, `scripts/check-postgres-migrations.mjs`, `scripts/measure-surveys.mjs`, `scripts/build-ncss-template.ts`, and `scripts/package-source.mjs`.
- Staff and deployment notes in this guide, `README.md`, and `.env.example`.
