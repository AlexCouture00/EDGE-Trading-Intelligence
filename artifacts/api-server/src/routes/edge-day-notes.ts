import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, dayNotes } from "@workspace/db";
import {
  ListDayNotesQueryParams, ListDayNotesResponse,
  SaveDayNoteParams, SaveDayNoteBody, SaveDayNoteResponse, DeleteDayNoteParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/edge-data";

const router: IRouter = Router();

// Calendar dates must stay date-only, independent of the session timezone.
function calendarDay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number(value.slice(0, 4)) < 1 ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, "Use a valid calendar date (YYYY-MM-DD).");
  }
  return value;
}
const view = (row: typeof dayNotes.$inferSelect) => ({
  day: row.day, wentWell: row.wentWell, wentBadly: row.wentBadly,
  updatedAt: row.updatedAt.toISOString(),
});

router.get("/day-notes", async (req, res): Promise<void> => {
  const query = ListDayNotesQueryParams.parse(req.query);
  const from = calendarDay(query.from), to = calendarDay(query.to);
  if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) {
    throw new HttpError(400, "Choose an ordered date range of at most one year.");
  }
  const rows = await db.select().from(dayNotes).where(and(
    eq(dayNotes.ownerId, res.locals.ownerId), gte(dayNotes.day, from), lte(dayNotes.day, to),
  )).orderBy(asc(dayNotes.day));
  res.json(ListDayNotesResponse.parse(rows.map(view)));
});

router.put("/day-notes/:day", async (req, res): Promise<void> => {
  const day = calendarDay(SaveDayNoteParams.parse(req.params).day);
  const data = SaveDayNoteBody.strict().parse(req.body);
  if (!data.wentWell.trim() && !data.wentBadly.trim()) {
    throw new HttpError(400, "Write a reflection before saving, or use Remove note.");
  }
  const [row] = await db.insert(dayNotes).values({
    ownerId: res.locals.ownerId, day, ...data,
  }).onConflictDoUpdate({
    target: [dayNotes.ownerId, dayNotes.day],
    set: { ...data, updatedAt: new Date() },
  }).returning();
  res.json(SaveDayNoteResponse.parse(view(row!)));
});

router.delete("/day-notes/:day", async (req, res): Promise<void> => {
  const day = calendarDay(DeleteDayNoteParams.parse(req.params).day);
  await db.delete(dayNotes).where(and(eq(dayNotes.ownerId, res.locals.ownerId), eq(dayNotes.day, day)));
  res.sendStatus(204);
});

export default router;
