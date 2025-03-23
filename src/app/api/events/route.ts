// /**
//  * Server-Sent-Events
//  * These are triggered by a GET to /api/events
//  */

import { NextRequest } from "next/server";

export type SSEMessageType = {
  type: string;
  header: string;
  status: string;
};

let sendToClient: ((msg: SSEMessageType) => void) | null = null;

export function sendSSEMessage(msg: SSEMessageType) {
  if (sendToClient) {
    sendToClient(msg);
  } else {
    console.warn("No SSE client to send to");
  }
}

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // SSE stream must send something immediately for Safari/Firefox
  writer.write(encoder.encode(": connected\n\n")); // comment line
  writer.write(encoder.encode(": ".padEnd(2049, " ") + "\n")); // padding to force flush

  // Assign the live send function
  sendToClient = (msg: SSEMessageType) => {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    writer.write(encoder.encode(data));
  };

  // Send a ready event
  console.log("SSE client connected");
  sendToClient({
    type: "ready",
    header: "",
    status: "SSE connection established",
  });

  // Heartbeat every 5 seconds
  const heartbeat = setInterval(() => {
    sendToClient?.({
      type: "heartbeat",
      header: "",
      status: new Date().toISOString(),
    });
  }, 5000);

  // Cleanup on client disconnect
  req.signal.addEventListener("abort", () => {
    console.log("SSE client disconnected");
    clearInterval(heartbeat);
    sendToClient = null;
    writer.close();
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}

// // app/api/events/route.ts
// import { NextRequest } from "next/server";

// export async function GET(_req: NextRequest) {
//   const encoder = new TextEncoder();
//   const stream = new TransformStream();
//   const writer = stream.writable.getWriter();

//   // Flush something immediately
//   writer.write(encoder.encode(`data: "hello"\n\n`));
//   writer.write(encoder.encode(": ".padEnd(2049, " ") + "\n")); // Safari flush trick

//   // Send a second message after 2 seconds
//   setTimeout(() => {
//     writer.write(encoder.encode(`data: "second message"\n\n`));
//   }, 2000);

//   return new Response(stream.readable, {
//     headers: {
//       "Content-Type": "text/event-stream",
//       "Cache-Control": "no-cache, no-transform, must-revalidate",
//       Connection: "keep-alive",
//       "X-Accel-Buffering": "no",
//       "Content-Encoding": "none",
//     },
//   });
// }
