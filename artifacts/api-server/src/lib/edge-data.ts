import { getAuth } from "@clerk/express";
import { db, settings, confluences, trades, accounts, strategies, executions, tradeConfluences } from "@workspace/db";
import { and, eq, inArray, asc } from "drizzle-orm";
import type { RequestHandler } from "express";
import { z } from "zod";

export const DEMO_OWNER = "edge-readonly-demo";
export const defaultConfluences = ["Kibo (BR fib)", "Fib 38", "Ema", "Trendline", "Key level", "Breach Key level", "Psych Level", "Fib 50", "Fib 68", "Divergence TDI"];
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const uuid = z.string().uuid();
export const parseId = (value: unknown) => uuid.parse(value);

export async function initializeOwner(ownerId: string) {
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(settings).values({ ownerId }).onConflictDoNothing().returning();
    if (inserted.length) await tx.insert(confluences).values(defaultConfluences.map((name, sortOrder) => ({
      ownerId, name, sortOrder, category: name.includes("Fib") || name.includes("fib") ? "Fibonacci" : name.includes("level") || name.includes("Level") ? "Price action" : "Technical",
      color: ["#7c9cd7", "#ab9bda", "#d1ad72", "#6ea993"][sortOrder % 4],
    })));
  });
}

export const edgeIdentity: RequestHandler = async (req, res, next) => {
  const demo = req.query.demo === "true" || req.query.demo === "1";
  const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (write && demo) throw new HttpError(403, "Demo workspace is read-only. Switch to your private workspace to save changes.");
  if (write && req.headers.origin) {
    const hostname = new URL(req.headers.origin).host;
    const forwarded = req.headers["x-forwarded-host"];
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? req.headers.host;
    if (host && hostname !== host) throw new HttpError(403, "Cross-origin writes are not allowed.");
  }
  if (demo) {
    res.locals.ownerId = DEMO_OWNER;
  } else {
    const auth = getAuth(req);
    if (!auth.userId) throw new HttpError(401, "Sign in to access your private trading workspace.");
    res.locals.ownerId = auth.userId;
    await initializeOwner(auth.userId);
  }
  res.locals.isDemo = demo;
  res.setHeader("Cache-Control", "private, no-store");
  next();
};

export async function ownedAccount(ownerId: string, id: string) {
  const [account] = await db.select().from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, parseId(id))));
  if (!account) throw new HttpError(404, "Trading account not found.");
  return account;
}

export async function loadTrades(ownerId: string) {
  const raw = await db.select().from(trades).where(eq(trades.ownerId, ownerId)).orderBy(asc(trades.entryAt));
  if (!raw.length) return [];
  const ids = raw.map((t) => t.id);
  const [accts, strats, links, fills] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ownerId, ownerId)),
    db.select().from(strategies).where(eq(strategies.ownerId, ownerId)),
    db.select().from(tradeConfluences).where(inArray(tradeConfluences.tradeId, ids)),
    db.select().from(executions).where(inArray(executions.tradeId, ids)).orderBy(asc(executions.timestamp)),
  ]);
  return raw.map((t) => {
    const account = accts.find((a) => a.id === t.accountId)!;
    const selected = links.filter((c) => c.tradeId === t.id).map((c) => ({
      id: c.confluenceId, name: c.nameSnapshot, description: c.descriptionSnapshot,
      category: c.categorySnapshot, color: c.colorSnapshot,
    }));
    return {
      ...t,
      confidence: t.confidence ?? undefined,
      grade: t.grade ?? undefined,
      followedPlan: t.followedPlan ?? undefined,
      entryAt: t.entryAt?.toISOString() ?? null, exitAt: t.exitAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
      accountName: account.name, currency: account.currency,
      strategyName: strats.find((s) => s.id === t.strategyId)?.name ?? null,
      confluences: selected, confluenceIds: selected.map((c) => c.id),
      executions: fills.filter((f) => f.tradeId === t.id).map((f) => ({ ...f, timestamp: f.timestamp.toISOString() })),
    };
  });
}
export type LoadedTrade = Awaited<ReturnType<typeof loadTrades>>[number];

export function filterTrades<T extends LoadedTrade>(rows: T[], query: Record<string, unknown>) {
  const timestamp = (v: unknown) => v instanceof Date ? v.getTime() : new Date(String(v)).getTime();
  const from = query.from ? timestamp(query.from) : null;
  const to = query.to ? timestamp(query.to) : null;
  if ((from !== null && !Number.isFinite(from)) || (to !== null && !Number.isFinite(to))) throw new HttpError(400, "Invalid date range.");
  if (from !== null && to !== null && from > to) throw new HttpError(400, "Start date must be on or before end date.");
  const search = String(query.search ?? "").toLowerCase();
  return rows.filter((t) => {
    const date = new Date(t.status === "closed" ? t.exitAt! : t.entryAt ?? t.createdAt).getTime();
    return (!query.accountId || t.accountId === query.accountId)
      && (!query.symbol || t.symbol.toUpperCase() === String(query.symbol).toUpperCase())
      && (!query.strategyId || t.strategyId === query.strategyId)
      && (!query.direction || t.direction === query.direction)
      && (!query.status || t.status === query.status)
      && (!search || `${t.symbol} ${t.strategyName ?? ""} ${t.thesis} ${t.entryReason} ${t.management} ${t.exitReason} ${t.wentWell} ${t.wentWrong} ${t.lesson}`.toLowerCase().includes(search))
      && (from === null || date >= from) && (to === null || date <= to);
  });
}
