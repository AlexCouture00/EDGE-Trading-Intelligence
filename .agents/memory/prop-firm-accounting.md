---
name: Prop firm accounting boundaries
description: User-required distinctions between allocations, snapshots, payouts, expenses and rule compliance.
---
Prop Firm Manager is part of the private personal journal. Nominal prop allocations are not personal assets, net worth or withdrawable funds. Keep personal live account balances separate, and never assume FX conversion when combining figures.

**Why:** The user explicitly required these financial distinctions in the confirmed feature documents.

Net realized prop cash profit uses only actually received net payouts less expenses, before personal income taxes. Pending payouts are separate. Snapshot balances and cash transactions are separate evidence: a payout must not automatically change a balance. Preserve history across failed, archived or completed accounts and challenge progression.

**Why:** The user explicitly required avoiding double counting and losing historical results.

Rules must be customized and confirmed per account, not fetched or fabricated as active. When manual snapshots cannot establish daily, intraday, trailing, equity or other rule compliance, show "Not enough data"; reaching a target does not establish that an evaluation passed.

**Why:** The user explicitly required honest limits on rule calculations rather than invented compliance.

**How to apply:** Keep these distinctions in future analytics, account linking and imports. Any richer automation needs data that actually supports the relevant rule and must retain the original balance/cash histories.
