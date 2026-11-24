import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { accounts } from "./accounts";

// Validated entity attributes live in JSONB; identity, ownership and relationships
// remain relational. No journal tables or historical trade relationships change.
const identity = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const propFirms = pgTable("edge_prop_firms", identity(), t => [index("edge_prop_firms_owner_idx").on(t.ownerId)]);
export const propAccounts = pgTable("edge_prop_accounts", {
  ...identity(),
  firmId: uuid("firm_id").notNull().references(() => propFirms.id, { onDelete: "restrict" }),
  journalAccountId: uuid("journal_account_id").references(() => accounts.id, { onDelete: "restrict" }),
}, t => [index("edge_prop_accounts_owner_idx").on(t.ownerId)]);
export const propBalances = pgTable("edge_prop_balances", {
  ...identity(),
  accountId: uuid("account_id").notNull().references(() => propAccounts.id, { onDelete: "restrict" }),
}, t => [index("edge_prop_balances_account_idx").on(t.ownerId, t.accountId, t.createdAt)]);
export const propChallenges = pgTable("edge_prop_challenges", {
  ...identity(),
  accountId: uuid("account_id").notNull().references(() => propAccounts.id, { onDelete: "restrict" }),
}, t => [index("edge_prop_challenges_owner_idx").on(t.ownerId)]);
export const propRules = pgTable("edge_prop_rules", {
  ...identity(),
  accountId: uuid("account_id").notNull().references(() => propAccounts.id, { onDelete: "restrict" }),
}, t => [index("edge_prop_rules_owner_idx").on(t.ownerId)]);
export const propExpenses = pgTable("edge_prop_expenses", {
  ...identity(),
  firmId: uuid("firm_id").notNull().references(() => propFirms.id, { onDelete: "restrict" }),
  accountId: uuid("account_id").references(() => propAccounts.id, { onDelete: "restrict" }),
}, t => [index("edge_prop_expenses_owner_idx").on(t.ownerId)]);
export const propPayouts = pgTable("edge_prop_payouts", {
  ...identity(),
  accountId: uuid("account_id").notNull().references(() => propAccounts.id, { onDelete: "restrict" }),
}, t => [index("edge_prop_payouts_owner_idx").on(t.ownerId)]);

export const insertPropFirmSchema = createInsertSchema(propFirms).omit({ id: true, createdAt: true });
export const insertPropAccountSchema = createInsertSchema(propAccounts).omit({ id: true, createdAt: true });
export const insertPropBalanceSchema = createInsertSchema(propBalances).omit({ id: true, createdAt: true });
export const insertPropChallengeSchema = createInsertSchema(propChallenges).omit({ id: true, createdAt: true });
export const insertPropRuleSchema = createInsertSchema(propRules).omit({ id: true, createdAt: true });
export const insertPropExpenseSchema = createInsertSchema(propExpenses).omit({ id: true, createdAt: true });
export const insertPropPayoutSchema = createInsertSchema(propPayouts).omit({ id: true, createdAt: true });
