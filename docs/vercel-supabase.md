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

### R-only journal

The personal journal accepts net results directly in R and shows R in its
tables, CSV exports, calendar, analytics and drawdown views. Dollar tracking
remains in Prop Firm Manager. Execution prices and quantities are optional for
new R-only trades; symbol, direction and entry/exit timestamps are still required
when applicable.

This uses the existing `realized_r` and free-text `pnl_source` columns; no schema
migration is required. New R-only trades have no monetary P&L or initial risk.
Historical monetary values and recorded executions are preserved when the owner
edits a trade's R. There is no bulk conversion or deletion. Unavailable historical
R is not counted as a zero-R result. Profit factor and win/loss statistics in
the journal use known R outcomes.

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

## General trading expenses: nullable firm relationship (pending approval)

The generated migration `0005_aberrant_nextwave.sql` contains exactly:

```sql
ALTER TABLE "edge_prop_expenses" ALTER COLUMN "firm_id" DROP NOT NULL;
```

This allows software, subscriptions and other general trading costs without
creating a fictitious prop firm. It preserves existing rows, foreign keys,
ownership, indexes, RLS and direct-access restrictions. There is no data backfill,
new table, cascade rule or automatic migration on startup/deployment.

Apply only after explicit approval, separately for development and Supabase.
Use the existing verified Session pooler migration connection for Supabase;
compare every recorded migration hash and timestamp first and allow only this
reviewed pending migration. Verify nullability, unchanged existing rows and
security restrictions afterwards. Do not reinitialize or reset either database.

Account deletion needs no schema migration. The API performs a single
owner-scoped transaction after exact account-name confirmation, removing only
that account's prop balances, challenges, rules, linked expenses and payouts,
then the prop account. Firms, firm-level/general expenses, journal accounts and
journal trades are not deleted. Archiving continues to preserve history.

The Challenges tab is hidden; existing challenge records are retained unless
their parent prop account is explicitly deleted.

## MFE tracking: additive migration

MFE is the manually recorded maximum favorable excursion in R while a trade
was open, not a price-based reconstruction or an observation after exit.
The form offers 0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 7 and 10R shortcuts and accepts exact
nonnegative decimal values. Unknown MFE is null, never inferred as zero.
Existing execution prices remain in storage even though the four price fields
are no longer presented in the logging form.

The owner approved this single additional column for both the existing
Supabase project and the separate Replit development database:

```sql
ALTER TABLE "edge_trades" ADD COLUMN "mfe_r" numeric(28, 8);
```

The generated fifth Drizzle migration contains only that statement. Run the
maintenance command `pnpm --filter @workspace/db run migrate:mfe` only after
approval, with `EDGE_CONFIRM_MFE_MIGRATION=add-mfe-column` and
`EXPECTED_SUPABASE_PROJECT_REF` set to the confirmed project reference.
It uses `MIGRATION_DATABASE_URL`, never the development connection as a fallback,
requires the Session pooler on port 5432 and verified TLS, validates all four
preceding migration hashes, and refuses any other pending schema change.
Afterwards it verifies five matching migrations, the nullable numeric type,
unchanged historical trade data, and unchanged RLS and access restrictions.
It logs only safe status and error categories; it never runs on build/startup.
The historical volatility-only command below intentionally refuses this newer
release and must not be used to apply MFE.

Development retains its separately approved schema: add only this column there.
Do not run the entire migration set against the older Replit development schema
or mark skipped migrations as applied.

Performance reports closed trades in the current owner/filter scope. MFE
averages, realized R averages and average gaps all use the identical subset
with both MFE and realized R recorded. Coverage counts remain explicit.
Breakdowns include regime, volatility, and their combined context.
Gap means MFE minus realized R; it is not an executable return or evidence
that a different exit rule would improve performance. Preserve negative
gaps if approximate manual observations understate realized R.

This database approval is separate from approval to publish the application.

Applied after the owner's explicit approval to both Supabase and the separate
development database. The Supabase command verified certificate-authorized TLS,
five matching migration entries, unchanged historical trade contents and unchanged
security restrictions on all 16 EDGE tables. The development postcheck confirmed
only the nullable numeric(28,8) field. No trade was assigned an MFE automatically.

## Market regime and volatility: approved additive migration applied

The journal offers **Trend Following**, **Counter Trend** and **Ranging** for new
market-regime selections, plus a separate optional **High**, **Medium** or **Low**
volatility selection. Existing regime values are preserved on their original
trades and remain visible in historical reports; they are not offered as choices
for new trades. Performance groups closed trades by each field using R metrics
and the current filters. Unassigned values appear as **Not recorded**.

The owner approved `0003_trade_volatility.sql`, containing only:

```sql
ALTER TABLE "edge_trades" ADD COLUMN "volatility" text;
```

The approved Supabase migration was applied using the certificate-verified
Session pooler. Verification confirmed the intended project, all four local
migration hashes/timestamps, the nullable text column with no default, unchanged
trade-row contents excluding the new field, and unchanged RLS and access
restrictions on all 16 EDGE tables. No trade was assigned a volatility value,
and no synthetic data was created. Prop Firm Manager was not changed.

The maintenance-only command is `pnpm --filter @workspace/db run migrate:volatility`.
It requires `EDGE_CONFIRM_VOLATILITY_MIGRATION=add-volatility-column` and
`EXPECTED_SUPABASE_PROJECT_REF` matching the intended project, and uses only
`MIGRATION_DATABASE_URL`, never `DATABASE_URL`. It refuses unexpected history,
unverified TLS, a non-Session target or any migration other than the reviewed
one-column addition. When the exact migration is already recorded, it verifies
the schema without applying it again. Never run it from a build or startup.

The owner separately approved adding the same optional column to Replit's
development database. Only that field was added there; no missing Prop Firm
Manager migrations were applied or falsely recorded as complete. Development
and Supabase remain separate. App publishing requires separate approval.

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
  worth. The journal shows trade-only performance, not account balances.
- Reports operate on one selected currency, without assumed FX conversion.
  Date filters apply to cash flows, not historical reconstructions of allocation.
- Net cash profit is **net payouts actually received minus recorded expenses**,
  before personal income taxes. Requested/approved payouts are pending, not cash.
  A payout's processing fee is informational and already withheld from its net
  received amount; do not subtract it twice or duplicate it as an expense.
- Balance snapshots are append-only. `recordedOn` is the observed calendar date;
  `createdAt` remains the server insertion timestamp. Old entries without
  `recordedOn` retain their original UTC insertion day, without a database backfill.
  Current balances, challenge closure and progress use balance-date order, with
  insertion time breaking same-day ties. Read-time previous/difference values are
  recalculated chronologically without updating stored snapshots. Charts use
  the last entry per day; the table retains all entries and insertion timestamps.
  A correction defaults to the corrected entry's balance date and appends a new
  snapshot with a correction note; it does not modify the original. Payouts never
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

### Trade-only journal

Workspace settings contain confluences and reporting preferences, not account or
cash-flow management. Logging a trade requires no account setup or starting
balance. A currency identifies the trade's denomination; reports include every
matching trade, including trades linked to archived historical accounts, without
combining currencies or assuming FX conversion.

Existing account records, cash flows and trade relationships are retained.
Creating a trade without an explicit legacy account ID automatically resolves an
owner-scoped internal record, creating one with zero starting capital if needed.
It does not choose an arbitrary legacy or prop-linked account for a new trade.
Entered-trade edits retain the original link and currency. A draft may change
currency. There is no schema migration, account deletion or historical rewrite.

Journal R curves start at zero for the selected trade scope. Drawdown is measured
against the running cumulative R peak. Initial capital, monetary results,
deposits, withdrawals and balance-relative risk are not displayed in the journal.
Prop Firm Manager remains the monetary balance-tracking module and keeps its
separate accounting rules.
Never point this validator at Supabase.
