# Updated staff workspace

The existing Next.js, Prisma and Excel import architecture is retained. Records are never reseeded or reset during startup. Both database providers use the additive `202610120002_staff_workflows` migration.

## Daily work

Start with **Dashboard → Needs attention**. Alert dates are grouped into Overdue, Today, Next 7 Days and Next 30 Days. Open the action or person directly. Analytics use recorded data below the action area; interests and detailed operational analysis remain in Reports.

**My Work** uses case ownership and alert assignment. Edit a person's Overview and choose **Assigned staff / Case owner**. A pending alert without an explicit assignee also appears in its case owner's work. Birthday reminders inherit the person's assignee. Grant reminders inherit the grant's assignee. Managers and administrators can see workload counts within their permitted record scope.

Profiles show care relationships, case owner, next action, outstanding alerts, support and participation counts. Completeness weights language, interests and recipient conditions/mobility most heavily; it does not mean an assessment or care plan is complete.

## Alerts

Use All Alerts, My Alerts, Unassigned, High Priority, Overdue or Completed. Combine these with the Filters panel. Snooze offers Tomorrow, Next Week or a chosen future date. The original due date stays unchanged; `snoozedUntil` determines when the reminder appears. Refreshing generated alerts preserves snoozes and completed statuses. Completing, dismissing or reopening clears the snooze. Actions are audited.

## Programmes

Forms separate programme details, suitability, schedule/availability and notes. Structured categories support suggestions, removable chips and new categories. Frequency suggestions include Weekly, Fortnightly, Monthly, One-off and Custom; existing custom text remains supported.

Matching keeps the original 35/25/15/15/10 weights. Each matched category earns its category weight once, even with multiple matching conditions. Missing information earns zero. Recipient language is used when recorded; otherwise the member's recorded languages are used. Explicit incompatible mobility produces **Not Recommended**, a zero recommendation score, a reason and disabled registration from that recommendation. Unknown mobility does not imply incompatibility and earns zero mobility points. Confidence separately describes recorded matching information, not clinical certainty. All mobility levels can be entered as `All`; `Wheelchair friendly` recognises a recipient recorded as `Wheelchair`.

## Import review

After parsing, use All, Ready, Warnings, Errors, Duplicates, Existing or New. Ready means no parser errors; warnings still require staff review. Bulk actions change proposed decisions only. Select existing rows before applying an update decision. **Compare changed fields** retains the original Excel proposal and current value, offers Keep Current, Use Excel Value and Review Manually, and shows the reviewed value. Final confirmation is still required; the database transaction rolls back on failure.

Import history shows counts derived from persisted row decisions, including old batches. Errors count rows with review errors at confirmation, including skipped error rows. Failed transactions create no batch. Staff and managers see their own import history; administrators can inspect all batches. Uploaded workbook text remains in the existing raw import fields and is not copied into source or seeds.

Updating an existing member preserves their case owner. If the proposed centre is outside that owner's access, the import is rejected safely. Keep the current centre during review, or update the assignment before importing the centre change.

## Centre access

Admins retain access to all centres. Existing accounts retain their previous all-centre access after migration; administrators should review them in **Settings → Edit access**. New non-admin accounts default to Selected centres and require exact centre names or an explicit All centres choice. Multiple centres may be entered with commas.

Permissions are checked on authenticated reads and inside write transactions. They cover people, programmes, grants, alerts, relationships, participation, imports, support extraction and search. A recipient without a recorded centre is visible through a member in an allowed centre; a recipient with an explicit different centre remains restricted. A programme with no centre is shared for viewing; restricted staff must record an authorised centre when creating or editing programmes. Unlinked custom alerts for restricted users default to their own assignment. Scoped managers' audit history contains authorised entities; user-access administration remains admin-only. Newly confirmed imported care recipients inherit the member's centre.

## Tables, search and reports

Members and Care Recipients query `/api/people` with server pagination, sorting and combined filters (20, 50 or 100 rows). Their initial workspace response omits the full people/programme/grant collections. Other shared tables use local pagination and column sorting. Original workbook blobs are returned only for person profiles and the compatibility snapshot endpoint, not normal list/dashboard requests.

Global suggestions use authenticated `/api/search`, a 250 ms debounce, bounded results, and centre scopes. Use Arrow Up/Down, Enter and Escape. The full search page retains the original broader category/notes search. Filters collapse behind a button and active category filters can be removed individually. Reports combine centre, condition, programme, staff and recorded-date range filters; the range refers to when a person was created. No export service or notification integration has been added.

## Architecture and review decisions

- `lib/access.ts`: centre scopes and transaction-level record/assignment guards.
- `lib/matching.ts`: deterministic eligibility, scoring, reasons and confidence, re-exported from the original domain module for compatibility.
- `lib/workflow.ts`: effective alert dates, time groups and weighted profile completeness.
- `lib/import-review.ts`: testable review category and bulk-decision rules.
- `components/ui.tsx`: shared status badges, native modal, chips, action menu, skeleton and table controls.
- Focused APIs: people lists, search suggestions and import history. Existing `/api/data` remains available for compatibility and multi-record dashboard/profile/report workflows.

No additional external service, telemetry, remote asset or browser record storage was introduced. The previously authorised optional Render/Supabase deployment remains supported. The UI changes do not change the organisation's hosting choice.
