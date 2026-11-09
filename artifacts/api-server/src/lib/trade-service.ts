import { db, trades, accounts, strategies, confluences, executions, tradeConfluences } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { CreateTradeBody } from "@workspace/api-zod";
import { D, money, netResult, realizedR, linearPnl } from "./calculations";
import { HttpError, parseId } from "./edge-data";

type TradeInput = z.infer<typeof CreateTradeBody>;
const decimalKeys = ["entryPrice", "exitPrice", "stopLoss", "takeProfit", "quantity", "multiplier", "initialRisk", "grossPnl", "commission", "funding", "slippage"] as const;
function validateDecimal(value: string, name: string, positive = false) {
  if (!/^-?\d+(\.\d{1,8})?$/.test(value) || value.length > 40) throw new HttpError(400, `${name} must be a decimal with at most 8 fractional digits.`);
  const n = D(value);
  if (!n.isFinite() || n.abs().gte("100000000000000000000")) throw new HttpError(400, `${name} exceeds supported precision.`);
  if (positive && !n.gt(0)) throw new HttpError(400, `${name} must be positive.`);
}

export async function saveTrade(ownerId: string, input: TradeInput, id?: string) {
  return db.transaction(async (tx) => {
    const [existing] = id ? await tx.select().from(trades).where(and(eq(trades.id, id), eq(trades.ownerId, ownerId))).for("update") : [];
    if (id && !existing) throw new HttpError(404, "Trade not found.");
    const data = { ...input };
    const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, data.accountId), eq(accounts.ownerId, ownerId)));
    if (!account) throw new HttpError(404, "Trading account not found.");
    if (account.archived && (!existing || existing.accountId !== account.id)) throw new HttpError(400, "Choose an active account.");
    if (existing && existing.status !== "draft") {
      if (data.accountId !== existing.accountId) throw new HttpError(400, "The account of an entered trade cannot be changed.");
      if (data.status === "draft") throw new HttpError(400, "An entered trade cannot be reverted to a draft.");
      // Null risk is preserved too: do not manufacture historical R by adding risk after entry.
      if (data.initialRisk != null && (existing.initialRisk === null || !D(data.initialRisk).eq(existing.initialRisk))) {
        throw new HttpError(400, "Initial risk is locked at entry and cannot be redefined.");
      }
      data.initialRisk = existing.initialRisk;
    }
    for (const key of decimalKeys) {
      if (data[key] != null) validateDecimal(data[key]!, key, ["entryPrice", "exitPrice", "quantity", "multiplier"].includes(key));
    }
    if (data.initialRisk != null && D(data.initialRisk).lt(0)) throw new HttpError(400, "Initial risk cannot be negative.");
    if (data.commission != null && D(data.commission).lt(0)) throw new HttpError(400, "Commission cannot be negative.");
    if (data.slippage != null && D(data.slippage).lt(0)) throw new HttpError(400, "Slippage cost cannot be negative.");
    if (data.chartUrl) {
      try {
        const url = new URL(data.chartUrl);
        if (url.protocol !== "https:") throw new Error("protocol");
      } catch { throw new HttpError(400, "Chart link must be a valid HTTPS URL."); }
    }
    if (data.strategyId) {
      parseId(data.strategyId);
      const [strategy] = await tx.select().from(strategies).where(and(eq(strategies.id, data.strategyId), eq(strategies.ownerId, ownerId)));
      if (!strategy || (strategy.archived && existing?.strategyId !== strategy.id)) throw new HttpError(400, "Choose an available strategy.");
    }
    const ids = [...new Set(data.confluenceIds ?? [])];
    const selected = ids.length ? await tx.select().from(confluences).where(and(eq(confluences.ownerId, ownerId), inArray(confluences.id, ids))) : [];
    if (selected.length !== ids.length) throw new HttpError(400, "One or more confluences do not belong to this workspace.");
    const historical = existing ? await tx.select().from(tradeConfluences).where(eq(tradeConfluences.tradeId, existing.id)) : [];
    for (const c of selected) {
      if ((c.archived || !c.enabled) && !historical.some((h) => h.confluenceId === c.id)) throw new HttpError(400, `Confluence "${c.name}" is inactive.`);
    }
    const fills = data.executions ?? [];
    for (const fill of fills) {
      validateDecimal(fill.price, "Execution price", true);
      validateDecimal(fill.quantity, "Execution quantity", true);
      validateDecimal(fill.fee ?? "0", "Execution fee");
      if (D(fill.fee ?? "0").lt(0)) throw new HttpError(400, "Execution fees cannot be negative.");
      if (fill.timestamp > new Date()) throw new HttpError(400, "Executions cannot be future-dated.");
    }
    const entries = fills.filter((f) => f.kind === "entry");
    const exits = fills.filter((f) => f.kind === "exit");
    if (fills.length) {
      let openQuantity = D();
      for (const f of [...fills].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
        openQuantity = openQuantity.plus(D(f.quantity).mul(f.kind === "entry" ? 1 : -1));
        if (openQuantity.lt(0)) throw new HttpError(400, "Exit executions cannot exceed the quantity entered at that time.");
      }
      if (data.status === "closed" && !openQuantity.eq(0)) throw new HttpError(400, "A closed trade requires matching total entry and exit quantities.");
      const total = (rows: typeof fills) => rows.reduce((s, f) => s.plus(f.quantity), D());
      const weighted = (rows: typeof fills) => money(rows.reduce((s, f) => s.plus(D(f.price).mul(f.quantity)), D()).div(total(rows)));
      if (entries.length) {
        data.entryPrice = weighted(entries);
        data.quantity = money(total(entries));
        data.entryAt = new Date(Math.min(...entries.map((f) => f.timestamp.getTime())));
      }
      if (exits.length) {
        data.exitPrice = weighted(exits);
        data.exitAt = new Date(Math.max(...exits.map((f) => f.timestamp.getTime())));
      }
    }
    if (data.status !== "draft" && (!data.symbol?.trim() || !data.direction || !data.entryAt || !data.entryPrice || !data.quantity)) {
      throw new HttpError(400, "Entered trades require symbol, direction, entry time, entry price, and position size.");
    }
    if (data.entryAt && data.entryAt > new Date()) throw new HttpError(400, "Entry time cannot be in the future.");
    if (data.exitAt && data.entryAt && data.exitAt < data.entryAt) throw new HttpError(400, "Exit must be on or after entry.");
    if (data.exitAt && data.exitAt > new Date()) throw new HttpError(400, "Exit time cannot be in the future.");
    if (data.status === "closed" && (!data.exitAt || !data.entryAt)) throw new HttpError(400, "Closed trades require entry and exit timestamps.");
    if (data.pnlSource === "calculated" && data.status === "closed") {
      // This explicitly models a linear, account-currency-settled contract, never an inverse contract.
      if (!data.entryPrice || !data.exitPrice || !data.quantity || !data.multiplier) throw new HttpError(400, "Linear calculation requires entry/exit prices, quantity and an explicit contract multiplier. For other contracts use broker-reported P&L.");
      data.grossPnl = linearPnl(data.entryPrice, data.exitPrice, data.quantity, data.multiplier, data.direction ?? "long");
    }
    if (data.status === "closed" && data.grossPnl == null) throw new HttpError(400, "Enter verified broker-reported gross P&L, or configure a supported linear calculation.");
    const fillFees = fills.reduce((s, f) => s.plus(f.fee ?? "0"), D());
    // Summary commission is additional to per-fill fees. UI currently uses summary-only fees.
    const netPnl = data.status === "closed" ? netResult(data.grossPnl!, D(data.commission ?? "0").plus(fillFees).toString(), data.funding, data.slippage) : null;
    const r = netPnl !== null ? realizedR(netPnl, data.initialRisk) : null;
    if (netPnl !== null) validateDecimal(netPnl, "Net P&L");
    if (r !== null) validateDecimal(r, "Realized R");
    const { confluenceIds: _ids, executions: _fills, ...fields } = data;
    const values = {
      ...fields,
      symbol: (data.symbol ?? "").trim().toUpperCase(),
      strategyId: data.strategyId || null,
      confidence: data.confidence ?? null,
      grade: data.grade ?? null,
      followedPlan: data.followedPlan ?? null,
      ownerId,
      netPnl, realizedR: r, updatedAt: new Date(),
      ...(data.status !== "closed" ? { grossPnl: data.grossPnl ?? null, exitAt: data.exitAt ?? null } : {}),
    };
    const [saved] = existing
      ? await tx.update(trades).set(values).where(and(eq(trades.id, existing.id), eq(trades.ownerId, ownerId))).returning()
      : await tx.insert(trades).values(values).returning();
    if (!saved) throw new Error("Trade persistence failed.");
    await tx.delete(tradeConfluences).where(eq(tradeConfluences.tradeId, saved.id));
    if (selected.length) await tx.insert(tradeConfluences).values(selected.map((c) => {
      const old = historical.find((h) => h.confluenceId === c.id);
      return {
        tradeId: saved.id, confluenceId: c.id,
        nameSnapshot: old?.nameSnapshot ?? c.name, descriptionSnapshot: old?.descriptionSnapshot ?? c.description,
        categorySnapshot: old?.categorySnapshot ?? c.category, colorSnapshot: old?.colorSnapshot ?? c.color,
      };
    }));
    await tx.delete(executions).where(eq(executions.tradeId, saved.id));
    const savedFills = fills.length ? fills : [
      ...(data.entryAt && data.entryPrice && data.quantity ? [{ kind: "entry", timestamp: data.entryAt, price: data.entryPrice, quantity: data.quantity, fee: "0" }] : []),
      ...(data.status === "closed" && data.exitAt && data.exitPrice && data.quantity ? [{ kind: "exit", timestamp: data.exitAt, price: data.exitPrice, quantity: data.quantity, fee: "0" }] : []),
    ];
    if (savedFills.length) await tx.insert(executions).values(savedFills.map((f) => ({ ...f, tradeId: saved.id })));
    return saved.id;
  });
}
