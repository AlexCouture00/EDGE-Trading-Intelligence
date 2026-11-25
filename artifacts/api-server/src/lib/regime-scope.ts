/** Apply the regime before calculating any analytics; keep choices independent of this selection. */
export function regimeScope<T extends { status: string; regime?: string | null }>(rows: T[], regime?: string) {
  const label = (row: T) => row.regime?.trim() || "Not recorded";
  return {
    availableRegimes: [...new Set(rows.filter(t => t.status === "closed").map(label))]
      .sort((a, b) => a.localeCompare(b)),
    rows: regime ? rows.filter(t => label(t) === regime) : rows,
  };
}
