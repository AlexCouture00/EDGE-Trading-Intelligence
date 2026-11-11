# EDGE — Trading Intelligence

A personal swing-trading journal and confluence research platform.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- Use managed workflow `artifacts/edge: web` for the React frontend and `artifacts/api-server: API Server` for the backend.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run generate` — generate development migration SQL
- `pnpm --filter @workspace/api-server run test` — financial unit and database-backed service tests
- `pnpm --filter @workspace/api-server run seed:demo` — optional isolated read-only sample dataset
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Frontend: `artifacts/edge/src`, shared filters/mode/time formatting under `src/lib`
- API: `artifacts/api-server/src/routes/edge*`; calculations and trade service under `src/lib`
- Database: `lib/db/src/schema`; generated migrations: `lib/db/drizzle`
- API contract: `lib/api-spec/openapi.yaml`; run codegen after each contract change
- Full methodology, run instructions and scope: `README.md`

## Architecture decisions

- Preserve the starter React/Express/Drizzle architecture rather than replacing it with Next.js/Prisma.
- EDGE is a PRIVATE, SINGLE-USER personal trading journal, not a SaaS. Supabase Auth manages email/password sessions for one exact `EDGE_AUTHORIZED_USER_ID`. Browser API calls send the access token as a bearer; Express verifies it with Supabase Auth and rejects all other users. No public sign-up or demo access. Never rewrite existing owner IDs without backup and explicit user approval.
- Treat confluence definitions as research variables: archive/create a new record for a changed trading definition, rather than reinterpreting historical results under the same identifier.
- Retain financial amounts as decimal strings; number conversion is for plotting/display only.

## Product

Accounts and cash flows, draft/open/closed trade journaling and reviews, custom confluences, strategies, observed performance/confluence/risk/psychology analytics and calendar. See README for deliberately deferred roadmap work.

## User preferences

- This product is a personal trading performance laboratory, not a signal service or simple tracker. Confluence analytics are the central differentiator.
- Target discretionary swing traders taking approximately 2–3 trades weekly, primarily gold, forex and indices, with potential crypto perpetuals.
- Never present sample performance as actual results. Keep demo and private data separate.
- Build stable end-to-end milestones; do not attempt every advanced feature in one untested change.
- Do not deploy or perform destructive operations without permission.

## Gotchas

- The isolated demo dataset is read-only. Signed-in private workspaces start without sample trades.
- Different-currency accounts must never be silently aggregated.
- Initial monetary risk locks at entry; changing stops never redefines historical R.
- Generated schemas and hooks are regenerated, never hand-edited. Server schema barrel intentionally exports only validation schemas to avoid Orval path/query naming collisions.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
