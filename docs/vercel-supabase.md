# EDGE: private, single-user Vercel + Supabase setup

EDGE is a personal journal, not a SaaS. Keep the existing React/Vite `edge`,
Express `api-server`, eight Drizzle tables, financial logic, analytics and design.
Both services stay in one Vercel project through the root `vercel.json`.
Never merge to main, deploy Production, reset the database, or migrate owner IDs
without the user's explicit approval.

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

Set the following separately in development and **Vercel Project → Settings →
Environment Variables → Preview**. Never silently copy Production settings
into development. Vercel's build-time frontend settings require a new build.

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

## 5. Vercel Preview and Production

Keep the root Services configuration: frontend `edge`, backend `api-server`,
same-origin `/api` rewrites, Node 24 and the frozen pnpm lockfile. Do not configure
an auth proxy, separate frontend/backend projects, or Replit hosting.

1. Add the new Preview-only variables above and remove obsolete Auth variables.
2. Push the feature branch and create a **Preview** deployment only; do not merge
   `main`. In the Vercel API this project uses explicit `target: "staging"` for
   Preview; verify the returned environment is `preview`. Never omit the target.
3. Leave Vercel Preview Authentication enabled. Use an exact-host automation
   bypass cookie/header only for authorized testing, never global headers.
4. Verify owner email/password login, refresh/re-login persistence, logout,
   wrong-password denial, other-user 403, expired/forged/wrong-project JWT 401,
   demo denial and trade/account/strategy/confluence ownership checks.
5. Complete any separately approved owner migration and verify existing data.

Only after passing Preview tests and explicit production approval: configure
separate Production environment scopes, the exact intended Auth identity/data
strategy and site/domain, review the PR, then merge to main or explicitly deploy
the reviewed commit as Production. Keep Preview isolated from real trading data.
Do not reinitialize the database or run migrations as a build command.

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
its local/Docker evidence checks or point it at Supabase. Live Supabase auth and
browser tests still require the real configured owner and Preview deployment.
