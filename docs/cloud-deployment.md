# Deploy P3H using Render Free and Supabase Free

This configuration runs the application on Render and retains its records in Supabase PostgreSQL. Your laptop needs only a browser. The local SQLite configuration remains available separately. The cloud database starts empty: this process does not copy your local records or passwords.

## 1. Put the prepared source on GitHub

A source-only package is provided at `artifacts/p3h-render-source.zip`. Extract it on your laptop and upload the extracted files and folders, not the ZIP itself. It excludes credentials, database files and spreadsheets.

Sign in to GitHub and use a **private** repository. If using the existing P3HDashboard repository, upload/commit the changes prepared in this workspace. If uploading through the website, use **Add file → Upload files** and preserve the folder structure. Include `src/`, `prisma/` (including `prisma/cloud/`), `scripts/`, `tests/`, `docs/`, `package.json`, `package-lock.json`, and the root configuration files such as `next.config.ts`, `tsconfig.json`, `next-env.d.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`, and `.env.cloud.example`.

Never upload `.env`, `node_modules/`, `.next/`, `data/`, `backups/`, test artifacts, real Excel workbooks, database files, or passwords. Render installs dependencies itself. Local source changes must reach GitHub before Render can use them; this guide does not publish them automatically.

## 2. Create Supabase

1. Open https://supabase.com/dashboard and sign in.
2. Create an organisation using its **Free** plan, then choose **New project**.
3. Use a name such as `p3h-dashboard`, select **Singapore** if offered, and generate a strong database password. A random password using letters and numbers is easiest to place in a URL. Keep it in a password manager.
4. Wait for project setup to finish.
5. In project **Settings → Data API** (sometimes under API settings), turn off **Enable Data API**. This application uses Prisma on its server, not Supabase browser APIs. Do this before deploying; tables are not intended to be exposed through the public Data API.
6. Click **Connect** near the top of the project. Choose **Session pooler** and the URI connection string, using port **5432**. Copy the actual host and username Supabase displays; do not invent them. Replace the password placeholder with your database password. Percent-encode reserved password characters if present.
7. Append `?sslmode=require&connection_limit=3` if the URL has no query string; otherwise append `&sslmode=require&connection_limit=3` without repeating existing options.

Example shape only, not usable credentials:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@YOUR_POOLER_HOST:5432/postgres?sslmode=require&connection_limit=3
```

Keep this connection string private. It goes only into Render's server environment. Do not send it in chat, put it on GitHub or use a `NEXT_PUBLIC_` variable. Supabase API keys are not needed. Staff accounts are created by the application, not in Supabase Auth.

References: [Supabase Prisma connection guide](https://supabase.com/docs/guides/database/prisma), [database connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 3. Create the Render website

1. Open https://dashboard.render.com and sign in using GitHub.
2. Choose **New → Web Service**, connect GitHub and select the private P3HDashboard repository. Grant access only to the repository needed.
3. Select the branch containing these deployment changes.
4. Set these values:

| Setting | Value |
| --- | --- |
| Name | `p3h-dashboard` or another available name |
| Region | Singapore |
| Runtime / Language | Node |
| Root Directory | Leave blank if `package.json` is at the repository root |
| Build Command | `npm ci --include=dev && npm run cloud:build` |
| Start Command | `npm run cloud:start` |
| Instance Type | Free |
| Health Check Path, if available | `/api/health` |

Do not use a Static Site. The application requires a running server. `cloud:build` generates the PostgreSQL Prisma client. `cloud:start` applies the dedicated PostgreSQL migrations, then listens on Render's assigned port on `0.0.0.0`. Startup never resets or seeds the database.

Reference: [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app).

## 4. Add Render environment variables

Before deploying, add these in the service's **Environment** section. Paste values without surrounding quotation marks.

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Your complete Supabase **Session pooler** connection string |
| `NODE_VERSION` | `24.19.0` |
| `COOKIE_SECURE` | `true` |
| `NEXT_TELEMETRY_DISABLED` | `1` |
| `SETUP_TOKEN` | A new random secret of 48–64 letters and numbers, saved privately |

The setup token is different from the database and staff passwords. Generate it using a password manager. It protects first-run administrator creation. Render automatically supplies `RENDER_EXTERNAL_URL`, which the application uses for its same-origin protection. You do not need `APP_ORIGIN` for the default Render domain. If later using a custom domain, set `APP_ORIGIN` to its exact HTTPS origin, without a trailing slash or path.

Keep free plans selected. Do not add paid storage or upgrade plans. Monitor usage quotas; $0 is subject to the providers' free-tier limits. If you want no overage charges, do not add a payment method where optional; the free service may be suspended when a limit is reached instead.

## 5. Deploy and create the administrator

1. Click **Deploy Web Service** and wait for the deployment to show **Live**. Watch Render's logs for build/start failures. Do not post full logs containing credentials.
2. Open the HTTPS `https://YOUR_SERVICE.onrender.com` URL displayed by Render. It must be the actual URL, not a guessed service name.
3. The first screen shows **Set up your workspace**. Enter your name, desired username, a new staff password of at least 12 characters, and the private setup token from step 4.
4. Select **Create administrator**. After setup, sign-in uses only username and password. There is no default login.
5. Remove `SETUP_TOKEN` from Render's environment and save/redeploy. Setup is already closed once a staff account exists; removing the token prevents keeping an unused secret. Remote setup without a token is denied.
6. In the application's **Settings**, add individual staff accounts with the appropriate roles. Share the app URL with staff; do not share hosting/database credentials.

If the first screen already shows a login rather than setup on an allegedly empty project, investigate existing accounts before uploading records.

## 6. Test, then import

Start with a workbook containing fictional data. Confirm preview before saving, duplicate warnings, profile editing, search, programme matching, alerts and read-only permissions. Refresh the browser and sign in from another browser to check persistence. Use Render's **Manual Deploy → Deploy latest commit** and verify fictional records remain after restarting/redeploying the website. The `/api/health` URL should show `{"status":"ok"}` once started.

When ready to use approved real data:

1. Sign in as Admin, Manager or Staff.
2. Choose **Import Data** and select your workbook in the browser.
3. Review the column mapping and parsed records. Correct issues and care-recipient suggestions.
4. Choose Import, Update existing or Skip for each row and confirm the final import.
5. Open **Members**, inspect the imported information, then refresh and check it remains.

In this hosted configuration, the workbook and personal records travel to Render and Supabase over HTTPS; they no longer stay only on your laptop. Source files and GitHub must not contain the workbook.

## 7. Backups and everyday use

Supabase Free has no included automatic backups. Before relying on the system for actual records, arrange regular full PostgreSQL exports and a restore check on a separate database. An authorised operator with PostgreSQL client tools can use `pg_dump` with the session connection and an encrypted backup location. Use unique timestamped filenames, keep connection credentials out of shell history/logs, and never restore over the only live database. Table CSV exports alone do not replace a complete relational backup. The application's `npm run backup` remains **SQLite-only** and is not a Supabase backup command. Render Free has no persistent backup disk or shell access, so do not plan to keep backups there.

The hosting preparation in this checkout has been checked locally. A live Supabase migration, Render deployment and hosted restore have not been tested without your accounts.

Render sleeps after 15 idle minutes, and the first visit can take about a minute. Supabase Free may pause after a week of inactivity; resume it in the Supabase dashboard if necessary. Alerts refresh when the application is used; no emails are sent and no continuous background worker runs. Use provider subdomains to avoid paying for a custom domain.

References: [Render free restrictions](https://render.com/docs/free), [Supabase free limits](https://supabase.com/pricing).

## Troubleshooting

| Message / symptom | Check |
| --- | --- |
| Missing `cloud:build` or `cloud:start` | The deployment changes have not reached the selected GitHub branch. |
| Prisma says provider is SQLite or migrations mismatch | Use the cloud commands above, not `db:migrate` or the SQLite migration directory. Use a new, empty project for initial deployment. |
| Cannot reach database / P1001 | Resume paused Supabase, check the Session pooler host and port 5432, and verify Render's environment value. |
| Authentication failed / P1000 | Check database password, the pooled username including project reference, and URL encoding. |
| Request origin is not permitted | Open the exact Render HTTPS address. Remove a stale `APP_ORIGIN`, or set it to your actual custom-domain origin. |
| Setup token is incorrect | Use the exact secret saved in Render, without quotes or spaces. |
| Cookie/login fails | Confirm HTTPS and `COOKIE_SECURE=true`. |
| Service unavailable on first visit | Allow the free service time to wake, then inspect logs or usage limits if it remains unavailable. |
| Migration fails | Do not reset the database. Capture the error code without credentials and resolve it before retrying. |

For future model changes, update both Prisma schemas and create a PostgreSQL migration in `prisma/cloud/migrations` as well as the local SQLite migration. Never run `prisma db push` or reset against the operational database as a deployment shortcut.
