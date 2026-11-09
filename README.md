# EDGE — Trading Intelligence

A personal trading journal and confluence research platform for discretionary swing traders. This first release implements the foundation, essential journal workflows, and observed-performance analytics. It is not a broker, a signal service, or a guarantee of future profitability.

## Architecture

The existing pnpm monorepo is preserved rather than replaced with Next.js/Prisma:

- `artifacts/edge`: React, Vite, strict TypeScript, Tailwind and accessible UI components.
- `artifacts/api-server`: Express API, Clerk authentication, request validation, financial calculations and analytics.
- `lib/db`: PostgreSQL with Drizzle; numeric `(28,8)` amounts and UTC timestamps.
- `lib/api-spec/openapi.yaml`: API contract. Orval generates client hooks and server validation schemas.
- Clerk provides email/password sign-up, verification and sessions. No local password database or bespoke tokens.

All private queries and mutations are scoped to the authenticated Clerk subject. Database relation ownership is checked before trade creation/update. The isolated demo owner can be read through `demo=true`, but cannot be authenticated or modified through public routes.

## Run

Use the configured EDGE and API Server workflows for the browser preview. They supply the assigned `PORT` and `BASE_PATH` automatically; do not create a competing server.

For local maintenance in the Replit shell:

```sh
pnpm install
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run seed:demo  # optional, isolated example data
pnpm run typecheck
pnpm --filter @workspace/api-server run test
```

Required environment keys are listed without values in `.env.example`. Database and managed authentication credentials are supplied through the workspace secrets system. Never commit actual credentials.

For a conventional development environment, launch each application with its own `PORT`, use `/` as the web `BASE_PATH`, and use a reverse proxy exposing the API server on `/api` and the frontend on `/`. The app does not assume a particular public hostname. Its current deployment structure is a React static frontend plus Express service, not a Vercel serverless adapter.

## Schema

- **Accounts** belong to an authenticated subject and hold currency, immutable opening capital after activity, account type, broker and archive state.
- **Cash flows** belong to an account and owner. Deposits, withdrawals and positive adjustments are separate from trading results.
- **Trades** represent positions, not individual fills. They hold original monetary risk, broker/calculated P&L provenance, market context, psychology and review notes.
- **Executions** belong to a trade and support multiple entries and partial exits. Fees are stored per fill; summary commission is additional, not a duplicate of fill fees.
- **Confluences** are owner-managed. The trade/confluence join stores a historical name, description, category and color snapshot. Archiving never removes a historical link.
- **Strategies** hold entry, exit and risk rules. Archiving preserves assigned trades.
- **Settings** store a validated IANA timezone and preferred risk limit.

UUID primary keys, foreign keys and owner/date indexes are included. Only deleting a trade cascades to its own execution and confluence-link records. Catalog entities are archived, not deleted.

Drizzle-generated development migration SQL is committed under `lib/db/drizzle/`. Generate a migration after schema edits with `pnpm --filter @workspace/db run generate`. Apply additive development schema updates with `push`. Production schema changes use Replit's Publish flow; there is no startup-time migration script.

## Calculation methodology

- Monetary arithmetic uses Decimal.js; prices and money cross the API as decimal strings. Number conversion is reserved for chart plotting and display-only statistics.
- Net P&L = gross P&L − commission − per-execution fees − funding − separately entered slippage costs.
- Broker mode expects **gross P&L in the account base currency**. If broker figures are already net, do not enter the same costs again.
- Calculated mode is only for **linear, account-currency-settled instruments** with an explicit contract multiplier. Use broker mode for inverse contracts, unavailable conversion rates or uncertain specifications. Slippage already reflected in fill prices must not be entered again as a separate cost.
- Closed trades with multiple executions require matched quantities. Weighted entry/exit prices produce one position result, not one trade per partial exit. Intermediate realized P&L for still-open partially closed positions is not included in this release.
- Realized R = net P&L / original positive monetary risk. Original risk locks when a draft becomes entered, including an unavailable original risk; stop changes do not redefine it.
- Win rate = wins / (wins + losses). Breakevens are counted separately.
- Expectancy = mean realized R across eligible closed trades, including breakevens. Trades without valid original risk are excluded from R statistics and counted in warnings.
- Profit factor uses positive/negative **net** trade outcomes. With positive outcomes and no losses it is infinite; with neither it is unavailable.
- Drawdown uses chronological closed-trade outcomes and an explicit opening balance. External cash flows never become trading profit. The drawdown series is cash-flow-neutral; it is not intraday mark-to-market drawdown.
- Balance curves are realized balance, not live equity. Account-wide balance includes cash flows; filtered instrument/strategy curves are explicitly attribution curves, with cash flows excluded.
- Different currencies cannot be aggregated. Select one account when currencies differ; no exchange rates are invented.
- Analytics dates use exit timestamps for closed trades. Monthly aggregation uses the configured timezone.
- Exact confluence matching means identical sets; Contains All permits additional confluences. Rankings prioritize sample size and expose the minimum sample filter. Displayed association is not proof of causation or a repeatable statistical edge.
- Preserve the meaning of a confluence: rename for display corrections, but archive/create a new confluence when its underlying trading definition changes.

## Milestones and scope

1. **Foundation:** authentication, protected API, database schema/migration, professional app shell and isolated demo.
2. **Core journal:** accounts, cash flows, strategies, editable confluences, draft/open/closed logging, reviews, edit/delete, original-risk preservation.
3. **Core observed analytics:** overview, realized balance and R, basic performance/risk/psychology breakdowns and calendar.
4. **Confluence research:** individual, exact/contains-all combinations and confluence-count metrics with sample warnings.

Further roadmap work is deliberately separate: private screenshot uploads, a dedicated Setup entity with example media, saved weekly reviews, CSV import/mapping/duplicate detection, broker synchronization, full time-based breakdowns, cash-flow-adjusted return percentages, Monte Carlo, co-occurrence matrices, uncertainty estimates and advanced comparison workflows. Multiple executions are supported by the backend, but editing individual fills is not available in the browser form. There are no fabricated broker integrations or background market prices.

## Verification

`pnpm --filter @workspace/api-server run test` runs decimal/financial edge cases and database-backed trade-service tests. The service tests create unique synthetic owners, exercise ownership, original risk, draft transitions, historical associations, partial executions and deletion, and remove only those test records.

Private signed-in browser flows require a real user session and cannot be established by the unauthenticated screenshot capture. A successful typecheck/test run is not a claim of complete production certification or a completed advanced roadmap.

No automatic publishing is performed.
