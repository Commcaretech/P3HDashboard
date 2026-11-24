# Survey data protection review

This records implemented safeguards and decisions for the organisation to review. It is not a regulatory-compliance certification.

## Data and purpose

Eligible responses retain original/effective answers, dates, phases, P3H WHOQOL scores, a separate six-item ZBI total, warnings and source metadata. The restricted `SurveyIdentityStage` stores submitted and cleaned names, temporary corrections, birth-date information and new name correction history. Staff sign in to CaritaHub separately, validate the respondent and enter the verified Member ID. P3H looks up the exact ID among its existing caregiver records in the survey centre.

Declined and test responses retain only record number, exclusion reason and batch totals. No declined/test identity, birth date or answers are stored. The uploaded CSV is processed in memory and is not retained by the application. The original file remains wherever the staff member chose it from; that location is subject to organisational handling policy.

## Access matrix

| Action                                                | Admin / Manager | Staff | Read Only |
| ----------------------------------------------------- | --------------- | ----- | --------- |
| Read permitted survey outcomes by reference or Member ID | Yes          | Yes   | Yes       |
| Preview and confirm imports                           | Yes             | Yes   | No        |
| View staged names and check exact Member IDs          | Yes             | Yes   | No        |
| Record CaritaHub confirmation and link                | Yes             | Yes   | No        |
| Correct phase, verified dates and answers with reason | Yes             | Yes   | No        |
| Add a verified alias                                  | Yes             | Yes   | No        |
| Unlink a mistaken identity                            | Yes             | No    | No        |
| Revoke a verified alias                               | Yes             | No    | No        |
| Export linked outcomes                                | Yes             | No    | No        |

All permissions apply server-side. Non-global users must have access to the survey's centre and to its linked caregiver. The lookup returns Member ID, centre and status. Unmatched records stay in the review queue. The caregiver history and outcome exports use verified links. Existing per-caregiver alias management remains a separate, authorised workflow. Survey verification creates no aliases or caregiver profiles.

## Technical controls

- Existing authenticated HTTP-only, same-site sessions and origin checks protect writes. Each endpoint authenticates, applies role/centre checks and returns private/no-store responses. Sensitive mutation transactions reload the actor's current permissions.
- Survey filters respect centre restrictions. Lookup uses a request body, and report outputs contain Member IDs and scores. General audit responses omit survey change payloads, including legacy payloads with identifying information. The restricted review retains access to necessary history. Sensitive exports recheck permissions, protect cells against formula injection and log volume without copying filter text into the audit.
- Source parsing and scoring run server-side on preview and confirmation. Source identifiers are hashed for deduplication; hashes are not used as caregiver identity. No data is sent to an AI/scoring service, the programme source or an analytics service.
- Identity review and original survey details bypass the workspace cache. Names stay in the active review view. Session changes clear protected state. Uploaded CSVs and staged identifiers stay out of localStorage and sessionStorage. Downloads are deliberate manager actions.
- Import audits store counts and row dispositions. The restricted matching history keeps the relevant Member ID, actor, time, method and reason. Name corrections preserve the imported values and scores. Revision checks reject concurrent or stale decisions. Unlinking still revokes any legacy alias sourced solely from the mistaken survey.
- The source package, tests and screenshots contain fictional records only. The supplied files are checked in memory with aggregate-only diagnostics. Operational databases, credentials, exports and backups must remain outside Git and publicly served directories.

## Deployment and retention decisions

Existing hosting, network, encrypted-storage, TLS, cookie, backup and scheduler controls remain the organisation's responsibility. Optional notification emails continue using the existing minimal reminder infrastructure; survey answers/scores are not added to emails.

Configure deployment logs to omit survey request bodies and to redact search query values and record identifiers. Limit access to backups and verify restoration in the approved storage location.

Before production deployment, request the Data Protection Officer's approval of the purpose, role and centre access matrix, processing and storage locations, backup controls, and retention and disposal policy. Record separate rules for pending and rejected identities, linked responses, temporary name corrections and legacy audit details, downloaded reports, original source files and backups. Define when a linked survey's identifiers can be removed, when unmatched data can be disposed of, who authorises disposal and how it is recorded. Staged identifiers currently remain protected until P3H approves and implements those rules. Existing restricted legacy audit payloads remain available for reconciliation. Confirm the provisional all-items-per-domain scoring policy with the programme owner.

Rehearse upgrades on a restored, protected copy. The new migrations are additive for SQLite and PostgreSQL. Local test databases are disposable fictional fixtures; migration tests never point at an operational database. Do not use a reset, destructive schema push or seed as an upgrade strategy. Validate the hosted PostgreSQL connection/pooler, real staff roles and scheduled email service separately before staff rollout.
