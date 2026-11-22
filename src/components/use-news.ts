"use client";
import { useEffect, useState } from "react";
import {
  newsSnapshotSchema,
  type NewsSnapshot,
  type NewsTopic,
} from "@/lib/news";
export function useNews(topics: NewsTopic[]) {
  const key = topics.join(","),
    [snapshot, setSnapshot] = useState<NewsSnapshot | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSnapshot((previous) =>
      previous?.topics.join(",") === key ? previous : null,
    );
    void fetch("/api/news?" + new URLSearchParams({ topics: key }), {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            "The news reader could not be reached. Any headlines below are from the last successful request.",
          );
        const result = newsSnapshotSchema.parse(await response.json());
        if (result.topics.join(",") !== key)
          throw Error(
            "The news topics changed during loading. Try refreshing.",
          );
        if (alive) setSnapshot(result);
      })
      .catch((error) => {
        if (alive && !controller.signal.aborted)
          setError(
            error?.name === "ZodError" || error instanceof SyntaxError
              ? "The publisher snapshot could not be verified. Try refreshing."
              : error?.name === "TimeoutError"
                ? "The publishers took too long to respond. Any headlines below are from the last successful request."
                : error instanceof TypeError
                  ? "The news reader could not be reached. Any headlines below are from the last successful request."
                  : error instanceof Error
                    ? error.message
                    : "The news reader could not finish. Try refreshing.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [key, revision]);
  return {
    data: snapshot?.topics.join(",") === key ? snapshot : null,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}
