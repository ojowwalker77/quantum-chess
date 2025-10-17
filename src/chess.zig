const std = @import("std");

pub const Color = enum(u8) {
    white = 0,
    black = 1,

    pub fn opponent(self: Color) Color {
        return if (self == .white) .black else .white;
    }
};

pub const PieceType = enum(u8) {
    pawn = 0,
    knight = 1,
    bishop = 2,
    rook = 3,
    queen = 4,
    king = 5,
};

pub const Piece = struct {
    piece_type: PieceType,
    color: Color,
};

pub const Position = struct {
    row: u8,
    col: u8,

    pub fn init(row: u8, col: u8) Position {
        return .{ .row = row, .col = col };
    }

    pub fn isValid(self: Position) bool {
        return self.row < 8 and self.col < 8;
    }

    pub fn equals(self: Position, other: Position) bool {
        return self.row == other.row and self.col == other.col;
    }

    pub fn toIndex(self: Position) u8 {
        return self.row * 8 + self.col;
    }

    pub fn fromIndex(index: u8) Position {
        return .{ .row = index / 8, .col = index % 8 };
    }
};

pub const Move = struct {
    from: Position,
    to: Position,
};

pub const Board = struct {
    // 8x8 board, null means empty square
    squares: [64]?Piece,

    pub fn init() Board {
        var board = Board{ .squares = [_]?Piece{null} ** 64 };
        board.setupInitialPosition();
        return board;
    }

    fn setupInitialPosition(self: *Board) void {
        // White pieces
        self.setPiece(Position.init(0, 0), Piece{ .piece_type = .rook, .color = .white });
        self.setPiece(Position.init(0, 1), Piece{ .piece_type = .knight, .color = .white });
        self.setPiece(Position.init(0, 2), Piece{ .piece_type = .bishop, .color = .white });
        self.setPiece(Position.init(0, 3), Piece{ .piece_type = .queen, .color = .white });
        self.setPiece(Position.init(0, 4), Piece{ .piece_type = .king, .color = .white });
        self.setPiece(Position.init(0, 5), Piece{ .piece_type = .bishop, .color = .white });
        self.setPiece(Position.init(0, 6), Piece{ .piece_type = .knight, .color = .white });
        self.setPiece(Position.init(0, 7), Piece{ .piece_type = .rook, .color = .white });

        for (0..8) |col| {
            self.setPiece(Position.init(1, @intCast(col)), Piece{ .piece_type = .pawn, .color = .white });
        }

        // Black pieces
        self.setPiece(Position.init(7, 0), Piece{ .piece_type = .rook, .color = .black });
        self.setPiece(Position.init(7, 1), Piece{ .piece_type = .knight, .color = .black });
        self.setPiece(Position.init(7, 2), Piece{ .piece_type = .bishop, .color = .black });
        self.setPiece(Position.init(7, 3), Piece{ .piece_type = .queen, .color = .black });
        self.setPiece(Position.init(7, 4), Piece{ .piece_type = .king, .color = .black });
        self.setPiece(Position.init(7, 5), Piece{ .piece_type = .bishop, .color = .black });
        self.setPiece(Position.init(7, 6), Piece{ .piece_type = .knight, .color = .black });
        self.setPiece(Position.init(7, 7), Piece{ .piece_type = .rook, .color = .black });

        for (0..8) |col| {
            self.setPiece(Position.init(6, @intCast(col)), Piece{ .piece_type = .pawn, .color = .black });
        }
    }

    pub fn getPiece(self: *const Board, pos: Position) ?Piece {
        if (!pos.isValid()) return null;
        return self.squares[pos.toIndex()];
    }

    pub fn setPiece(self: *Board, pos: Position, piece: ?Piece) void {
        if (!pos.isValid()) return;
        self.squares[pos.toIndex()] = piece;
    }

    pub fn movePiece(self: *Board, from: Position, to: Position) void {
        const piece = self.getPiece(from);
        self.setPiece(to, piece);
        self.setPiece(from, null);

        // Handle castling - move the rook
        if (piece) |p| {
            if (p.piece_type == .king) {
                const col_diff = @abs(@as(i8, @intCast(to.col)) - @as(i8, @intCast(from.col)));
                if (col_diff == 2) {
                    // This is castling
                    const is_kingside = to.col > from.col;
                    const rook_from_col: u8 = if (is_kingside) 7 else 0;
                    const rook_to_col: u8 = if (is_kingside) to.col - 1 else to.col + 1;

                    const rook = self.getPiece(Position.init(from.row, rook_from_col));
                    self.setPiece(Position.init(from.row, rook_to_col), rook);
                    self.setPiece(Position.init(from.row, rook_from_col), null);
                }
            }
        }
    }

    // Check if a move is valid (basic chess rules)
    pub fn isValidMove(self: *const Board, move: Move, color: Color) bool {
        const piece = self.getPiece(move.from) orelse return false;
        if (piece.color != color) return false;

        // Check if destination has own piece
        if (self.getPiece(move.to)) |dest_piece| {
            if (dest_piece.color == color) return false;
        }

        return switch (piece.piece_type) {
            .pawn => self.isValidPawnMove(move, piece.color),
            .knight => self.isValidKnightMove(move),
            .bishop => self.isValidBishopMove(move),
            .rook => self.isValidRookMove(move),
            .queen => self.isValidQueenMove(move),
            .king => self.isValidKingMove(move),
        };
    }

    fn isValidPawnMove(self: *const Board, move: Move, color: Color) bool {
        const direction: i8 = if (color == .white) 1 else -1;
        const start_row: u8 = if (color == .white) 1 else 6;

        const row_diff: i8 = @as(i8, @intCast(move.to.row)) - @as(i8, @intCast(move.from.row));
        const col_diff: i8 = @as(i8, @intCast(move.to.col)) - @as(i8, @intCast(move.from.col));

        // Forward move
        if (col_diff == 0) {
            if (row_diff == direction) {
                return self.getPiece(move.to) == null;
            }
            // Double move from start
            if (move.from.row == start_row and row_diff == direction * 2) {
                const between = Position.init(@intCast(@as(i8, @intCast(move.from.row)) + direction), move.from.col);
                return self.getPiece(move.to) == null and self.getPiece(between) == null;
            }
        }

        // Capture
        if (@abs(col_diff) == 1 and row_diff == direction) {
            return self.getPiece(move.to) != null;
        }

        return false;
    }

    fn isValidKnightMove(_: *const Board, move: Move) bool {
        const row_diff = @abs(@as(i8, @intCast(move.to.row)) - @as(i8, @intCast(move.from.row)));
        const col_diff = @abs(@as(i8, @intCast(move.to.col)) - @as(i8, @intCast(move.from.col)));
        return (row_diff == 2 and col_diff == 1) or (row_diff == 1 and col_diff == 2);
    }

    fn isValidBishopMove(self: *const Board, move: Move) bool {
        const row_diff = @abs(@as(i8, @intCast(move.to.row)) - @as(i8, @intCast(move.from.row)));
        const col_diff = @abs(@as(i8, @intCast(move.to.col)) - @as(i8, @intCast(move.from.col)));
        if (row_diff != col_diff) return false;
        return self.isPathClear(move);
    }

    fn isValidRookMove(self: *const Board, move: Move) bool {
        if (move.from.row != move.to.row and move.from.col != move.to.col) return false;
        return self.isPathClear(move);
    }

    fn isValidQueenMove(self: *const Board, move: Move) bool {
        return self.isValidRookMove(move) or self.isValidBishopMove(move);
    }

    fn isValidKingMove(self: *const Board, move: Move) bool {
        const row_diff = @abs(@as(i8, @intCast(move.to.row)) - @as(i8, @intCast(move.from.row)));
        const col_diff = @abs(@as(i8, @intCast(move.to.col)) - @as(i8, @intCast(move.from.col)));

        // Normal king move
        if (row_diff <= 1 and col_diff <= 1) return true;

        // Castling - king moves 2 squares horizontally
        if (row_diff == 0 and col_diff == 2) {
            const piece = self.getPiece(move.from) orelse return false;
            const king_row = move.from.row;
            const is_kingside = move.to.col > move.from.col;
            const rook_col: u8 = if (is_kingside) 7 else 0;
            const rook_pos = Position.init(king_row, rook_col);

            // Check if rook exists at expected position
            if (self.getPiece(rook_pos)) |rook| {
                if (rook.piece_type != .rook or rook.color != piece.color) return false;
            } else return false;

            // Check path between king and rook is clear
            const start_col = if (is_kingside) move.from.col + 1 else rook_col + 1;
            const end_col = if (is_kingside) rook_col else move.from.col;
            var col = start_col;
            while (col < end_col) : (col += 1) {
                if (self.getPiece(Position.init(king_row, col)) != null) return false;
            }

            // Check king not in check (checked elsewhere)
            return true;
        }

        return false;
    }

    fn isPathClear(self: *const Board, move: Move) bool {
        const row_dir: i8 = if (move.to.row > move.from.row) 1 else if (move.to.row < move.from.row) -1 else 0;
        const col_dir: i8 = if (move.to.col > move.from.col) 1 else if (move.to.col < move.from.col) -1 else 0;

        var current_row: i8 = @as(i8, @intCast(move.from.row)) + row_dir;
        var current_col: i8 = @as(i8, @intCast(move.from.col)) + col_dir;

        while (current_row != @as(i8, @intCast(move.to.row)) or current_col != @as(i8, @intCast(move.to.col))) {
            const pos = Position.init(@intCast(current_row), @intCast(current_col));
            if (self.getPiece(pos) != null) return false;
            current_row += row_dir;
            current_col += col_dir;
        }

        return true;
    }

    // Check if the king of the given color is in check
    pub fn isInCheck(self: *const Board, color: Color) bool {
        // Find king position
        var king_pos: ?Position = null;
        for (0..64) |i| {
            const pos = Position.fromIndex(@intCast(i));
            if (self.getPiece(pos)) |piece| {
                if (piece.piece_type == .king and piece.color == color) {
                    king_pos = pos;
                    break;
                }
            }
        }

        const king_position = king_pos orelse return false;

        // Check if any opponent piece can attack the king
        for (0..64) |i| {
            const pos = Position.fromIndex(@intCast(i));
            if (self.getPiece(pos)) |piece| {
                if (piece.color == color.opponent()) {
                    const move = Move{ .from = pos, .to = king_position };
                    if (self.isValidMove(move, piece.color)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }
};
