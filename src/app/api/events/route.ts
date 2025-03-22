/**
 * Server-Sent-Events
 * These are triggered by a GET to /api/events
 */

import { NextRequest } from "next/server";

type SSEClient = {
  id: number;
  controller: ReadableStreamDefaultController;
};
export type SSEMessageType = {
  type: string; // done, update (error is a "done" type)
  header: string; // header string to be displayed
  status: string; // status string to be displayed
};

let clients: SSEClient[] = [];
let clientIdCounter = 0;

/**
 * Handles incoming SSE connections
 */
export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const clientId = clientIdCounter++;
      const send = (message: {
        status: string;
        type: string;
        header: string;
      }) => {
        controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
      };

      const newClient: SSEClient = { id: clientId, controller };
      clients.push(newClient);
      console.log(`Clients: ${JSON.stringify(clients)}`);

      console.log(`Client ${clientId} connected (${clients.length})`);
      send({
        status: `Client ${clientId} connected to SSE server`,
        type: "info",
        header: "",
      });

      req.signal.addEventListener("abort", () => {
        clients = clients.filter((client) => client.id !== clientId);
        controller.close();
        console.log(`Client ${clientId} disconnected (${clients.length})`);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Sends a message to all connected SSE clients
 */
export function sendSSEMessage(message: SSEMessageType): void {
  console.log(`sendSSEMessage: ${JSON.stringify(message)}`);
  clients.forEach((client) => {
    try {
      client.controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
    } catch (error) {
      console.error(`Error sending message to client ${client.id}:`, error);
      clients = clients.filter((c) => c.id !== client.id);
    }
  });
}
