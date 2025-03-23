// lib/sseGlobal.ts
import type { SSEMessageType } from "@/app/api/events/route";

const SSE_KEY = "__sseSend__";

export function registerSSESender(fn: (msg: SSEMessageType) => void) {
  // console.log("[sseSession] registerSSESender");
  (globalThis as any)[SSE_KEY] = fn;
}

export function clearSSESender() {
  // console.log(`clearing sendToClient: ${sendToClient}`);
  (globalThis as any)[SSE_KEY] = null;
}

export function sendSSEMessage(msg: SSEMessageType) {
  console.log(
    `[sseSession] sendSSEMessage", !!sendToClient ${JSON.stringify(msg)}`,
  );
  const fn = (globalThis as any)[SSE_KEY] as
    | ((msg: SSEMessageType) => void)
    | null;
  if (fn) {
    fn(msg);
  } else {
    console.warn("No SSE client to send to");
  }
}
