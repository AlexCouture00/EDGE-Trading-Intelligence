import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db, accounts, propFirms, propAccounts, propBalances,
  propChallenges, propRules, propExpenses, propPayouts,
} from "@workspace/db";
import { CreatePropRecordBody, GetPropManagerResponse, CreatePropRecordParams } from "@workspace/api-zod";
import { subtractMoney } from "@workspace/prop-math";
import { HttpError, parseId } from "../lib/edge-data";

const router: IRouter = Router();
const tables = {
  firms: propFirms, accounts: propAccounts, balances: propBalances,
  challenges: propChallenges, rules: propRules, expenses: propExpenses, payouts: propPayouts,
};
const kinds = Object.keys(tables) as (keyof typeof tables)[];
type Kind = keyof typeof tables;
const kindOf = (params: unknown): Kind => CreatePropRecordParams.parse(params).kind;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function calendarDay(v: unknown) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number(v.slice(0, 4)) < 1
    || !Number.isFinite(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw new HttpError(400, "Use a valid calendar date (YYYY-MM-DD).");
  }
}
function validateAttributes(kind: Kind, raw: unknown): Record<string, unknown> {
  // The union documents the endpoint; its position maps to one strict schema
  // per resource, preventing another kind's fields or forged ownership.
  const data = CreatePropRecordBody.options[kinds.indexOf(kind)]!.strict().parse(raw) as Record<string, unknown>;
  for (const key of ["name", "phase"]) {
    if (typeof data[key] === "string" && key === "name" && !data[key].trim()) throw new HttpError(400, "A name is required.");
  }
  for (const key of ["purchasedOn", "startDate", "expiresOn", "effectiveDate", "verifiedOn", "date", "requestedOn", "paidOn"]) {
    if (data[key] != null) calendarDay(data[key]);
  }
  for (const key of ["nominalSize", "startingBalance", "profitTarget", "maximumLoss", "dailyLoss", "amount", "requestedAmount", "netReceived", "grossProfit", "processingFee"]) {
    if (data[key] != null && Number(data[key]) < 0) throw new HttpError(400, "Allocations, loss allowances, fees and payout amounts cannot be negative.");
  }
  if (kind === "accounts" && Number(data.nominalSize) <= 0) throw new HttpError(400, "Nominal account size must be positive.");
  if (kind === "challenges") {
    if (data.expiresOn && String(data.expiresOn) < String(data.startDate)) throw new HttpError(400, "Expiration must not precede the challenge start date.");
    if (Number(data.profitTarget) <= 0 && data.structure !== "instant_funded") throw new HttpError(400, "A challenge profit target must be positive.");
  }
  if (kind === "payouts") {
    if (data.profitSplit != null && Number(data.profitSplit) > 100) throw new HttpError(400, "Profit split cannot exceed 100%.");
    if (data.status === "paid" && !data.paidOn) throw new HttpError(400, "A received payout needs its payment date.");
    if (data.status !== "paid" && (data.paidOn !== null || Number(data.netReceived) !== 0)) throw new HttpError(400, "Only a paid payout may have a payment date or received amount.");
    if (data.paidOn && String(data.paidOn) < String(data.requestedOn)) throw new HttpError(400, "Payment must not precede the request date.");
  }
  for (const key of ["website", "sourceUrl"]) {
    if (data[key]) {
      let url: URL;
      try { url = new URL(String(data[key])); } catch { throw new HttpError(400, "Use a complete https:// or http:// URL."); }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new HttpError(400, "Only public http(s) URLs without credentials are allowed.");
    }
  }
  if (kind === "rules" && data.confirmed && ["static_balance_loss", "trailing_balance_loss"].includes(String(data.method))) {
    if (!["amount", "%"].includes(String(data.unit)) || !/^\d{1,16}(\.\d{1,8})?$/.test(String(data.value))
      || Number(data.value) <= 0 || (data.unit === "%" && Number(data.value) > 100)) {
      throw new HttpError(400, "A confirmed loss rule needs a positive value and amount or % unit (maximum 100%).");
    }
  }
  return data;
}

async function owned(tx: Tx, kind: Kind, ownerId: string, id: unknown) {
  const table = tables[kind];
  const [row] = await tx.select().from(table).where(and(eq(table.ownerId, ownerId), eq(table.id, parseId(id)))).for("update");
  if (!row) throw new HttpError(404, "Prop manager record not found.");
  return row;
}

async function save(kind: Kind, ownerId: string, raw: unknown, id?: string) {
  const data = validateAttributes(kind, raw);
  if (kind === "balances" && id) throw new HttpError(409, "Balance history is append-only. Record a new balance with a correction note.");
  return db.transaction(async tx => {
    const table = tables[kind];
    const existing = id ? await owned(tx, kind, ownerId, id) : null;
    if (existing && kind === "accounts") {
      for (const key of ["firmId", "currency", "startingBalance", "nominalSize"]) {
        if (data[key] !== existing.data[key]) throw new HttpError(409, "An account's firm, currency, allocation and starting balance are historical identity. Create a separate account instead.");
      }
    }
    if (existing && kind !== "accounts" && kind !== "firms") {
      if (data.accountId !== existing.data.accountId || data.firmId !== existing.data.firmId) {
        throw new HttpError(409, "Historical records cannot be moved to a different account or firm.");
      }
    }
    if (kind === "challenges" && existing && ["passed", "failed", "expired"].includes(String(existing.data.status))) {
      for (const key of ["status", "phase", "startingBalance", "profitTarget"]) {
        if (data[key] !== existing.data[key]) throw new HttpError(409, "A completed phase is historical. Add the next phase instead of rewriting its result.");
      }
    }
    const relationships: { firmId?: string; accountId?: string | null; journalAccountId?: string | null } = {};
    if (typeof data.firmId === "string") {
      await owned(tx, "firms", ownerId, data.firmId);
      relationships.firmId = data.firmId;
    }
    let relatedAccount: Awaited<ReturnType<typeof owned>> | undefined;
    if (typeof data.accountId === "string") {
      relatedAccount = await owned(tx, "accounts", ownerId, data.accountId);
      relationships.accountId = data.accountId;
      if (data.firmId && relatedAccount.data.firmId !== data.firmId) throw new HttpError(400, "The selected account belongs to a different firm.");
      if (data.currency && data.currency !== relatedAccount.data.currency) throw new HttpError(400, "Use the linked account's currency; currency conversion is not assumed.");
    } else if ("accountId" in data) relationships.accountId = null;
    if (kind === "accounts") {
      relationships.journalAccountId = data.journalAccountId as string | null;
      if (data.journalAccountId) {
        const [journal] = await tx.select().from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, String(data.journalAccountId))));
        if (!journal) throw new HttpError(404, "Linked journal account not found.");
        if (journal.currency !== data.currency) throw new HttpError(400, "The linked journal account must use the same currency.");
      }
    }
    let createdAt = new Date();
    if (kind === "challenges") {
      if (existing?.data.completedAt) {
        data.closingBalance = existing.data.closingBalance;
        data.completedAt = existing.data.completedAt;
      } else if (["passed", "failed", "expired"].includes(String(data.status))) {
        const [last] = await tx.select().from(propBalances).where(and(
          eq(propBalances.ownerId, ownerId), eq(propBalances.accountId, String(data.accountId)),
        )).orderBy(desc(propBalances.createdAt)).limit(1);
        data.closingBalance = last?.data.balance ?? relatedAccount!.data.startingBalance;
        data.completedAt = new Date().toISOString();
      } else {
        data.closingBalance = null;
        data.completedAt = null;
      }
    }
    if (kind === "balances") {
      // Locking the parent serializes concurrent updates, so previous/difference
      // remain a continuous chain even with rapid requests or equal timestamps.
      const [previous] = await tx.select().from(propBalances).where(and(
        eq(propBalances.ownerId, ownerId), eq(propBalances.accountId, String(data.accountId)),
      )).orderBy(desc(propBalances.createdAt)).limit(1);
      const previousBalance = String(previous?.data.balance ?? relatedAccount!.data.startingBalance);
      data.previousBalance = previousBalance;
      data.difference = subtractMoney(String(data.balance), previousBalance);
      createdAt = new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1));
    }
    if (existing) {
      await tx.update(table).set({ data, ...relationships }).where(and(eq(table.ownerId, ownerId), eq(table.id, existing.id)));
      return { id: existing.id };
    }
    const [row] = await tx.insert(table).values({ ownerId, data, ...relationships, createdAt }).returning({ id: table.id });
    return row!;
  });
}

// Give an actionable, credential-free error before the approved migration.
router.use("/prop-manager", async (_req, _res, next): Promise<void> => {
  try {
    // Query only our new table, never create or migrate at runtime.
    await db.select({ id: propFirms.id }).from(propFirms).limit(0);
    next();
  } catch (e) {
    const error = e as { code?: string; cause?: { code?: string } };
    if ((error.code ?? error.cause?.code) === "42P01") {
      throw new HttpError(503, "Prop Firm Manager needs its approved database migration. Existing journal data is unchanged.");
    }
    throw e;
  }
});
router.get("/prop-manager", async (_req, res): Promise<void> => {
  const entries = await Promise.all(kinds.map(async kind => {
    const table = tables[kind];
    const rows = await db.select().from(table).where(eq(table.ownerId, res.locals.ownerId)).orderBy(asc(table.createdAt));
    return [kind, rows.map(row => ({
      ...row.data, id: row.id,
      ...(kind === "balances" ? { createdAt: row.createdAt.toISOString() } : {}),
    }))] as const;
  }));
  res.json(GetPropManagerResponse.parse(Object.fromEntries(entries)));
});
router.post("/prop-manager/:kind", async (req, res): Promise<void> => {
  res.status(201).json(await save(kindOf(req.params), res.locals.ownerId, req.body));
});
router.put("/prop-manager/:kind/:id", async (req, res): Promise<void> => {
  res.json(await save(kindOf(req.params), res.locals.ownerId, req.body, parseId(req.params.id)));
});
router.delete("/prop-manager/:kind/:id", async (req, res): Promise<void> => {
  const kind = kindOf(req.params), id = parseId(req.params.id);
  await db.transaction(async tx => {
    await owned(tx, kind, res.locals.ownerId, id);
    if (!["expenses", "payouts", "rules"].includes(kind)) {
      throw new HttpError(409, "Archive firms and accounts. Balance and challenge history must be retained.");
    }
    const table = tables[kind];
    await tx.delete(table).where(and(eq(table.ownerId, res.locals.ownerId), eq(table.id, id)));
  });
  res.sendStatus(204);
});
export default router;
