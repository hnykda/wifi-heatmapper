/**
 * diagnostics-state.ts - small in-memory records for bug reports: which way
 * the Wi-Fi was last read, how the last measurement went, and the network
 * names and BSSIDs seen (so they can be hidden in reports). Never written to
 * disk. Kept on globalThis because Next.js may load modules more than once.
 */

export interface WifiMethodRecord {
  /** e.g. "macOS Wi-Fi helper (CoreWLAN)", "iw", "netsh" */
  method: string;
  /** e.g. why the WLAN API fell back to netsh */
  detail?: string;
  at: string; // ISO time
}

export interface MeasurementRecord {
  at: string; // ISO time it ended
  ok: boolean;
  speedTests: boolean;
  error?: string; // why it failed
  note?: string; // e.g. why speed was not measured
}

interface State {
  wifiMethod: WifiMethodRecord | null;
  measurement: MeasurementRecord | null;
  pendingNote?: string;
  ssids: Set<string>;
  bssids: Set<string>;
}

const KEY = "__wifiHeatmapperDiagnostics__";
const MAX_NETWORKS = 200;

function state(): State {
  const g = globalThis as unknown as Record<string, State | undefined>;
  if (!g[KEY]) {
    g[KEY] = {
      wifiMethod: null,
      measurement: null,
      ssids: new Set(),
      bssids: new Set(),
    };
  }
  return g[KEY]!;
}

export function recordWifiMethod(method: string, detail?: string): void {
  state().wifiMethod = { method, detail, at: new Date().toISOString() };
}

export function lastWifiMethod(): WifiMethodRecord | null {
  return state().wifiMethod;
}

/** A note about the measurement in progress, e.g. "iperf3 server unreachable". */
export function recordMeasurementNote(note: string): void {
  state().pendingNote = note;
}

/** The measurement ended; a note recorded while it ran is kept with it. */
export function recordMeasurement(record: Omit<MeasurementRecord, "at">): void {
  const s = state();
  s.measurement = {
    ...record,
    note: record.note ?? s.pendingNote,
    at: new Date().toISOString(),
  };
  s.pendingNote = undefined;
}

export function lastMeasurement(): MeasurementRecord | null {
  return state().measurement;
}

/** Remember network names and BSSIDs so reports can hide them. */
export function rememberNetworks(
  networks: { ssid?: string; bssid?: string }[],
): void {
  const s = state();
  for (const n of networks) {
    if (n.ssid && s.ssids.size < MAX_NETWORKS) s.ssids.add(n.ssid);
    if (n.bssid && s.bssids.size < MAX_NETWORKS) s.bssids.add(n.bssid);
  }
}

export function seenNetworks(): { ssids: string[]; bssids: string[] } {
  const s = state();
  return { ssids: [...s.ssids], bssids: [...s.bssids] };
}
