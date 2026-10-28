"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { UsageCountsInfo } from "@/lib/usage-counts";

// One shared copy for every component that shows usage counts.
let current: UsageCountsInfo | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(info: UsageCountsInfo | null) {
  current = info;
  for (const l of listeners) l();
}

function load(): Promise<void> {
  loading ??= fetch("/api/telemetry")
    .then(async (res) => (res.ok ? set(await res.json()) : undefined))
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function patch(body: { enabled: boolean }): Promise<boolean> {
  try {
    const res = await fetch("/api/telemetry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    set(await res.json());
    return true;
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Usage counts on this computer (GET /api/telemetry), and how to change them. */
export function useUsageCounts() {
  const info = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  useEffect(() => {
    if (!current) void load();
  }, []);
  const setEnabled = useCallback((enabled: boolean) => patch({ enabled }), []);
  return { info, setEnabled, reload: load };
}
