# EDGE: Vercel Services + Supabase deployment

## Status and boundaries

The existing React/Vite, Express, Drizzle/PostgreSQL and Clerk application is
preserved. The interface, financial formulas, tables, columns and relationships
are unchanged. No Supabase SDK or Supabase Auth is used.

This is compatibility preparation, **not a completed production deployment**.
No Supabase project, external Clerk tenant or Vercel deployment was created.
No development credentials were replaced, no existing data was migrated, and
no demo data was copied. Do not merge or publish before review and preview tests.

## Audit

- Frontend: React 19 + Vite 7 at `artifacts/edge`, Wouter client routing.
- Backend: Express 5 at `artifacts/api-server`; default Express export is the
  Vercel entrypoint. The local listener remains available for Replit workflows.
- Database: PostgreSQL 16 in the Replit development environment; Drizzle and
  node-postgres. This database must remain intact. There is no Prisma client or
  Prisma migration step.
- Authentication: Replit-managed Clerk today. Keep this development instance
  and its secrets unchanged. Independent production hosting needs an
  independently controlled Clerk application; merely copying managed
  development keys is not an independent production setup.
- Sessions: Clerk browser cookies, not an Express memory session store.
  Browser API calls remain same-origin `/api/...`; no browser bearer-token
  workaround, cross-origin API domain or service binding is required.
- Storage/workers: no persistent application filesystem, uploads, cron job,
  WebSocket server or in-memory user database is required. Financial state is
  in PostgreSQL. Production logging goes to stdout, not a local file.
- Replit Vite diagnostics are development-only. Vercel needs neither
  `REPL_ID`, `REPLIT_DOMAINS`, `PORT` nor `BASE_PATH`.
- Existing `chore/vercel-services-setup` branch and draft PR were inspected
  before changes. Their three initial commits were preserved along with local
  development changes. No existing remote was changed and main was not merged
  into or overwritten.
- Git initially relied on this machine's global ignore for `.env`, while
  `.env.local` and `.env.production` were unprotected. Project ignore rules now
  cover them, database backups and generated artifacts, retaining `.env.example`.
  This is not a full historical secret scan.

## 1. Create Supabase (manual)

1. Create a new project in an account you control. Choose the region near your
   planned Vercel function region. Save the database password privately.
2. Use Supabase strictly as managed PostgreSQL. Do not enable frontend
   Supabase Auth or install its browser SDK.
3. **Disable the Data API** in project API settings before initialization.
   EDGE only uses trusted server-to-Postgres connections. The initializer also
   enables RLS with no browser policies and revokes public/anon/authenticated
   privileges on the eight EDGE tables.
4. In **Connect**, copy the **Transaction pooler** URL (port **6543**) for
   Vercel's runtime `DATABASE_URL`. Use the host and pooled username Supabase
   provides, not a hostname inferred from the region.
5. Separately copy the **Direct connection** URL (port **5432**) for schema
   initialization. If the machine running initialization is IPv4-only, use
   the **Session pooler** (5432) instead. Never use transaction mode for DDL.
6. Percent-encode special characters in the password. Put URLs in the relevant
   provider's secret settings, never in chat, source, Git or a command literal.
7. Enable SSL enforcement. Runtime and initializer require certificate
   verification. If the server certificate is not trusted by Node's standard
   CA store, download Supabase's root certificate and set `DATABASE_SSL_CA`
   to its PEM content (literal or escaped newlines). Single-line PEM is also
   normalized into standard wrapped PEM without changing certificate bytes.
   The configuration validates base64, X.509 parsing and CA status; malformed
   input fails with a fixed message that does not expose its contents. Do not set
   `rejectUnauthorized=false` or disable TLS.

### Pooling

The Vercel API reuses one module-level pg pool per warm instance. It defaults
to three connections, a 5-second idle timeout, 10-second connection timeout,
20-second statement timeout and 25-second client query timeout.
`attachDatabasePool` handles idle sockets before Fluid compute suspension.
The total across instances is not capped at three; monitor Supabase connection
limits and constrain Vercel concurrency/scaling accordingly. Adjust
`DATABASE_POOL_MAX` conservatively (1–20). The value 3 balances Fluid compute
concurrency against database capacity; it is not a throughput guarantee.

This app uses unnamed node-postgres parameterized queries. Do not add named
prepared statements or session-state dependencies to the transaction pooler.
Drizzle `.prepare(name)` must not be introduced on this connection.

## 2. Initialize a NEW EMPTY Supabase database (manual approval)

The existing versioned Drizzle baseline is reused, without demo or user seed.
An explicit initializer:

- requires a distinct `MIGRATION_DATABASE_URL` and confirmation;
- only accepts Supabase hostnames and a non-transaction-pooler connection;
- locks initialization and refuses an existing public table or migration journal;
- applies the unchanged Drizzle baseline, then Supabase access hardening;
- never reads from or writes to Replit's development `DATABASE_URL`.

On a trusted machine with Node 24 and pnpm 10.26.1, securely configure
`MIGRATION_DATABASE_URL`, and `DATABASE_SSL_CA` if needed. After inspecting
the target and explicitly approving initialization, run:

```sh
pnpm install --frozen-lockfile
EDGE_CONFIRM_EMPTY_DATABASE=initialize-new-supabase \
  pnpm --filter @workspace/db run initialize:external
```

This intentionally changes only the newly approved empty Supabase database.
Do not run it until ready. It is not a general existing-database upgrader.
Keep Data API disabled if hardening fails; inspect the new target rather than
dropping tables and retrying blindly. There is no auto-migration in Vercel.
The initializer rejects repeat runs; the underlying Drizzle migrator tracks
its migration journal normally.

Future changes: generate and review incremental Drizzle SQL, back up the
external database, approve the migration, then execute a separately reviewed
upgrade procedure against its direct/session connection. Never use
`drizzle-kit push-force` in production.

**Existing trading data:** remains in development. Copying it requires a
separate approved backup/restore and identity-mapping plan. No export is
committed to Git.

## 3. Configure Clerk (manual)

Keep Clerk; do not replace it with Supabase Auth.

The current tenant is Replit-managed. Its development/prod stores are separate,
and a managed tenant cannot simply be exported as your own external Clerk app.
Do not change the current Replit-managed keys or treat its Auth pane as an
external tenant's management interface.

For independent production:

1. Create an independently controlled Clerk application. Use its development
   instance for an isolated Vercel Preview first.
2. For live production, configure a domain you own and the Clerk production
   instance, DNS records/certificates, email verification and intended login
   methods. Configure your own OAuth credentials if offering social sign-in.
3. Set embedded paths to `/sign-in` and `/sign-up`; verify email/OAuth callback
   subpaths can load directly. Set post-auth destinations to `/` as appropriate.
4. Frontend and backend keys must belong to the **same Clerk instance**.
5. Configure exact allowed origins in `CLERK_AUTHORIZED_PARTIES` on Vercel:
   comma-separated HTTPS origins, no trailing slash, wildcard or path.
   For previews, include the actual preview/test origin and use separate
   non-production Clerk/database credentials. Do not broadly trust
   `*.vercel.app`. Rebuild/redeploy after changing environment variables.
6. Leave `VITE_CLERK_PROXY_URL` **unset** on Vercel. This setup uses the external
   Clerk Frontend API/DNS directly; the Replit-managed proxy is disabled when
   running on Vercel. `/api/__clerk` is therefore not a production auth endpoint.

Existing accounts and sessions do not automatically transfer to a new Clerk
instance. EDGE records are owned by the Clerk subject ID. A new registration
can have a different ID even with the same email. Do not auto-link by email or
rewrite owner IDs without an approved mapping and backup. Until this is resolved,
identity continuity for existing users is a production cutover blocker, not
something the code preparation silently fixes.

## 4. Vercel environment variables

Set values in **Vercel Project Settings → Environment Variables**, separately
for Preview and Production. Never expose database credentials through `VITE_*`.

| Name | Scope/purpose |
|---|---|
| `DATABASE_URL` | API runtime only: Supabase transaction pooler, 6543 |
| `DATABASE_SSL_CA` | Optional API TLS root certificate PEM |
| `DATABASE_POOL_MAX` | Optional API pool limit per warm instance, default 3 |
| `CLERK_SECRET_KEY` | API secret for the independent Clerk instance |
| `CLERK_PUBLISHABLE_KEY` | API publishable key from that same instance |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend build-time publishable key, same instance |
| `CLERK_AUTHORIZED_PARTIES` | Exact allowed HTTPS origins, API only |
| `LOG_LEVEL` | Optional API logging verbosity |

Vercel supplies `VERCEL`, `VERCEL_ENV` and the Node production environment.
Choose **Node.js 24.x**. `SESSION_SECRET` is unused by current Clerk sessions.
`MIGRATION_DATABASE_URL` and the initializer confirmation are maintenance-only,
not deployment/build secrets. `VITE_CLERK_PROXY_URL` must be unset, not a Replit URL.
No Supabase anon/service-role API key is needed.

## 5. Connect GitHub and Vercel Services (manual)

1. Review the changes on `chore/vercel-services-setup` and the existing draft PR.
   This work does not force-push, merge main, or automatically publish.
2. Push only the reviewed feature branch when ready. If Git reports divergence,
   fetch and reconcile normally; never force-push.
3. In Vercel, import `AlexCouture00/EDGE-Trading-Intelligence` through its GitHub
   integration. Select the **repository root**, not `artifacts/edge`.
4. Use the committed root `vercel.json` Services configuration. Services are a
   Vercel Beta feature: confirm availability/settings in your account.
   Do not replace it with separate-project or static-only configuration.
5. `edge` builds Vite and serves `dist/public`; filesystem routes take precedence
   over the SPA `/index.html` fallback. `api-server` uses Express at `src/app.ts`.
   Its request handler does not start a permanent HTTP listener on Vercel.
6. Ordered top-level rewrites send `/api` and `/api/*` to Express, preserving
   their prefix, and all other paths to `edge`. Mockup sandbox is not a service.
7. No service bindings are needed: browser requests already call the shared
   origin's `/api/...`. A runtime binding URL would not be available to a
   static Vite browser build anyway.
8. Configure isolated Preview secrets and test first. Vercel performs the two
   service builds independently with the frozen pnpm workspace lockfile.
9. Only after review, successful preview tests, and explicit approval, merge
   to main and allow the production deployment. Set main as Production Branch.
   Importing the repository can start a deployment, so do not perform that
   step until preview infrastructure and credentials are ready.

After connection, branch pushes/PRs trigger Preview builds; pushes/merges to
main trigger Production builds. Successful builds update the deployment.
Pushing code does **not** migrate data or run the schema initializer.
Database migrations remain a separate approved maintenance operation.

## 6. Available local verification

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build:production
pnpm --filter @workspace/db run test
pnpm --filter @workspace/db run validate:migrations
pnpm run check:deployment
```

`validate:migrations` only accepts a local PostgreSQL development endpoint.
It checks both node-postgres's effective target and the TCP peer (or a real
Unix socket), not just the server-reported address. In this repository's
GitHub-hosted `checks` job only, a PostgreSQL bridge address is accepted when
Docker inspection verifies the exact running `postgres:16` service ID, server
IP and published port, with the `edge_ci` test identity. A private IP or `CI`
flag alone is never sufficient. Vercel/production contexts are always refused.
Replit's database proxy is not a local TCP or Unix-socket endpoint, even if the
upstream database reports a Unix socket; use a disposable local PostgreSQL
instance or the GitHub-hosted checks rather than bypassing the guard.
It creates a unique temporary database, applies the baseline and hardening,
verifies all eight tables, six foreign keys, zero initial data, RLS, migration
journal/idempotency and refusal to overwrite an initialized database. It then
runs the API financial/ownership suite against that separate database and
drops **only that generated database**. Existing development rows are untouched.
Validation can require local database-creation permission.

Connection diagnostics show only transport/address classifications, numeric
ports, peer/server IPs and allowlisted context booleans. Failures include a
stage, stable safety reason or SQLSTATE, and a safe hint. Connection URLs,
usernames, passwords, SQL parameters, raw driver errors/stacks and raw Docker
inspection output are never logged. Cleanup errors are reported separately
so they cannot hide the original validation failure.

`check:deployment` checks routing selection, SPA fallback settings and built
assets; it is not a substitute for Vercel's cloud builder/runtime.
`pnpm run check:deployment --schema` additionally validates `vercel.json`
against Vercel's current public configuration schema (requires internet).
The upstream schema currently declares draft-04 while using numeric
`exclusiveMinimum`; the checker applies its draft-07 keyword semantics.

GitHub Actions in `.github/workflows/checks.yml` repeats these checks using a
disposable PostgreSQL 16 service, not Supabase production credentials. It does
not deploy. Configure branch protection to require this check before merging;
the workflow's first actual GitHub-hosted run still needs to pass after push.

## 7. Preview and production acceptance checklist (manual until infrastructure exists)

1. Open `/`, `/performance`, `/settings`, `/journal`, `/trades/new`,
   `/sign-in` and sign-up verification subpaths directly, then refresh.
   Verify JS, CSS and logo requests succeed without Replit domains.
2. `GET /api/healthz` should return JSON 200. An unsigned private request to
   `/api/edge/accounts` must return JSON 401, never the SPA HTML.
   Unknown `/api/...` paths must not fall back to the frontend.
3. Register a new account, complete email verification, sign out, and sign back
   in. Confirm an active same-origin session cookie allows private API calls.
4. Create a trading account and a closed trade with known fees/P&L/risk.
   Check journal, performance, confluences and account balance; reload and
   sign in again to confirm Supabase persistence.
5. Edit and delete only that synthetic test trade and verify analytics update.
6. With a second identity, verify lists exclude the first user's records and
   direct read/edit/delete IDs and cross-owner account/strategy/confluence
   associations are refused. Anonymous writes and demo writes must be refused.
7. Confirm the Supabase Data API is disabled, SSL is enforced, all eight tables
   have RLS enabled, and no frontend bundle contains secrets or database URLs.
8. Check Vercel logs for connection/certificate/authentication errors and
   Supabase connection counts. Ensure Preview cannot touch Production data.

Do not call the production application verified until these real hosted
registration, session, persistence, isolation and routing checks pass.

## Results from this preparation

- Full workspace TypeScript checks and maintenance-script checks passed.
- Frontend and API production builds passed without `PORT` or `BASE_PATH`.
  Vite reported non-blocking sourcemap-location and large-chunk warnings.
- Six pool-configuration unit tests passed.
- Thirty-three API/configuration/financial/ownership tests passed against the
  isolated migrated database, not existing trading records.
- Migration validation passed for table/foreign-key preservation, empty initial
  data, RLS, journal tracking, underlying migrator repeat safety and initializer
  refusal on an initialized target. The temporary database was removed.
- `vercel.json` passed the current official configuration schema validation,
  including Services routing, and local built-asset/routing checks passed.
- Frozen-lockfile dependency installation passed.
- Replit development frontend/API restarted successfully. Local HTTP checks
  confirmed health 200, private anonymous requests 401, public demo reads 200,
  demo writes 403 and unknown API paths 404 without SPA fallback.
- The Settings preview still rendered the existing premium interface.
- No hosted Vercel build, Supabase TLS/network test, external Clerk registration
  or returning-user session flow was performed; credentials/infrastructure are
  not configured. GitHub-hosted CI has not yet run.

## References

- https://vercel.com/kb/guide/vercel-services
- https://vercel.com/docs/services/config-reference
- https://vercel.com/docs/services/routing
- https://vercel.com/docs/frameworks/backend/express
- https://vercel.com/kb/guide/connection-pooling-with-functions
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/secure-data
- https://clerk.com/docs/guides/development/deployment/production
- https://docs.replit.com/features/auth-and-identity/clerk-auth
