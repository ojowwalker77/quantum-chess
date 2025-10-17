const std = @import("std");
const chess = @import("chess.zig");
const quantum = @import("quantum.zig");

const QuantumBoard = quantum.QuantumBoard;
const Position = chess.Position;
const Color = chess.Color;

// Global game state
var game: QuantumBoard = undefined;
var game_initialized = false;

var buffer: [1024 * 1024]u8 = undefined;
var fba = std.heap.FixedBufferAllocator.init(&buffer);
var allocator = fba.allocator();

// Export functions for JavaScript

export fn initGame() void {
    game = QuantumBoard.init();
    game_initialized = true;
}

// Get piece at position for a specific player (returns piece type and color, or -1 if empty)
// player_color: 0 = white, 1 = black
// Returns: (piece_type << 8) | color, or -1 if empty
export fn getPieceAt(row: u8, col: u8, player_color: u8) i32 {
    if (!game_initialized) return -1;
    const pos = Position.init(row, col);
    const color: Color = @enumFromInt(player_color);

    // Get the board for this player (their truth)
    const board = if (color == .white) &game.white_true_board else &game.black_true_board;

    if (board.getPiece(pos)) |piece| {
        const piece_val: i32 = @intCast(@intFromEnum(piece.piece_type));
        const color_val: i32 = @intCast(@intFromEnum(piece.color));
        return (piece_val << 8) | color_val;
    }
    return -1;
}

// Make a move
// Returns: 1 if successful, 0 if invalid
export fn makeMove(from_row: u8, from_col: u8, to_row: u8, to_col: u8) i32 {
    if (!game_initialized) return 0;
    const from = Position.init(from_row, from_col);
    const to = Position.init(to_row, to_col);

    const success = game.makeMove(from, to, allocator) catch return 0;
    return if (success) 1 else 0;
}

// Get current turn (0 = white, 1 = black)
export fn getCurrentTurn() i32 {
    if (!game_initialized) return 0;
    return @intFromEnum(game.current_turn);
}

// Get quantum probability for a square for the opponent's view
// Returns probability * 100 as integer (0-100)
export fn getQuantumProbability(row: u8, col: u8, for_color: u8) i32 {
    if (!game_initialized) return 0;
    const pos = Position.init(row, col);
    const color: Color = @enumFromInt(for_color);

    const view = game.getQuantumView(color);
    const prob = view[pos.toIndex()];
    return @intFromFloat(prob * 100.0);
}

// Get quantum piece at position (for opponent's view) by index
// index: which piece to get (0 = first, 1 = second, etc.)
// Returns: (piece_type << 16) | (color << 8) | probability, or -1 if no piece at that index
export fn getQuantumPieceAt(row: u8, col: u8, for_color: u8, index: u8) i32 {
    if (!game_initialized) return -1;
    const pos = Position.init(row, col);
    const color: Color = @enumFromInt(for_color);
    const opponent_color = color.opponent();

    const quantum_pieces = if (opponent_color == .white) &game.white_quantum_pieces else &game.black_quantum_pieces;

    // Find the Nth quantum piece with probability at this position
    var found_count: u8 = 0;
    for (quantum_pieces) |maybe_qp| {
        if (maybe_qp) |qp| {
            if (qp.probabilities[pos.toIndex()] > 0.0) {
                if (found_count == index) {
                    const piece_val: i32 = @intCast(@intFromEnum(qp.piece.piece_type));
                    const color_val: i32 = @intCast(@intFromEnum(qp.piece.color));
                    const prob: i32 = @intFromFloat(qp.probabilities[pos.toIndex()] * 100.0);
                    return (piece_val << 16) | (color_val << 8) | prob;
                }
                found_count += 1;
            }
        }
    }
    return -1;
}

// Check if a move is valid for a specific player
export fn isValidMove(from_row: u8, from_col: u8, to_row: u8, to_col: u8, player_color: u8) i32 {
    if (!game_initialized) return 0;
    const from = Position.init(from_row, from_col);
    const to = Position.init(to_row, to_col);
    const move = chess.Move{ .from = from, .to = to };
    const color: Color = @enumFromInt(player_color);

    const board = if (color == .white) &game.white_true_board else &game.black_true_board;
    const valid = board.isValidMove(move, color);
    return if (valid) 1 else 0;
}

// Check if a specific player is in check
export fn isInCheck(player_color: u8) i32 {
    if (!game_initialized) return 0;
    const color: Color = @enumFromInt(player_color);
    const board = if (color == .white) &game.white_true_board else &game.black_true_board;
    const in_check = board.isInCheck(color);
    return if (in_check) 1 else 0;
}

export fn getValidMoveBit(from_row: u8, from_col: u8, bit_index: u8, player_color: u8) i32 {
    if (!game_initialized or bit_index >= 64) return 0;

    const from = Position.init(from_row, from_col);
    const to = Position.fromIndex(bit_index);
    const move = chess.Move{ .from = from, .to = to };
    const color: Color = @enumFromInt(player_color);

    const board = if (color == .white) &game.white_true_board else &game.black_true_board;
    const valid = board.isValidMove(move, color);
    return if (valid) 1 else 0;
}

// Get all valid ghost squares for a piece (for quantum superposition)
// Returns count of valid moves, stores squares in shared buffer
// Call this, then call getGhostSquare(index) to get each square
var ghost_squares: [64]u8 = undefined;
var ghost_count: u8 = 0;

export fn getGhostSquares(from_row: u8, from_col: u8, player_color: u8) u8 {
    if (!game_initialized) return 0;

    const from = Position.init(from_row, from_col);
    const color: Color = @enumFromInt(player_color);
    const board = if (color == .white) &game.white_true_board else &game.black_true_board;

    ghost_count = 0;

    // Check all 64 squares for valid moves
    for (0..64) |i| {
        const to = Position.fromIndex(@intCast(i));
        const move = chess.Move{ .from = from, .to = to };

        if (board.isValidMove(move, color)) {
            ghost_squares[ghost_count] = @intCast(i);
            ghost_count += 1;
        }
    }

    return ghost_count;
}

// Get a specific ghost square by index (call after getGhostSquares)
export fn getGhostSquare(index: u8) u8 {
    if (index >= ghost_count) return 255; // Invalid
    return ghost_squares[index];
}

// Process a probe move - check if opponent piece is really at target square
// Returns encoded result: (piece_was_there << 24) | (captured_piece_type << 16) | (true_row << 8) | true_col
// If piece_was_there = 0, true_row/col show where the piece actually is
// If piece_was_there = 1, it's a capture
var probe_result_row: u8 = 0;
var probe_result_col: u8 = 0;
var probe_result_success: u8 = 0;
var probe_result_piece_type: u8 = 0;

export fn processProbe(from_row: u8, from_col: u8, to_row: u8, to_col: u8, player_color: u8) i32 {
    if (!game_initialized) return 0;

    const from = Position.init(from_row, from_col);
    const to = Position.init(to_row, to_col);
    const color: Color = @enumFromInt(player_color);
    const opponent_color = color.opponent();

    const player_board = if (color == .white) &game.white_true_board else &game.black_true_board;
    const opponent_board = if (opponent_color == .white) &game.white_true_board else &game.black_true_board;

    // Check if opponent has a piece at the target square
    const opponent_piece = opponent_board.getPiece(to);

    if (opponent_piece) |piece| {
        // Probe successful - piece was really there!
        // Capture it on both boards
        player_board.movePiece(from, to);  // Move our piece and capture
        opponent_board.setPiece(to, null);  // Remove from opponent's board

        probe_result_success = 1;
        probe_result_row = to_row;
        probe_result_col = to_col;
        probe_result_piece_type = @intFromEnum(piece.piece_type);

        // Collapse quantum state for this piece
        const quantum_pieces = if (opponent_color == .white) &game.white_quantum_pieces else &game.black_quantum_pieces;
        for (quantum_pieces) |*maybe_qp| {
            if (maybe_qp.*) |*qp| {
                if (qp.piece.piece_type == piece.piece_type and
                    qp.piece.color == piece.color and
                    qp.probabilities[to.toIndex()] > 0.0)
                {
                    qp.collapse(to);
                    break;
                }
            }
        }

        return 1;  // Capture successful
    } else {
        // Probe failed - piece wasn't there
        // Move to empty square
        player_board.movePiece(from, to);

        probe_result_success = 0;
        probe_result_piece_type = 0;

        // Find where the opponent piece actually is and collapse it
        // (We need to find which quantum piece the player was trying to probe)
        // For now, we'll reveal all pieces (this will be refined)
        probe_result_row = 255;  // No specific piece
        probe_result_col = 255;

        return 0;  // No capture
    }
}

export fn getProbeResultSuccess() u8 {
    return probe_result_success;
}

export fn getProbeResultRow() u8 {
    return probe_result_row;
}

export fn getProbeResultCol() u8 {
    return probe_result_col;
}

export fn getProbeResultPieceType() u8 {
    return probe_result_piece_type;
}

// Reset allocator (call between games if needed)
export fn resetAllocator() void {
    fba.reset();
}

// Export memory for JavaScript access
export fn getMemory() [*]u8 {
    return &buffer;
}
