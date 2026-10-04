"use client";
import { useCallback, useEffect, useState } from "react";
import { MacosHelperStatus } from "@/lib/types";

/**
 * The native macOS Wi-Fi helper: is it working, may it see network names?
 * Only fetched when `enabled` (macOS, helper built, not mock mode).
 */
export function useMacosHelper(enabled: boolean) {
  const [helper, setHelper] = useState<MacosHelperStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/macos-helper", { cache: "no-store" });
      setHelper((await res.json()) as MacosHelperStatus);
    } catch {
      setHelper({ available: false, path: null, error: "No answer" });
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  /** Show the macOS Location prompt (or open System Settings). */
  const authorize = useCallback(async () => {
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/macos-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "authorize" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setHelper(body as MacosHelperStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAsking(false);
    }
  }, []);

  return { helper, asking, error, refresh, authorize };
}
