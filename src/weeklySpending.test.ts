import { describe, expect, it } from "vitest";
import { weeksInMonth } from "./weeklySpending";

describe("weekly spending", () => {
  it("buckets days within the selected month and respects the exclusive end", () => {
    expect(
      weeksInMonth("2026-10", "2026-10-16", [
        { start: "2026-10-01", total: "2.5" },
        { start: "2026-10-07", total: "1" },
        { start: "2026-10-08", total: "-0.5" },
        { start: "2026-10-15", total: "4" },
      ]),
    ).toEqual([
      { label: "1–7", cost: 3.5 },
      { label: "8–14", cost: -0.5 },
      { label: "15–21", cost: 4 },
    ]);
  });

  it("shows every week of a completed month for comparison", () => {
    const rows = weeksInMonth("2026-10", "2026-11-01", [
      { start: "2026-10-02", total: "10" },
      { start: "2026-10-09", total: "20" },
      { start: "2026-10-16", total: "30" },
      { start: "2026-10-23", total: "40" },
      { start: "2026-10-30", total: "50" },
    ]);
    expect(rows).toEqual([
      { label: "1–7", cost: 10 },
      { label: "8–14", cost: 20 },
      { label: "15–21", cost: 30 },
      { label: "22–28", cost: 40 },
      { label: "29–31", cost: 50 },
    ]);
  });
});
