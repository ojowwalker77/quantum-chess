import { Database } from "bun:sqlite";

export interface GameRecord {
  id?: number;
  room_code: string;
  white_player: string;
  black_player: string;
  started_at: string;
  ended_at?: string;
  winner?: string;
  total_moves: number;
  final_state?: string;
}

export interface MoveRecord {
  id?: number;
  game_id: number;
  move_number: number;
  player_color: string;
  from_row: number;
  from_col: number;
  to_row: number;
  to_col: number;
  notation: string; // Chess notation like "e4", "Nf3", "Bxc4+"
  timestamp: string;
  was_capture: boolean;
  was_check: boolean;
}

export class GameDatabase {
  private db: Database;

  constructor(dbPath: string = "quantum-chess.db") {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    // Games table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        white_player TEXT NOT NULL,
        black_player TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        winner TEXT,
        total_moves INTEGER DEFAULT 0,
        final_state TEXT
      )
    `);

    // Moves table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        move_number INTEGER NOT NULL,
        player_color TEXT NOT NULL,
        from_row INTEGER NOT NULL,
        from_col INTEGER NOT NULL,
        to_row INTEGER NOT NULL,
        to_col INTEGER NOT NULL,
        notation TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        was_capture BOOLEAN DEFAULT FALSE,
        was_check BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )
    `);

    // Add notation column if it doesn't exist (migration)
    try {
      this.db.run(`ALTER TABLE moves ADD COLUMN notation TEXT DEFAULT ''`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Indices for performance
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_games_room ON games(room_code)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id)`);
  }

  createGame(roomCode: string, whitePlayer: string, blackPlayer: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO games (room_code, white_player, black_player, started_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(roomCode, whitePlayer, blackPlayer);
    return Number(result.lastInsertRowid);
  }

  recordMove(
    gameId: number,
    moveNumber: number,
    playerColor: string,
    from: { row: number; col: number },
    to: { row: number; col: number },
    notation: string,
    wasCapture: boolean = false,
    wasCheck: boolean = false
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO moves (
        game_id, move_number, player_color,
        from_row, from_col, to_row, to_col, notation,
        timestamp, was_capture, was_check
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `);

    stmt.run(
      gameId,
      moveNumber,
      playerColor,
      from.row,
      from.col,
      to.row,
      to.col,
      notation,
      wasCapture ? 1 : 0,
      wasCheck ? 1 : 0
    );

    // Update total moves
    this.db
      .prepare("UPDATE games SET total_moves = ? WHERE id = ?")
      .run(moveNumber, gameId);
  }

  endGame(gameId: number, winner?: string, finalState?: string): void {
    const stmt = this.db.prepare(`
      UPDATE games
      SET ended_at = datetime('now'), winner = ?, final_state = ?
      WHERE id = ?
    `);

    stmt.run(winner || null, finalState || null, gameId);
  }

  getGame(gameId: number): GameRecord | null {
    const stmt = this.db.prepare("SELECT * FROM games WHERE id = ?");
    return stmt.get(gameId) as GameRecord | null;
  }

  getGameByRoom(roomCode: string): GameRecord | null {
    const stmt = this.db.prepare(
      "SELECT * FROM games WHERE room_code = ? ORDER BY started_at DESC LIMIT 1"
    );
    return stmt.get(roomCode) as GameRecord | null;
  }

  getGameMoves(gameId: number): MoveRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM moves WHERE game_id = ? ORDER BY move_number ASC"
    );
    return stmt.all(gameId) as MoveRecord[];
  }

  getRecentGames(limit: number = 10): GameRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM games
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as GameRecord[];
  }

  getPlayerStats(playerName: string): {
    total_games: number;
    wins: number;
    losses: number;
    draws: number;
  } {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_games,
        SUM(CASE WHEN winner = ? THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN winner IS NOT NULL AND winner != ? THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN winner IS NULL AND ended_at IS NOT NULL THEN 1 ELSE 0 END) as draws
      FROM games
      WHERE white_player = ? OR black_player = ?
    `);

    return stmt.get(playerName, playerName, playerName, playerName) as any;
  }

  close(): void {
    this.db.close();
  }
}
