// /**
//  * Server-Sent-Events
//  * These are triggered by a GET to /api/events
//  */

import { NextRequest } from "next/server";
import {
  registerSSESender,
  clearSSESender,
  sendSSEMessage,
} from "../../../lib/sseGlobal";

export type SSEMessageType = {
  type: string;
  header: string;
  status: string;
};

// sendToClient is a function that encodes and sends the mgs
// Initialize it to null; it'll be created when /api/events arrives
// let sendToClient: ((msg: SSEMessageType) => void) | null = null;

// export async function sendSSEMessage(msg: SSEMessageType) {
//   console.log(`SSE message to send: ${JSON.stringify(msg)}`);
//   if (sendToClient) {
//     sendToClient(msg);
//   } else {
//     console.warn("No SSE client to send to");
//   }
// }

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Safari buffering hack: pad with 2KB of comment lines
  const prelude = ": ".padEnd(2049, " ") + "\r\n";
  writer.write(encoder.encode(prelude));
  writer.write(encoder.encode(": connected\r\n\r\n"));

  // Assign the live send function
  const sendToClient = (msg: SSEMessageType) => {
    const data = `data: ${JSON.stringify(msg)}\r\n\r\n`;
    writer.write(encoder.encode(data));
  };
  registerSSESender(sendToClient); // 🔧 moved here

  // Send a ready event
  console.log("SSE client connected");
  sendSSEMessage({
    type: "ready",
    header: "",
    status: "SSE connection established",
  });

  // Heartbeat every 5 seconds
  const heartbeat = setInterval(() => {
    // console.log(`heartbeat`);
    sendSSEMessage({
      type: "heartbeat",
      header: "",
      status: new Date().toISOString(),
    });
  }, 5000);

  // Cleanup on client disconnect
  req.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    clearSSESender();
    writer.close();
    console.log("SSE client disconnected");
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}
