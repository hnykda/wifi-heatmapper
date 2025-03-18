import { WebSocketServer } from "ws";
import { NextRequest } from "next/server";

let wss: WebSocketServer | null = null;

export async function GET(req: NextRequest) {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (ws) => {
      ws.send(JSON.stringify({ message: "Connected to WebSocket server" }));
    });
  }

  return new Response(null, { status: 101 });
}

// Function to send WebSocket messages
export function sendWebSocketMessage(data: string) {
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ message: data }));
      }
    });
  }
}
