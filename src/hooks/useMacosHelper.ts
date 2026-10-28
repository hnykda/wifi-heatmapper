"use client";
import { useEffect, useState } from "react";
import { MacosHelperStatus } from "@/lib/types";

/**
 * The native macOS Wi-Fi helper: is it working, may it see network names?
 * Only fetched when `enabled` (macOS, helper built, not mock mode).
 */
async function fetchStatus(): Promise<MacosHelperStatus> {
  try {
    const res = await fetch("/api/macos-helper", { cache: "no-store" });
    return (await res.json()) as MacosHelperStatus;
  } catch {
    return { available: false, path: null, error: "No answer" };
  }
}

async function requestAuthorization(): Promise<MacosHelperStatus> {
  const res = await fetch("/api/macos-helper", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "authorize" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as MacosHelperStatus;
}

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export function useMacosHelper(enabled: boolean) {
  const [helper, setHelper] = useState<MacosHelperStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => fetchStatus().then(setHelper);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    fetchStatus().then((status) => {
      if (current) setHelper(status);
    });
    return () => {
      current = false;
    };
  }, [enabled]);

  /** Show the macOS Location prompt (or open System Settings). */
  const authorize = async () => {
    setAsking(true);
    setError(null);
    await requestAuthorization().then(setHelper, (err: unknown) =>
      setError(errorMessage(err)),
    );
    setAsking(false);
  };

  return { helper, asking, error, refresh, authorize };
}
