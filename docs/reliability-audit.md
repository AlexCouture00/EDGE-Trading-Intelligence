# EDGE reliability audit

## Scope

Existing journal, financial calculations, confluence analytics and responsive KPI readability. No broker synchronization, AI, simulations, database replacement or publishing.

## Verification

### Authenticated browser journey

A new, isolated test identity signed in through Clerk's supported programmatic testing mechanism. This exercises authenticated application behavior, **not** public registration, password authentication or email verification.

- Created a USD account with opening balance 10,000 through first-run onboarding; verified it in Settings.
- Renamed and saved all ten default confluences.
- Created a strategy with saved rules.
- Created a closed XAUUSD trade with entry 2000, exit 2010, stop 1990, target 2020, size 1, multiplier 100, initial monetary risk 1000, broker gross 1000 and commission 10.
- Verified journal/detail/dashboard results: net 990, realized R 0.99 and win rate 100%.
- Edited exit to 2005 and gross to 500: persisted results after reload were net 490 and R 0.49. Journal, dashboard and both associated confluences reflected the edit.
- Deleted only the test trade through confirmation. Journal and analytics reset; Settings showed balance 10,000 and zero trading P&L.
- A direct PostgreSQL check confirmed zero remaining trade, execution or confluence-link rows for that deleted browser-test trade.
- At 1280px, authenticated overview KPI values were visible without clipping.

The exact intermediate account balance of 10,990 was not directly checked in the browser. The separate Settings account-creation dialog was not exercised; onboarding creation was.

### Automated verification

`pnpm --filter @workspace/api-server run test`: **30 passing checks**, including parent/subtest results. Tests use unique synthetic owners and clean up only their own records.

Coverage includes:

- Decimal fee arithmetic, signed funding rebates, linear long/short contracts and explicit multipliers.
- Locked original risk; unknown/zero risk excluded from R calculations.
- Breakeven treatment, expectancy as mean valid realized R, median, total R, profit factor and unavailable/infinite denominators.
- Chronological monetary/percentage drawdown.
- Deposits/withdrawals affect balances but not profit, R or cash-flow-neutral drawdown.
- Period opening balances, date boundaries and exclusion of events after the selected end date.
- Partial executions, weighted prices, fill fees and rejection of unbalanced/oversold exits.
- PostgreSQL-backed analytics: individual tags, exact versus contains-all sets, small-sample warnings, multi-instrument totals and rejection of mixed-currency aggregation.
- Persisted edits and deletion recalculation; execution and confluence-link cascades.
- Cross-owner trade/account/confluence access refusal.

Full workspace TypeScript checks passed. Frontend TypeScript checks also passed after the final cache correction. API and frontend workflows restarted successfully.

Desktop performance at 1280px and mobile overview at 390px were visually checked.

## Bugs found and fixed

1. **Date filters rejected URL dates.** With date types enabled, generated query schemas expected Date objects rather than HTTP strings. Query date coercion is now configured at generation time and regenerated. Tests also preserve millisecond boundaries and reject reversed ranges.
2. **Fractional weighted execution prices could alter P&L.** Linear execution P&L now uses full-precision entry/exit notionals, rounding only the final result, rather than multiplying rounded weighted summary prices.
3. **Untagged exact-match curves could include cash flows.** An explicitly empty confluence selection is now correctly treated as filtered performance attribution.
4. **Desktop KPI values were truncated in eight narrow columns.** Shared KPI grids adapt to available width; metric values, labels and supporting text wrap rather than disappear behind ellipses. The combination panel follows the same sizing rule.
5. **Tiny-sample caution could disappear when the display minimum was lowered.** Lowering the combination display threshold no longer removes warnings below twenty trades.
6. **Successful edits briefly displayed old detail values.** The mutation response now replaces the detail cache before navigation and cancels older detail requests. Related data is invalidated for recalculation. This final fix was typechecked and inspected, but the browser edit journey was not repeated afterward.

During live code generation/restarts the tester saw a transient development-only provider error; reloading after updates restored the app. It was not reproduced in the settled app.

## Database and authentication status

- PostgreSQL persistence, owner scoping, recalculation and deletion cascades passed automated checks.
- The isolated authenticated browser journey passed using supported Clerk testing sign-in.
- Public signup, real password sign-in, email verification, password recovery and production authentication remain **unverified**. No credentials were requested and no authentication bypass was added.
- No production database changes or publication occurred.
- Synthetic account/catalog records remain in the isolated test identity; the browser-test trade was deleted. Existing user and demo records were not modified by the audit tests.

## Calculation limitations retained explicitly

- These are realized balance curves, not live mark-to-market equity.
- Open positions, including partially exited open positions, do not contribute realized performance until the whole journal trade closes.
- The API supports multiple executions, but there is no individual-fill editor.
- Calculated P&L supports linear contracts settled in account currency; broker-reported P&L is required for unsupported conversion/inverse-contract cases.
- Multiple account currencies are never silently added together or converted.
- Win rate excludes breakeven trades. R expectancy includes breakeven trades with known positive initial risk.
- Small-sample observations do not establish causality or statistical superiority.

## Recommended next milestone

Complete the real-user authentication acceptance pass (registration, email verification, password sign-in, sign-out/sign-in persistence and two-user isolation), then improve the existing partial-exit workflow with a transparent execution editor. Keep advanced features deferred until those daily-use paths are verified.
