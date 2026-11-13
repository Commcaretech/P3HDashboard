# Staff workspace performance and UI upgrade

## Why navigation interrupted work

The catch-all route rendered the complete application inside each page. Changing route replaced that application, including its sidebar, header and component state. Its authentication effect also depended on a section-specific data loader, so ordinary navigation repeated `/api/auth`. The route-level loading boundary filled the screen while this happened. Repeated task comparisons also constructed a new Singapore date formatter for every call; the shared formatter is now reused without caching the current date.

Most `/api/data` sections loaded every permitted person, grant, programme and audit row. A single profile or Settings therefore transferred nearly 2 MB in the fictional benchmark. The people list effect depended on the whole workspace data object. Every action also reconciled all generated reminders; completing a follow-up could reconcile twice.

## Implementation

- The authenticated application now lives in the root layout. Existing routes, deep links, browser history and search parameters remain supported. The initial visit checks authentication before mounting any protected content. Route loading is a compact status inside the persistent shell.
- Authentication and destination loading have independent effects. Destination requests use sequence guards; obsolete requests cannot publish another person's profile. Failed navigation retains the current usable page with Retry. Dynamic imports defer spreadsheet, chart and page code until needed. Chart links and global search use client navigation.
- A memory-only cache belongs to one workspace, account and permission fingerprint. Results expire after 45 seconds; at most 40 query results remain. Concurrent identical requests share one promise. Logout, session expiry and permission changes clear protected state and cancel account requests. Nothing stores caregiver datasets in localStorage or sessionStorage.
- Every new API authenticates and applies existing server-side centre scopes. Responses use `private, no-store`. Restoring a cached destination first checks current access using a small authenticated endpoint. Focus and a 30-second interval also check access. Revisits can reuse results for up to 45 seconds; already open pages do not receive other staff's edits automatically. Refresh current page explicitly reloads current data, and optimistic version checks reject conflicting saves. Local saves invalidate related page and resource caches.
- Dashboard responses contain summary counts, chart aggregates, up to 60 urgent tasks and their required labels, plus recent cases. Profiles load the selected person, permitted relationships, grants, reminders and history. Directory pages no longer load all profiles first.
- Grants, My Tasks, reports, audit history, birthdays and full search have dedicated endpoints. Browser tables use bounded pages. Report aggregation and dashboard counting stay on the server; some scoped summary calculations still scan lean projections, and programme matching still needs its permitted matching dataset. This is not a claim of constant-time queries for arbitrarily large databases.
- People search is debounced, paginated and stably sorted. Unrelated workspace objects no longer trigger refetches. Filter vocabularies include preferred languages and permitted linked recipient conditions. Contact links and relationship labels are visible in the directory.
- Person/grant mutations reconcile only their affected reminders. Full scheduled notification processing remains independent. A nonblocking authenticated POST checks a leased, database-backed daily checkpoint at sign-in, every 15 minutes while visible, and on focus (throttled to at most once a minute) and supplies in-app reminders if scheduled jobs are unavailable. It never sends email. Existing jobs, email delivery leases, follow-up history, duplicate prevention, snoozes and resolution logic remain in place.

## Staff interface

Shared navy/teal tokens, readable tables, focus indicators and consistent controls apply across Dashboard, My Tasks, Caregivers, Care Recipients, profiles, Grants & Referrals, Programmes, matching, Alerts, Reports, Import Data, Audit Log, Settings and search. The sidebar groups daily work and administration, supports collapse and becomes a keyboard-operable drawer on phones. The header retains global search, notifications, account settings and sign-out.

The dashboard leads with urgent counts, quick actions, direct follow-up completion and a separately filtered caregiver birthday list. Management charts are in an expandable section. Profiles prioritise identity, contact, ownership, relationships and quick actions, with completed follow-ups in a separate history view. Grant summary cards and task-period filters expose outstanding work. Caregiver and grant tables become labelled cards on phones. Existing optional fields, tabs, import review, programme reviews and interest suggestions remain available; omitted fields remain preserved on partial edits.

## Measurements

The repeatable `scripts/measure-workspace.mjs` creates a new, migrated fictional SQLite database for each run: 1,500 caregivers, 500 care recipients, 500 relationships, 500 grants and 100 manual alerts. It starts a production build locally, signs in with a generated disposable password, measures nine client navigations, takes three authenticated API samples per endpoint and saves one edited profile. It never opens the operational database. Daily fallback maintenance is checkpointed for the after benchmark so the warmed navigation comparison excludes once-daily global maintenance.

Before/after results are recorded in ignored `data/workspace-performance-before.json` and `data/workspace-performance-after.json`. API timings include response transfer and use the median of three samples; browser timings are single runs and include rendering and Playwright click overhead. After navigation additionally waits for lazy page content and local refresh indicators to finish. Local timings depend on machine load and do not establish hosted latency or capacity.

| Measure | Before | After |
|---|---:|---:|
| Initial authenticated dashboard | 2,709 ms | 1,209 ms |
| Profile edit save | 5,261 ms | 66 ms |
| `/api/auth` calls across nine navigations | 9 | 0 |
| Navigate to `members` | 546 ms | 262 ms |
| Navigate to `people/perf-0` | 317 ms | 127 ms |
| Navigate to `grants` | 256 ms | 122 ms |
| Navigate to `my-work` | 727 ms | 170 ms |
| Navigate to `dashboard` | 594 ms | 123 ms |
| Navigate to `reports` | 537 ms | 607 ms |
| Navigate to `settings` | 303 ms | 373 ms |
| Navigate to `dashboard` | 540 ms | 158 ms |
| Navigate to `members` | 432 ms | 138 ms |

| API, median of 3 | Before time / bytes | After time / bytes |
|---|---:|---:|
| `/api/data?section=dashboard` | 75 ms / 1,152,843 | 94 ms / 52,238 |
| `/api/data?section=members` | 21 ms / 37,218 | 12 ms / 272 |
| `/api/data?section=people&id=perf-0` | 183 ms / 1,952,109 | 28 ms / 2,943 |
| `/api/data?section=grants` | 195 ms / 1,952,109 | 12 ms / 272 |
| `/api/data?section=settings` | 187 ms / 1,952,109 | 13 ms / 306 |
| `/api/people?kind=Member&q=Fictional&size=20` | 33 ms / 24,946 | 39 ms / 27,126 |
| `/api/search?q=Fictional` | 9 ms / 1,625 | 17 ms / 1,643 |

The new grants page additionally requests `/api/grants?size=20`: 23 ms / 16,223 bytes. The 272-byte grants bootstrap is not the complete grants view. The new reports endpoint returned 93 ms / 310 bytes; tasks returned 21 ms / 11,878 bytes.

The after run made 12 `/api/data` requests, including 6 small permission checks: six page payloads rather than nine full loads. Cached returns still verify access. Core daily-work modules are included in the initial bundle after a first experiment exposed a cold-page chunk delay. Charts, reports and spreadsheet import code remain deferred.

Not every measurement improved: first Reports/Settings visits were modestly slower in this single run; lazy code, table rendering and click/scroll timing contribute. The dashboard API performed additional server aggregates and was 19 ms slower, while its payload fell by 95.5% and cached dashboard navigation improved substantially. Directory search now also includes linked recipient labels and preferred-language options, increasing payload slightly; its median was 39 ms versus 33 ms. Global search remained below 20 ms. These figures are a local diagnostic, not latency guarantees.

## Validation and limits

- TypeScript checking and ESLint passed.
- All 91 unit/integration tests passed, including cache deduplication, account/permission invalidation, bounded retention, targeted reminder reconciliation, daily fallback checkpointing, migration preservation, source imports, follow-up schedules and notification delivery deduplication.
- All 18 production-browser workflows passed with fictional records: add/edit/link, Excel import and reimport, grant schedules/completion/resolution, programme sync/review/suggestions, role/centre restrictions, reports, logout/login and concurrent-edit protection. New coverage asserts persistent sidebar/header DOM identity, zero navigation auth requests, slow and failed requests with recovery, session expiry, missing/deep-linked profiles, Back/Forward and clearing cached centre records after an administrator changes permissions.
- Responsive checks passed at 1440, 1280, 1024, 768, 390 and 375 pixels. Dashboard follow-up dialogs and expanded charts fit; caregiver/grant/report/settings pages have no page overflow. Mobile keyboard focus stays in the navigation drawer and returns to the toggle on Escape; reduced motion disables page animation. Fictional desktop/mobile screenshots were inspected.
- SQLite schema validation, PostgreSQL schema validation, SQLite production build and the PostgreSQL-client production build passed. The SQLite client was restored after cloud verification.
- The production-server restart persistence test passed. Operational records and sessions were never used as fixtures.

SQLite migration preservation checks apply the additive migrations to a restored fictional database copy and compare existing rows and columns, foreign keys and integrity. Test databases are disposable and separate from `data/p3h.db`. No operational records were reset or migrated as part of development.

Live PostgreSQL execution, the hosted scheduler, Microsoft Graph delivery/inbox receipt and physical mobile/tablet screen-reader behaviour still require deployment-environment checks. Browser responsiveness and keyboard checks are Chromium simulations, not a WCAG certification. Preserve the configured notification schedule; the in-app fallback supplements in-app reminders and does not replace scheduled email delivery.

## Setup and deployment

There are no new secrets or environment variables. Migration `202611040004_workspace_maintenance` adds only the coordination table in both SQLite and PostgreSQL; it does not change existing records. Keep the earlier programme migrations too.

For a local upgrade, stop the running app, create a verified backup, run `npm.cmd run db:generate`, `npm.cmd run db:migrate`, `npm.cmd run build`, then restart. Run migrations against the intended database; do not use reset or db push. For PostgreSQL use the existing `cloud:build` and `cloud:start` deployment flow; `cloud:start` deploys the cloud migrations. Check `/api/health`, sign-in, scoped navigation, one profile save, grant follow-up, birthday reminders and the scheduled job after deployment. No deployment was performed during this task.


## Surveys & Outcomes extension

The 2026-11-13 survey work retains this persistent shell and account-scoped memory cache. New paginated survey APIs, conditional requests and debounced candidate searches reuse it. The caregiver directory now loads a lean list and fetches the complete current profile before Edit. See [the survey report](surveys-outcomes.md#measured-local-workloads) for repeated 100/1,000/5,000-caregiver workloads, including recipients, grants and 200/2,000/10,000 survey responses. Directory payloads fell by 74.1%; not all API timings improved, and the report includes those regressions and measurement limits.
