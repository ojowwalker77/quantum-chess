// Type definitions for WASM exports

export interface WasmExports {
  // Game initialization
  initGame(): void;

  // Board queries (require player_color: 0=white, 1=black)
  getPieceAt(row: number, col: number, player_color: number): number;
  getQuantumPieceAt(row: number, col: number, for_color: number, index: number): number;

  // Move operations
  makeMove(from_row: number, from_col: number, to_row: number, to_col: number): number;
  isValidMove(from_row: number, from_col: number, to_row: number, to_col: number, player_color: number): number;

  // Game state
  getCurrentTurn(): number;
  isInCheck(player_color: number): number;

  // Ghost calculation
  getGhostSquares(from_row: number, from_col: number, player_color: number): number;
  getGhostSquare(index: number): number;

  // Probing
  processProbe(from_row: number, from_col: number, to_row: number, to_col: number, player_color: number): number;
  getProbeResultSuccess(): number;
  getProbeResultRow(): number;
  getProbeResultCol(): number;
  getProbeResultPieceType(): number;

  // Memory management
  resetAllocator(): void;
  getMemory(): number;
}

export type PlayerColor = "white" | "black";
export type PieceType = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
}

export interface ServerMessage {
  type: string;
  roomCode?: string;
  color?: PlayerColor;
  message?: string;
  from?: Position;
  to?: Position;
}
