import { pgTable, text, uuid, numeric, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const accounts = pgTable("edge_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  broker: text("broker").notNull().default(""),
  currency: text("currency").notNull(),
  initialBalance: numeric("initial_balance", { precision: 28, scale: 8 }).notNull(),
  type: text("type").notNull(),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("edge_accounts_owner_idx").on(t.ownerId)]);

export const cashFlows = pgTable("edge_cash_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  ownerId: text("owner_id").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("edge_flows_account_date_idx").on(t.accountId, t.date)]);

export const settings = pgTable("edge_settings", {
  ownerId: text("owner_id").primaryKey(),
  timezone: text("timezone").notNull().default("UTC"),
  riskLimitPercent: numeric("risk_limit_percent", { precision: 8, scale: 4 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
