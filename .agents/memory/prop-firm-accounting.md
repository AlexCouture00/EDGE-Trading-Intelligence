---
name: Prop firm accounting boundaries
description: User-required distinctions between allocations, snapshots, payouts, expenses and rule compliance.
---
Prop Firm Manager is part of the private personal journal. Nominal prop allocations are not personal assets, net worth or withdrawable funds. Keep personal live account balances separate, and never assume FX conversion when combining figures.

**Why:** The user explicitly required these financial distinctions in the confirmed feature documents.

Net realized prop cash profit uses only actually received net payouts less expenses, before personal income taxes. Pending payouts are separate. Snapshot balances and cash transactions are separate evidence: a payout must not automatically change a balance. Preserve history across failed, archived or completed accounts and challenge progression, except when the owner explicitly confirms permanent account deletion.

**Why:** The user explicitly required avoiding double counting and losing historical results.

The owner chose “Supprimer compte et historique lié” for the prop-account deletion option, not merely hiding accounts. Remove only the selected prop account and its linked prop history after explicit in-app confirmation. Keep journal trades, other accounts and expenses not linked to that account intact.

**Why:** The user explicitly chose permanent deletion after being warned that it changes financial statistics.

**How to apply:** Do not replace this with archiving. Adding the capability does not authorize deleting existing accounts during development or testing.

Rules must be customized and confirmed per account, not fetched or fabricated as active. When manual snapshots cannot establish daily, intraday, trailing, equity or other rule compliance, show "Not enough data"; reaching a target does not establish that an evaluation passed.

**Why:** The user explicitly required honest limits on rule calculations rather than invented compliance.

**How to apply:** Keep these distinctions in future analytics, account linking and imports. Any richer automation needs data that actually supports the relevant rule and must retain the original balance/cash histories.

The journal workspace should track trades, not account balances. Account and balance management belongs in Prop Firm Manager. Hide journal accounts while keeping existing account links internally; do not delete them to simplify the interface.

**Why:** The user wants only trade tracking in the journal and already tracks balances with Prop Firm Manager. They explicitly chose to hide accounts and preserve their trade history.

**How to apply:** Do not reintroduce journal-facing account setup or balance tracking when simplifying trade workflows. Preserve existing trade history and keep Prop Firm Manager separate.

The journal uses R-only trade entry and result displays. Dollar results belong only in Prop Firm Manager; retain historical monetary records internally rather than deleting or converting them.

**Why:** The user explicitly selected “R-only entry and displays” and asked to keep dollars in the prop firm tracker.

**How to apply:** Never fabricate monetary P&L or a nominal dollar risk to store an R result. Include directly entered R in journal analytics without requiring monetary results.
