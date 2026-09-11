"use client";
import { useEffect, useState } from "react";
import { AppStatus } from "@/lib/types";

// One fetch per page load, shared by every component that asks.
let cache: AppStatus | null = null;
let inflight: Promise<AppStatus | null> | null = null;

export async function fetchAppStatus(): Promise<AppStatus | null> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/status")
      .then(async (res) => {
        if (!res.ok) return null;
        cache = (await res.json()) as AppStatus;
        return cache;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Facts about the running server: version, OS, mock mode, iperf3. */
export function useAppStatus(): AppStatus | null {
  const [status, setStatus] = useState<AppStatus | null>(cache);
  useEffect(() => {
    if (status) return;
    let alive = true;
    fetchAppStatus().then((s) => alive && s && setStatus(s));
    return () => {
      alive = false;
    };
  }, [status]);
  return status;
}
