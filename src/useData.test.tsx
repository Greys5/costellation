// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useData } from "./useData";

afterEach(() => vi.unstubAllGlobals());

test("refresh forces one request; navigation after refresh reuses the backend cache", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { total: "1" }, meta: { cached: true } }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const { result, rerender } = renderHook(
    ({ path, revision }) => useData(path, revision),
    { initialProps: { path: "/api/costs?start=a", revision: 0 } },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  rerender({ path: "/api/costs?start=a", revision: 1 });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetchMock.mock.calls[1][0]).toBe("/api/costs?start=a&refresh=true");
  rerender({ path: "/api/costs?start=b", revision: 1 });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetchMock.mock.calls[2][0]).toBe("/api/costs?start=b");
});

test("a late response from an old filter cannot replace the new filter result", async () => {
  let resolveOld: (value: unknown) => void = () => {};
  const old = new Promise((resolve) => {
    resolveOld = resolve;
  });
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(old)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: "new" }) });
  vi.stubGlobal("fetch", fetchMock);
  const { result, rerender } = renderHook(({ path }) => useData<string>(path), {
    initialProps: { path: "/old" },
  });
  rerender({ path: "/new" });
  await waitFor(() => expect(result.current.result?.data).toBe("new"));
  await act(async () => {
    resolveOld({ ok: true, json: async () => ({ data: "old" }) });
  });
  expect(result.current.result?.data).toBe("new");
});

test("refresh retains dependent query inputs while awaiting updated data", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { earliest: "2025-10-01" } }),
    })
    .mockReturnValueOnce(new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const { result, rerender } = renderHook(
    ({ revision }) => useData<{ earliest: string }>("/api/options", revision),
    { initialProps: { revision: 0 } },
  );
  await waitFor(() =>
    expect(result.current.result?.data.earliest).toBe("2025-10-01"),
  );
  rerender({ revision: 1 });
  expect(result.current.loading).toBe(true);
  expect(result.current.result?.data.earliest).toBe("2025-10-01");
});
