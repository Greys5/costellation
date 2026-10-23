// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MultiSelect } from "./CostellationPage";

it("closes the filter menu when clicking outside or pressing Escape", () => {
  const { container } = render(<MultiSelect label="Accounts" options={[{ value: "a", label: "Alpha" }]} selected={[]} onChange={() => {}} />);
  const details = container.querySelector("details")!;
  fireEvent.click(screen.getByText("Accounts"));
  expect(details.open).toBe(true);
  fireEvent.pointerDown(document.body);
  expect(details.open).toBe(false);
  fireEvent.click(screen.getByText("Accounts"));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(details.open).toBe(false);
});
