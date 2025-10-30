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

// Utility: Format position as chess notation
function posToNotation(pos: { row: number; col: number }): string {
  const files = "abcdefgh";
  const ranks = "12345678";
  return files[pos.col] + ranks[pos.row];
}

// Utility: Create board map showing what a player sees
function createBoardMap(
  myPieces: Array<{ type: string; position: Position }>,
  opponentQuantumStates: any[]  // Can be QuantumPiece[] or formatted objects
): string[][] {
  const board: string[][] = Array(8)
    .fill(null)
    .map(() => Array(8).fill("."));

  // Place own pieces (classical, non-superposed)
  const pieceMap: Record<string, string> = {
    pawn: "P",
    knight: "N",
    bishop: "B",
    rook: "R",
    queen: "Q",
    king: "K"
  };

  for (const piece of myPieces) {
    const symbol = pieceMap[piece.type] || "?";
    board[piece.position.row][piece.position.col] = symbol;
  }

  // Place opponent pieces (with ghosts)
  for (const qp of opponentQuantumStates) {
    // Handle both QuantumPiece objects and formatted {piece: string, positions} objects
    const pieceType = qp.piece?.type || qp.piece;
    const symbol = "*" + (pieceMap[pieceType] || "?");

    for (const pos of qp.positions) {
      const current = board[pos.row][pos.col];
      // If multiple ghosts on same square, show all
      if (current === ".") {
        board[pos.row][pos.col] = symbol;
      } else if (current.startsWith("*")) {
        board[pos.row][pos.col] = current + "+" + symbol; // Multiple ghosts
      }
    }
  }

  return board;
}

// Utility: Print board to console with coordinates
function printBoard(boardMap: string[][], playerColor: string): string {
  const files = "  a b c d e f g h";
  let output = `\n=== ${playerColor.toUpperCase()}'s VIEW ===\n${files}\n`;

  for (let row = 7; row >= 0; row--) {
    output += `${row + 1} `;
    for (let col = 0; col < 8; col++) {
      const cell = boardMap[row][col];
      output += cell.padEnd(3);
    }
    output += `${row + 1}\n`;
  }
  output += files + "\n";
  return output;
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

          const playerColor = ws.data.color as "white" | "black";
          const opponentColor = playerColor === "white" ? "black" : "white";

          // Calculate ghost positions BEFORE moving (from origin square!)
          const ghostPositions = room.board.getQuietMoves(data.from, opponentColor);

          // Check for probing moves (moving to opponent's ghost square)
          const hasOpponentGhost = room.quantumState.hasOpponentGhost(data.to, playerColor);
          const allowProbing = hasOpponentGhost;

          // Validate and execute move on classical board (source of truth)
          // Pass allowProbing flag to permit pawn diagonal captures on ghosts
          const moveResult = room.board.makeMove({
            from: data.from,
            to: data.to
          }, allowProbing);

          if (!moveResult.success) {
            // Invalid move - notify player
            ws.send(JSON.stringify({
              type: "move_rejected",
              reason: "Invalid move"
            }));
            return;
          }

          // Handle self-ghost collapse: if moved to own ghost, collapse that piece
          const ownGhostPiece = room.quantumState.getOwnGhostPiece(data.to, playerColor);
          if (ownGhostPiece) {
            room.quantumState.collapsePiece(ownGhostPiece.piece);
          }

          // Handle opponent ghost probing: if probed opponent ghost (no capture), collapse their piece
          if (allowProbing && !moveResult.wasCapture) {
            // This was a probe on an empty square with opponent ghost
            // Find which opponent piece had the ghost and collapse it
            const opponentQuantumState = room.quantumState.getOpponentQuantumState(playerColor);
            for (const qp of opponentQuantumState) {
              if (qp.positions.some(pos => pos.row === data.to.row && pos.col === data.to.col)) {
                // Found the piece with the ghost - collapse it to true position
                room.quantumState.collapsePiece(qp.piece);
                break;
              }
            }
          }

          // Prevent castled pieces from entering superposition (castling is classical)
          let modifiedWasCapture = moveResult.wasCapture;
          let modifiedWasCheck = moveResult.wasCheck;
          let ghostPositionsForQuantum = ghostPositions;

          // If castling, force collapse (no superposition for castled pieces)
          if (movingPiece.type === 'king' && Math.abs(data.to.col - data.from.col) === 2) {
            modifiedWasCapture = true;  // Force collapse by treating as "capture-like"
            modifiedWasCheck = moveResult.wasCheck || modifiedWasCheck;
            ghostPositionsForQuantum = []; // No ghosts for castling
          }

          // Update quantum state manager with pre-calculated ghost positions
          room.quantumState.updateAfterMove(
            data.from,
            data.to,
            movingPiece,
            modifiedWasCapture,
            modifiedWasCheck,
            moveResult.wasCapture ? data.to : undefined,
            ghostPositionsForQuantum  // Pass pre-calculated ghosts from origin
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

          console.log(`\n${'='.repeat(60)}`);
          console.log(`Move: ${notation} in room ${ws.data.room}`);
          console.log(`${'='.repeat(60)}`);

          // Log board state for DEBUGGING
          const whiteMyPieces = room.quantumState.getMyPieces('white');
          const whitOpponentQuantum = room.quantumState.getOpponentQuantumState('white');
          const blackMyPieces = room.quantumState.getMyPieces('black');
          const blackOpponentQuantum = room.quantumState.getOpponentQuantumState('black');

          const whiteBoardMap = createBoardMap(whiteMyPieces, whitOpponentQuantum);
          const blackBoardMap = createBoardMap(blackMyPieces, blackOpponentQuantum);

          console.log(printBoard(whiteBoardMap, 'white'));
          console.log(printBoard(blackBoardMap, 'black'));

          // Log quantum state details
          console.log("WHITE sees opponent (black) pieces:");
          for (const qp of whitOpponentQuantum) {
            const positions = qp.positions.map(posToNotation).join(", ");
            console.log(`  *${qp.piece.type.charAt(0).toUpperCase() + qp.piece.type.slice(1)}: {${positions}} - ${(qp.probability * 100).toFixed(1)}% each`);
          }

          console.log("BLACK sees opponent (white) pieces:");
          for (const qp of blackOpponentQuantum) {
            const positions = qp.positions.map(posToNotation).join(", ");
            console.log(`  *${qp.piece.type.charAt(0).toUpperCase() + qp.piece.type.slice(1)}: {${positions}} - ${(qp.probability * 100).toFixed(1)}% each`);
          }

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
