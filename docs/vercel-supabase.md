# EDGE: private, single-user Vercel + Supabase setup

EDGE is a personal journal, not a SaaS. Keep the existing React/Vite `edge`,
Express `api-server`, Drizzle tables, financial logic, analytics and design.
Both services stay in one Vercel project through the root `vercel.json`.
Never merge to main, deploy Production, reset the database, or migrate owner IDs
without the user's explicit approval.

The current routine workflow is **Replit → GitHub `main` → Vercel Production**,
as requested by the owner. Work on `main` whenever practical; Preview deployments
and feature branches are not required for routine updates. See section 5.

## 1. Supabase Auth

Use the existing Supabase project. Do not initialize its tables again.

1. In Supabase **Authentication → Sign In / Providers**, enable email/password.
   Disable **Allow new users to sign up**, anonymous sign-ins, phone sign-ins,
   and unneeded social providers. Prefer disabling sign-ups before creating the
   account; an administrator can still create the one account.
2. In **Authentication → Users → Add user → Create new user**, create the
   owner's email/password account. Confirm the email through the intended
   verification flow or the dashboard's admin confirmation option.
   Never send the password through chat or commit it to source.
3. Copy the exact user **UUID** into `EDGE_AUTHORIZED_USER_ID` on the backend.
   Do not use an email address, a list, or a former identity-provider subject.
   Every other user receives 403 even if they have a valid Supabase session.
4. In **Project Settings → API Keys**, use the publishable key
   (`sb_publishable_…`), or the legacy **anon** key if needed. The application
   must NOT receive a Supabase secret key, service-role key or JWT signing secret.
5. In **Authentication → URL Configuration**, set the intended site URL and
   explicitly list only required Preview/Production origins. No wildcard
   production redirect URLs. This password-only app has no OAuth/callback flow.
6. Keep a short access-token lifetime, e.g. 15 minutes, and enable appropriate
   email/password protections and rate limits. Supabase manages passwords and
   refresh tokens. Logout clears this browser's session and query cache;
   already issued access JWTs expire according to the configured lifetime.

Keep the **Data API disabled**. Auth is a separate service and does not require
enabling database REST access. Keep SSL enforcement and the existing eight-table
RLS/revoked browser-role privileges. Do not add browser SQL policies.

## 2. Environment variables

Keep development separate from **Vercel Project → Settings → Environment
Variables → Production**. Preview scopes are needed only for separately requested
Preview work. Do not modify production secrets as part of routine updates or
silently copy them into development. Frontend build-time settings require a new build.

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Existing project's exact HTTPS origin, no trailing slash |
| `SUPABASE_PUBLISHABLE_KEY` | Backend public publishable/anon key |
| `EDGE_AUTHORIZED_USER_ID` | One authorized Supabase Auth UUID, server-only |
| `VITE_SUPABASE_URL` | Frontend project origin, matching backend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend public publishable/anon key |
| `DATABASE_URL` | Existing database runtime transaction pooler, port 6543 |
| `DATABASE_SSL_CA` | Existing verified CA certificate when required |
| `DATABASE_POOL_MAX` | Optional bounded pool size; Vercel defaults to 3 |

Keep `VITE_CLERK_*`, `CLERK_*`, `SESSION_SECRET` and any identity-provider proxy
settings unset. No service-role key is needed. Remove obsolete provider secrets
from Replit's Secrets tool as well as Vercel after reviewing the cutover.
Do not expose database credentials through `VITE_*`.
`MIGRATION_DATABASE_URL` stays a maintenance-only Session pooler (5432) variable,
never a Vercel deployment/build variable.

Missing or invalid Auth configuration returns 503 on private endpoints and a
setup screen in the frontend; it never opens an unprotected workspace.

## 3. Backend security

The browser sends its Supabase access token as `Authorization: Bearer …`.
Express asks the configured Supabase Auth service to verify its signature and
validity over verified HTTPS on **each private request** (`auth.getUser(token)`).
After successful verification it additionally enforces exact issuer, authenticated
audience/role, expiry, issued-at/not-before and subject consistency, then the
single authorized UUID. This supports asymmetric and legacy HS256 Supabase
projects without putting a signing secret in Express.

No provider outage, missing environment variable, forged token, client-supplied
owner ID or `demo=true` can grant access. `/api/healthz` is public and reveals
only health status. `/api/auth/session` and all `/api/edge/*` routes are protected.
Database relation ownership checks remain an additional boundary.

## 4. Preserve existing ownership — approval gate

No automatic migration, schema push, reset, seed or data cleanup occurs during
the authentication change. Existing trades keep their IDs, account references,
executions and confluence links.

Supabase UUIDs differ from old owner subjects. Old records will not appear under
the new account until the exact mapping is approved. Never map by matching email,
adopt every old owner, merge the synthetic test users into the real journal, or
use the old owner ID as an authentication bypass.

Before any owner migration:

1. Read-only inventory of each old owner's six owner-bearing tables, with counts,
   IDs and relation checks. Identify the real journal owner separately from
   synthetic Preview identities.
2. Verify the destination Auth UUID belongs to the intended account. Inspect
   existing destination data; never overwrite or silently merge it.
3. Take a protected full PostgreSQL backup outside Git and verify it can restore
   to a disposable database. Never print connection strings or data in logs.
4. Present the exact source → destination mapping, affected counts, backup and
   rollback plan to the user; obtain explicit approval before any writes.
5. In one transaction, update only approved owner columns while preserving all
   primary/foreign keys. Reject cross-owner relations or unexpected changes.
6. Verify counts, IDs, calculations and relations before committing, then test
   read/edit/persistence through the new identity. Keep the backup for rollback.

The existing initializer is only for a different, NEW EMPTY approved database.
It must not run against this already initialized project.

## 5. Direct-to-main Production workflow

Keep the root Services configuration: frontend `edge`, backend `api-server`,
same-origin `/api` rewrites, Node 24 and the frozen pnpm lockfile. Do not configure
an auth proxy, separate frontend/backend projects, or Replit hosting.

1. Preserve existing work, fetch remote branches and safely synchronize with
   `origin/main`. Use fast-forward synchronization where possible; never force-push.
2. Run the automated checks below, with database tests on a disposable local
   database, not Supabase or the existing Replit development database.
3. Review migrations. Before any Production database migration, explain the
   exact objects and data affected and obtain explicit approval. Check the live
   Drizzle journal first: do not reapply an already installed migration.
4. Commit the validated changes on `main` and push to GitHub when deployment is
   authorized. Let the existing Git integration deploy Vercel Production automatically.
5. Verify frontend assets, API health, private endpoint protection and the
   signed-in experience where an authorized session is available. Report any
   checks that could not be performed; do not claim persistence was tested without it.

Do not modify production secrets, reset the database or delete existing data.
Do not reinitialize Supabase or run migrations as a build/startup command.
Do not create synthetic data in real storage without separate approval.
If a Preview is exceptionally requested, keep its protection enabled and use
automation credentials only on its exact origin, never in global headers.

## 6. Automated verification

```sh
pnpm run typecheck
pnpm run build:production
pnpm --filter @workspace/db run test
pnpm --filter @workspace/db run validate:migrations
pnpm run check:deployment
```

The migration validator refuses remote/production endpoints and uses a disposable
database. If the workspace development database is remote, start a separate local
PostgreSQL cluster and override `DATABASE_URL` only for this command. Never weaken
its local/Docker evidence checks or point it at Supabase. Signed-in live browser
checks require the real configured owner; a passing local test is not a live session.

## Daily calendar reflections: additive migration

Daily reflections use the ninth table, `edge_day_notes`, introduced in
`lib/db/drizzle/0001_kind_terrax.sql`. The original eight tables and their data are
not altered. Notes are keyed by the authenticated owner and a calendar date;
they are independent of account, strategy and trade filters.

The owner-approved migration has been applied to the existing Supabase project.
Verified TLS, migration hashes, the new table and its restrictions all passed.
Before-and-after row fingerprints matched for all eight existing tables, and
the notes table remained empty at that verification. Database approval and
application publishing are separate operations; use the current workflow in section 5.

- **Do not run `initialize:external` on an existing Supabase project.**
- Applying migrations to Supabase and publishing the app require separate
  explicit approval. Approval of the table migration does not authorize an app
  deployment.
- Before an approved upgrade, verify the Session pooler target project and TLS,
  inspect the existing Drizzle journal, and confirm the first migration is
  already recorded and that `edge_day_notes` does not already exist.
- Run the Drizzle migrator against that verified `MIGRATION_DATABASE_URL`, using
  `databasePoolConfig(process.env, true)` (including the verified CA).
  Never use schema push, reset, the empty-database initializer, or migrations
  during Vercel builds.
- The new migration enables RLS and revokes `PUBLIC`, `anon`, and `authenticated`
  table privileges. The trusted Express connection remains the only data path;
  the API derives ownership from the verified session, never the request body.
- After applying, verify the ninth table, RLS, revoked privileges, migration
  journal, and unchanged existing table row counts. Validate saving/editing/
  removing notes on a disposable local database; real-storage fixtures need approval.

`validate:migrations` checks both fresh initialization and the additive upgrade
on a disposable local database, including preservation of an existing account.
No Supabase migration has been authorized merely by adding these files.

## Prop Firm Manager: approved additive migration applied

The local application now includes `/prop-manager` under Record. Its storage is
introduced by `lib/db/drizzle/0002_cultured_taskmaster.sql`, which creates **seven
new tables only**:

- `edge_prop_firms`
- `edge_prop_accounts`
- `edge_prop_balances`
- `edge_prop_challenges`
- `edge_prop_rules`
- `edge_prop_expenses`
- `edge_prop_payouts`

This brings a fully migrated database to 16 EDGE tables. The migration only
creates new tables, their indexes and foreign keys, enables their RLS, and revokes
direct `PUBLIC`, `anon` and `authenticated` access. It does not alter existing
journal tables, populate demo records, reset the database, copy data, or run at
startup/build time.

The owner explicitly approved this storage migration, and it was applied to the
intended Supabase project on 2026-11-24 using the certificate-verified Session
pooler on port 5432. Postchecks passed: 16 tables, all three matching migration
entries, seven empty new tables, 14 foreign keys, RLS enabled on each new table,
zero policies and no direct `PUBLIC`, `anon` or `authenticated` privileges.
Before/after counts and row-content fingerprints matched for all nine original
tables. No user data or synthetic fixtures were written. Provider-managed
backup/recovery availability could not be verified from the available access;
no backup was created or claimed.

The Replit API runtime uses a **different development database**, verified
read-only after this migration. It still has no prop-manager tables and therefore
continues to show "Storage not installed" for this feature. No development schema,
connection string or environment setting was changed. Do not silently point
development at Supabase or migrate its schema. Obtain separate approval if
development storage should also be enabled.

Storage approval was separate from deployment approval. The feature was later
pushed to `preview/prop-firm-manager` under the former Preview-first workflow.
The owner now requests the validated changes on `main` and automatic Vercel
Production deployment. No new storage migration is implied by that push.
Do not rerun the applied migration: first inspect the now-updated journal.

Procedure used for the approved Supabase activation:

1. Confirm the intended Supabase project using the existing Session pooler
   `MIGRATION_DATABASE_URL` on port 5432 and certificate-verified TLS with
   `databasePoolConfig(process.env, true)`. Do not change `DATABASE_URL`, print
   credentials, or weaken TLS verification.
2. Read the Drizzle journal and compare **all** recorded migration hashes and
   timestamps to the corresponding local migrations. Confirm that the first
   two migrations are present and the seven new tables do not exist. Stop on any
   unexpected schema or migration history; never use `initialize:external`,
   `push`, `push-force`, reset or seed against this existing database.
3. Check and report provider recovery/backup availability; do not claim a restore
   point when it cannot be verified. Record safe before counts and row-content
   fingerprints for the existing tables. These checks are not a database backup.
   This additive migration does not modify existing rows; any later destructive
   migration requires separate approval and confirmed recovery arrangements.
   Do not export real records into the repository.
4. After the owner explicitly approves this specific additive migration, use
   Drizzle's `migrate()` on one verified Session connection with an advisory lock
   held throughout. Only the pending reviewed migration should run. No production
   app deployment is implied by storage approval.
5. Verify all 16 tables, all three migration entries and hashes, all seven empty
   new tables, RLS, zero direct API-role privileges and unchanged existing-table
   counts/fingerprints. Do not create synthetic rows in real user storage unless
    separately approved for real-storage validation.
6. Deploy the application using the current direct-to-main workflow in section 5,
   independently of database migration approval.

### Financial and historical semantics

- Nominal allocations are not personal assets, withdrawable balances or net
  worth. Personal live journal balances are displayed separately.
- Reports operate on one selected currency, without assumed FX conversion.
  Date filters apply to cash flows, not historical reconstructions of allocation.
- Net cash profit is **net payouts actually received minus recorded expenses**,
  before personal income taxes. Requested/approved payouts are pending, not cash.
  A payout's processing fee is informational and already withheld from its net
  received amount; do not subtract it twice or duplicate it as an expense.
- Balance snapshots are append-only. A correction appends a new current balance
  with a correction note; it does not modify the original snapshot. Payouts never
  adjust balances automatically. Explicitly record the resulting balance if a
  firm deducted a payout.
- Balance minus starting balance is a balance-change estimate, not necessarily
  pure trading P&L: payouts, resets and adjustments may affect it. Linked journal
  performance remains the source for trading-only calculations.
- Account status, evaluation phase and payout status are separate. Completing a
  challenge freezes its recorded closing balance; create the next phase to
  preserve historical results. Account identity and old snapshots cannot be
  overwritten; archive accounts/firms rather than deleting them.
- Rules are user-entered and inactive until confirmed and effective. Only a
  confirmed static balance-loss rule supports a latest-snapshot loss-allowance
  estimate. This never certifies historical or live compliance. Daily, trailing,
  intraday, equity, trading restrictions and payout eligibility show
  **Not enough data** when manual snapshots cannot establish the result.
- Expense and payout history stays available when accounts fail, close or
  archive. Receipt uploads are intentionally not enabled yet; references can be
  recorded in notes.

`validate:migrations` uses an isolated disposable local PostgreSQL database to
check fresh initialization, reapplication safety, the additive prop-manager
upgrade preserving an existing account, RLS, and the API/financial test suite.
Never point this validator at Supabase.
