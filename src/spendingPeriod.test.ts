import { describe, expect, it } from "vitest";
import { availableDays, monthChoices, spendingWindow } from "./spendingPeriod";

describe("spending period windows", () => {
  it("shows six calendar months including the current month", () => {
    expect(
      spendingWindow("six-months", "2026-10-23", "", "", "", "DAILY"),
    ).toEqual({
      start: "2026-05-01",
      end: "2026-10-23",
      granularity: "MONTHLY",
    });
  });

  it("queries the full selected month for both daily and weekly comparisons", () => {
    expect(
      spendingWindow("month", "2026-10-23", "", "", "2026-10", "MONTHLY"),
    ).toEqual({
      start: "2026-10-01",
      end: "2026-10-23",
      granularity: "DAILY",
    });
    expect(
      spendingWindow("week", "2026-10-23", "", "", "2026-10", "MONTHLY"),
    ).toEqual({
      start: "2026-10-01",
      end: "2026-10-23",
      granularity: "DAILY",
    });
  });

  it("keeps custom dates and granularity", () => {
    expect(
      spendingWindow(
        "range",
        "2026-10-23",
        "2026-09-03",
        "2026-09-10",
        "",
        "DAILY",
      ),
    ).toEqual({
      start: "2026-09-03",
      end: "2026-09-10",
      granularity: "DAILY",
    });
  });

  it("offers completed months as dropdown choices", () => {
    expect(monthChoices("2026-08-01", "2026-10-23")).toEqual([
      { value: "2026-10", label: "October 2026" },
      { value: "2026-09", label: "September 2026" },
      { value: "2026-08", label: "August 2026" },
    ]);
    expect(monthChoices("2026-09-01", "2026-10-01").map((choice) => choice.value)).toEqual(["2026-09"]);
    expect(availableDays("2026-10", "2026-10-23")).toBe(22);
  });

  it("limits the daily month view to an inclusive custom day range", () => {
    expect(spendingWindow("month", "2026-10-23", "", "", "2026-10", "MONTHLY", { from: 8, to: 15 })).toEqual({
      start: "2026-10-08", end: "2026-10-16", granularity: "DAILY",
    });
    expect(spendingWindow("month", "2026-10-23", "", "", "2026-10", "MONTHLY", { from: 20, to: 31 })).toEqual({
      start: "2026-10-20", end: "2026-10-23", granularity: "DAILY",
    });
  });
});
