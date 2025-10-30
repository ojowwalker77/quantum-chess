# Known Issues

This document tracks known bugs and limitations in Quantum Chess.

## Critical Issues

### 1. Castling Creates Unknown Behavior
**Status**: Not Fixed
**Priority**: High
**Reported**: 2025-10-17

**Description**:
Castling moves create unexpected quantum behavior. The king and rook movements should be treated as classical moves visible to both players in all POVs, but currently may enter superposition or show incorrect ghost positions.

**Expected Behavior**:
- Castling should be visible as a classical move to both players
- No quantum superposition for king or rook during castling
- Both pieces should show exact positions after castling

**Current Behavior**:
- Unknown/unpredictable quantum state after castling
- May show ghost positions for castled pieces

**Workaround**:
None. Avoid castling until fixed.

**Technical Notes**:
- Castling is detected in `chess.ts` (ClassicalBoard.makeMove)
- Rook movement handled separately in move logic
- Quantum state manager may need special case for castling moves

---

### 2. Moving Into Own Ghost Position Doesn't Collapse Superposition
**Status**: Not Fixed
**Priority**: High
**Reported**: 2025-10-17

**Description**:
When a player moves one of their pieces into a square where another of their pieces has a ghost position (in opponent's view), the opponent should see both pieces collapse. Currently, the ghost superposition persists.

**Example Scenario**:
1. Black knight at e4 moves to g6 (white sees ghosts at e6, f6, g6, h6 - 25% each)
2. Black bishop moves to f6 (one of the knight's ghost positions)
3. **Expected**: White should see knight collapse to g6 and bishop at f6
4. **Actual**: White still sees knight at 25% probability at f6, plus bishop at f6

**Expected Behavior**:
- When any piece moves to a square with own ghost, opponent sees collapse
- Ghost probabilities should resolve to actual positions
- Both pieces become visible at their real locations

**Current Behavior**:
- Ghost positions persist even when occupied by own pieces
- Multiple pieces can appear to overlap in opponent's view
- No collapse trigger when moving into own ghost

**Workaround**:
Capture or check with the ghosted piece to force collapse.

**Technical Notes**:
- Need to check if destination square has own ghost before move
- If yes, collapse the ghosted piece to its actual position
- Update both pieces' quantum states in `QuantumStateManager`

---

### 3. Pawn Captures of Ghost Pieces Incorrectly Marked as Illegal
**Status**: Not Fixed
**Priority**: Medium
**Reported**: 2025-10-17

**Description**:
When a pawn attempts to capture diagonally at a square containing only opponent ghost positions (no actual piece), the server rejects the move as illegal. This is a "probing move" that should be allowed to test if the ghost is real.

**Example Scenario**:
1. White pawn at e4, black knight has ghost at f5
2. White tries pawn e4 to f5 (diagonal capture)
3. **Expected**: Move allowed (probing move)
   - If knight really at f5: Capture succeeds
   - If knight elsewhere: Pawn moves to f5, ghost collapses
4. **Actual**: Server rejects move (no piece to capture)

**Expected Behavior**:
- Pawn diagonal moves to ghost squares should be legal
- Acts as "probing move" to test ghost reality
- If ghost is real: normal capture
- If ghost is fake: pawn moves, all ghosts of that piece collapse

**Current Behavior**:
- Server validation checks classical board only
- Sees empty square, rejects pawn diagonal move
- No mechanism for probing moves

**Workaround**:
None. Cannot probe with pawns.

**Technical Notes**:
- Need to implement "probing move" logic in `ClassicalBoard.isValidMove`
- Check if destination has opponent ghost (even if no real piece)
- Allow pawn diagonal to ghost squares
- After move, check classical board to see if capture succeeded
- Collapse ghost states accordingly

---

## Minor Issues

### 4. No Checkmate Detection
**Status**: Not Implemented
**Priority**: Medium

**Description**:
Game doesn't end when checkmate occurs. Players must manually recognize checkmate.

---

### 5. No En Passant Support
**Status**: Not Implemented
**Priority**: Low

**Description**:
En passant pawn captures not supported.

---

### 6. No Pawn Promotion
**Status**: Not Implemented
**Priority**: Low

**Description**:
Pawns reaching the back rank don't promote to other pieces.

---

### 7. No Stalemate Detection
**Status**: Not Implemented
**Priority**: Low

**Description**:
Stalemate situations not detected. Game continues even with no legal moves.

---

### 8. Valid Move Highlighting Uses Local WASM
**Status**: Minor Issue
**Priority**: Low

**Description**:
Valid move indicators (green dots) use local WASM validation instead of server validation. May show moves that server would reject.

**Expected Behavior**:
- Request valid moves from server
- Show only server-approved moves

**Current Behavior**:
- Client calculates valid moves locally with WASM
- Usually correct but could theoretically diverge from server

**Workaround**:
Server validates anyway, so invalid moves are rejected with error message.

---

## Notes

### Reporting New Issues
When reporting issues, please include:
1. Room code
2. Game state (moves leading to the issue)
3. Expected vs actual behavior
4. Screenshots if applicable

### Testing
Use the SQLite database to inspect game state:
```bash
sqlite3 quantum-chess.db "SELECT * FROM moves WHERE game_id = [ID] ORDER BY move_number;"
```
