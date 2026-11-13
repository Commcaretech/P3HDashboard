# Surveys & Outcomes: staff guide

## Import survey CSV files

1. Open **Surveys & Outcomes**, then **Import Surveys**. The dashboard also has an **Import Survey** shortcut.
2. Enter the correct **Import centre**. This is the centre responsible for these survey records. Centre permissions are checked by the server.
3. Choose one or several **Survey CSV files**. Use UTF-8 exports. Up to five files, 4 MB each, 8 MB combined and 5,000 submitted responses per import are supported. Larger exports can be split at complete CSV records, keeping the header in each file.
4. Check each file's source language/export: **English**, **Mandarin**, or **Malay / Tamil**. The last option describes the combined export; it does not guess an individual's language from damaged text.
5. Select **Preview surveys**. Review the submitted, eligible, consent-excluded, test-excluded, duplicate, conflict, incomplete and identity-review counts. Nothing is saved at this stage.
6. Review the preview rows and preliminary scores. Unknown answers and missing dates remain flagged. A declined/test row shows only its record number and exclusion reason.
7. Select **Confirm survey import**. Eligible records are stored securely even when nobody has identified the respondent. No caregiver is created, merged or overwritten by this import. Records go to **Needs Review**.

Re-uploading the same responses reports **Already imported** and does not make another copy. A changed response with the same source identity reports **Source conflict — original retained**. Review the existing survey and its original answers; use an authorised correction with a reason. An invalid CSV structure or unknown question template needs a corrected export before that file can be imported. Import files are validated together, and saves are transactional.

## Review unmatched surveys and link Member IDs

1. Open **Needs Review**. This includes **Unmatched Surveys and data review**. Use matching-status, phase, centre, language and date filters to narrow the list.
2. Select **Review identity**. Compare the original submitted name, birth-date text, date, language/export and centre.
3. Use **Find caregiver** to search by Member ID, name, existing alias, verified alias, contact number or a trustworthy birth date. Results are limited to permitted caregivers in the survey's centre.
4. Select the candidate and review the Member ID, contact details, available evidence and birth-date conflicts. A matching nickname or birth date is not proof of identity.
5. Complete the organisation's identity-verification process. Enter **Review notes / reason** and tick **I verified this identity using the organisation’s approved process**.
6. Optionally save the submitted name/initials as a verified alias, then select **Confirm & Link Survey**.

If several people could be the respondent, add review notes and select **Mark identity ambiguous**. Leave the response unlinked until identity can be established. An alias can belong to several caregivers; future imports still require confirmation.

Managers can open a linked survey, enter a reason, confirm unlinking and select **Unlink survey**. The response, original answers, previous Member ID and review history remain. A verified alias created solely from that mistaken survey is revoked, not deleted. Other independently verified aliases remain available for separate review.

## Correct survey information

Open **View survey**, add review notes and expand **Source answers and corrections**. Correct the phase, Singapore timestamp, verified birth date or an answer only against verified information, then select **Save survey corrections**. The system retains the originally submitted phase, date text, birth-date text and answers. Scores are recalculated, and corrections are audited. A stale save asks you to reload instead of overwriting another staff member's work.

The first survey is never automatically changed to Baseline. Unknown, missing or after-programme phases remain **Needs Review** until corrected. Two-digit birth years are never expanded to an assumed century.

## View a caregiver's results

Open the caregiver's profile and choose **Surveys & Outcomes**. Only staff-linked responses appear here. The table is chronological and paginated. Separate WHOQOL and six-item ZBI charts show this page of dated, compatible results; at least two different valid survey dates are needed for a trend. Scores without enough answers show **Incomplete**. Use the page controls to see earlier/later records.

The **Verified survey aliases** section supports multiple aliases. Staff can add a verified alias with notes; a manager can revoke a mistaken alias. The existing profile alias field is preserved.

## Understand the statistics

**Overview** and **Results & Trends** show eligible response counts, linked responses, unmatched identities, data warnings and unique linked caregivers. A response count can be larger than the caregiver count. Clicking the unmatched or warning controls opens the corresponding records.

P3H WHOQOL domain scores run from 0 to 100. Social Relations uses the P3H-requested two questions. These results are labelled **P3H WHOQOL Survey Score**, not standard WHOQOL-BREF. The six-item ZBI survey runs from 0 to 24 and is kept separate from the **Existing ZBI Assessment (0–88)**. No clinical categories are assigned.

The provisional policy requires every answer in a domain, and all six answers for a ZBI total. Missing, not-applicable and unknown answers are not replaced with zero. Each aggregate shows its valid sample size. Dated Baseline/Annual responses with confirmed identities and the current calculation version contribute to outcomes. Incomplete domains do not contribute to that domain's average. Other available domains may contribute with their own sample sizes.

Paired changes compare the same caregiver's one baseline with their latest annual response on a later Singapore date. Repeated baseline phases require review and are excluded from paired comparisons. Changes describe recorded responses; they do not establish that a programme caused improvement.

## Export outcomes

Admin and Manager accounts can use **Export outcomes** or **Extended export** from Survey Records or a caregiver's survey tab. Exports include all filtered, verified linked rows, not only the visible page, up to 10,000 rows. Narrow the filters for larger datasets. The requested format contains Name, Survey Date, Survey Phase, Physical, Psychological, Social Relations, Environment, Overall and ZBI. The extended format adds Member ID, centre, source language, match status, scoring version and quality warnings. Survey dates use the Singapore calendar date in ISO format.

Exports are recorded in the audit log. Treat downloaded files as sensitive organisational records and store them only in approved locations.

## Review application dates from remarks

On a caregiver's **Notes** tab, recognised application dates appear under **Application dates suggested from remarks**. Select **Review proposed application**, confirm the scheme and application date in the normal grant form, and save. The form calculates the routine follow-up. A detected date never silently replaces an existing application date; already tracked schemes direct you to the existing application.
