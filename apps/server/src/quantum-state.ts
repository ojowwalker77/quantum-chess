// Server-side quantum state management
import type { ClassicalBoard, Piece, Position, Color, PieceType } from "./chess";

export interface QuantumPiece {
  piece: Piece;
  positions: Position[];  // All possible ghost positions
  probability: number;     // Probability for each position (1.0 / positions.length)
}

export class QuantumStateManager {
  // Track quantum pieces for opponent's view
  private whiteQuantumPieces: Map<string, QuantumPiece> = new Map();
  private blackQuantumPieces: Map<string, QuantumPiece> = new Map();

  constructor(private board: ClassicalBoard) {}

  // Initialize - all pieces start collapsed at their real positions
  initialize(): void {
    const whitePieces = this.board.getPieces('white');
    const blackPieces = this.board.getPieces('black');

    for (const { piece, position } of whitePieces) {
      const key = this.getPieceKey(position);
      this.whiteQuantumPieces.set(key, {
        piece,
        positions: [position],
        probability: 1.0
      });
    }

    for (const { piece, position } of blackPieces) {
      const key = this.getPieceKey(position);
      this.blackQuantumPieces.set(key, {
        piece,
        positions: [position],
        probability: 1.0
      });
    }
  }

  private getPieceKey(pos: Position): string {
    return `${pos.row},${pos.col}`;
  }

  // Update quantum state after a move
  updateAfterMove(
    from: Position,
    to: Position,
    movingPiece: Piece,
    wasCapture: boolean,
    wasCheck: boolean,
    capturedPosition: Position | undefined,
    ghostPositions: Position[]  // Pre-calculated from origin square!
  ): void {
    const opponentColor = movingPiece.color === 'white' ? 'black' : 'white';
    const quantumPieces = movingPiece.color === 'white'
      ? this.whiteQuantumPieces
      : this.blackQuantumPieces;

    // Find and remove the piece that was at 'from' position
    // It might already be in superposition at multiple positions
    let keyToRemove: string | null = null;
    for (const [key, qp] of quantumPieces.entries()) {
      // Check if this is the piece that moved (same type/color and has probability at 'from')
      if (qp.piece.type === movingPiece.type &&
          qp.piece.color === movingPiece.color &&
          qp.positions.some(pos => pos.row === from.row && pos.col === from.col)) {
        keyToRemove = key;
        break;
      }
    }

    if (keyToRemove) {
      quantumPieces.delete(keyToRemove);
    }

    // Determine if piece should be in superposition
    const shouldCollapse = wasCapture || wasCheck || movingPiece.type === 'pawn';

    if (shouldCollapse) {
      // Collapsed - show exact position
      const newKey = `${movingPiece.type}-${to.row},${to.col}`;
      quantumPieces.set(newKey, {
        piece: movingPiece,
        positions: [to],
        probability: 1.0
      });
    } else {
      // Enter superposition with pre-calculated ghost positions from ORIGIN square
      if (ghostPositions.length > 0) {
        // Create unique key for this piece in superposition
        const newKey = `${movingPiece.type}-superposition-${to.row},${to.col}`;
        quantumPieces.set(newKey, {
          piece: movingPiece,
          positions: ghostPositions,  // Use pre-calculated ghosts from origin!
          probability: 1.0 / ghostPositions.length
        });
      } else {
        // No valid ghost positions - collapse to actual position
        const newKey = `${movingPiece.type}-${to.row},${to.col}`;
        quantumPieces.set(newKey, {
          piece: movingPiece,
          positions: [to],
          probability: 1.0
        });
      }
    }

    // If capture, remove captured piece
    if (wasCapture && capturedPosition) {
      const capturedPieces = opponentColor === 'white'
        ? this.whiteQuantumPieces
        : this.blackQuantumPieces;

      // Find and remove the captured piece
      let capturedKeyToRemove: string | null = null;
      for (const [key, qp] of capturedPieces.entries()) {
        if (qp.positions.some(pos => pos.row === capturedPosition.row && pos.col === capturedPosition.col)) {
          capturedKeyToRemove = key;
          break;
        }
      }

      if (capturedKeyToRemove) {
        capturedPieces.delete(capturedKeyToRemove);
      }
    }
  }

  // Get quantum state for a player (what they see of opponent's pieces)
  getOpponentQuantumState(playerColor: Color): QuantumPiece[] {
    const opponentPieces = playerColor === 'white'
      ? this.blackQuantumPieces
      : this.whiteQuantumPieces;

    return Array.from(opponentPieces.values());
  }

  // Get player's own pieces (classical view)
  getMyPieces(playerColor: Color): Array<{ type: PieceType; position: Position }> {
    return this.board.getPieces(playerColor).map(({ piece, position }) => ({
      type: piece.type,
      position
    }));
  }

  // Check if a square has opponent ghost(s)
  hasOpponentGhost(position: Position, playerColor: Color): boolean {
    const opponentPieces = playerColor === 'white'
      ? this.blackQuantumPieces
      : this.whiteQuantumPieces;

    for (const qp of opponentPieces.values()) {
      if (qp.positions.some(pos => pos.row === position.row && pos.col === position.col)) {
        return true;
      }
    }
    return false;
  }

  // Check if a square has own ghost(s)
  hasOwnGhost(position: Position, playerColor: Color): boolean {
    const ownPieces = playerColor === 'white'
      ? this.whiteQuantumPieces
      : this.blackQuantumPieces;

    for (const qp of ownPieces.values()) {
      // Only consider superposed pieces (multiple positions)
      if (qp.positions.length > 1 && qp.positions.some(pos => pos.row === position.row && pos.col === position.col)) {
        return true;
      }
    }
    return false;
  }

  // Get which of my pieces has a ghost at this position
  getOwnGhostPiece(position: Position, playerColor: Color): QuantumPiece | null {
    const ownPieces = playerColor === 'white'
      ? this.whiteQuantumPieces
      : this.blackQuantumPieces;

    for (const qp of ownPieces.values()) {
      if (qp.positions.length > 1 && qp.positions.some(pos => pos.row === position.row && pos.col === position.col)) {
        return qp;
      }
    }
    return null;
  }

  // Collapse a piece's superposition to its true position
  collapsePiece(piece: Piece): void {
    const quantumPieces = piece.color === 'white'
      ? this.whiteQuantumPieces
      : this.blackQuantumPieces;

    const truePosition = this.board.getPieces(piece.color).find(
      p => p.piece.type === piece.type && p.piece.color === piece.color
    )?.position;

    if (truePosition) {
      // Remove all entries for this piece
      const keysToRemove: string[] = [];
      for (const [key, qp] of quantumPieces.entries()) {
        if (qp.piece.type === piece.type && qp.piece.color === piece.color) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => quantumPieces.delete(key));

      // Add it back at true position only
      const newKey = `${piece.type}-${truePosition.row},${truePosition.col}`;
      quantumPieces.set(newKey, {
        piece,
        positions: [truePosition],
        probability: 1.0
      });
    }
  }
}
