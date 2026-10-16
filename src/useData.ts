import { useEffect, useRef, useState } from "react";
export type Envelope<T> = {
  data: T;
  meta: { retrieved_at: string; cached: boolean };
};
export function useData<T>(path: string | null, revision = 0) {
  const [result, setResult] = useState<Envelope<T> | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const seenRevision = useRef(revision);
  const previousPath = useRef(path);
  useEffect(() => {
    const forceRefresh = revision !== seenRevision.current;
    seenRevision.current = revision;
    const pathChanged = path !== previousPath.current;
    previousPath.current = path;
    if (!path) {
      setResult(null);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (pathChanged) setResult(null);
    fetch(
      path +
        (forceRefresh ? `${path.includes("?") ? "&" : "?"}refresh=true` : ""),
      { signal: controller.signal },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new Error(
            typeof body.detail === "string"
              ? body.detail
              : "The query could not be completed. Check the date range and filters.",
          );
        return body;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError")
          setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { result, error, loading };
}
