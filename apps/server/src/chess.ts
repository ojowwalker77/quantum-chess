export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Color = 'white' | 'black';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  promotion?: PieceType;
}

export interface MoveResult {
  success: boolean;
  wasCapture: boolean;
  wasCheck: boolean;
  wasCheckmate: boolean;
  wasStalemate: boolean;
  wasPromotion: boolean;
  wasEnPassant: boolean;
  enPassantCapturePos?: Position;
  capturedPiece?: Piece;
  promotedTo?: PieceType;
}

export class ClassicalBoard {
  private board: (Piece | null)[][];
  private currentTurn: Color = 'white';
  private enPassantTarget: Position | null = null;

  private castlingRights = {
    whiteKingside: true,
    whiteQueenside: true,
    blackKingside: true,
    blackQueenside: true
  };

  constructor() {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    this.initializeBoard();
  }

  getEnPassantTarget(): Position | null {
    return this.enPassantTarget;
  }

  getCastlingRights() {
    return { ...this.castlingRights };
  }

  private initializeBoard(): void {
    for (let col = 0; col < 8; col++) {
      this.board[1][col] = { type: 'pawn', color: 'white' };
      this.board[6][col] = { type: 'pawn', color: 'black' };
    }

    this.board[0][0] = { type: 'rook', color: 'white' };
    this.board[0][7] = { type: 'rook', color: 'white' };
    this.board[7][0] = { type: 'rook', color: 'black' };
    this.board[7][7] = { type: 'rook', color: 'black' };

    this.board[0][1] = { type: 'knight', color: 'white' };
    this.board[0][6] = { type: 'knight', color: 'white' };
    this.board[7][1] = { type: 'knight', color: 'black' };
    this.board[7][6] = { type: 'knight', color: 'black' };

    this.board[0][2] = { type: 'bishop', color: 'white' };
    this.board[0][5] = { type: 'bishop', color: 'white' };
    this.board[7][2] = { type: 'bishop', color: 'black' };
    this.board[7][5] = { type: 'bishop', color: 'black' };

    this.board[0][3] = { type: 'queen', color: 'white' };
    this.board[7][3] = { type: 'queen', color: 'black' };

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

  makeMove(move: Move, allowProbing: boolean = false): MoveResult {
    const piece = this.getPiece(move.from);

    if (!piece) {
      return { success: false, wasCapture: false, wasCheck: false };
    }

    if (piece.color !== this.currentTurn) {
      return { success: false, wasCapture: false, wasCheck: false };
    }

    if (!this.isValidMove(move, allowProbing)) {
      return { success: false, wasCapture: false, wasCheck: false };
    }

    const targetPiece = this.getPiece(move.to);
    const wasCapture = targetPiece !== null;
    const capturedPiece = targetPiece || undefined;

    this.setPiece(move.to, piece);
    this.setPiece(move.from, null);

    let enPassantCapture = false;
    let enPassantCapturePos: Position | undefined;
    if (piece.type === 'pawn' && this.enPassantTarget &&
        move.to.row === this.enPassantTarget.row && move.to.col === this.enPassantTarget.col) {
      const capturedPawnRow = piece.color === 'white' ? move.to.row - 1 : move.to.row + 1;
      enPassantCapturePos = { row: capturedPawnRow, col: move.to.col };
      this.setPiece(enPassantCapturePos, null);
      enPassantCapture = true;
    }

    if (piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
      const epRow = piece.color === 'white' ? move.from.row + 1 : move.from.row - 1;
      this.enPassantTarget = { row: epRow, col: move.from.col };
    } else {
      this.enPassantTarget = null;
    }

    let wasPromotion = false;
    let promotedTo: PieceType | undefined;
    if (piece.type === 'pawn') {
      const promotionRank = piece.color === 'white' ? 7 : 0;
      if (move.to.row === promotionRank) {
        promotedTo = move.promotion || 'queen';
        this.setPiece(move.to, { type: promotedTo, color: piece.color });
        wasPromotion = true;
      }
    }

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

    if (piece.type === 'king') {
      if (piece.color === 'white') {
        this.castlingRights.whiteKingside = false;
        this.castlingRights.whiteQueenside = false;
      } else {
        this.castlingRights.blackKingside = false;
        this.castlingRights.blackQueenside = false;
      }
    }
    if (piece.type === 'rook') {
      if (piece.color === 'white') {
        if (move.from.row === 0 && move.from.col === 0) this.castlingRights.whiteQueenside = false;
        if (move.from.row === 0 && move.from.col === 7) this.castlingRights.whiteKingside = false;
      } else {
        if (move.from.row === 7 && move.from.col === 0) this.castlingRights.blackQueenside = false;
        if (move.from.row === 7 && move.from.col === 7) this.castlingRights.blackKingside = false;
      }
    }
    if (wasCapture) {
      if (move.to.row === 0 && move.to.col === 0) this.castlingRights.whiteQueenside = false;
      if (move.to.row === 0 && move.to.col === 7) this.castlingRights.whiteKingside = false;
      if (move.to.row === 7 && move.to.col === 0) this.castlingRights.blackQueenside = false;
      if (move.to.row === 7 && move.to.col === 7) this.castlingRights.blackKingside = false;
    }

    const opponentColor = this.currentTurn === 'white' ? 'black' : 'white';
    const wasCheck = this.isInCheck(opponentColor);

    this.currentTurn = opponentColor;

    const wasCheckmate = wasCheck && this.isCheckmate(opponentColor);
    const wasStalemate = !wasCheck && this.isStalemate(opponentColor);

    const actualCapture = wasCapture || enPassantCapture;

    return {
      success: true,
      wasCapture: actualCapture,
      wasCheck,
      wasCheckmate,
      wasStalemate,
      wasPromotion,
      wasEnPassant: enPassantCapture,
      enPassantCapturePos,
      capturedPiece,
      promotedTo
    };
  }

  isValidMove(move: Move, allowProbing: boolean = false): boolean {
    const piece = this.getPiece(move.from);
    if (!piece) return false;

    const target = this.getPiece(move.to);
    if (target && target.color === piece.color) return false;

    if (!this.isValidPieceMove(move, piece, allowProbing)) return false;

    if (!this.isPathClear(move, piece)) return false;

    if (allowProbing && !target) {
      return true;
    }

    if (this.wouldLeaveKingInCheck(move)) {
      return false;
    }

    return true;
  }

  private wouldLeaveKingInCheck(move: Move): boolean {
    const piece = this.getPiece(move.from);
    if (!piece) return false;

    const targetPiece = this.getPiece(move.to);

    this.setPiece(move.to, piece);
    this.setPiece(move.from, null);

    let rookOriginalPos: Position | null = null;
    let rookNewPos: Position | null = null;
    if (piece.type === 'king' && Math.abs(move.to.col - move.from.col) === 2) {
      const isKingside = move.to.col > move.from.col;
      rookOriginalPos = { row: move.from.row, col: isKingside ? 7 : 0 };
      rookNewPos = { row: move.from.row, col: isKingside ? move.to.col - 1 : move.to.col + 1 };
      const rook = this.getPiece(rookOriginalPos);
      if (rook) {
        this.setPiece(rookNewPos, rook);
        this.setPiece(rookOriginalPos, null);
      }
    }

    const inCheck = this.isInCheck(piece.color);

    if (rookOriginalPos && rookNewPos) {
      const rook = this.getPiece(rookNewPos);
      if (rook) {
        this.setPiece(rookOriginalPos, rook);
        this.setPiece(rookNewPos, null);
      }
    }

    this.setPiece(move.from, piece);
    this.setPiece(move.to, targetPiece);

    return inCheck;
  }

  private isValidPieceMove(move: Move, piece: Piece, allowProbing: boolean = false): boolean {
    const dx = move.to.col - move.from.col;
    const dy = move.to.row - move.from.row;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const target = this.getPiece(move.to);

    switch (piece.type) {
      case 'pawn': {
        const direction = piece.color === 'white' ? 1 : -1;
        const startRow = piece.color === 'white' ? 1 : 6;

        if (dx === 0 && dy === direction && !target) {
          return true;
        }

        if (dx === 0 && dy === 2 * direction && move.from.row === startRow && !target) {
          const middlePos = { row: move.from.row + direction, col: move.from.col };
          if (!this.getPiece(middlePos)) return true;
        }

        if (absDx === 1 && dy === direction) {
          if (target) {
            return true;
          }
          if (this.enPassantTarget &&
              move.to.row === this.enPassantTarget.row &&
              move.to.col === this.enPassantTarget.col) {
            return true;
          }
          if (allowProbing) {
            return true;
          }
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
        if (absDx <= 1 && absDy <= 1) return true;

        if (absDy === 0 && absDx === 2) {
          return this.canCastle(piece.color, dx > 0);
        }

        return false;
    }
  }

  private canCastle(color: Color, kingside: boolean): boolean {
    const row = color === 'white' ? 0 : 7;

    if (color === 'white') {
      if (kingside && !this.castlingRights.whiteKingside) return false;
      if (!kingside && !this.castlingRights.whiteQueenside) return false;
    } else {
      if (kingside && !this.castlingRights.blackKingside) return false;
      if (!kingside && !this.castlingRights.blackQueenside) return false;
    }

    if (this.isInCheck(color)) return false;

    const kingCol = 4;
    const rookCol = kingside ? 7 : 0;
    const direction = kingside ? 1 : -1;

    for (let col = kingCol + direction; col !== rookCol; col += direction) {
      if (this.getPiece({ row, col })) return false;
    }

    const squaresToCheck = kingside ? [5, 6] : [2, 3];
    for (const col of squaresToCheck) {
      const originalKingPos = { row, col: kingCol };
      const testPos = { row, col };
      const king = this.getPiece(originalKingPos);
      if (!king) return false;

      this.setPiece(originalKingPos, null);
      this.setPiece(testPos, king);

      const inCheck = this.isInCheck(color);

      this.setPiece(originalKingPos, king);
      this.setPiece(testPos, null);

      if (inCheck) return false;
    }

    return true;
  }

  private isPathClear(move: Move, piece: Piece): boolean {
    if (piece.type === 'knight') return true;

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

  isInCheck(color: Color): boolean {
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

  getQuietMoves(from: Position, opponentColor: Color): Position[] {
    const allMoves = this.getValidMoves(from);
    const quietMoves: Position[] = [];

    for (const to of allMoves) {
      if (this.getPiece(to)) continue;

      const piece = this.getPiece(from);
      if (!piece) continue;

      const originalTarget = this.getPiece(to);
      this.setPiece(to, piece);
      this.setPiece(from, null);

      const wouldCheck = this.isInCheck(opponentColor);

      this.setPiece(from, piece);
      this.setPiece(to, originalTarget);

      if (!wouldCheck) {
        quietMoves.push(to);
      }
    }

    return quietMoves;
  }

  getLegalMoves(color: Color): Move[] {
    const legalMoves: Move[] = [];
    const pieces = this.getPieces(color);

    for (const { position } of pieces) {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const move = { from: position, to: { row, col } };
          if (this.isValidMove(move)) {
            legalMoves.push(move);
          }
        }
      }
    }

    return legalMoves;
  }

  isCheckmate(color: Color): boolean {
    if (!this.isInCheck(color)) return false;
    return this.getLegalMoves(color).length === 0;
  }

  isStalemate(color: Color): boolean {
    if (this.isInCheck(color)) return false;
    return this.getLegalMoves(color).length === 0;
  }
}
