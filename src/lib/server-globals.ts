// lib/sseGlobal.ts

/**
 * This module keeps (truly) global variables.
 * They need to be available to all server-side code
 * They include:
 *
 * * sendSSEMessage - register the function that sends SSE's
 * * cancelMeasurement (maybe)
 */
import type { SSEMessageType } from "@/app/api/events/route";
import { SurveyResult } from "./types";

const SSE_KEY = "__sseSend__";
const CANCEL_KEY = "__sseFlag__";
const STATUS_KEY = "__status__";
const RESULTS_KEY = "__results__";
// const SSID_KEY = "__ssid__";

export function registerSSESender(fn: (msg: SSEMessageType) => void) {
  (globalThis as any)[SSE_KEY] = fn;
}

export function clearSSESender() {
  (globalThis as any)[SSE_KEY] = null;
}

// the SSE_KEY element holds a function to call to send a SSE
export function sendSSEMessage(msg: SSEMessageType) {
  const fn = (globalThis as any)[SSE_KEY] as
    | ((msg: SSEMessageType) => void)
    | null;
  setGlobalStatus(msg); // stash a global copy of the message
  if (fn) {
    fn(msg);
  } else {
    console.warn("No SSE client to send to");
  }
}

// === Boolean flag to cancel the measurement process ===

export function setCancelFlag(value: boolean) {
  (globalThis as any)[CANCEL_KEY] = value;
}

export function getCancelFlag(): boolean {
  return !!(globalThis as any)[CANCEL_KEY];
}

// === Global copy of the current "sendSSEMessage" ===

export function setGlobalStatus(value: SSEMessageType) {
  (globalThis as any)[STATUS_KEY] = value;
}

export function getGlobalStatus(): SSEMessageType {
  return (globalThis as any)[STATUS_KEY];
}

// === Global copy of SurveyResults ===

export function setSurveyResults(value: SurveyResult) {
  (globalThis as any)[RESULTS_KEY] = value;
}

export function getSurveyResults(): SurveyResult {
  return (globalThis as any)[RESULTS_KEY];
}

// Originally used to hold the desired SSID
// in the `scan-wifi` branch, now abandoned
// // === Global copy of the current SSID ===
//
// export function setSSID(value: WifiResults | null) {
//   (globalThis as any)[SSID_KEY] = value;
// }
//
// export function getSSID(): WifiResults | null {
//   return (globalThis as any)[SSID_KEY];
// }


export interface IperfConfig {
  duration: number; // Duration of the test in seconds (`-t` flag)
  parallelStreams: number; // Number of parallel client streams to run (`-P` flag)
  port: number; // Server port to listen on/connect to (`-p` flag)
  udp: boolean; // Use UDP instead of TCP (`-u` flag)
  bandwidth: string | null; // Target bandwidth in bits/sec (e.g., "1M", "100K") (`-b` flag)
  reverse: boolean; // Run in reverse mode (server sends, client receives) (`-R` flag)
  zeroCopy: boolean; // Use a 'zero copy' method of sending data (`-Z` flag)
  interval: number; // Interval in seconds between periodic bandwidth reports (`-i` flag)
  noDelay: boolean; // Set TCP no delay, disabling Nagle's algorithm (`-N` flag)
  jsonOutput: boolean; // Output results in JSON format (always true for programmatic use) (`-J` flag)
}

export const DEFAULT_IPERF_CONFIG: IperfConfig = {
  duration: 10, // 10 seconds
  parallelStreams: 1, // 1 stream
  port: 5201, // Default iperf3 port
  udp: false, // Use TCP by default
  bandwidth: null, // No bandwidth limit by default
  reverse: false, // Client sends, server receives by default
  zeroCopy: false, // No zero copy by default
  interval: 1, // Report every second
  noDelay: false, // Nagle's algorithm enabled by default
  jsonOutput: true, // Always output JSON for programmatic processing
};