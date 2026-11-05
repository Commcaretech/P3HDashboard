"use client";
import { useEffect, useState } from "react";
import { request } from "./common";
import { useWorkspaceCache } from "./workspace-cache";
export function useResource<T>(
  family: string,
  url: string,
  revision: unknown = 0,
) {
  const cache = useWorkspaceCache(),
    key = `resource:${family}:${url}`;
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
  }>(() => ({ key, data: cache?.get<T>(key) ?? null, error: "" }));
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const loader = () => request(url);
    const present = cache?.get<T>(key);
    const promise =
      present && cache
        ? cache
            .fetch(
              "permission-check",
              () => request("/api/data?section=access"),
              true,
              0,
            )
            .then(() => present)
        : cache
          ? cache.fetch<T>(key, loader)
          : loader();
    promise
      .then((data) => {
        if (active) setState({ key, data, error: "" });
      })
      .catch((e) => {
        if (active && !(e instanceof DOMException && e.name === "AbortError"))
          setState((s) => ({
            ...s,
            key,
            error: e instanceof Error ? e.message : "Unable to load records",
          }));
      });
    return () => {
      active = false;
    };
  }, [key, url, cache, revision, retry]);
  return {
    data: state.data,
    error: state.error,
    busy: state.key !== key || !state.data,
    reload: () => {
      cache?.invalidate((k) => k === key);
      setRetry((n) => n + 1);
    },
  };
}
