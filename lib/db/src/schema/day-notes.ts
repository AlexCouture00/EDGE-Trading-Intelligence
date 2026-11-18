import { date, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dayNotes = pgTable("edge_day_notes", {
  ownerId: text("owner_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  wentWell: text("went_well").notNull().default(""),
  wentBadly: text("went_badly").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.day] })]);

export const insertDayNoteSchema = createInsertSchema(dayNotes).omit({ updatedAt: true });
export type InsertDayNote = z.infer<typeof insertDayNoteSchema>;
export type DayNote = typeof dayNotes.$inferSelect;
