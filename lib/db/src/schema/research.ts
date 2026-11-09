import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";

export const confluences = pgTable("edge_confluences", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("Technical"),
  color: text("color").notNull().default("#7f96c6"),
  enabled: boolean("enabled").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("edge_confluences_owner_idx").on(t.ownerId)]);

export const strategies = pgTable("edge_strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  entryRules: text("entry_rules").notNull().default(""),
  exitRules: text("exit_rules").notNull().default(""),
  riskRules: text("risk_rules").notNull().default(""),
  timeframe: text("timeframe").notNull().default("H4"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("edge_strategies_owner_idx").on(t.ownerId)]);
