import type { EquityPoint } from "@workspace/api-client-react";

export function rDrawdown(data: Pick<EquityPoint, "cumulativeR">[]) {
  let peak = 0;
  return data.map(p => {
    peak = Math.max(peak, p.cumulativeR);
    return peak - p.cumulativeR;
  });
}

export function maxRDrawdown(data: Pick<EquityPoint, "cumulativeR">[]) {
  return rDrawdown(data).reduce((max, dd) => Math.max(max, dd), 0);
}

export function totalRecordedR(trades: { status: string; realizedR: string | null }[]) {
  const measured = trades.filter(t => t.status === "closed" && t.realizedR !== null);
  return measured.length ? measured.reduce((sum, t) => sum + Number(t.realizedR), 0) : null;
}
