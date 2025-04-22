// lib/sseGlobal.ts

/**
 * This module keeps (truly) global variables.
 * They need to be available to all server-side code
 * They include:
 *
 * * sendSSEMessage
 * * cancelMeasurement (maybe)
 */
import type { SSEMessageType } from "@/app/api/events/route";

const SSE_KEY = "__sseSend__";
const CANCEL_KEY = "__sseFlag__";

export function registerSSESender(fn: (msg: SSEMessageType) => void) {
  (globalThis as any)[SSE_KEY] = fn;
}

export function clearSSESender() {
  // console.log(`clearing sendToClient: ${sendToClient}`);
  (globalThis as any)[SSE_KEY] = null;
}

export function sendSSEMessage(msg: SSEMessageType) {
  const fn = (globalThis as any)[SSE_KEY] as
    | ((msg: SSEMessageType) => void)
    | null;
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
