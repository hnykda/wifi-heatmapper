/**
 * Server-Sent-Events
 * These are triggered by a GET to /api/events
 */

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

  // Create a proper streaming response
  const responseStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": ping\n\n"));
      // Set up the send function for external access
      sendToClient = (msg: SSEMessageType) => {
        const data = `data: ${JSON.stringify(msg)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      // Send initial ready message
      console.log(`Client connected`);
      sendToClient({
        type: "ready",
        status: `Client connected to SSE server`,
        header: "",
      });

      // Setup heartbeat
      const heartbeat = setInterval(() => {
        console.log(`heartbeat`);
        if (sendToClient) {
          sendToClient({
            type: "heartbeat",
            header: "",
            status: new Date().toISOString(),
          });
        } else {
          clearInterval(heartbeat);
        }
      }, 5000);

      // Clean up on disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sendToClient = null;
        controller.close();
        console.log(`Client disconnected`);
      });
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform, must-revalidate",
      Connection: "keep-alive",
      // These are crucial to prevent buffering
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Sends a message to all connected SSE clients
 */
// export function sendSSEMessage(message: SSEMessageType): void {
//   console.log(`sendSSEMessage: ${JSON.stringify(message)}`);
//   clients.forEach((client) => {
//     try {
//       client.controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
//     } catch (error) {
//       console.error(`Error sending message to client ${client.id}:`, error);
//       clients = clients.filter((c) => c.id !== client.id);
//     }
//   });
// }
