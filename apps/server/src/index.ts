import type { ServerWebSocket } from "bun";
import { GameDatabase } from "./db";

const PORT = 8080;

type PlayerColor = "white" | "black";

interface Room {
  white: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
  black: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
  gameId?: number;
  moveCount: number;
}

const rooms = new Map<string, Room>();
const dbPath = process.env.DATABASE_PATH || "quantum-chess.db";
const db = new GameDatabase(dbPath);

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
    const pathname = url.pathname;

    // HTML from apps/web/public
    if (pathname === "/" || pathname.endsWith(".html")) {
      const htmlPath = pathname === "/" ? "/index.html" : pathname;
      const file = Bun.file("./apps/web/public" + htmlPath);
      if (await file.exists()) return new Response(file);
    }

    // JS from dist/web
    if (pathname.endsWith(".js")) {
      const file = Bun.file("./dist/web" + pathname);
      if (await file.exists()) return new Response(file);
    }

    // WASM from dist/wasm
    if (pathname.includes("/wasm/")) {
      const file = Bun.file("./dist" + pathname);
      if (await file.exists()) return new Response(file);
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
            moveCount: 0,
          });

          ws.data = { room: roomCode, color: "white" };

          ws.send(JSON.stringify({
            type: "room_created",
            roomCode,
            color: "white",
          }));
          console.log(`Room created: ${roomCode}`);
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

          // Create game record
          const gameId = db.createGame(
            data.roomCode,
            "white_player",  // TODO: Add player names
            "black_player"
          );
          room.gameId = gameId;
          console.log(`Game started: ${data.roomCode} (ID: ${gameId})`);
          break;
        }

        case "move": {
          if (!ws.data?.room) return;

          const room = rooms.get(ws.data.room);
          if (!room) return;

          const opponent = ws.data.color === "white" ? room.black : room.white;

          // Record move in database
          if (room.gameId) {
            room.moveCount++;
            db.recordMove(
              room.gameId,
              room.moveCount,
              ws.data.color,
              data.from,
              data.to,
              data.wasCapture || false,
              data.wasCheck || false
            );
          }

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

      // End game if it was started
      if (room.gameId) {
        const winner = ws.data.color === "white" ? "black" : "white";
        db.endGame(room.gameId, winner, "disconnect");
        console.log(`Game ended: ${ws.data.room} - ${winner} wins by disconnect`);
      }

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
