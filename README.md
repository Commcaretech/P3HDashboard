# P3H local case management

An internal staff workspace for caregiver/member records, separate linked care recipients, Excel imports, programme matching, grants, reminders and caseload reporting. Personal data stays in a SQLite file on the hosting computer. No cloud database, analytics, AI service, remote fonts or external assets are used at runtime.

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

## Production on the local host

```powershell
npm.cmd run db:migrate
npm.cmd run build
npm.cmd start
```

Installation/build needs internet access to download dependencies. The running application works without internet. Both normal start commands bind to `127.0.0.1`. Keep the process running while staff use it.

## Import the supplied workbook

1. Sign in as Admin, Manager or Staff and open **Import Data**.
2. Select `Members (cth.user) (14).xlsx` from Downloads. The file is read locally by this application, not sent to an external service.
3. Review the column mapping; Member ID is required. The eleven sample headings map automatically.
4. Select **Parse and preview**. Review row counts, errors, warnings and duplicates.
5. Use **Review / correct** for each row. The editor includes member information, suggested care-recipient information, original cells and an existing-value comparison. Assessment ownership must be explicitly confirmed. Unknown assessment dates remain empty; recording timestamps are tracked separately. Creating a care recipient requires a staff-confirmed name or alias; an unidentified person is never fabricated.
6. Choose **Import**, **Skip**, or **Update existing**. Existing Member IDs default to Skip. Updates replace the reviewed import fields, including blank mapped fields. Existing non-imported health/profile fields and record status are retained, and an empty imported name retains the existing name. Original cells remain intact even when a column is not mapped. A Name column is optional for future workbooks. Review the comparison before updating.
7. Select **Confirm import** and confirm the selected record count. One database transaction saves the batch, records, category links and audit entries. A failure rolls back the whole batch.
8. Open **Members**, then the imported profile. **Notes → Original imported cells** preserves source text; **Health**, **Interests**, and **Overview** show structured information.

Only `.xlsx` is accepted; convert older `.xls` in Excel first. Limits: 10 MB compressed, 50 MB expanded, 10,000 data rows and 100 columns. The first worksheet is used. Invalid dates, repeated headers, duplicate IDs and encrypted/invalid archives are rejected or highlighted. Excel's 1900/1904 dates are supported; the fictitious 1900-02-29 is rejected. Text dates accept ISO YYYY-MM-DD and unambiguous DD/MM/YYYY or DD-MM-YYYY. Low-confidence remarks remain original text. No macros or formulas are executed.

## Staff workflows

- **Members / Care Recipients:** search, combine filters, sort the first table column and page through 20 results at a time. Create/edit forms separate overview, health, languages/interests and notes. Archive keeps the record; select Archived in the table filter to find it again. Active/Inactive status may be restored through editing.
- **Profiles:** link an existing care recipient under Care Relationships. A confirmed removal deletes only the relationship, retaining both people and the audit entry. Record programme participation, grants and reminders from their respective tabs.
- **Programmes:** maintain programme suitability, structured conditions/languages/interests, schedule, venue, capacity and registration state. Archive removes it from new matching recommendations. Register participation from a profile or matching result; closed/full programmes are rejected on the server.
- **Grants & Support:** create a scheme name or reuse an existing one. Maintain application/submission/approval/expiry/review dates, amount, staff assignment and notes. Editing a grant requires confirmation. Review and expiry reminders appear within 30 days, including overdue items.
- **Alerts:** manual reminders support case review, programme follow-up, grant follow-up and custom tasks. Complete, dismiss or reopen alerts. Generated reminders refresh on login/data/dashboard access and through Refresh Alerts; completed/dismissed reminders are not recreated by repeated refreshes.
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

Unit tests cover date epochs and original serial preservation, languages, interests, medical/remark parsing, workbook validation, duplicates, matching weights/explanations, birthday windows, permissions and input validation. Integration tests exercise relational writes, audit, rollback, independent database connections, stale-write rejection and grant/birthday reminder idempotency. Playwright uses an isolated `data/e2e.db`, covering setup/login, preview/confirmation, persistence after refresh, profile editing, recipient creation/linking, programme creation/matching/participation, grants, alerts, search/filters, duplicate review/update, rollback, read-only server rejection, all main pages/reports, archive confirmations, invalid forms, desktop/tablet/mobile layout and browser errors. The separate persistence test completely stops and restarts the production server and checks both records and the session. The supplied-workbook test reads the file named in SAMPLE_WORKBOOK (default: the supplied Downloads location) into the isolated database. Browser traces/screenshots are disabled for that sample test to avoid leaving personal data in test artifacts; layout screenshots use fictional data only. Test databases are local and git-ignored; `data/e2e.db` contains sample data after a run and should be removed after the test server stops.

## Organisation-controlled local-network deployment

Complete first-run setup on the host's loopback address **before** permitting network access. Use one application process on an organisation-controlled host with a local SQLite disk (never a network/shared filesystem). Configure an organisation-controlled HTTPS reverse proxy, set `COOKIE_SECURE=true`, restrict incoming access to staff devices/subnet through the firewall and bind the Next process behind that proxy. For example, start directly with `npx.cmd next start --hostname 127.0.0.1 --port 3000` and have the proxy forward to it. Configure trusted host/origin forwarding consistently; mutation Origin must match the application origin. Test staff roles and backup restoration before opening access.

Set `APP_ORIGIN` to the exact internal HTTPS origin when using a reverse proxy, and `COOKIE_SECURE=true`. The hosting device must use operating-system disk encryption, appropriate folder/account access controls, controlled backups and organisational retention policies. SQLite itself is not encrypted by this application. All authenticated staff can view operational records; row-specific case assignment restrictions are not implemented. Avoid public hosting or placing the database/backups in cloud-sync folders. Do not use production personal data while running development tools or collecting diagnostics.

This first version intentionally loads the operational dataset into each authenticated workspace and paginates rendered tables; for substantially larger caseloads, replace the snapshot endpoint with server-side query pagination and aggregated reports. SQLite is suitable for modest internal concurrency; evaluate PostgreSQL on an organisation-controlled server for heavier simultaneous use. No email, external staff-app notifications, AI matching/chatbot, cloud storage or continuous background scheduler is implemented. Alerts are refreshed when the application is used; they are not sent while it is closed.
