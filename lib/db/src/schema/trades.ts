import { pgTable, uuid, text, numeric, boolean, integer, timestamp, jsonb, index, primaryKey } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { strategies, confluences } from "./research";

const decimal = (name: string) => numeric(name, { precision: 28, scale: 8 });
export const trades = pgTable("edge_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  symbol: text("symbol").notNull().default(""),
  assetClass: text("asset_class").notNull().default("forex"),
  direction: text("direction").notNull().default("long"),
  entryAt: timestamp("entry_at", { withTimezone: true }),
  exitAt: timestamp("exit_at", { withTimezone: true }),
  entryPrice: decimal("entry_price"),
  exitPrice: decimal("exit_price"),
  stopLoss: decimal("stop_loss"),
  takeProfit: decimal("take_profit"),
  quantity: decimal("quantity"),
  multiplier: decimal("multiplier"),
  initialRisk: decimal("initial_risk"),
  grossPnl: decimal("gross_pnl"),
  commission: decimal("commission").notNull().default("0"),
  funding: decimal("funding").notNull().default("0"),
  slippage: decimal("slippage").notNull().default("0"),
  pnlSource: text("pnl_source").notNull().default("broker"),
  netPnl: decimal("net_pnl"),
  realizedR: decimal("realized_r"),
  timeframe: text("timeframe").notNull().default("H4"),
  higherTimeframe: text("higher_timeframe").notNull().default("D1"),
  session: text("session").notNull().default("London"),
  regime: text("regime").notNull().default(""),
  emotion: text("emotion").notNull().default(""),
  confidence: integer("confidence"),
  grade: text("grade"),
  followedPlan: boolean("followed_plan"),
  behavioralTags: jsonb("behavioral_tags").$type<string[]>().notNull().default([]),
  thesis: text("thesis").notNull().default(""),
  entryReason: text("entry_reason").notNull().default(""),
  management: text("management").notNull().default(""),
  exitReason: text("exit_reason").notNull().default(""),
  wentWell: text("went_well").notNull().default(""),
  wentWrong: text("went_wrong").notNull().default(""),
  lesson: text("lesson").notNull().default(""),
  chartUrl: text("chart_url").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("edge_trades_owner_exit_idx").on(t.ownerId, t.exitAt),
  index("edge_trades_account_idx").on(t.accountId),
]);

export const executions = pgTable("edge_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeId: uuid("trade_id").notNull().references(() => trades.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  price: decimal("price").notNull(),
  quantity: decimal("quantity").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  fee: decimal("fee").notNull().default("0"),
}, (t) => [index("edge_executions_trade_idx").on(t.tradeId)]);

export const tradeConfluences = pgTable("edge_trade_confluences", {
  tradeId: uuid("trade_id").notNull().references(() => trades.id, { onDelete: "cascade" }),
  confluenceId: uuid("confluence_id").notNull().references(() => confluences.id, { onDelete: "restrict" }),
  nameSnapshot: text("name_snapshot").notNull(),
  descriptionSnapshot: text("description_snapshot").notNull().default(""),
  categorySnapshot: text("category_snapshot").notNull().default("Technical"),
  colorSnapshot: text("color_snapshot").notNull(),
}, (t) => [primaryKey({ columns: [t.tradeId, t.confluenceId] })]);

export type TradeRecord = typeof trades.$inferSelect;
