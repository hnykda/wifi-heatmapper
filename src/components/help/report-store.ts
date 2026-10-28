"use client";
import { useSyncExternalStore } from "react";

/**
 * Opens the "Report a problem" dialog from anywhere (help menu, measurement
 * panel, error toasts), optionally with the error the app showed.
 */
type ReportState = { open: boolean; problem: string | null };

let state: ReportState = { open: false, problem: null };
const listeners = new Set<() => void>();

function set(next: ReportState) {
  state = next;
  listeners.forEach((l) => l());
}

export function openReport(problem?: string | null) {
  set({ open: true, problem: problem?.trim() || null });
}

export function closeReport() {
  set({ ...state, open: false });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

export function useReportState(): ReportState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
