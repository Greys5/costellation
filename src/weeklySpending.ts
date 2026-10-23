export type DailySpend = { start: string; total: string };

export function weeksInMonth(
  month: string,
  end: string,
  periods: DailySpend[],
) {
  const totals = new Map(periods.map((day) => [day.start, Number(day.total)]));
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const result: { label: string; cost: number }[] = [];
  for (let first = 1; first <= lastDay; first += 7) {
    const last = Math.min(first + 6, lastDay);
    let cost = 0;
    let hasDay = false;
    for (let day = first; day <= last; day++) {
      const key = `${month}-${String(day).padStart(2, "0")}`;
      if (key >= end) break;
      hasDay = true;
      cost += totals.get(key) || 0;
    }
    if (hasDay) result.push({ label: `${first}–${last}`, cost });
  }
  return result;
}
