# P3H Dashboard on Vercel and Neon

Use the `codex/p3h-dashboard-completion` branch (`9027b85` as checked locally) for the commands and schema below. That revision contains all 12 cloud migrations represented by the bundled Neon SQL. To use this guide as written, deploy the completion branch or a branch containing those migrations.

## Vercel project settings

Use the Next.js framework preset, the repository root, Node.js 24.x and the build command `npm run cloud:build`. If you set a custom install command, use `npm ci --include=dev` so the Prisma CLI is available. This generates the PostgreSQL Prisma client. Apply migrations from an operator terminal before deployment. Vercel runs the Next.js server through its platform.

`vercel.json` pins Serverless Functions to `sin1` (Singapore), next to the Neon database: the app makes many sequential database round-trips per imported row, and running the functions in the US (`iad1`) against a Singapore database made a 291-row import fail. On a Hobby plan Vercel ignores the `regions` setting and functions stay in `iad1`; large imports then rely on the import wizard saving rows in batches of 25 (`src/lib/import-chunks.ts`), each in its own transaction, with progress shown and a resume path if a batch fails.

Under **Settings > Environment Variables**, set these on **Production**. For previews use a separate Neon database or a schema-only branch with fictional records.

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Copy the pooled connection URI from Neon **Connect** for the intended database and role. The host contains `-pooler`. Keep the TLS options from Neon. |
| `APP_ORIGIN` | The exact production URL staff open, such as `https://your-project.vercel.app`. Omit the trailing slash. |
| `COOKIE_SECURE` | `true` |
| `SETUP_TOKEN` | On a fresh database only, a private random secret for creating the first administrator. Remove it after setup and redeploy. Existing staff accounts are restored with the database. |

Keep any existing enabled reminder or programme-feed settings when moving the application. A Supabase URL under `P3H_PROGRAMME_FEED_URL` refers to a separate feed service and stays in place if that integration is in use. Keep `NCSS_SURVEY_IMPORT_APPROVAL` unset until the organisation approves the new hosting arrangement for that workflow.

The Prisma schema reads `DATABASE_URL`. For migrations, set it to the direct Neon URI in your local operator terminal. The Vercel deployment uses the pooled URI. Keep credentials in the password manager and server environment, and avoid posting them in chat or committing them to Git.

Reference [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) and [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

## Move existing records from Supabase

1. Confirm which Supabase database the deployed dashboard currently uses. Create an empty Neon database in the approved region. Rehearse the procedure on a test destination.
2. During the final cutover, pause dashboard writes and any scheduled jobs that write to Supabase. Use a protected folder outside the repository for the backup. Verify you can connect to Supabase with its direct URI, or its **Session pooler** on port 5432 if the direct endpoint is unreachable. Use the **direct** URI for Neon. Use provider-issued PostgreSQL connection strings for the dump and restore. An application URI with Prisma-only options such as `connection_limit` can be rejected by PostgreSQL client tools.
3. From a trusted terminal with PostgreSQL client tools installed, supply the actual connection settings privately as process variables. The following commands assume the application's database is dedicated to P3H and stores its tables in `public`. If other apps share `public`, inventory the tables first and restrict the export to the P3H tables and Prisma ledger.

```powershell
if (!$env:P3H_SUPABASE_URL -or !$env:P3H_NEON_DIRECT_URL) {
  throw "Set both migration connection URIs in this terminal"
}
$backup = "p3h-supabase-$(Get-Date -Format yyyyMMdd-HHmmss)-$([guid]::NewGuid().ToString('N')).backup"
pg_dump --format=custom --schema=public --no-owner --no-acl --file=$backup --dbname=$env:P3H_SUPABASE_URL
if ($LASTEXITCODE -ne 0) { throw "Supabase backup failed" }

pg_restore --single-transaction --exit-on-error --no-owner --no-acl --dbname=$env:P3H_NEON_DIRECT_URL $backup
if ($LASTEXITCODE -ne 0) { throw "Neon restore failed" }
```

The restore brings across table definitions and records, including IDs, staff password hashes, and the `_prisma_migrations` ledger. Use the restored database directly for the next step. Keep the backup protected and use a fresh destination for any restore retry. [Neon PostgreSQL migration guide](https://neon.com/docs/import/migrate-from-postgres)

4. From the deployable source branch, install dependencies and apply any pending migrations to the restored Neon database. Supply the direct URI from the previous step in the current PowerShell session.

```powershell
npm.cmd ci --include=dev
$env:DATABASE_URL = $env:P3H_NEON_DIRECT_URL
npm.cmd run cloud:migrate
```

If a populated source has no Prisma migration ledger or Prisma reports divergent history, stop and reconcile its schema before attempting to baseline. Compare the source and target counts before applying pending migrations, then check key relationships and staff access afterward.

5. Set the pooled URI in Vercel, deploy, and open the exact URL in `APP_ORIGIN`. Sign in with an existing staff account and check a caregiver, its linked records, and a centre-restricted account. Resume scheduled jobs only against the selected live deployment. Keep the Supabase backup through the cutover. If staff have already written to Neon, reconcile those writes before rolling back.

## Start an empty database

The easiest path is `npm.cmd run cloud:migrate` with the direct Neon URI in local `DATABASE_URL`, from the completion branch. This applies the schema and records its exact migration history.

For the Neon SQL Editor, run the entire [fresh schema SQL](neon-fresh-schema.sql) once on an empty database. It creates the tables and constraints in one transaction. Register the 12 applied migrations with Prisma before running future deploys. Run the following from the completion branch with local `DATABASE_URL` pointing to the same direct Neon endpoint, using the exact revision whose SQL was bundled.

```powershell
Get-ChildItem prisma/cloud/migrations -Directory |
  Where-Object Name -LE '202611240001_ncss_matched_csv' |
  Sort-Object Name |
  ForEach-Object {
    npx.cmd --no-install prisma migrate resolve --schema prisma/cloud/schema.prisma --applied $_.Name
    if ($LASTEXITCODE -ne 0) { throw "Could not register migration $($_.Name)" }
  }
npx.cmd --no-install prisma migrate status --schema prisma/cloud/schema.prisma
```

The bundled SQL was tested against all 12 source migrations in isolated PostgreSQL. The live export, restore and deployment require the operator connections.
