export type SpendingPeriod = "six-months" | "range" | "month" | "week";

export function availableDays(month: string, today: string) {
  if (!month || !today || month > today.slice(0, 7)) return 0;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return month === today.slice(0, 7) ? Math.min(last, Number(today.slice(8, 10)) - 1) : last;
}

export function monthChoices(earliest: string, today: string) {
  if (!earliest || !today) return [];
  const cursor = new Date(`${earliest.slice(0, 7)}-01T00:00:00Z`);
  const result: { value: string; label: string }[] = [];
  while (cursor.toISOString().slice(0, 7) <= today.slice(0, 7)) {
    const value = cursor.toISOString().slice(0, 7);
    if (availableDays(value, today) > 0) {
      result.push({ value, label: cursor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result.reverse();
}

export function spendingWindow(
  mode: SpendingPeriod,
  today: string,
  start: string,
  end: string,
  month: string,
  rangeGranularity: string,
  days?: { from: number; to: number },
) {
  if (mode === "range") return { start, end, granularity: rangeGranularity };
  if (mode === "six-months") {
    const current = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    current.setUTCMonth(current.getUTCMonth() - 5);
    return {
      start: current.toISOString().slice(0, 10),
      end: today,
      granularity: "MONTHLY",
    };
  }
  if (!month) return { start: "", end: "", granularity: "DAILY" };
  const next = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
  )
    .toISOString()
    .slice(0, 10);
  const fullEnd = next < today ? next : today;
  if (mode === "month" && days) {
    const last = availableDays(month, today);
    const from = Math.min(Math.max(days.from, 1), last);
    const to = Math.min(Math.max(days.to, from), last);
    const nextDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, to + 1)).toISOString().slice(0, 10);
    return { start: `${month}-${String(from).padStart(2, "0")}`, end: nextDay < fullEnd ? nextDay : fullEnd, granularity: "DAILY" };
  }
  return {
    start: `${month}-01`,
    end: fullEnd,
    granularity: "DAILY",
  };
}
