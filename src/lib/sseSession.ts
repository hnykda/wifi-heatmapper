// lib/sseSession.ts
"use server";
import type { SSEMessageType } from "@/app/api/events/route";

console.log("[sseSession] module loaded");

let sendToClient: ((msg: SSEMessageType) => void) | null = null;

export async function registerSSESender(fn: (msg: SSEMessageType) => void) {
  console.log("[sseSession] registerSSESender");
  sendToClient = fn;
}

export async function clearSSESender() {
  console.log(`clearing sendToClient: ${sendToClient}`);
  sendToClient = null;
}

// Change name to sendSSEMessageX to force error
export async function sendSSEMessageX(msg: SSEMessageType) {
  console.log("[sseSession] sendSSEMessage", !!sendToClient);
  if (sendToClient) {
    sendToClient(msg);
  } else {
    console.warn("No SSE client to send to");
  }
}
