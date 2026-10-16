import { expect, test } from "vitest";
import { selectActiveTag } from "./tagSelection";

test("uses actual active allocation keys and preserves valid selection", () => {
  const tags = [
    { TagKey: "environment", Status: "Active" },
    { TagKey: "team", Status: "Active" },
    { TagKey: "owner", Status: "Inactive" },
  ];
  expect(selectActiveTag("unavailable-tag", tags)).toBe("environment");
  expect(selectActiveTag("team", tags)).toBe("team");
  expect(selectActiveTag("owner", tags)).toBe("environment");
  expect(selectActiveTag("environment", [])).toBe("");
});
