# Upgrade migration and recovery

Do not run migrations on the operational database during development. The upgrade adds columns with safe defaults and new history/delivery tables; it does not rewrite existing identifiers, review dates, statuses or relationships. Both migration paths carry the same additions. Existing records are not automatically backfilled with guessed application dates.

Before deployment: stop writes, create and verify a backup, record row counts and foreign-key integrity, restore to an isolated database, apply migrations there, compare every original row and run the test suite. Schedule downtime and have an administrator review the results. Never use migrate reset or db push --accept-data-loss.

SQLite: `npm run backup` produces a uniquely named, integrity-checked snapshot in ignored backups/. Copy it to restricted encrypted storage away from this computer. To recover, stop the app, retain the failed database, restore the verified snapshot to data/p3h.db, remove obsolete WAL/SHM files only after all processes are stopped, and start the matching previous application revision. Rehearse recovery on a separate file first.

PostgreSQL: use `pg_dump --format=custom --file=p3h-backup.dump` with PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSFILE set by the administrator. Encrypt the dump and store it separately from the application host. Create an empty isolated database and run `pg_restore --no-owner --no-acl --dbname=<isolated-database> p3h-backup.dump`. Apply cloud migrations to this isolated database and compare counts and relations before deployment. Do not use --clean against operational databases. Restore checks and backup retention require an approved organisational policy.

Recovery is a database restore plus matching code revision, not a destructive down migration. Retain the pre-upgrade snapshot and new follow-up history separately if recovering after staff resumed work; reconcile later writes with the organisation before restoring an older snapshot. No live PostgreSQL backup or restore has been claimed by this repository.
