import type { Outcome } from "./calculations";
import { summarizeJournal } from "./journal-r";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type TimedTrade = Outcome & { session?: string | null };

/** Entry-time cohorts of already filtered closed trades; never infer missing dates or sessions. */
export function temporalAnalytics(rows: TimedTrade[], timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "long", hour: "2-digit", hourCycle: "h23",
  });
  const closed = rows.filter(t => t.status === "closed");
  const dated: { trade: TimedTrade; day: string; hour: string }[] = [];
  for (const trade of closed) {
    if (!trade.entryAt) continue;
    const date = new Date(trade.entryAt);
    if (!Number.isFinite(date.getTime())) continue;
    const parts = formatter.formatToParts(date);
    dated.push({
      trade,
      day: parts.find(p => p.type === "weekday")!.value,
      hour: parts.find(p => p.type === "hour")!.value,
    });
  }
  const group = (id: string, name: string, items: TimedTrade[]) => {
    const metrics = summarizeJournal(items);
    return { id, name, ...metrics, sampleWarning: metrics.rSample < 20 };
  };
  const sessions = [...new Set(closed.map(t => t.session?.trim() || "Not recorded"))]
    .sort((a, b) => a.localeCompare(b));
  return {
    timezone,
    excludedMissingEntry: closed.length - dated.length,
    byDayOfWeek: DAYS.map((day, i) => group(String(i + 1), day, dated.filter(t => t.day === day).map(t => t.trade))),
    byHourOfDay: Array.from({ length: 24 }, (_, i) => {
      const hour = String(i).padStart(2, "0");
      return group(hour, `${hour}:00–${hour}:59`, dated.filter(t => t.hour === hour).map(t => t.trade));
    }),
    byDaySession: DAYS.flatMap((day, i) => sessions.map(session => ({
      ...group(JSON.stringify([i + 1, session]), `${day} · ${session}`,
        dated.filter(t => t.day === day && (t.trade.session?.trim() || "Not recorded") === session).map(t => t.trade)),
      dayId: String(i + 1), session,
    }))),
  };
}
