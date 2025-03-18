/**
 * Server-Sent-Events
 */

import { NextRequest } from "next/server";

type SSEClient = {
  id: number;
  controller: ReadableStreamDefaultController;
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
      const send = (message: string) => {
        controller.enqueue(`data: ${JSON.stringify({ message })}\n\n`);
      };

      const newClient: SSEClient = { id: clientId, controller };
      clients.push(newClient);
      console.log(`Clients: ${JSON.stringify(clients)}`);

      console.log(`Client ${clientId} connected`);
      send(`Client ${clientId} connected to SSE server`);

      req.signal.addEventListener("abort", () => {
        clients = clients.filter((client) => client.id !== clientId);
        controller.close();
        console.log(`Client ${clientId} disconnected`);
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
export function sendSSEMessage(message: string): void {
  clients.forEach((client) => {
    try {
      client.controller.enqueue(`data: ${JSON.stringify({ message })}\n\n`);
    } catch (error) {
      console.error(`Error sending message to client ${client.id}:`, error);
      clients = clients.filter((c) => c.id !== client.id);
    }
  });
}
