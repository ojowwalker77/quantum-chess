import type { ServerWebSocket } from "bun";
import { GameDatabase } from "./db";
import { ClassicalBoard, type Position } from "./chess";
import { QuantumStateManager } from "./quantum-state";

const PORT = 8080;

type PlayerColor = "white" | "black";

interface Room {
  white: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
  black: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
  board: ClassicalBoard; // Single source of truth
  quantumState: QuantumStateManager; // Quantum view management
  gameId?: number;
  moveCount: number;
}

const rooms = new Map<string, Room>();
const dbPath = process.env.DATABASE_PATH || "quantum-chess.db";
const db = new GameDatabase(dbPath);

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Send complete game state to a player
function sendGameState(
  ws: ServerWebSocket<{ room: string; color: PlayerColor }>,
  room: Room
): void {
  if (!ws.data) return;

  // Get player's own pieces (classical view from server)
  const myPieces = room.quantumState.getMyPieces(ws.data.color);

  // Get opponent's quantum pieces (what player sees of opponent)
  const opponentQuantum = room.quantumState.getOpponentQuantumState(ws.data.color);

  // Format quantum states for client
  const opponentQuantumStates = opponentQuantum.map(qp => ({
    piece: qp.piece.type,
    color: qp.piece.color,
    positions: qp.positions,
    probability: qp.probability
  }));

  // Check if player is in check
  const isInCheck = room.board.isInCheck(ws.data.color);

  ws.send(JSON.stringify({
    type: "game_state",
    myPieces,
    opponentQuantumStates,
    currentTurn: room.board.getCurrentTurn(),
    isInCheck
  }));
}

function generateNotation(
  from: { row: number; col: number },
  to: { row: number; col: number },
  pieceType?: string,
  wasCapture: boolean = false,
  wasCheck: boolean = false
): string {
  const files = "abcdefgh";
  const ranks = "12345678";

  const fromSquare = files[from.col] + ranks[from.row];
  const toSquare = files[to.col] + ranks[to.row];

  // Castling detection
  if (pieceType === "king") {
    const colDiff = Math.abs(to.col - from.col);
    if (colDiff === 2) {
      return to.col > from.col ? "O-O" : "O-O-O";
    }
  }

  // Piece prefix (empty for pawns)
  const pieceMap: Record<string, string> = {
    knight: "N",
    bishop: "B",
    rook: "R",
    queen: "Q",
    king: "K",
    pawn: ""
  };

  const piece = pieceType ? (pieceMap[pieceType] || "") : "";
  const capture = wasCapture ? "x" : "";
  const check = wasCheck ? "+" : "";

  // For pawn captures, include the starting file
  if (piece === "" && wasCapture) {
    return files[from.col] + capture + toSquare + check;
  }

  return piece + capture + toSquare + check;
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
          const board = new ClassicalBoard();
          const quantumState = new QuantumStateManager(board);
          quantumState.initialize();

          rooms.set(roomCode, {
            white: ws as ServerWebSocket<{ room: string; color: PlayerColor }>,
            black: null,
            board,
            quantumState,
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

          // Send initial game state to both players
          if (room.white) sendGameState(room.white, room);
          if (room.black) sendGameState(room.black, room);

          console.log(`Game started: ${data.roomCode} (ID: ${gameId})`);
          break;
        }

        case "move": {
          if (!ws.data?.room) return;

          const room = rooms.get(ws.data.room);
          if (!room) return;

          // Get the piece before moving (for quantum state update)
          const movingPiece = room.board.getPiece(data.from);
          if (!movingPiece) {
            ws.send(JSON.stringify({
              type: "move_rejected",
              reason: "No piece at source position"
            }));
            return;
          }

          // Calculate ghost positions BEFORE moving (from origin square!)
          const opponentColor = ws.data.color === "white" ? "black" : "white";
          const ghostPositions = room.board.getQuietMoves(data.from, opponentColor);

          // Validate and execute move on classical board (source of truth)
          const moveResult = room.board.makeMove({
            from: data.from,
            to: data.to
          });

          if (!moveResult.success) {
            // Invalid move - notify player
            ws.send(JSON.stringify({
              type: "move_rejected",
              reason: "Invalid move"
            }));
            return;
          }

          // Update quantum state manager with pre-calculated ghost positions
          room.quantumState.updateAfterMove(
            data.from,
            data.to,
            movingPiece,
            moveResult.wasCapture,
            moveResult.wasCheck,
            moveResult.wasCapture ? data.to : undefined,
            ghostPositions  // Pass pre-calculated ghosts from origin
          );

          // Get piece type for notation
          const piece = room.board.getPiece(data.to);
          const pieceType = piece?.type;

          // Generate chess notation
          const notation = generateNotation(
            data.from,
            data.to,
            pieceType,
            moveResult.wasCapture,
            moveResult.wasCheck
          );

          // Record move in database
          if (room.gameId) {
            room.moveCount++;
            db.recordMove(
              room.gameId,
              room.moveCount,
              ws.data.color,
              data.from,
              data.to,
              notation,
              moveResult.wasCapture,
              moveResult.wasCheck
            );
          }

          console.log(`Move: ${notation} in room ${ws.data.room}`);

          // Send complete game state to BOTH players
          const opponent = ws.data.color === "white" ? room.black : room.white;

          if (room.white) sendGameState(room.white, room);
          if (room.black) sendGameState(room.black, room);

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
