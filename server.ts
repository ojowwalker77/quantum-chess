import type { ServerWebSocket } from "bun";

const PORT = 8080;

type PlayerColor = "white" | "black";

interface Room {
  white: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
  black: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
}

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const server = Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (server.upgrade(req)) {
      return;
    }

    // Serve static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file("." + filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("404 Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      console.log("Client connected");
    },

    message(ws, message) {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case "create_room": {
          const roomCode = generateRoomCode();
          rooms.set(roomCode, {
            white: ws as ServerWebSocket<{ room: string; color: PlayerColor }>,
            black: null,
          });

          ws.data = { room: roomCode, color: "white" };

          ws.send(JSON.stringify({
            type: "room_created",
            roomCode,
            color: "white",
          }));
          break;
        }

        case "join_room": {
          const room = rooms.get(data.roomCode);

          if (!room) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room not found",
            }));
            return;
          }

          if (room.black) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room is full",
            }));
            return;
          }

          room.black = ws as ServerWebSocket<{ room: string; color: PlayerColor }>;
          ws.data = { room: data.roomCode, color: "black" };

          ws.send(JSON.stringify({
            type: "room_joined",
            roomCode: data.roomCode,
            color: "black",
          }));

          room.white?.send(JSON.stringify({
            type: "opponent_joined",
          }));
          break;
        }

        case "move": {
          if (!ws.data?.room) return;

          const room = rooms.get(ws.data.room);
          if (!room) return;

          const opponent = ws.data.color === "white" ? room.black : room.white;

          if (opponent) {
            opponent.send(JSON.stringify({
              type: "opponent_move",
              from: data.from,
              to: data.to,
            }));
          }
          break;
        }
      }
    },

    close(ws) {
      if (!ws.data?.room) return;

      const room = rooms.get(ws.data.room);
      if (!room) return;

      const opponent = ws.data.color === "white" ? room.black : room.white;

      if (opponent) {
        opponent.send(JSON.stringify({
          type: "opponent_disconnected",
        }));
      }

      rooms.delete(ws.data.room);
    },
  },
});

console.log(`Server running at http://localhost:${PORT}/`);
console.log(`WebSocket server running on ws://localhost:${PORT}/`);
