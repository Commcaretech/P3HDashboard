# Automatic reminders and email setup

## What works without an email provider

In-app birthday, review and expiry reminders remain available. Caregiver birthday tasks appear in the next 30 days. Email reminders are sent seven days before and on the birthday. February 29 is observed February 28 in non-leap years, preserving the previous policy. Care recipient birthdays are opt-in for their assigned staff account. Existing records are kept; duplicate people are never merged automatically. Completing the in-app birthday task does not cancel the scheduled birthday-day email. An existing application cannot be moved to a different person because its follow-up history belongs to the original case.

South West CDC applications use two calendar months, CHAS uses fourteen days, and HPC+, MOW, Counselling and SMF use seven days. Submission date takes priority over application date. Month ends clamp to the last valid day. Other schemes require staff to choose a date or a recurring interval. One-time follow-ups have no recurrence unless staff chooses one. Review tasks appear immediately even when due more than 30 days away; expiry reminders appear within 30 days of expiry. Weekly tasks retain one outstanding reminder until completed. Completing a follow-up schedules from the actual follow-up date; resolving stops review reminders, while independently recorded expiry reminders remain. Approval alone does not stop follow-ups. No existing review date or status is silently backfilled.

## Monthly check-ins (provisional, P3H approval pending)

A monthly check-in reminder is generated automatically for each active caregiver when they have not been contacted for at least 30 days. Last contact is the latest of a staff-recorded check-in and a completed grant follow-up. If neither exists, the caregiver's P3H onboarding date is used, or their record creation date when no onboarding date is recorded. The reminder is due 30 days after that date, is High priority once overdue, and there is only ever one outstanding check-in reminder per caregiver. Recording a check-in (from the caregiver's profile or by completing the reminder) stores the contact date, completes the outstanding reminder and restarts the 30-day clock; completing a grant follow-up also counts as contact. Inactive or archived caregivers never receive check-in reminders, and staff-dismissed reminders stay dismissed. Completing the reminder without recording contact is not possible: completing it records today as the contact date.

First-run note: on the first reconcile after this upgrade, long-standing cases with no recorded contact surface as overdue check-ins, because their baseline is the onboarding or creation date. That is intended — it shows which caregivers have gone longest without recorded contact — but staff should expect a large first batch on a long-running caseload and may record check-ins in bulk from caregiver profiles to clear it. The 30-day interval and the baseline above are provisional; P3H must approve them before operational use, in the same way as the provisional survey scoring policy.

## Administrator setup

1. First apply the upgrade migrations using [the migration and recovery guide](upgrade-migration.md). Restart the matching application build.
2. Open Settings. Use Edit account to enter each staff member's unique email address and enable Email notifications. Confirm their role, active status and centre permissions. Staff without email, inactive accounts, disabled preferences and people outside their permissions do not receive notifications. Optional care recipient birthday alerts are configured here too.
3. Arrange an organisation-approved transactional email account. The included adapter uses Resend over HTTPS. Verify a sending domain with that provider. Create a server-only API key. Do not paste credentials into caregiver records or chat.
4. Set these **server environment** values in the hosting dashboard, then restart/redeploy:

```text
EMAIL_ENABLED=true
RESEND_API_KEY=<provider-issued API key>
EMAIL_FROM=<verified sender address>
APP_ORIGIN=https://<your actual dashboard host>
NOTIFICATION_JOB_SECRET=<a new random secret of at least 32 characters>
COOKIE_SECURE=true
```

Generate a job secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it in the scheduler's protected secret storage and the server environment, never in Git or URLs. The setup token is a separate secret.

5. Sign in as an administrator, enable your own email notifications and click Send Test Email in Settings. It sends only to your own configured address, at most once per Singapore date. Check your inbox and the provider dashboard. **Accepted means the provider accepted the API request, not inbox delivery.** Failed attempts appear in Settings. Real sending stays disabled when credentials, an HTTPS APP_ORIGIN, verified sender configuration or EMAIL_ENABLED are absent.
6. Approve hosting/provider contracts, retention, access controls, HTTPS, data protection and backup arrangements before operational use. These safeguards alone do not establish PDPA compliance.

## Schedule the independent job

Use an external HTTPS scheduler or a separately provisioned cron job; the web server does not keep a background timer. The Vercel deployment already schedules it: `vercel.json` runs `GET /api/jobs/notifications` daily at `30 0 * * *` UTC, which is **8:30 AM Asia/Singapore**. Vercel Cron sends that request with `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is set, and the endpoint accepts either that or `NOTIFICATION_JOB_SECRET`, so set `CRON_SECRET` in Vercel to a new random secret of at least 32 characters (generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). The daily schedule fits the Hobby plan's cron limit. If the deployment ever moves off Vercel, configure an external scheduler instead:

- Method: POST
- URL: `https://<your actual dashboard host>/api/jobs/notifications`
- Header: `Authorization: Bearer <NOTIFICATION_JOB_SECRET>`
- Schedule: `30 0 * * *` in UTC, which is **8:30 AM Asia/Singapore**, every day.
- Retry failures after 5 minutes, up to two retries. Use a timeout allowing database reconciliation and the staff email volume. Monitor failed runs and missed daily runs.

A shell scheduler can run:

```sh
curl --fail-with-body --max-time 300 --request POST --header "Authorization: Bearer $NOTIFICATION_JOB_SECRET" "$APP_ORIGIN/api/jobs/notifications"
```

The scheduler must hold both variables securely. Do not log the Authorization header. A wrong/missing token returns 401. The endpoint reconciles reminders before identifying recipients and dispatching. It works without any logged-in staff. Disabled email configuration returns configured:false and generates in-app reminders. Provider failures return HTTP 503 for scheduler retries. Repeated invocations do not duplicate accepted daily digests.

Daily digests contain task counts and a sign-in-protected My Tasks link; they contain no names, health details, full birth dates or notes. Overdue items are grouped into the same daily digest. Assigned staff and centre access are rechecked immediately before dispatch. Test mode is provided only as an injectable mock sender in automated tests; production cannot switch to fake success through an environment variable.

## Delivery diagnostics and recovery

The database stores a unique key per staff/date/type, related reminder IDs, delivery status, provider ID, attempt count, last attempt, failure reason and a short dispatch lease. A conditional database claim prevents overlapping workers sending the same row. Requests use provider idempotency keys and a frozen payload. At most three attempts are allowed, at least a minute apart. Automatic retries stop after 23 hours so they cannot outlive the provider's 24-hour idempotency protection. Failed old rows need administrator review against provider logs before any deliberate resend. Never clear accepted rows to retry them.

References: [Resend send API](https://resend.com/docs/api-reference/emails/send-email) and [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys). If recipient email, permission or task eligibility changes during a retry, the original digest is cancelled rather than sent with stale access. It resumes with the next daily digest. Provider rate limits and actual inbox delivery must be rehearsed with your real account. No production provider account, credentials or scheduler has been provisioned by this upgrade.

For a local installation, use an always-on approved task runner that can reach the web server. A publicly scheduled service cannot reach 127.0.0.1 on your computer. Keep EMAIL_ENABLED=false until an approved HTTPS deployment and provider are configured. Monitor the scheduler independently; in-app reminders alone cannot prove a scheduled run took place.

## Dashboard definitions

Pending Grants/Referrals counts applications without an explicit resolution and without Rejected, Expired or Completed status. Receiving, Received and legacy imported status text remain visible until staff decide whether follow-up work is resolved. Overdue Follow-ups counts pending grant/referral review reminders using their effective snoozed date. Tasks Due Today includes all pending task types in the current staff view. Upcoming Birthdays shows active caregivers in the next 30 days, separate from care recipients. Resolved this month uses the recorded resolution date; it does not guess a completion date for legacy status-only records. A person may appear in multiple condition bars, so those bars should not be summed as a unique-person total.
