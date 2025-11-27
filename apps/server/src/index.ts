import type { ServerWebSocket } from "bun";
import { GameDatabase } from "./db";
import { ClassicalBoard, type Position } from "./chess";
import { QuantumStateManager } from "./quantum-state";

const PORT = 8080;

type PlayerColor = "white" | "black";

interface Room {
  white: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
  black: ServerWebSocket<{ room: string; color: PlayerColor }> | null;
  board: ClassicalBoard;
  quantumState: QuantumStateManager;
  gameId?: number;
  moveCount: number;
}

const rooms = new Map<string, Room>();
const dbPath = process.env.DATABASE_PATH || "quantum-chess.db";
const db = new GameDatabase(dbPath);

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function posToNotation(pos: { row: number; col: number }): string {
  const files = "abcdefgh";
  const ranks = "12345678";
  return files[pos.col] + ranks[pos.row];
}

function createBoardMap(
  myPieces: Array<{ type: string; position: Position }>,
  opponentQuantumStates: any[]
): string[][] {
  const board: string[][] = Array(8)
    .fill(null)
    .map(() => Array(8).fill("."));

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

  for (const qp of opponentQuantumStates) {
    const pieceType = qp.piece?.type || qp.piece;
    const symbol = "*" + (pieceMap[pieceType] || "?");

    for (const pos of qp.positions) {
      const current = board[pos.row][pos.col];
      if (current === ".") {
        board[pos.row][pos.col] = symbol;
      } else if (current.startsWith("*")) {
        board[pos.row][pos.col] = current + "+" + symbol;
      }
    }
  }

  return board;
}

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

function sendGameState(
  ws: ServerWebSocket<{ room: string; color: PlayerColor }>,
  room: Room,
  gameOver?: { winner: PlayerColor | 'draw'; reason: 'checkmate' | 'stalemate' | 'resign' | 'disconnect' }
): void {
  if (!ws.data) return;

  const myPieces = room.quantumState.getMyPieces(ws.data.color);

  const opponentQuantum = room.quantumState.getOpponentQuantumState(ws.data.color);

  const opponentQuantumStates = opponentQuantum.map(qp => ({
    piece: qp.piece.type,
    color: qp.piece.color,
    positions: qp.positions,
    probability: qp.probability
  }));

  const isInCheck = room.board.isInCheck(ws.data.color);

  ws.send(JSON.stringify({
    type: "game_state",
    myPieces,
    opponentQuantumStates,
    currentTurn: room.board.getCurrentTurn(),
    isInCheck,
    gameOver
  }));
}

function generateNotation(
  from: { row: number; col: number },
  to: { row: number; col: number },
  pieceType?: string,
  wasCapture: boolean = false,
  wasCheck: boolean = false,
  wasCheckmate: boolean = false,
  promotedTo?: string
): string {
  const files = "abcdefgh";
  const ranks = "12345678";

  const fromSquare = files[from.col] + ranks[from.row];
  const toSquare = files[to.col] + ranks[to.row];

  if (pieceType === "king") {
    const colDiff = Math.abs(to.col - from.col);
    if (colDiff === 2) {
      return to.col > from.col ? "O-O" : "O-O-O";
    }
  }

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
  const checkSymbol = wasCheckmate ? "#" : (wasCheck ? "+" : "");

  const promotion = promotedTo ? "=" + pieceMap[promotedTo] : "";

  if (piece === "" && wasCapture) {
    return files[from.col] + capture + toSquare + promotion + checkSymbol;
  }

  return piece + capture + toSquare + promotion + checkSymbol;
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

    if (pathname.endsWith(".js")) {
      const file = Bun.file("./dist/web" + pathname);
      if (await file.exists()) return new Response(file);
    }

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

          const gameId = db.createGame(
            data.roomCode,
            "white_player",
            "black_player"
          );
          room.gameId = gameId;

          if (room.white) sendGameState(room.white, room);
          if (room.black) sendGameState(room.black, room);

          console.log(`Game started: ${data.roomCode} (ID: ${gameId})`);
          break;
        }

        case "move": {
          if (!ws.data?.room) return;

          const room = rooms.get(ws.data.room);
          if (!room) return;

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

          const ghostPositions = room.board.getQuietMoves(data.from, opponentColor);

          const hasOpponentGhost = room.quantumState.hasOpponentGhost(data.to, playerColor);
          const allowProbing = hasOpponentGhost;

          const moveResult = room.board.makeMove({
            from: data.from,
            to: data.to,
            promotion: data.promotion
          }, allowProbing);

          if (!moveResult.success) {
            ws.send(JSON.stringify({
              type: "move_rejected",
              reason: "Invalid move"
            }));
            return;
          }

          const ownGhostPiece = room.quantumState.getOwnGhostPiece(data.to, playerColor);
          if (ownGhostPiece) {
            room.quantumState.collapsePiece(ownGhostPiece.piece);
          }

          if (allowProbing && !moveResult.wasCapture) {
            const opponentQuantumState = room.quantumState.getOpponentQuantumState(playerColor);
            for (const qp of opponentQuantumState) {
              if (qp.positions.some(pos => pos.row === data.to.row && pos.col === data.to.col)) {
                room.quantumState.collapsePiece(qp.piece);
                break;
              }
            }
          }

          let modifiedWasCapture = moveResult.wasCapture;
          let modifiedWasCheck = moveResult.wasCheck;
          let ghostPositionsForQuantum = ghostPositions;

          if (movingPiece.type === 'king' && Math.abs(data.to.col - data.from.col) === 2) {
            modifiedWasCapture = true;
            modifiedWasCheck = moveResult.wasCheck || modifiedWasCheck;
            ghostPositionsForQuantum = [];
          }

          let capturedPosition: { row: number; col: number } | undefined;
          if (moveResult.wasEnPassant) {
            capturedPosition = moveResult.enPassantCapturePos;
          } else if (moveResult.wasCapture) {
            capturedPosition = data.to;
          }

          room.quantumState.updateAfterMove(
            data.from,
            data.to,
            movingPiece,
            modifiedWasCapture,
            modifiedWasCheck,
            capturedPosition,
            ghostPositionsForQuantum
          );

          const piece = room.board.getPiece(data.to);
          const pieceType = moveResult.wasPromotion ? 'pawn' : piece?.type;

          const notation = generateNotation(
            data.from,
            data.to,
            pieceType,
            moveResult.wasCapture,
            moveResult.wasCheck,
            moveResult.wasCheckmate,
            moveResult.promotedTo
          );

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

          const moveNotification = {
            type: "move_made",
            notation,
            color: ws.data.color,
            moveNumber: room.moveCount
          };
          if (room.white) room.white.send(JSON.stringify(moveNotification));
          if (room.black) room.black.send(JSON.stringify(moveNotification));

          console.log(`\n${'='.repeat(60)}`);
          console.log(`Move: ${notation} in room ${ws.data.room}`);
          console.log(`${'='.repeat(60)}`);

          const whiteMyPieces = room.quantumState.getMyPieces('white');
          const whitOpponentQuantum = room.quantumState.getOpponentQuantumState('white');
          const blackMyPieces = room.quantumState.getMyPieces('black');
          const blackOpponentQuantum = room.quantumState.getOpponentQuantumState('black');

          const whiteBoardMap = createBoardMap(whiteMyPieces, whitOpponentQuantum);
          const blackBoardMap = createBoardMap(blackMyPieces, blackOpponentQuantum);

          console.log(printBoard(whiteBoardMap, 'white'));
          console.log(printBoard(blackBoardMap, 'black'));

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

          let gameOver: { winner: PlayerColor | 'draw'; reason: 'checkmate' | 'stalemate' | 'resign' | 'disconnect' } | undefined;

          if (moveResult.wasCheckmate) {
            gameOver = { winner: playerColor, reason: 'checkmate' };
            console.log(`\n*** CHECKMATE! ${playerColor.toUpperCase()} wins! ***\n`);

            if (room.gameId) {
              db.endGame(room.gameId, playerColor, "checkmate");
            }
          } else if (moveResult.wasStalemate) {
            gameOver = { winner: 'draw', reason: 'stalemate' };
            console.log(`\n*** STALEMATE! Game is a draw. ***\n`);

            if (room.gameId) {
              db.endGame(room.gameId, "draw", "stalemate");
            }
          }

          const opponent = ws.data.color === "white" ? room.black : room.white;

          if (room.white) sendGameState(room.white, room, gameOver);
          if (room.black) sendGameState(room.black, room, gameOver);

          break;
        }

        case "resign": {
          if (!ws.data?.room) return;

          const room = rooms.get(ws.data.room);
          if (!room) return;

          const resigningPlayer = ws.data.color as PlayerColor;
          const winner = resigningPlayer === "white" ? "black" : "white";

          console.log(`\n*** ${resigningPlayer.toUpperCase()} RESIGNED! ${winner.toUpperCase()} wins! ***\n`);

          if (room.gameId) {
            db.endGame(room.gameId, winner, "resign");
          }

          const gameOver = { winner, reason: 'resign' as const };

          if (room.white) sendGameState(room.white, room, gameOver);
          if (room.black) sendGameState(room.black, room, gameOver);

          break;
        }
      }
    },

    close(ws) {
      if (!ws.data?.room) return;

      const room = rooms.get(ws.data.room);
      if (!room) return;

      const opponent = ws.data.color === "white" ? room.black : room.white;

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
