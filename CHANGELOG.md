# Changelog

All notable changes to Quantum Chess will be documented in this file.

## [Unreleased] - 2025-10-17

### Major Refactoring - Server-Authoritative Architecture

#### Changed
- **Complete architectural overhaul**: Moved from client-side WASM game state to server-authoritative model
- Server now maintains single source of truth on classical board
- Both players receive complete game state after every move
- Client is now pure view layer, rendering from server-provided state

#### Added
- **Server-side game logic** (`apps/server/src/chess.ts`):
  - `ClassicalBoard` class with complete chess rules
  - Move validation, capture detection, check detection
  - Castling support
  - `getQuietMoves()` for quantum ghost calculation (excludes captures/checks)

- **Quantum state management** (`apps/server/src/quantum-state.ts`):
  - `QuantumStateManager` tracks each player's view of opponent pieces
  - Handles superposition, collapse, and ghost position calculation
  - Manages piece removal on capture

- **Enhanced WebSocket protocol**:
  - `game_state`: Complete game state broadcast to both players
  - `move_rejected`: Server validation feedback
  - Removed `move_confirmed` and `opponent_move` in favor of `game_state`

- **Database enhancements**:
  - Added `notation` column to moves table for chess notation (e.g., "Nf3", "Bxc4+")
  - Proper capture and check detection stored in database
  - Server generates notation automatically

#### Fixed
- **Critical capture bug**: Captured pieces now properly removed from opponent's quantum view
  - Previously, captured pieces remained visible in superposition to the player who lost them
  - Server now correctly removes captured pieces from quantum state

- **Ghost position calculation**: Ghosts now calculated from **origin square** instead of destination
  - Previously: Knight e4’g6 showed ghosts from g6 (wrong!)
  - Now: Shows all valid quiet moves FROM e4 (correct!)
  - Ghost positions exclude the origin square (piece moved away)

- **Pawn superposition**: Pawns never enter superposition (always collapse to exact position)

- **Ghost filtering**: Ghost positions exclude squares that would capture or check opponent

#### Removed
- Client-side WASM game state management
- Local move execution on client (now server-only)
- `opponent_move` message type (replaced with `game_state` broadcast)

### Technical Details

#### Architecture Pattern
```
Client A         Server (Source of Truth)         Client B
   |                      |                           |
   | --- move request --> |                           |
   |                      | (validates)               |
   |                      | (executes on classical)   |
   |                      | (updates quantum states)  |
   | <-- game_state ----- | ---- game_state --------> |
   |                      |                           |
   | (renders)            |              (renders)    |
```

#### Quantum Mechanics Implementation
- **Classical board**: Single 8x8 board on server with definitive piece positions
- **Quantum views**: Each player sees:
  - Own pieces: Classical positions (exact)
  - Opponent pieces: Quantum superposition (probability distribution)
- **Collapse triggers**: Capture, check, or pawn move reveals exact position
- **Ghost positions**: All valid "quiet" moves from piece's last known position

#### Game State Synchronization
- Server broadcasts complete state to both players after every move
- No delta updates - full state ensures consistency
- Client renders from `gameState` object (no local game logic)

### Dependencies
- Bun 1.3.0+
- TypeScript
- Zig 0.13.0 (WASM still used for local move validation UI only)

### Breaking Changes
- Old WASM interface no longer used for game state
- WebSocket message format changed
- Database schema updated (added `notation` column)

---

## Previous Work (Pre-Refactor)

### Initial Implementation
- Zig WASM-based chess engine
- Client-side quantum state management
- Dual board system (white_true_board, black_true_board)
- WebSocket multiplayer with room codes
- SQLite game history
- Docker deployment support
