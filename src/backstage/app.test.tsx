// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { appTreeApiRef, useApi } from "@backstage/frontend-plugin-api";
import { createCostellationApp } from "./app";

vi.mock("../CostellationPage", () => ({
  CostellationPage: function Probe() {
    const { tree } = useApi(appTreeApiRef).getTree();
    return (
      <div data-testid="backstage-plugin">
        {String(tree.nodes.has("page:costellation"))}
      </div>
    );
  },
}));

test("boots the real Backstage app and mounts the registered Costellation plugin", async () => {
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  const app = createCostellationApp(window.location.origin);
  render(app.createRoot());
  expect(
    (await screen.findByTestId("backstage-plugin", {}, { timeout: 15000 }))
      .textContent,
  ).toBe("true");
});
