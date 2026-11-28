import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";
import {
  db, pool, accounts, trades, propFirms, propAccounts, propBalances, propChallenges,
  propRules, propExpenses, propPayouts,
} from "@workspace/db";
import { GetPropManagerResponse } from "@workspace/api-zod";
import { accountSnapshot, challengeProgress, evaluateRule, portfolioReport, sumMoney, subtractMoney, type Portfolio } from "@workspace/prop-math";
import router from "../routes/edge-prop-manager";
import { AuthFailure, privateSessionMiddleware } from "./private-auth";

test("prop manager persists history and enforces private ownership for every relationship", async t => {
  const ownerA = `prop-test-${randomUUID()}`, ownerB = `prop-test-${randomUUID()}`;
  const app = express();
  app.use(express.json());
  app.use(privateSessionMiddleware(async auth => {
    if (auth === "Bearer a") return { id: ownerA };
    if (auth === "Bearer b") return { id: ownerB };
    throw new AuthFailure(401, "Unauthorized");
  }));
  app.use(router);
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err instanceof ZodError ? 400 : err.status ?? 500).json({ error: err.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const addr = server.address(); assert.ok(addr && typeof addr !== "string");
  const request = (path = "", method = "GET", data?: unknown, token = "a") =>
    fetch(`http://127.0.0.1:${addr.port}/prop-manager${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const create = async (kind: string, data: unknown, token = "a") => {
    const r = await request(`/${kind}`, "POST", data, token);
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json() as { id: string }).id;
  };
  const load = async (token = "a") => {
    const r = await request("", "GET", undefined, token); assert.equal(r.status, 200);
    return GetPropManagerResponse.parse(await r.json());
  };
  const firm = { name: "Synthetic firm", website: "", marketType: "Futures", platform: "Test platform", notes: "", status: "active" };
  const account = (firmId: string) => ({
    firmId, name: "Synthetic evaluation", reference: "", marketType: "Futures", platform: "",
    currency: "USD", nominalSize: "100000", startingBalance: "100000", purchasedOn: "2026-11-01",
    status: "evaluation", phase: "Phase 1", journalAccountId: null, notes: "",
  });
  let firmA = "", firmB = "", accountA = "", accountB = "";
  const balance = (accountId: string, value = "100100.10") => ({ accountId, balance: value, equity: null, note: "Synthetic balance" });
  const expense = (firmId: string, accountId: string | null) => ({ firmId, accountId, category: "challenge_purchase", amount: "100.10", currency: "USD", date: "2026-11-01", notes: "" });
  const payout = (accountId: string) => ({ accountId, grossProfit: null, profitSplit: "90", requestedAmount: "1000", netReceived: "0", currency: "USD", requestedOn: "2026-11-02", paidOn: null, status: "requested", processingFee: "10", notes: "" });
  const rule = (accountId: string) => ({ accountId, name: "Confirmed static balance loss", category: "risk", value: "5000", unit: "amount", method: "static_balance_loss", explanation: "Synthetic rule, not a firm's verified policy", effectiveDate: "2026-11-01", sourceUrl: "", verifiedOn: null, notes: "", confirmed: true });
  const challenge = (accountId: string) => ({ accountId, name: "Synthetic phase", structure: "two_step", phase: "Phase 1", startingBalance: "100000", profitTarget: "1000", maximumLoss: "5000", dailyLoss: null, minimumDays: 5, completedDays: 2, startDate: "2026-11-01", expiresOn: null, status: "active", notes: "" });
  try {
    await t.test("anonymous requests cannot read or mutate any resource", async () => {
      assert.equal((await request("", "GET", undefined, "")).status, 401);
      for (const kind of ["firms", "accounts", "balances", "challenges", "rules", "expenses", "payouts"]) {
        assert.equal((await request(`/${kind}`, "POST", {}, "")).status, 401);
        assert.equal((await request(`/${kind}/${randomUUID()}`, "PUT", {}, "")).status, 401);
        assert.equal((await request(`/${kind}/${randomUUID()}`, "DELETE", undefined, "")).status, 401);
      }
    });
    await t.test("create custom firms and accounts without journal side effects", async () => {
      firmA = await create("firms", firm); firmB = await create("firms", firm, "b");
      accountA = await create("accounts", account(firmA)); accountB = await create("accounts", account(firmB), "b");
      const p = await load(); assert.equal(p.firms.length, 1); assert.equal(p.accounts.length, 1);
      assert.equal((await db.select().from(accounts).where(eq(accounts.ownerId, ownerA))).length, 0);
      assert.equal("ownerId" in p.accounts[0]!, false);
    });
    await t.test("cross-user references and writes are rejected for every resource", async () => {
      for (const [kind, data] of [
        ["accounts", account(firmA)], ["balances", balance(accountA)], ["challenges", challenge(accountA)],
        ["rules", rule(accountA)], ["expenses", expense(firmA, accountA)], ["payouts", payout(accountA)],
      ] as const) assert.equal((await request(`/${kind}`, "POST", data, "b")).status, 404, kind);
      for (const [kind, data] of [
        ["firms", firm], ["accounts", account(firmA)], ["balances", balance(accountA)],
        ["challenges", challenge(accountA)], ["rules", rule(accountA)],
        ["expenses", expense(firmA, accountA)], ["payouts", payout(accountA)],
      ] as const) {
        const id = kind === "firms" ? firmA : kind === "accounts" ? accountA : await create(kind, data);
        const before = await load();
        // Balances are globally append-only, so 409 is also an appropriate denial.
        assert.ok([404, 409].includes((await request(`/${kind}/${id}`, "PUT", data, "b")).status));
        assert.equal((await request(`/${kind}/${id}`, "DELETE", undefined, "b")).status, 404);
        assert.deepEqual(await load(), before);
      }
      assert.equal((await request("/accounts", "POST", { ...account(firmB), journalAccountId: accountA }, "b")).status, 404);
    });
    await t.test("strict inputs reject forged ownership, invalid dates, unsafe URLs and currency mismatches", async () => {
      assert.equal((await request("/firms", "POST", { ...firm, ownerId: ownerB })).status, 400);
      assert.equal((await request("/firms", "POST", { ...firm, website: "javascript:alert(1)" })).status, 400);
      assert.equal((await request("/firms", "POST", { ...firm, name: " " })).status, 400);
      assert.equal((await request("/accounts", "POST", { ...account(firmA), purchasedOn: "2026-02-30" })).status, 400);
      assert.equal((await request("/expenses", "POST", { ...expense(firmA, accountA), amount: "-1" })).status, 400);
      assert.equal((await request("/expenses", "POST", expense(firmA, accountB))).status, 404);
      assert.equal((await request("/payouts", "POST", { ...payout(accountA), currency: "CAD" })).status, 400);
      assert.equal((await request("/payouts", "POST", { ...payout(accountA), status: "paid" })).status, 400);
      assert.equal((await request("/payouts", "POST", { ...payout(accountA), netReceived: "10" })).status, 400);
    });
    await t.test("concurrent balance snapshots preserve exact previous balance and history", async () => {
      await Promise.all([create("balances", balance(accountA, "100200.20")), create("balances", balance(accountA, "100300.30"))]);
      const p = await load(), s = accountSnapshot(p, accountA);
      assert.equal(s.balances.length, 3);
      assert.equal(s.balances[0]!.previousBalance, "100000");
      for (let i = 1; i < s.balances.length; i++) {
        assert.equal(s.balances[i]!.previousBalance, s.balances[i - 1]!.balance);
        assert.ok(s.balances[i]!.createdAt > s.balances[i - 1]!.createdAt);
      }
      assert.equal(sumMoney(s.balances.map(x => x.difference)), subtractMoney(s.balance, "100000"));
      assert.equal((await request(`/balances/${s.balances[0]!.id}`, "DELETE")).status, 409);
      // Derived differences can have one more digit than an input amount.
      await create("balances", balance(accountB, "-9999999999999999.99999999"), "b");
      const other = await load("b");
      assert.equal(other.balances[0]!.difference, "-10000000000099999.99999999");
    });
    await t.test("backdated balances persist in date order without changing current balance or existing stored rows", async () => {
      const before = await load(), current = accountSnapshot(before, accountA);
      const storedBefore = await db.select().from(propBalances).where(eq(propBalances.accountId, accountA));
      const id = await create("balances", { ...balance(accountA, "100150.15"), recordedOn: "2026-11-02" });
      const after = await load(), s = accountSnapshot(after, accountA);
      assert.equal(s.balance, current.balance);
      assert.equal(s.balances[0].id, id);
      assert.equal(s.balances[0].recordedOn, "2026-11-02");
      assert.equal(s.balances[1].previousBalance, "100150.15");
      assert.equal(after.balances.find(b => b.id === id)!.recordedOn, "2026-11-02");
      assert.equal(sumMoney(s.balances.map(b => b.difference)), subtractMoney(s.balance, "100000"));
      const storedAfter = await db.select().from(propBalances).where(eq(propBalances.accountId, accountA));
      const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
      assert.deepEqual(storedAfter.filter(row => row.id !== id).sort(byId), storedBefore.sort(byId));
      assert.equal((await request("/balances", "POST", { ...balance(accountA), recordedOn: "2026-11-02" }, "b")).status, 404);
      assert.equal((await request(`/balances/${id}`, "PUT", { ...balance(accountA), recordedOn: "2026-11-03" })).status, 409);
    });
    await t.test("invalid or future balance dates cannot create records", async () => {
      const before = await db.select().from(propBalances).where(eq(propBalances.accountId, accountA));
      for (const recordedOn of ["2026-02-30", "9999-12-31", "0000-01-01", "2026-11-01T12:00:00Z"]) {
        assert.equal((await request("/balances", "POST", { ...balance(accountA), recordedOn })).status, 400);
      }
      const after = await db.select().from(propBalances).where(eq(propBalances.accountId, accountA));
      assert.deepEqual(after, before);
    });
    await t.test("legacy snapshots get their original insertion date without a database backfill", async () => {
      const [row] = await db.select().from(propBalances).where(eq(propBalances.accountId, accountB));
      const { recordedOn: _date, ...legacy } = row.data;
      await db.update(propBalances).set({ data: legacy }).where(eq(propBalances.id, row.id));
      const before = await db.select().from(propBalances).where(eq(propBalances.id, row.id));
      const p = await load("b"), restored = p.balances.find(b => b.id === row.id)!;
      assert.equal(restored.recordedOn, row.createdAt.toISOString().slice(0, 10));
      assert.equal(restored.createdAt, row.createdAt.toISOString());
      assert.deepEqual(await db.select().from(propBalances).where(eq(propBalances.id, row.id)), before);
    });
    await t.test("received payouts count once, never automatically change balances or funded lifecycle", async () => {
      await request(`/accounts/${accountA}`, "PUT", { ...account(firmA), status: "funded" });
      const id = await create("payouts", payout(accountA));
      const before = await load();
      const r = await request(`/payouts/${id}`, "PUT", { ...payout(accountA), status: "paid", netReceived: "890.50", paidOn: "2026-11-03" });
      assert.equal(r.status, 200, await r.clone().text());
      const after = await load();
      assert.deepEqual(after.balances, before.balances);
      assert.equal(after.accounts[0]!.status, "funded");
      const report = portfolioReport(after, { currency: "USD" });
      assert.equal(report.received, "890.5");
      assert.equal(report.pending, "1000");
      assert.equal(report.expensesTotal, "100.1");
      assert.equal(report.netProfit, "790.4"); // processing fee already reflected in net received
    });
    await t.test("completed challenge results remain fixed when the next phase balance changes", async () => {
      const id = await create("challenges", challenge(accountA));
      const currentBalance = accountSnapshot(await load(), accountA).balance;
      await create("balances", { ...balance(accountA, "99000"), recordedOn: "2020-01-01" });
      assert.equal((await request(`/challenges/${id}`, "PUT", { ...challenge(accountA), status: "passed" })).status, 200);
      const before = await load(), c = before.challenges.find(c => c.id === id)!;
      assert.equal(c.closingBalance, currentBalance);
      const fixed = challengeProgress(before, c);
      await create("balances", balance(accountA, "103000"));
      const after = await load();
      assert.deepEqual(challengeProgress(after, after.challenges.find(c => c.id === id)!), fixed);
      assert.equal((await request(`/challenges/${id}`, "PUT", { ...challenge(accountA), status: "active" })).status, 409);
      await create("challenges", { ...challenge(accountA), phase: "Phase 2", startingBalance: "103000" });
      assert.ok((await load()).challenges.some(c => c.phase === "Phase 1" && c.status === "passed"));
    });
    await t.test("unverifiable rules never claim compliance; confirmed static rules show snapshot allowance only", async () => {
      const p = await load(), r = p.rules[0]!;
      assert.equal(evaluateRule(p, r).remaining, "8000");
      assert.equal(evaluateRule(p, r).status, "snapshot_only");
      assert.equal(evaluateRule(p, { ...r, confirmed: false }).status, "not_confirmed");
      for (const method of ["daily_loss", "intraday_trailing", "equity_loss", "eod_trailing", "trailing_balance_loss", "news", "payout_eligibility"] as const) {
        assert.equal(evaluateRule(p, { ...r, method }).status, "not_enough_data", method);
      }
    });
    await t.test("archives retain expenses and payouts; deletion requires exact account confirmation", async () => {
      assert.equal((await request(`/accounts/${accountA}`, "PUT", { ...account(firmA), startingBalance: "1" })).status, 409);
      const before = await load();
      assert.equal((await request(`/accounts/${accountA}`, "PUT", { ...account(firmA), status: "archived" })).status, 200);
      const after = await load();
      assert.deepEqual(after.expenses, before.expenses); assert.deepEqual(after.payouts, before.payouts);
      const report = portfolioReport(after, { currency: "USD" });
      assert.equal(report.nominalAllocatedCapital, "0"); assert.equal(report.received, "890.5");
      for (const [kind, id] of [["firms", firmA], ["accounts", accountA]] as const) assert.equal((await request(`/${kind}/${id}`, "DELETE")).status, 409);
    });
    await t.test("expenses, payouts and rules support explicit edit and deletion without altering other data", async () => {
      const id = await create("expenses", expense(firmA, null));
      assert.equal((await request(`/expenses/${id}`, "PUT", { ...expense(firmA, null), notes: "Corrected", amount: "99.99" })).status, 200);
      assert.equal((await load()).expenses.find(x => x.id === id)!.amount, "99.99");
      assert.equal((await request(`/expenses/${id}`, "DELETE")).status, 204);
      assert.ok(!(await load()).expenses.some(x => x.id === id));
      for (const kind of ["payouts", "rules"] as const) {
        const row = (await load())[kind][0]!;
        assert.equal((await request(`/${kind}/${row.id}`, "DELETE")).status, 204);
      }
      assert.equal((await load("b")).accounts.length, 1);
    });
    await t.test("general trading expenses save without a firm and retain ownership and relationship restrictions", async () => {
      const general = { ...expense(firmA, null), firmId: null, category: "software", amount: "29.99" };
      const before = await load();
      const id = await create("expenses", general);
      assert.equal((await load()).expenses.find(x => x.id === id)!.firmId, null);
      const [stored] = await db.select().from(propExpenses).where(eq(propExpenses.id, id));
      assert.equal(stored.firmId, null);
      assert.equal((await request(`/expenses/${id}`, "PUT", { ...general, notes: "Software subscription" })).status, 200);
      assert.equal((await request(`/expenses/${id}`, "PUT", general, "b")).status, 404);
      assert.equal((await request(`/expenses/${id}`, "DELETE", undefined, "b")).status, 404);
      assert.equal((await request("/expenses", "POST", { ...general, accountId: accountA })).status, 400);
      assert.equal((await request("/expenses", "POST", { ...general, accountId: accountB })).status, 400);
      assert.equal((await request(`/expenses/${id}`, "PUT", { ...general, firmId: firmA })).status, 409);
      assert.equal((await request(`/expenses/${id}`, "DELETE")).status, 204);
      assert.deepEqual((await load()).expenses, before.expenses);
    });
    await t.test("confirmed account deletion atomically removes only its prop history and preserves journal trades", async () => {
      const [journal] = await db.insert(accounts).values({ ownerId: ownerA, name: "Keep journal", currency: "USD", initialBalance: "100", type: "backtesting" }).returning();
      const [journalTrade] = await db.insert(trades).values({ ownerId: ownerA, accountId: journal.id, symbol: "KEEP", regime: "Ranging", pnlSource: "r" }).returning();
      const id = await create("accounts", { ...account(firmA), name: "Delete only this account", journalAccountId: journal.id });
      await create("balances", balance(id));
      await create("challenges", challenge(id));
      await create("rules", rule(id));
      await create("expenses", expense(firmA, id));
      await create("payouts", payout(id));
      const keptExpenseId = await create("expenses", expense(firmA, null));
      const generalId = await create("expenses", { ...expense(firmA, null), firmId: null, category: "software" });
      const before = await load(), otherBefore = await load("b");
      assert.equal((await request(`/accounts/${id}`, "DELETE", { confirmationName: "Delete only this account" }, "b")).status, 404);
      for (const body of [undefined, {}, { confirmationName: "wrong" }]) {
        assert.equal((await request(`/accounts/${id}`, "DELETE", body)).status, 409);
      }
      assert.deepEqual(await load(), before);
      const linkedExpense = before.expenses.find(x => x.accountId === id)!;
      await db.update(propExpenses).set({ ownerId: ownerB }).where(eq(propExpenses.id, linkedExpense.id));
      const inconsistentBefore = await load();
      assert.equal((await request(`/accounts/${id}`, "DELETE", { confirmationName: "Delete only this account" })).status, 500);
      assert.deepEqual(await load(), inconsistentBefore, "any restricted dependent row must roll back the entire deletion");
      await db.update(propExpenses).set({ ownerId: ownerA }).where(eq(propExpenses.id, linkedExpense.id));
      assert.equal((await request(`/accounts/${id}`, "DELETE", { confirmationName: "Delete only this account" })).status, 204);
      const after = await load();
      assert.deepEqual(after.accounts, before.accounts.filter(x => x.id !== id));
      for (const kind of ["balances", "challenges", "rules", "expenses", "payouts"] as const) {
        assert.deepEqual(after[kind], before[kind].filter(x => x.accountId !== id), kind);
      }
      assert.deepEqual(after.firms, before.firms);
      assert.ok(after.expenses.some(x => x.id === keptExpenseId));
      assert.ok(after.expenses.some(x => x.id === generalId));
      assert.deepEqual(await load("b"), otherBefore);
      assert.deepEqual(await db.select().from(accounts).where(eq(accounts.id, journal.id)), [journal]);
      assert.deepEqual(await db.select().from(trades).where(eq(trades.id, journalTrade.id)), [journalTrade]);
      assert.equal((await request(`/accounts/${id}`, "DELETE", { confirmationName: "Delete only this account" })).status, 404);
    });
  } finally {
    for (const owner of [ownerA, ownerB]) {
      for (const table of [propPayouts, propExpenses, propRules, propChallenges, propBalances, propAccounts, propFirms]) {
        await db.delete(table).where(eq(table.ownerId, owner));
      }
      await db.delete(trades).where(eq(trades.ownerId, owner));
      await db.delete(accounts).where(eq(accounts.ownerId, owner));
    }
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await pool.end();
  }
});

test("portfolio financial totals are exact, currency-separated and use actual cash dates", () => {
  const p: Portfolio = { firms: [{ id: "firm", name: "Firm", website: "", marketType: "CFD", platform: "", notes: "", status: "active" }],
    accounts: ["USD", "CAD"].map(currency => ({ id: currency, firmId: "firm", name: currency, reference: "", marketType: "CFD", platform: "", currency, nominalSize: "100000", startingBalance: "100000", purchasedOn: "2026-01-01", status: "funded", phase: "", journalAccountId: null, notes: "" })),
    balances: [], challenges: [], rules: [], payouts: [],
    expenses: [
      { id: "1", firmId: "firm", accountId: "USD", category: "challenge_purchase", amount: "0.1", currency: "USD", date: "2026-01-01", notes: "" },
      { id: "2", firmId: "firm", accountId: null, category: "other", amount: "0.2", currency: "USD", date: "2026-02-01", notes: "" },
      { id: "3", firmId: "firm", accountId: "CAD", category: "activation", amount: "100", currency: "CAD", date: "2026-02-01", notes: "" },
    ] };
  const r = portfolioReport(p, { currency: "USD" });
  assert.equal(r.expensesTotal, "0.3"); assert.equal(r.netProfit, "-0.3"); assert.equal(r.roi, "-100");
  assert.equal(r.nominalAllocatedCapital, "100000"); assert.equal(r.monthly.at(-1)!.cumulative, "-0.3");
  assert.equal(r.remainingDrawdown, null);
  assert.equal(portfolioReport(p, { currency: "USD", to: "2026-01-31" }).expensesTotal, "0.1");
  assert.equal(portfolioReport(p, { currency: "USD", marketType: "CFD" }).expensesTotal, "0.1");
  assert.equal(portfolioReport({ ...p, expenses: [] }, { currency: "USD" }).roi, null);
  assert.equal(portfolioReport(p, { currency: "CAD" }).expensesTotal, "100");
  assert.equal(sumMoney(["9007199254740990.1", "0.2"]), "9007199254740990.3");
  const payoutBase = { accountId: "USD", grossProfit: null, profitSplit: null, requestedAmount: "100", netReceived: "0", currency: "USD", requestedOn: "2026-01-15", paidOn: null, processingFee: "5", notes: "" };
  const cash: Portfolio = { ...p, payouts: [
    { ...payoutBase, id: "paid", status: "paid", paidOn: "2026-02-15", netReceived: "95" },
    { ...payoutBase, id: "pending", status: "approved" },
    { ...payoutBase, id: "rejected", status: "rejected" },
  ] };
  const january = portfolioReport(cash, { currency: "USD", from: "2026-01-01", to: "2026-01-31" });
  assert.equal(january.received, "0"); assert.equal(january.pending, "100");
  const february = portfolioReport(cash, { currency: "USD", from: "2026-02-01", to: "2026-02-28" });
  assert.equal(february.received, "95"); assert.equal(february.pending, "0");
  assert.equal(february.netProfit, "94.8"); // Fee withheld already: never subtract 5 again.
});

test("general software and other trading costs are included once without inventing firm allocations", () => {
  const p: Portfolio = { firms: [], accounts: [], balances: [], challenges: [], rules: [], payouts: [], expenses: [
    { id: "software", firmId: null, accountId: null, category: "software", amount: "0.1", currency: "USD", date: "2026-11-01", notes: "Software" },
    { id: "other", firmId: null, accountId: null, category: "other", amount: "0.2", currency: "USD", date: "2026-12-01", notes: "Other trading cost" },
    { id: "cad", firmId: null, accountId: null, category: "subscription", amount: "100", currency: "CAD", date: "2026-11-01", notes: "" },
  ] };
  const r = portfolioReport(p, { currency: "USD" });
  assert.equal(r.expensesTotal, "0.3");
  assert.equal(r.netProfit, "-0.3");
  assert.deepEqual(r.monthly.map(x => x.month), ["2026-11", "2026-12"]);
  assert.equal(r.monthly.at(-1)!.cumulative, "-0.3");
  assert.deepEqual(r.expensesByFirm, [{ id: "general", name: "General trading", value: "0.3" }]);
  for (const filter of [{ firmId: "some-firm" }, { marketType: "CFD" }, { status: "funded" }]) {
    assert.equal(portfolioReport(p, { currency: "USD", ...filter }).expensesTotal, "0");
  }
  assert.equal(portfolioReport(p, { currency: "USD", to: "2026-11-30" }).expensesTotal, "0.1");
  assert.equal(portfolioReport(p, { currency: "CAD" }).expensesTotal, "100");
});
