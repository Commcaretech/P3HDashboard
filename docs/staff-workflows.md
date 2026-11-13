# Updated daily care-management workflows

- **Dashboard:** review My Tasks Today, overdue follow-ups, today's tasks and upcoming caregiver birthdays. Ordinary staff see their assigned tasks first; managers review permitted centre workload. Use the birthday centre/owner filters to narrow the next 30 days.
- **Add Caregiver:** open the form from Dashboard or Caregivers. Enter Member ID, name, date of birth, optional contact number, preferred language, centre and assigned staff. Less common fields remain available in Health, Languages & interests and Notes tabs. Save opens the new profile. Validation keeps entered values. Existing Member IDs are rejected as duplicates; use search and the import comparison tools before creating a possible duplicate.
- **Care Relationships:** open the caregiver profile, choose Care Relationships and link an existing care recipient and relationship. Both records remain separate.
- **Add Grant/Referral:** select a person and scheme, enter submission date or application date and review the calculated follow-up. South West CDC uses two calendar months, CHAS fourteen days, and HPC+, MOW, Counselling and SMF seven days. For another scheme select a frequency or one-time date. You can override Next review date and enter a reason. Choose a case owner and save.
- **Mark Follow-up Done:** available on Dashboard, My Tasks and Alerts. Enter the date the follow-up actually happened, outcome and optional notes. Review the next date. Choose Resolved only when no more follow-up is required. Approval alone may still need payout follow-up. Save immediately refreshes the task list.
- **Follow-up History:** open a caregiver profile to review completed actions and staff attribution. Grant rows also contain the history under their scheme details. Completion never deletes old reminders.
- **Reopen a resolved referral:** edit it under Grants & Referrals, change Follow-up resolution to Open, review the next date and save. Underlying imported statuses remain intact.
- **Snooze:** delays the reminder without changing its original due date. Editing its source date clears the old snooze; unrelated edits retain it.
- **Email reminders:** administrators set staff email, notification preferences and centre permissions in Settings. Missing email configuration is shown explicitly. In-app tasks remain usable. An accepted test email still needs an inbox check.

All existing programme matching, registration, Excel review/import, reports, search and audit pages retain their URLs. Existing data types still use Member and Care Recipient internally.

# Updated staff workspace

The existing Next.js, Prisma and Excel import architecture is retained. Records are never reseeded or reset during startup. Both database providers retain the earlier `202610120002_staff_workflows` migration and add `202610260001_follow_up_notifications`.

## Daily work

Start with **Dashboard → Needs attention**. Alert dates are grouped into Overdue, Today, Next 7 Days and Next 30 Days. Open the action or person directly. Analytics use recorded data below the action area; interests and detailed operational analysis remain in Reports.

**My Tasks** uses case ownership and alert assignment. Edit a person's Overview and choose **Assigned staff / Case owner**. A pending alert without an explicit assignee also appears in its case owner's work. Birthday reminders inherit the person's assignee. Grant reminders inherit the grant's assignee. Managers and administrators can see workload counts within their permitted record scope.

Profiles show care relationships, case owner, next action, outstanding alerts, support and participation counts. Completeness weights language, interests and recipient conditions/mobility most heavily; it does not mean an assessment or care plan is complete.

## Alerts

Use All Alerts, My Alerts, Unassigned, High Priority, Overdue or Completed. Combine these with the Filters panel. Snooze offers Tomorrow, Next Week or a chosen future date. The original due date stays unchanged; `snoozedUntil` determines when the reminder appears. Refreshing generated alerts preserves snoozes and completed statuses. Completing, dismissing or reopening clears the snooze. Actions are audited.

Birthday reminders show one current alert per person within the next 30 days, with the exact countdown (for example, `1 day away` or `today`). Refresh updates the same annual reminder rather than adding separate 30-day, 7-day and 1-day alerts. Its due date is the birthday. Older overlapping reminders are dismissed automatically; the closest existing reminder's completion or snooze is retained.

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

Global suggestions use authenticated `/api/search`, a 250 ms debounce, bounded results, and centre scopes. Use Arrow Up/Down, Enter and Escape. The full search page retains the original broader category/notes search. Filters collapse behind a button and active category filters can be removed individually. Reports combine centre, condition, programme, staff and recorded-date range filters; the range refers to when a person was created. The existing report functionality remains; optional staff reminder email setup is described in automatic-reminders.md.

## Architecture and review decisions

- `lib/access.ts`: centre scopes and transaction-level record/assignment guards.
- `lib/matching.ts`: deterministic eligibility, scoring, reasons and confidence, re-exported from the original domain module for compatibility.
- `lib/workflow.ts`: effective alert dates, time groups and weighted profile completeness.
- `lib/import-review.ts`: testable review category and bulk-decision rules.
- `components/ui.tsx`: shared status badges, native modal, chips, action menu, skeleton and table controls.
- Focused APIs: people lists, search suggestions and import history. Existing `/api/data` remains available for compatibility and multi-record dashboard/profile/report workflows.

No telemetry, remote asset or browser record storage is introduced. Optional configured staff reminder emails use an HTTPS provider. The previously authorised optional Render/Supabase deployment remains supported. The UI changes do not change the organisation's hosting choice.


## Surveys & Outcomes

Use the [survey staff guide](surveys-staff-guide.md) for multilingual CSV previews, unmatched identities, Member ID confirmation, verified aliases, caregiver history, provisional scoring and manager exports. Programme sync remains automatic for import and interest matching; the separate survey identity confirmation protects caregiver outcomes from incorrect nickname matches.
<<<<<<< HEAD


## Move to Trash and Restore

Admin and Manager accounts can remove individual main records from normal views using **Move to Trash**, then recover them through **Trash**. The preview explains related history before confirmation. See [Trash and Restore](trash-and-restore.md). Archive is retained as a separate status action.
=======
>>>>>>> 60d3afc9e4413702748b4ab0a3577b1dea7bece4
