// Server-side classical chess logic - single source of truth

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Color = 'white' | 'black';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Position {
  row: number; // 0-7
  col: number; // 0-7
}

export interface Move {
  from: Position;
  to: Position;
}

export interface MoveResult {
  success: boolean;
  wasCapture: boolean;
  wasCheck: boolean;
  capturedPiece?: Piece;
}

export class ClassicalBoard {
  // 8x8 board, null = empty square
  private board: (Piece | null)[][];
  private currentTurn: Color = 'white';

  constructor() {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    this.initializeBoard();
  }

  private initializeBoard(): void {
    // Pawns
    for (let col = 0; col < 8; col++) {
      this.board[1][col] = { type: 'pawn', color: 'white' };
      this.board[6][col] = { type: 'pawn', color: 'black' };
    }

    // Rooks
    this.board[0][0] = { type: 'rook', color: 'white' };
    this.board[0][7] = { type: 'rook', color: 'white' };
    this.board[7][0] = { type: 'rook', color: 'black' };
    this.board[7][7] = { type: 'rook', color: 'black' };

    // Knights
    this.board[0][1] = { type: 'knight', color: 'white' };
    this.board[0][6] = { type: 'knight', color: 'white' };
    this.board[7][1] = { type: 'knight', color: 'black' };
    this.board[7][6] = { type: 'knight', color: 'black' };

    // Bishops
    this.board[0][2] = { type: 'bishop', color: 'white' };
    this.board[0][5] = { type: 'bishop', color: 'white' };
    this.board[7][2] = { type: 'bishop', color: 'black' };
    this.board[7][5] = { type: 'bishop', color: 'black' };

    // Queens
    this.board[0][3] = { type: 'queen', color: 'white' };
    this.board[7][3] = { type: 'queen', color: 'black' };

    // Kings
    this.board[0][4] = { type: 'king', color: 'white' };
    this.board[7][4] = { type: 'king', color: 'black' };
  }

  getPiece(pos: Position): Piece | null {
    if (!this.isValidPosition(pos)) return null;
    return this.board[pos.row][pos.col];
  }

  private setPiece(pos: Position, piece: Piece | null): void {
    if (!this.isValidPosition(pos)) return;
    this.board[pos.row][pos.col] = piece;
  }

  private isValidPosition(pos: Position): boolean {
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
  }

  getCurrentTurn(): Color {
    return this.currentTurn;
  }

  // Validate and execute a move
  makeMove(move: Move): MoveResult {
    const piece = this.getPiece(move.from);

    if (!piece) {
      return { success: false, wasCapture: false, wasCheck: false };
    }

    if (piece.color !== this.currentTurn) {
      return { success: false, wasCapture: false, wasCheck: false };
    }

    if (!this.isValidMove(move)) {
      return { success: false, wasCapture: false, wasCheck: false };
    }

    // Check for capture
    const targetPiece = this.getPiece(move.to);
    const wasCapture = targetPiece !== null;
    const capturedPiece = targetPiece || undefined;

    // Execute move
    this.setPiece(move.to, piece);
    this.setPiece(move.from, null);

    // Handle castling - move rook
    if (piece.type === 'king' && Math.abs(move.to.col - move.from.col) === 2) {
      const isKingside = move.to.col > move.from.col;
      const rookFromCol = isKingside ? 7 : 0;
      const rookToCol = isKingside ? move.to.col - 1 : move.to.col + 1;

      const rook = this.getPiece({ row: move.from.row, col: rookFromCol });
      if (rook) {
        this.setPiece({ row: move.from.row, col: rookToCol }, rook);
        this.setPiece({ row: move.from.row, col: rookFromCol }, null);
      }
    }

    // Check if opponent is in check
    const opponentColor = this.currentTurn === 'white' ? 'black' : 'white';
    const wasCheck = this.isInCheck(opponentColor);

    // Switch turn
    this.currentTurn = opponentColor;

    return { success: true, wasCapture, wasCheck, capturedPiece };
  }

  // Validate if a move is legal
  private isValidMove(move: Move): boolean {
    const piece = this.getPiece(move.from);
    if (!piece) return false;

    const target = this.getPiece(move.to);
    if (target && target.color === piece.color) return false;

    // Check piece-specific movement rules
    if (!this.isValidPieceMove(move, piece)) return false;

    // Check if path is clear (for sliding pieces)
    if (!this.isPathClear(move, piece)) return false;

    // TODO: Check if move leaves king in check (implement later)

    return true;
  }

  private isValidPieceMove(move: Move, piece: Piece): boolean {
    const dx = move.to.col - move.from.col;
    const dy = move.to.row - move.from.row;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    switch (piece.type) {
      case 'pawn': {
        const direction = piece.color === 'white' ? 1 : -1;
        const startRow = piece.color === 'white' ? 1 : 6;

        // Forward move
        if (dx === 0 && dy === direction && !this.getPiece(move.to)) {
          return true;
        }

        // Initial two-square move
        if (dx === 0 && dy === 2 * direction && move.from.row === startRow && !this.getPiece(move.to)) {
          const middlePos = { row: move.from.row + direction, col: move.from.col };
          if (!this.getPiece(middlePos)) return true;
        }

        // Capture
        if (absDx === 1 && dy === direction && this.getPiece(move.to)) {
          return true;
        }

        return false;
      }

      case 'knight':
        return (absDx === 2 && absDy === 1) || (absDx === 1 && absDy === 2);

      case 'bishop':
        return absDx === absDy && absDx > 0;

      case 'rook':
        return (dx === 0 && dy !== 0) || (dx !== 0 && dy === 0);

      case 'queen':
        return (absDx === absDy && absDx > 0) || (dx === 0 && dy !== 0) || (dx !== 0 && dy === 0);

      case 'king':
        // Normal king move
        if (absDx <= 1 && absDy <= 1) return true;

        // Castling
        if (absDy === 0 && absDx === 2) {
          // TODO: Check castling conditions (king/rook not moved, path clear, not in check)
          return true;
        }

        return false;
    }
  }

  private isPathClear(move: Move, piece: Piece): boolean {
    // Knights jump over pieces
    if (piece.type === 'knight') return true;

    // Kings and pawns move only 1-2 squares
    if (piece.type === 'king' || piece.type === 'pawn') return true;

    const dx = Math.sign(move.to.col - move.from.col);
    const dy = Math.sign(move.to.row - move.from.row);

    let currentRow = move.from.row + dy;
    let currentCol = move.from.col + dx;

    while (currentRow !== move.to.row || currentCol !== move.to.col) {
      if (this.getPiece({ row: currentRow, col: currentCol })) {
        return false;
      }
      currentRow += dy;
      currentCol += dx;
    }

    return true;
  }

  // Check if a color is in check
  isInCheck(color: Color): boolean {
    // Find king position
    let kingPos: Position | null = null;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece && piece.type === 'king' && piece.color === color) {
          kingPos = { row, col };
          break;
        }
      }
      if (kingPos) break;
    }

    if (!kingPos) return false;

    // Check if any opponent piece can attack the king
    const opponentColor = color === 'white' ? 'black' : 'white';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece && piece.color === opponentColor) {
          const move = { from: { row, col }, to: kingPos };
          if (this.isValidPieceMove(move, piece) && this.isPathClear(move, piece)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // Get all pieces of a specific color
  getPieces(color: Color): { piece: Piece; position: Position }[] {
    const pieces: { piece: Piece; position: Position }[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece && piece.color === color) {
          pieces.push({ piece, position: { row, col } });
        }
      }
    }
    return pieces;
  }

  // Get all valid moves for a piece (for quantum ghost calculation)
  getValidMoves(from: Position): Position[] {
    const piece = this.getPiece(from);
    if (!piece) return [];

    const validMoves: Position[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const to = { row, col };
        if (this.isValidMove({ from, to })) {
          validMoves.push(to);
        }
      }
    }
    return validMoves;
  }

  // Get "quiet" moves (no capture, no check) for quantum superposition
  getQuietMoves(from: Position, opponentColor: Color): Position[] {
    const allMoves = this.getValidMoves(from);
    const quietMoves: Position[] = [];

    for (const to of allMoves) {
      // Skip if it would be a capture
      if (this.getPiece(to)) continue;

      // Check if it would put opponent in check
      // Simulate the move
      const piece = this.getPiece(from);
      if (!piece) continue;

      const originalTarget = this.getPiece(to);
      this.setPiece(to, piece);
      this.setPiece(from, null);

      const wouldCheck = this.isInCheck(opponentColor);

      // Undo the move
      this.setPiece(from, piece);
      this.setPiece(to, originalTarget);

      if (!wouldCheck) {
        quietMoves.push(to);
      }
    }

    return quietMoves;
  }
}
