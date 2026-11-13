# Survey data protection review

This records implemented safeguards and decisions for the organisation to review. It is not a regulatory-compliance certification.

## Data and purpose

Eligible survey records retain submitted and cleaned names, original birth-date/date/phase text, parsed dates where unambiguous, original/effective answers, P3H WHOQOL domain scores, a separate six-item ZBI total, quality warnings and source metadata. The purpose is staff-reviewed survey management and descriptive outcomes reporting. No fake Member IDs, medical diagnoses or inferred legal names are generated.

Declined and test responses retain only record number, exclusion reason and batch totals. No declined/test identity, birth date or answers are stored. The uploaded CSV is processed in memory and is not retained by the application. The original file remains wherever the staff member chose it from; that location is subject to organisational handling policy.

## Access matrix

| Action                                                | Admin / Manager | Staff | Read Only |
| ----------------------------------------------------- | --------------- | ----- | --------- |
| Read permitted survey records and details             | Yes             | Yes   | Yes       |
| Preview and confirm imports                           | Yes             | Yes   | No        |
| Search identity candidates and confirm links          | Yes             | Yes   | No        |
| Correct phase, verified dates and answers with reason | Yes             | Yes   | No        |
| Add a verified alias                                  | Yes             | Yes   | No        |
| Unlink a mistaken identity                            | Yes             | No    | No        |
| Revoke a verified alias                               | Yes             | No    | No        |
| Export linked outcomes                                | Yes             | No    | No        |

All permissions apply server-side. Non-global users must have access to the survey's centre and to its linked caregiver. Identity candidates are additionally limited to caregivers in that survey centre. Exact Member IDs and verified aliases are evidence for review; manual confirmation remains mandatory. Unrecognised identities do not appear in caregiver history or caregiver-level statistics/exports. Staff must not work around centre restrictions by choosing an incorrect import centre.

## Technical controls

- Existing authenticated HTTP-only, same-site sessions and origin checks protect writes. Each endpoint authenticates, applies role/centre checks and returns private/no-store responses. Sensitive mutation transactions reload the actor's current permissions.
- Survey filters do not bypass centre restrictions. Candidate search and modified record URLs are tested. Sensitive export queries recheck current permissions and are audited. Exported text is guarded against spreadsheet formula injection.
- Source parsing and scoring run server-side on preview and confirmation. Source identifiers are hashed for deduplication; hashes are not used as caregiver identity. No data is sent to an AI/scoring service, the programme source or an analytics service.
- The existing memory-only private cache is scoped to the account/permission fingerprint. Logout, session expiry and permission changes clear protected workspace state. Survey files/results are not stored in localStorage or sessionStorage. Downloads are deliberate manager actions.
- Import audits store counts and minimal row dispositions. Link/unlink/ambiguity decisions retain actor, time, reason and the selected Member ID. Original answers and submitted metadata survive corrections. Stale/concurrent decisions cannot overwrite the same revision. Unlinking revokes an alias created solely by the mistaken survey while preserving the alias record and other independent verifications.
- The source package, tests and screenshots contain fictional records only. The supplied files are checked in memory with aggregate-only diagnostics. Operational databases, credentials, exports and backups must remain outside Git and publicly served directories.

## Deployment and retention decisions

Existing hosting, network, encrypted-storage, TLS, cookie, backup and scheduler controls remain the organisation's responsibility. Optional notification emails continue using the existing minimal reminder infrastructure; survey answers/scores are not added to emails.

Before operational use, P3H should approve the role matrix, the independent identity-confirmation process, the provisional all-items-per-domain policy, retention periods for eligible responses and audit records, download handling, and backup access/deletion schedules. No retention period or automatic deletion job is invented. No declined/test identity is retained while that policy is outstanding.

Rehearse upgrades on a restored, protected copy. The new migrations are additive for SQLite and PostgreSQL. Local test databases are disposable fictional fixtures; migration tests never point at an operational database. Do not use a reset, destructive schema push or seed as an upgrade strategy. Validate the hosted PostgreSQL connection/pooler, real staff roles and scheduled email service separately before staff rollout.
