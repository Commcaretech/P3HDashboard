# Trash and Restore

Admin and Manager accounts can move caregivers, care recipients, grants/referrals, programmes and survey responses to Trash within their permitted centres. Staff and Read Only accounts cannot move, view or restore Trash records. Shared programmes without a centre require global access. Normal Archive remains available separately.

## Remove a record from normal views

1. Open the record's actions and choose **Move to Trash**. Caregivers/recipients also have this button on their profile. Grant and survey rows have direct buttons; programme actions include the same control.
2. Check the selected record, centre and linked-history explanation. A reason is optional.
3. Tick **I confirm moving this record to Trash, while retaining its linked history**.
4. Choose **Confirm Move to Trash**. Cancel closes the preview without changing the record.

Trashed records are hidden from normal directories, search, matching, lists, statistics and exports. A trashed person's grants, surveys and reminders are also hidden. The care recipient or caregiver linked to that person is retained as an independent record. Moving a programme does not move its participants.

## Restore a record

1. Open **Trash** in the navigation.
2. Search by name or Member ID, or choose a record type.
3. Select **Restore**, review the record, tick **I confirm restoring this record**, then choose **Confirm Restore**.

The record returns with its existing status and retained information. An archived record remains archived; a closed grant remains closed. Restore the linked caregiver/care recipient before restoring a separately trashed grant or survey. Restoring a person does not restore records you separately moved to Trash.

Member IDs remain reserved while a person is in Trash. Restore the existing person instead of creating another person with the same ID. Original survey answers, calculated scores, identity links, aliases, relationships, participation and follow-up history are not erased. A deleted survey reimport is reported as **In Trash — restore the original record**, and does not create another response. Synced programmes remain in Trash when Sync Now updates their source information; restore uses the latest source information.

There is no permanent delete, bulk wipe or automatic emptying. Import and audit history are retained. Every move/restore records the actor, time and optional reason in the existing audit log. Concurrent changes ask you to reload the preview instead of overwriting a newer revision.

## Reminders and privacy

Trashed people and applications do not generate active reminders or appear in email digests. Generated pending reminders are automatically dismissed and can resume after restoration; existing completion history, notes and snooze dates are retained. Restoring an overdue application can make its retained follow-up visible again. Centre permissions and the actor's current role are rechecked server-side for every move or restore. Normal edit/import endpoints cannot restore a record implicitly.

## Upgrade

Migration `202611130002_record_trash` adds nullable `deletedAt` and `deletedBy` fields plus Trash lookup indexes to Person, Programme, GrantApplication and SurveyResponse, in both SQLite and PostgreSQL migration trees. Existing rows start outside Trash. No tables are dropped and no existing records are moved by the migration.

Deploy the complete application and migration history, including the preceding survey workspace migration. Rehearse on a protected restored copy before upgrading an operational database. Use the existing `db:generate`/`db:migrate`/`build` flow locally, or `cloud:build`/`cloud:start` for PostgreSQL. No new secrets or scheduler settings are required. Development tests do not migrate or delete operational records.

## Local validation

126 automated tests, 21 browser workflows, the restart-persistence check, lint, type checking and the production build passed. Both Prisma schemas validate; the PostgreSQL migration replay preserved 32 existing tables across all nine migrations in isolated PGlite. A live PostgreSQL connection, hosted deployment and operational database upgrade were not performed.
