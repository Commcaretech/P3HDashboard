# Surveys & Outcomes: staff guide

## Import survey CSV files

1. Open **Surveys & Outcomes**, then **Import Surveys**. The dashboard also has an **Import Survey** shortcut.
2. Enter the correct **Import centre**. This is the centre responsible for these survey records. Centre permissions are checked by the server.
3. Choose one or several **Survey CSV files**. Use UTF-8 exports. Up to five files, 4 MB each, 8 MB combined and 5,000 submitted responses per import are supported. Larger exports can be split at complete CSV records, keeping the header in each file.
4. Check each file's source language/export: **English**, **Mandarin**, or **Malay / Tamil**. The last option describes the combined export; it does not guess an individual's language from damaged text.
5. Select **Preview surveys**. Review the submitted, eligible, consent-excluded, test-excluded, duplicate, conflict, incomplete and identity-review counts. Nothing is saved at this stage.
6. Review the preview rows and preliminary scores. Unknown answers and missing dates remain flagged. A declined/test row shows only its record number and exclusion reason.
7. Select **Confirm survey import**. Eligible records go to **Identity Review**, including responses that staff still need to identify.

Re-uploading the same responses reports **Already imported** and does not make another copy. A changed response with the same source identity reports **Source conflict — original retained**. Review the existing survey and its original answers; use an authorised correction with a reason. An invalid CSV structure or unknown question template needs a corrected export before that file can be imported. Import files are validated together, and saves are transactional.

## Verify survey identities in CaritaHub

1. Open **Surveys & Outcomes → Identity Review**. The table shows the response reference, submitted name or initials, survey date, language and matching status. Use the filters to review **Unmatched**, **Needs Review**, **Corrected** or **Verified** records.
2. Choose **Review identity**. Search for the respondent in CaritaHub using your existing authorised account and follow the organisation's verification process.
3. Enter the verified Member ID exactly as it appears in CaritaHub. Choose **Check Member ID**. P3H shows the Member ID, centre and record status when it finds an existing caregiver in the survey centre.
4. Check the details, add a brief verification note and tick the CaritaHub confirmation. Choose **Confirm Match**. Include a case reference in notes when needed and keep names and contact details out of notes.
5. If the Member ID is missing from P3H or you cannot confirm the respondent, leave the survey unmatched or choose **Reject Match** with a reason. Use **Review unmatched surveys** to work through the current filters. **Confirm Match & Next** saves the current link and opens the next response. **Skip to Next Survey** leaves the current response in the queue.

Managers can use **Review identity → Unlink Survey** for a mistaken match. Use **View Matching History** for the previous Member ID, verification method, reviewer and date. To reassign, verify the correct Member ID in CaritaHub and repeat the confirmation.

## Correct a name for identity review

Open **Review identity → Correct Display Name** to save a temporary corrected spelling and an optional reason. **Reverse Name Correction** restores the original display. The original imported name and answers remain available in the restricted review. A correction keeps the linkage and scores intact. CaritaHub remains the authority for verifying full names and Member IDs.

## Correct survey information

Open **Review identity**, add review notes and expand **Source answers and corrections**. Correct the phase, Singapore timestamp, verified birth date or an answer only against verified information, then select **Save survey corrections**. The system retains the originally submitted phase, date text, birth-date text and answers. Scores are recalculated, and corrections are audited. If another staff member saved first, choose **Reload survey** to see the current record before editing again.

The first survey is never automatically changed to Baseline. Unknown, missing or after-programme phases remain **Needs Review** until corrected. Two-digit birth years are never expanded to an assumed century.

## View a caregiver's results

Choose **View Survey History** on a linked survey or open the caregiver's profile and choose **Surveys & Outcomes**. Only staff-linked responses appear here. The table is chronological and paginated. Separate WHOQOL and six-item ZBI charts show this page of dated, compatible results; at least two different valid survey dates are needed for a trend. Scores without enough answers show **Incomplete**. Use the page controls to see earlier/later records.

The **Verified survey aliases** section supports multiple aliases. Staff can add a verified alias with notes; a manager can revoke a mistaken alias. The existing profile alias field is preserved.

## Understand the statistics

**Overview** and **Results & Trends** show eligible response counts, linked responses, unmatched identities, data warnings and unique linked caregivers. A response count can be larger than the caregiver count. Clicking the unmatched or warning controls opens the corresponding records.

In **Data quality**, select a count to review ambiguous identities, invalid timestamps, incomplete WHOQOL domains or phases that need verification. Use **Review survey data warnings** for unknown answers and unverified birth dates. **Import History** lists duplicate counts by upload. On the main dashboard, survey coverage uses active caregivers as its denominator.

P3H WHOQOL domain scores run from 0 to 100. Social Relations uses the P3H-requested two questions. These results are labelled **P3H WHOQOL Survey Score**, not standard WHOQOL-BREF. The six-item ZBI survey runs from 0 to 24 and is kept separate from the **Existing ZBI Assessment (0–88)**. No clinical categories are assigned.

The provisional policy requires every answer in a domain, and all six answers for a ZBI total. Missing, not-applicable and unknown answers are not replaced with zero. Each aggregate shows its valid sample size. Dated Baseline/Annual responses with confirmed identities and the current calculation version contribute to outcomes. Incomplete domains do not contribute to that domain's average. Other available domains may contribute with their own sample sizes.

Paired changes compare the same caregiver's one baseline with their latest annual response on a later Singapore date. Repeated baseline phases require review and are excluded from paired comparisons. Changes describe recorded responses; they do not establish that a programme caused improvement.

## Export outcomes

Admin and Manager accounts can use **Export outcomes** or **Extended export** from Survey Records or a caregiver's survey tab. Exports include up to 10,000 filtered, verified linked rows. Narrow the filters for larger datasets. The format begins with Member ID, followed by Survey Date, Survey Phase, Physical, Psychological, Social Relations, Environment, Overall and ZBI. The extended format adds centre, source language, match status, scoring version and quality warnings. Survey dates use the Singapore calendar date in ISO format.

Exports are recorded in the audit log. Treat downloaded files as sensitive organisational records and store them only in approved locations.

## Review application dates from remarks

On a caregiver's **Notes** tab, recognised application dates appear under **Application dates suggested from remarks**. Select **Review proposed application**, confirm the scheme and application date in the normal grant form, and save. The form calculates the routine follow-up. A detected date never silently replaces an existing application date; already tracked schemes direct you to the existing application.
