# P3H local case management

An internal staff workspace for caregiver/member records, separate linked care recipients, Excel imports, programme matching, grants, reminders and caseload reporting. The default local configuration stores records in SQLite on the hosting computer. An optional Render + Supabase PostgreSQL configuration is now available; in that mode, records and uploads are processed by those hosting providers. No analytics, AI service or remote fonts are used. Optional staff reminder emails use an explicitly configured HTTPS provider.

## Updated staff workflows

See [the staff workflow guide](docs/staff-workflows.md) for case assignment, My Tasks, profile completeness, snoozing, import comparisons/history and centre permissions. Update an existing installation with `npm.cmd run db:generate`, `npm.cmd run db:migrate`, then rebuild or restart development. Back up first with `npm.cmd run backup`. No reset or seed is required. Existing accounts retain their prior centre access until an administrator reviews it in Settings.

## Care-management upgrade

See [automatic reminders and email setup](docs/automatic-reminders.md), [migration and recovery](docs/upgrade-migration.md), and [upgrade verification](docs/upgrade-verification.md). Start with a verified backup and an isolated migration rehearsal. The operational database is not migrated by tests. Both SQLite and PostgreSQL have version-controlled additive migrations. Existing staff emails default to unset and email notifications default to disabled.

New features include automatic scheme dates, recurring referral follow-ups, completion history, explicit resolution, staff email preferences, an independent daily notification endpoint, delivery diagnostics, dashboard actions and caregiver birthday lists. No email account or scheduler is configured automatically.

## First installation (Windows PowerShell)

Install Node.js 24 LTS, then open PowerShell in this project folder.

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

Open http://127.0.0.1:3000 on the host. The first screen creates an administrator: choose your own name, username and password (at least 12 characters). There are **no default passwords**. First setup is permitted only through the host's loopback address. Later visits use normal sign-in. Keep the database and its backups out of shared source-code repositories.

The database is `data/p3h.db`, outside build output. Restarting the browser, application or computer does not reset it. Startup does not seed, migrate destructively or import records automatically. `.env` contains the SQLite URL and cookie configuration; session secrets are random tokens rather than a fixed signing password.

## Free cloud hosting

Follow [the Render + Supabase deployment guide](docs/cloud-deployment.md) for browser-based setup without Node.js on staff laptops. Use the separate `cloud:build` and `cloud:start` commands; the local SQLite commands below are not cloud deployment commands. Never publish database files, real workbooks or credentials to GitHub.

## Production on the local host

```powershell
npm.cmd run db:migrate
npm.cmd run build
npm.cmd start
```

Installation/build needs internet access to download dependencies. The core local application works without internet. Configured email delivery requires internet. Both normal start commands bind to `127.0.0.1`. Keep the process running while staff use it.

## Import the supplied workbook

1. Sign in as Admin, Manager or Staff and open **Import Data**.
2. Select `Members (cth.user) (14).xlsx` from Downloads. The file is read locally by this application, not sent to an external service.
3. Review the column mapping; Member ID is required. The eleven sample headings map automatically.
4. Select **Parse and preview**. Review row counts, errors, warnings and duplicates.
5. Use **Review / correct** for each row. The editor includes member information, suggested care-recipient information, original cells and an existing-value comparison. Assessment ownership must be explicitly confirmed. Unknown assessment dates remain empty; recording timestamps are tracked separately. Creating a care recipient requires a staff-confirmed name or alias; an unidentified person is never fabricated.
6. Choose **Import**, **Skip**, or **Update existing**. Existing Member IDs default to Skip. Updates replace the reviewed import fields, including blank mapped fields. Existing non-imported health/profile fields and record status are retained, and an empty imported name retains the existing name. Original cells remain intact even when a column is not mapped. A Name column is optional for future workbooks. Review the comparison before updating.
7. Select **Confirm import** and confirm the selected record count. One database transaction saves the batch, records, category links and audit entries. A failure rolls back the whole batch.
8. Open **Caregivers**, then the imported profile. **Notes → Original imported cells** preserves source text; **Health**, **Interests**, and **Overview** show structured information.

Only `.xlsx` is accepted; convert older `.xls` in Excel first. Limits: 10 MB compressed, 50 MB expanded, 10,000 data rows and 100 columns. The first worksheet is used. Invalid dates, repeated headers, duplicate IDs and encrypted/invalid archives are rejected or highlighted. Excel's 1900/1904 dates are supported; the fictitious 1900-02-29 is rejected. Text dates accept ISO YYYY-MM-DD and unambiguous DD/MM/YYYY or DD-MM-YYYY. Low-confidence remarks remain original text. No macros or formulas are executed.

## Staff workflows

- **Caregivers / Care Recipients:** search, combine filters, sort the first table column and page through 20 results at a time. Create/edit forms separate overview, health, languages/interests and notes. Archive keeps the record; select Archived in the table filter to find it again. Active/Inactive status may be restored through editing.
- **Profiles:** link an existing care recipient under Care Relationships. A confirmed removal deletes only the relationship, retaining both people and the audit entry. Record programme participation, grants and reminders from their respective tabs.
- **Programmes:** maintain programme suitability, structured conditions/languages/interests, schedule, venue, capacity and registration state. Archive removes it from new matching recommendations. Register participation from a profile or matching result; closed/full programmes are rejected on the server.
- **Grants & Support:** create a scheme name or reuse an existing one. Maintain application/submission/approval/expiry/review dates, amount, staff assignment and notes. Editing a grant requires confirmation. Review tasks appear as soon as the application is saved; expiry reminders appear within 30 days. Overdue items remain actionable.
- **Alerts:** manual reminders support case review, programme follow-up, grant follow-up and custom tasks. Complete, dismiss or reopen alerts. Generated reminders reconcile after record changes, through Refresh Alerts, and through the independent scheduled job. Reading a page does not regenerate reminders. Completed task history is retained.
- **Reports:** caseload, conditions, languages, separate interests, grant status, upcoming birthdays, outstanding follow-ups and programme participation. Tables use database-backed values. Export is reserved for a future version; no inactive export button is shown.
- **Global search:** IDs, names, aliases, original remarks, tags, conditions, languages, interests and programme information. Filter state is kept in the URL; records and credentials are never stored in localStorage.
- **Audit Log:** latest 500 sensitive actions with staff, timestamp, entity and prior/new values. Detailed audit visibility is restricted to Admin and Manager. Timestamps are stored in UTC; due dates and birthday calculations use Singapore calendar dates.

## Roles and authentication

| Role | Permissions |
| --- | --- |
| Admin | Operational editing, imports, audit review, creation of staff accounts |
| Manager | Operational editing, imports, audit review |
| Staff | Operational editing and imports |
| Read Only | View operational records and reports; no writes/imports/audit access |

Admin creates additional accounts in Settings. Server routes enforce permissions independently of navigation/buttons. Passwords use salted scrypt hashes. Sessions use cryptographically random tokens, store only token hashes in the database, expire after eight hours and use HttpOnly/SameSite Strict cookies. Five unsuccessful login attempts lock a username for 15 minutes. Mutations verify the same-origin Origin header. Profile/programme/grant edits carry a last-updated version to detect another staff member's intervening changes.

## Matching rules

Deterministic rules in `src/lib/domain.ts` award these weights once per dimension when at least one recorded category overlaps:

| Dimension | Weight |
| --- | --- |
| Care recipient condition | 35% |
| Language | 25% |
| Member interest | 15% |
| Care recipient interest | 15% |
| Care recipient mobility | 10% |

Care-recipient languages take precedence when available, otherwise member languages are used. Recorded spoken/understood/preferred languages are considered. Mobility requires an exact recorded level or a programme explicitly marked All. Missing fields earn zero points; scores are not renormalised. Every result explains all five dimensions, including missing data and unmatched categories. Filters narrow centre, language, category, day, venue and open available capacity. Matching assists staff review and does not establish clinical suitability or a reservation.

## Database and code structure

Next.js App Router, strict TypeScript, Tailwind/CSS, Prisma 6, SQLite, Zod, ExcelJS, Recharts and Lucide. Prisma 6 is intentionally used for its established SQLite client and migration workflow. Dependency overrides replace vulnerable transitive uuid/deepmerge versions and the Next lint plugin's directory-glob dependency with the compatible `tinyglobby.globSync` implementation. Recheck these overrides when upgrading.

`prisma/schema.prisma` contains relational User/Session, Person, CareRelationship, Language, Interest, MedicalCondition, per-person/per-programme category joins, Assessment, Programme, Participation, SupportScheme, GrantApplication, Alert, AuditLog, ImportBatch/ImportRow and LoginAttempt models. Person is a shared person table with a server-validated Member or Care Recipient discriminator; each person is an independent record and the relationship table explicitly connects their IDs. This avoids duplicate person-field storage while retaining separate operational record types. Support enrolments and grant applications share the same structured dated application model. JSON is limited to source import metadata and audit changes. Foreign keys, uniqueness constraints and search/relationship indexes are included.

Business logic is in `src/lib/`; authenticated server endpoints are in `src/app/api/`; reusable forms/tables and individual page views are in `src/components/`. Migrations are versioned in `prisma/migrations/`. A future PostgreSQL move requires a provider-specific migration and data transfer, while service/query code and the relational design remain reusable.

## Backups and recovery

```powershell
npm.cmd run backup
```

The script uses SQLite's backup API and checks database integrity. Every backup has a timestamp and random suffix in `backups/`; it never intentionally reuses an existing filename. It works with a running SQLite database, though a quiet maintenance window is preferred. The script honours DATABASE_URL from the environment or `.env`.

For recovery, stop all application processes, preserve the current database as a separate file, and copy the chosen verified backup to `data/p3h.db`. Do not restore onto a running database. Run `npm.cmd run db:migrate` before restarting if application migrations have advanced. Regularly test restore procedures on a separate device or copy. Protect and encrypt backup folders just like the live database.

## Fictional demonstration records (optional)

Seeding is a separate explicit action, never normal startup:

```powershell
$env:ALLOW_FAKE_SEED = 'yes'
$env:DEMO_PASSWORD = Read-Host 'Choose a demo password of at least 12 characters'
npm.cmd run db:seed
Remove-Item Env:DEMO_PASSWORD
Remove-Item Env:ALLOW_FAKE_SEED
```

Sign in as `demo.admin` using the password you supplied. The seed uses visibly fictional records; it never reads the sample workbook. Do not seed a real operational database unless you intend to add demo records. Existing demo accounts are not silently reset.

## Verification

```powershell
npm.cmd run db:validate
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run test:persistence
npm.cmd audit
```

Unit tests cover date epochs and original serial preservation, languages, interests, medical/remark parsing, workbook validation, duplicates, matching weights/explanations, birthday windows, permissions and input validation. Integration tests exercise relational writes, audit, rollback, independent database connections, stale-write rejection and grant/birthday reminder idempotency. Playwright uses an isolated `data/e2e.db`, covering setup/login, preview/confirmation, persistence after refresh, profile editing, recipient creation/linking, programme creation/matching/participation, grants, alerts, search/filters, duplicate review/update, rollback, read-only server rejection, all main pages/reports, archive confirmations, invalid forms, desktop/tablet/mobile layout and browser errors. The separate persistence test completely stops and restarts the production server and checks both records and the session. The sample-workbook workflow uses a generated fictional workbook. The namespace compatibility workflow uses SYNTHETIC_WORKBOOK (default: Downloads/P3H_Synthetic_Test_Data.xlsx) and only previews it. Browser screenshots use fictional data. Test databases are local and git-ignored.

## Organisation-controlled local-network deployment

Complete first-run setup on the host's loopback address **before** permitting network access. Use one application process on an organisation-controlled host with a local SQLite disk (never a network/shared filesystem). Configure an organisation-controlled HTTPS reverse proxy, set `COOKIE_SECURE=true`, restrict incoming access to staff devices/subnet through the firewall and bind the Next process behind that proxy. For example, start directly with `npx.cmd next start --hostname 127.0.0.1 --port 3000` and have the proxy forward to it. Configure trusted host/origin forwarding consistently; mutation Origin must match the application origin. Test staff roles and backup restoration before opening access.

Set `APP_ORIGIN` to the exact internal HTTPS origin when using a reverse proxy, and `COOKIE_SECURE=true`. The hosting device must use operating-system disk encryption, appropriate folder/account access controls, controlled backups and organisational retention policies. SQLite itself is not encrypted by this application. All authenticated staff can view operational records; row-specific case assignment restrictions are not implemented. Avoid public hosting or placing the database/backups in cloud-sync folders. Do not use production personal data while running development tools or collecting diagnostics.

People lists use server pagination; the dashboard uses a minimal projection and scoped aggregate counts. Other profile/report workflows still use authorised snapshots and should be load-tested for a much larger caseload. Optional staff email digests run through an external scheduler even when nobody is signed in. There is no resident background timer. Real hosting availability, PostgreSQL migrations, provider acceptance and inbox delivery require deployment rehearsal. See docs/automatic-reminders.md for configuration and monitoring.


## Extract support from member notes

In **Grants & Referrals**, choose **Extract from member notes**. Review the suggested member, scheme, status and original source line; uncheck anything you do not want, then select **Confirm extraction**. No database writes occur during preview. Existing schemes for that member are skipped and never overwritten. Archived members are excluded and read-only accounts cannot preview or commit extraction. Changed notes require a fresh preview. New confirmed Excel imports also extract recognised support from reviewed member remarks; suggestions appear in import preview and the source text remains intact.

Recognised labels are `Receiving`, `Received` and `Completed`, with or without a colon. Supported names are HCG, SSS, PioneerDAS, Home Therapy, EASE, Financial assistance and South West. Unknown schemes, unlabelled mentions, negated and uncertain statements are left in notes for manual entry. Completed programme names are not automatically converted to support schemes. Receipt/completion does not imply an approval date or current eligibility. Conflicting statements use `Recorded in notes` for review. Dates and amounts stay unset; for example, `Received South West $250 and $1000` retains both amounts verbatim in the support record's source notes rather than inventing one combined award. All created support records have an audit entry. Edit a support record to add staff-confirmed details.
