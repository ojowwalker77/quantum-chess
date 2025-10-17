const std = @import("std");
const chess = @import("chess.zig");

const Position = chess.Position;
const Piece = chess.Piece;
const Board = chess.Board;
const Color = chess.Color;

// Represents the quantum state of a piece - it could be in multiple positions
pub const QuantumPiece = struct {
    piece: Piece,
    probabilities: [64]f32,
    // Whether this piece has been observed (collapsed to definite position)
    is_collapsed: bool,
    id: u8,

    pub fn init(piece: Piece, pos: Position) QuantumPiece {
        var qp = QuantumPiece{
            .piece = piece,
            .probabilities = [_]f32{0.0} ** 64,
            .is_collapsed = true,
            .id = pos.toIndex(),
        };
        qp.probabilities[pos.toIndex()] = 1.0;
        return qp;
    }

    pub fn getDefinitePosition(self: *const QuantumPiece) ?Position {
        if (!self.is_collapsed) return null;
        for (self.probabilities, 0..) |prob, i| {
            if (prob > 0.99) {
                return Position.fromIndex(@intCast(i));
            }
        }
        return null;
    }

    pub fn collapse(self: *QuantumPiece, pos: Position) void {
        self.probabilities = [_]f32{0.0} ** 64;
        self.probabilities[pos.toIndex()] = 1.0;
        self.is_collapsed = true;
    }
};

pub const QuantumBoard = struct {
    // Two separate board states - each player's ground truth
    white_true_board: Board,  // White's actual positions (only white knows this)
    black_true_board: Board,  // Black's actual positions (only black knows this)

    // Quantum pieces represent what the opponent sees
    white_quantum_pieces: [16]?QuantumPiece,  // Black's view of white's pieces
    black_quantum_pieces: [16]?QuantumPiece,  // White's view of black's pieces
    white_piece_count: u8,
    black_piece_count: u8,
    current_turn: Color,

    pub fn init() QuantumBoard {
        var qb = QuantumBoard{
            .white_true_board = Board.init(),
            .black_true_board = Board.init(),
            .white_quantum_pieces = [_]?QuantumPiece{null} ** 16,
            .black_quantum_pieces = [_]?QuantumPiece{null} ** 16,
            .white_piece_count = 16,
            .black_piece_count = 16,
            .current_turn = .white,
        };

        // Initialize quantum pieces at their starting positions
        var white_idx: u8 = 0;
        var black_idx: u8 = 0;
        for (0..64) |i| {
            const pos = Position.fromIndex(@intCast(i));
            if (qb.white_true_board.getPiece(pos)) |piece| {
                if (piece.color == .white) {
                    qb.white_quantum_pieces[white_idx] = QuantumPiece.init(piece, pos);
                    white_idx += 1;
                } else {
                    qb.black_quantum_pieces[black_idx] = QuantumPiece.init(piece, pos);
                    black_idx += 1;
                }
            }
        }

        return qb;
    }

    // Get the quantum view for the opponent
    pub fn getQuantumView(self: *QuantumBoard, for_color: Color) [64]f32 {
        var view = [_]f32{0.0} ** 64;
        const opponent_color = for_color.opponent();

        const quantum_pieces = if (opponent_color == .white) &self.white_quantum_pieces else &self.black_quantum_pieces;

        for (quantum_pieces) |maybe_qp| {
            if (maybe_qp) |qp| {
                for (0..64) |i| {
                    view[i] += qp.probabilities[i];
                }
            }
        }

        return view;
    }

    // Make a move and update quantum states
    pub fn makeMove(self: *QuantumBoard, from: Position, to: Position, allocator: std.mem.Allocator) !bool {
        // Get the board for the current player
        const player_board = if (self.current_turn == .white) &self.white_true_board else &self.black_true_board;

        const moving_piece = player_board.getPiece(from) orelse return false;
        if (moving_piece.color != self.current_turn) return false;

        // Check if move is valid
        if (!player_board.isValidMove(.{ .from = from, .to = to }, self.current_turn)) {
            return false;
        }

        const captured_piece = player_board.getPiece(to);
        const is_capture = captured_piece != null;

        const is_castling = moving_piece.piece_type == .king and
            @abs(@as(i8, @intCast(to.col)) - @as(i8, @intCast(from.col))) == 2;
        var rook_from: ?Position = null;
        var rook_to: ?Position = null;
        if (is_castling) {
            const is_kingside = to.col > from.col;
            const rook_from_col: u8 = if (is_kingside) 7 else 0;
            const rook_to_col: u8 = if (is_kingside) to.col - 1 else to.col + 1;
            rook_from = Position.init(from.row, rook_from_col);
            rook_to = Position.init(from.row, rook_to_col);
        }

        player_board.movePiece(from, to);

        const opponent_color = self.current_turn.opponent();
        const opponent_board = if (opponent_color == .white) &self.white_true_board else &self.black_true_board;
        const is_check = opponent_board.isInCheck(opponent_color);

        const quantum_pieces = if (self.current_turn == .white) &self.white_quantum_pieces else &self.black_quantum_pieces;

        for (quantum_pieces) |*maybe_qp| {
            if (maybe_qp.*) |*qp| {
                if (qp.piece.piece_type == moving_piece.piece_type and
                    qp.piece.color == moving_piece.color and
                    qp.probabilities[from.toIndex()] > 0.0)
                {
                    if (is_capture or is_check) {
                        // Collapse to definite position (opponent sees it)
                        qp.collapse(to);
                    } else {
                        // Expand into quantum superposition
                        try self.expandQuantumState(qp, from, to, allocator);
                    }
                    break;
                }
            }
        }

        // If castling, also update rook quantum state
        if (is_castling and rook_from != null and rook_to != null) {
            for (quantum_pieces) |*maybe_qp| {
                if (maybe_qp.*) |*qp| {
                    if (qp.piece.piece_type == .rook and
                        qp.piece.color == moving_piece.color and
                        qp.probabilities[rook_from.?.toIndex()] > 0.0)
                    {
                        if (is_capture or is_check) {
                            qp.collapse(rook_to.?);
                        } else {
                            try self.expandQuantumState(qp, rook_from.?, rook_to.?, allocator);
                        }
                        break;
                    }
                }
            }
        }

        // If capture occurred, remove the captured piece from quantum state
        if (is_capture and captured_piece != null) {
            const opponent_pieces = if (opponent_color == .white) &self.white_quantum_pieces else &self.black_quantum_pieces;
            const piece_count = if (opponent_color == .white) &self.white_piece_count else &self.black_piece_count;

            for (opponent_pieces, 0..) |*maybe_qp, i| {
                if (maybe_qp.*) |*qp| {
                    // Find the captured piece by matching type/color and having probability at capture square
                    if (qp.piece.piece_type == captured_piece.?.piece_type and
                        qp.piece.color == captured_piece.?.color and
                        qp.probabilities[to.toIndex()] > 0.0)
                    {
                        opponent_pieces[i] = null;
                        piece_count.* -= 1;
                        break;
                    }
                }
            }
        }

        self.current_turn = opponent_color;
        return true;
    }

    // Expand quantum state based on all possible moves from original position
    fn expandQuantumState(self: *QuantumBoard, qp: *QuantumPiece, from: Position, actual_to: Position, allocator: std.mem.Allocator) !void {
        // Get all valid moves from the original position
        var valid_moves = std.ArrayList(Position).init(allocator);
        defer valid_moves.deinit();

        // Create a temporary board with the piece at 'from' to calculate possible moves
        const player_board = if (qp.piece.color == .white) &self.white_true_board else &self.black_true_board;
        var temp_board = player_board.*;
        const piece = temp_board.getPiece(actual_to);
        temp_board.setPiece(from, piece);
        temp_board.setPiece(actual_to, null);

        for (0..64) |i| {
            const target_pos = Position.fromIndex(@intCast(i));
            if (temp_board.isValidMove(.{ .from = from, .to = target_pos }, qp.piece.color)) {
                try valid_moves.append(target_pos);
            }
        }

        // Reset probabilities
        qp.probabilities = [_]f32{0.0} ** 64;
        qp.is_collapsed = false;

        // Distribute probability equally among all possible moves
        if (valid_moves.items.len > 0) {
            const prob_each: f32 = 1.0 / @as(f32, @floatFromInt(valid_moves.items.len));
            for (valid_moves.items) |pos| {
                qp.probabilities[pos.toIndex()] = prob_each;
            }
        } else {
            // If no valid moves, collapse to actual position
            qp.collapse(actual_to);
        }
    }
};
