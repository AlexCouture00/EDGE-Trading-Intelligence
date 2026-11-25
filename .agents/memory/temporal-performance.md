---
name: Temporal performance semantics
description: Why trading timing cohorts use entry time while date-range filters retain exit-time semantics.
---
Evaluate day-of-week, hour-of-day and day-by-session performance using the trade's entry instant in the journal's configured timezone. Keep the existing closed-trade date-range scope based on exit time and disclose the distinction.

**Why:** Timing analysis evaluates when the position was initiated, not when it happened to close. Changing the global filter basis for these breakdowns would make them disagree with the rest of Performance.

**How to apply:** Reuse the same filtered closed-trade population for all breakdowns. Never replace missing entry times with creation/exit dates or infer recorded trading sessions from clock hours. Missing R is not a breakeven, and confidence warnings should consider the recorded-R sample.
