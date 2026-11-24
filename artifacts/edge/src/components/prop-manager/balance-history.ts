import { balanceHistory } from "@workspace/prop-math";
import type { PropAccount, PropBalance } from "@workspace/api-client-react";

export function validateBalanceDate(day: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number(day.slice(0, 4)) < 1
    || !Number.isFinite(Date.parse(`${day}T00:00:00Z`))
    || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    return "Choose a valid balance date.";
  }
  return day > today ? "Balance date cannot be in the future." : null;
}

/** Format calendar dates without letting the browser's timezone shift the day. */
export const balanceDateLabel = (day: string) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC",
}).format(new Date(`${day}T00:00:00Z`));

export function balanceChartPoints(account: Pick<PropAccount, "startingBalance" | "purchasedOn">, entries: PropBalance[]) {
  const history = balanceHistory(account.startingBalance, entries);
  const days = new Map<string, string>();
  // Never insert a later-dated starting balance into older observed history.
  if (!history.length || account.purchasedOn <= history[0].recordedOn) {
    days.set(account.purchasedOn, account.startingBalance);
  }
  // Latest entry wins on a shared calendar day; the audit table retains every entry.
  for (const point of history) days.set(point.recordedOn, point.balance);
  return [...days].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, amount]) => ({ t: Date.parse(`${day}T00:00:00Z`), v: Number(amount) }));
}
