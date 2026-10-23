// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CostChangesView, changeSegments } from "./CostellationPage";

const data = {
  base_month: "2026-01-01", compare_month: "2026-02-01", base_total: "100", compare_total: "200", delta: "100",
  group: "SERVICE", estimated: false, rows: [{ key: "Database", previous: "100", current: "200", delta: "100", tag_deltas: { "": "30", prod: "70" } }],
  tag: { key: "environment", tagged_delta: "70", untagged_delta: "30", tagged_share_of_increase: "70" },
};

it("shows the service increase, tag split, and a usable driver drilldown", () => {
  const onSelect = vi.fn();
  render(<CostChangesView names={{}} onSelect={onSelect} data={data} selectedValues={["prod"]} />);
  expect(screen.getAllByText("+$100.00").length).toBeGreaterThan(0);
  expect(screen.getByText("70.0% of this net increase is attributed to environment.")).toBeTruthy();
  expect(screen.getByText("environment=prod")).toBeTruthy();
  expect(screen.getAllByText("No tag value").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Database" }));
  expect(onSelect).toHaveBeenCalledWith("Database");
});

it("keeps a general bar without a tag key and gives tag values distinct colors", () => {
  expect(changeSegments({ ...data, tag: null }, []).series).toEqual([{ id: "total", label: "Total change", color: "#8270d0" }]);
  const segments = changeSegments(data, ["prod"]);
  expect(segments.series.map((item) => item.label)).toEqual(["environment=prod", "No tag value"]);
  expect(new Set(segments.series.map((item) => item.color)).size).toBe(2);
});
