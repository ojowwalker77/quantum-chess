# Playability Bugs Report
**Date**: 2025-10-30
**Analysis**: Comprehensive code review of quantum chess implementation

---

## Critical Bugs (Game-Breaking)

### BUG #1: collapsePiece() Collapses Wrong Piece with Multiple Same-Type Pieces
**File**: `apps/server/src/quantum-state.ts` (lines 191-218)
**Severity**: CRITICAL
**Impact**: Incorrect piece collapse when multiple pieces of same type exist

**Problem**:
The `collapsePiece()` method finds the "true position" by searching for ANY piece matching the type and color:
```typescript
const truePosition = this.board.getPieces(piece.color).find(
  p => p.piece.type === piece.type && p.piece.color === piece.color
)?.position;
```

This returns the FIRST piece found with matching type/color, not the specific piece that should collapse.

**Example Scenario**:
1. White has two knights: one at f3 (superposed at {f3, h3}), one at c3 (superposed at {c3, e3})
2. White moves bishop to h3 (own ghost position)
3. `collapsePiece()` is called to collapse the f3 knight
4. **BUG**: It finds the FIRST white knight (could be c3 knight) and collapses that instead
5. **Result**: Wrong knight collapsed, game state corrupted

**Fix Required**:
Need unique piece IDs or track pieces by more than just type+color. Must identify WHICH specific knight/rook/bishop is being collapsed.

---

### BUG #2: Quantum Key Collisions Allow Pieces to Overwrite Each Other
**File**: `apps/server/src/quantum-state.ts` (line 92)
**Severity**: CRITICAL
**Impact**: Multiple pieces in superposition can overwrite each other's quantum states

**Problem**:
Quantum piece keys use format: `${movingPiece.type}-superposition-${to.row},${to.col}`

If two knights both move to create superposition at the same destination square (on different turns), they get THE SAME KEY and overwrite each other in the Map.

**Example Scenario**:
1. White knight at g1 moves to f3 (enters superposition with key `knight-superposition-2,5`)
2. Later, white knight at b1 also moves to f3 (same destination)
3. **BUG**: Uses same key `knight-superposition-2,5`, overwrites first knight's quantum state
4. **Result**: First knight's superposition lost, only one knight tracked

**Fix Required**:
Keys must include unique piece identifier, not just type and destination. Use piece origin position or unique ID.

---

### BUG #3: Castling Rook Not Added to Quantum State
**File**: `apps/server/src/index.ts` (castling handling)
**Severity**: HIGH
**Impact**: Castled rook disappears from opponent's view

**Problem**:
When castling:
1. King movement is handled with forced collapse (lines 357-361)
2. Rook is moved on classical board in `chess.ts` (lines 115-126)
3. **BUG**: Rook's quantum state is NEVER updated in QuantumStateManager

The rook remains in quantum state at its original position (a1/h1) and is never shown at its new position (d1/f1).

**Example Scenario**:
1. White castles kingside (e1-g1, rook h1-f1)
2. King shown at g1 to black (collapsed correctly)
3. **BUG**: Black still sees white rook at h1, not at f1
4. **Result**: Rook appears in wrong location to opponent

**Fix Required**:
After castling, must update rook's quantum state to show at new position (collapsed, like king).

---

### BUG #4: Incomplete Castling Validation Allows Illegal Castles
**File**: `apps/server/src/chess.ts` (lines 217-221)
**Severity**: HIGH
**Impact**: Players can castle illegally (through check, while in check, after moving)

**Problem**:
Castling validation has TODO comment and just returns `true`:
```typescript
// Castling
if (absDy === 0 && absDx === 2) {
  // TODO: Check castling conditions (king/rook not moved, path clear, not in check)
  return true;
}
```

Chess rules require:
- King hasn't moved before
- Rook hasn't moved before
- King not currently in check
- King doesn't pass through check
- King doesn't land in check

**Current Behavior**: ALL castling moves accepted if king moves 2 squares horizontally

**Example Exploits**:
- Castle while in check (illegal)
- Castle through squares attacked by opponent (illegal)
- Castle after moving king earlier (illegal)
- Castle after moving rook earlier (illegal)

**Fix Required**:
Implement full castling validation per chess rules. Track whether king/rook have moved.

---

## High Priority Bugs

### BUG #5: Client WASM Doesn't Show Pawn Probing Moves as Valid
**File**: `packages/chess/src/chess.zig` (lines 149-174)
**Severity**: MEDIUM-HIGH
**Impact**: UI doesn't highlight pawn probing moves, confusing players

**Problem**:
Server allows pawn diagonal moves to opponent ghost squares when `allowProbing=true` (implemented in `chess.ts` lines 186-196).

But client-side WASM validation (`chess.zig`) doesn't have this logic:
```zig
// Capture
if (@abs(col_diff) == 1 and row_diff == direction) {
    return self.getPiece(move.to) != null;  // Only allows if piece exists
}
```

**Result**:
- Server accepts pawn probing moves
- Client doesn't show green "valid move" indicator
- Players don't know they can probe with pawns

**Fix Required**:
Either:
1. Update Zig code to match TypeScript probing logic, OR
2. Request valid moves from server instead of calculating client-side

---

### BUG #6: Piece Tracking by Position Instead of Unique ID
**File**: `apps/server/src/quantum-state.ts` (entire file)
**Severity**: MEDIUM-HIGH
**Impact**: Pieces can be confused when multiple of same type exist

**Problem**:
Quantum state uses Map keys based on position: `${pos.row},${pos.col}` or `${type}-${row},${col}`

When searching for "which piece moved", code finds piece by checking if it has probability at the source square:
```typescript
if (qp.piece.type === movingPiece.type &&
    qp.piece.color === movingPiece.color &&
    qp.positions.some(pos => pos.row === from.row && pos.col === from.col))
```

**Problem**: If two knights are both in superposition and both have probability at the same square, this could match the wrong knight.

**Example**:
1. White has knights superposed at {e4, f4} and {d4, e4}
2. Both have probability at e4
3. When moving from e4, which knight is moving?
4. **BUG**: Code matches first knight in Map iteration order, might be wrong one

**Fix Required**:
Assign unique IDs to pieces at game start. Track by ID, not by type+position.

---

## Medium Priority Bugs

### BUG #7: No Validation That King Doesn't Castle Through Check
**File**: `packages/chess/src/chess.zig` (lines 206-228)
**Severity**: MEDIUM
**Impact**: Illegal castling moves allowed

**Problem**:
Zig castling validation checks:
- Rook exists at expected position ✓
- Path between king and rook is clear ✓

But DOESN'T check:
- King not passing through attacked square ✗
- King not landing on attacked square ✗

**Example Exploit**:
Black bishop on f6 attacking e1, f1, g1. White can still castle kingside (king passes through f1 under attack).

**Fix Required**:
Add check for attacked squares along king's path during castling.

---

### BUG #8: Ghost Position Calculation May Be Incorrect for Captures
**File**: `apps/server/src/chess.ts` (lines 317-346 `getQuietMoves`)
**Severity**: MEDIUM
**Impact**: Ghost positions may include invalid squares

**Problem**:
`getQuietMoves()` simulates moves to find non-capture, non-check positions. It temporarily modifies the board:

```typescript
const originalTarget = this.getPiece(to);
this.setPiece(to, piece);
this.setPiece(from, null);
// Test if would check
this.setPiece(from, piece);
this.setPiece(to, originalTarget);
```

If the board state is already modified (piece already moved), this simulation is based on wrong state.

**Current safeguard**: `getQuietMoves` is called BEFORE `makeMove` in index.ts (line 309), so board state should be correct.

**Risk**: If calling order changes, this breaks. Fragile dependency on call order.

**Fix Recommendation**:
Pass board snapshot to `getQuietMoves()` or clone board inside method to guarantee correct state.

---

## Low Priority / Minor Bugs

### BUG #9: Captured Piece Detection Uses Wrong Search Logic
**File**: `apps/server/src/quantum-state.ts` (lines 116-127)
**Severity**: LOW-MEDIUM
**Impact**: Captured pieces might not be removed from quantum state

**Problem**:
When finding captured piece to remove from quantum state:
```typescript
for (const [key, qp] of capturedPieces.entries()) {
  if (qp.positions.some(pos => pos.row === capturedPosition.row && pos.col === capturedPosition.col)) {
    capturedKeyToRemove = key;
    break;
  }
}
```

This finds ANY piece with probability at capture square, not necessarily the piece that was captured.

**Edge Case**:
If two opponent pieces are superposed and both have probability at the capture square, wrong piece might be removed.

**Fix Required**:
Match by piece type and color, not just position.

---

### BUG #10: No Detection of Moving Into Own Ghost (Different Piece Types)
**File**: `apps/server/src/index.ts` (lines 332-335)
**Severity**: LOW
**Impact**: Minor strategic confusion

**Current Implementation**:
```typescript
const ownGhostPiece = room.quantumState.getOwnGhostPiece(data.to, playerColor);
if (ownGhostPiece) {
  room.quantumState.collapsePiece(ownGhostPiece.piece);
}
```

This collapses the ghosted piece, but doesn't check if moving piece is ALSO in superposition.

**Edge Case**:
1. White knight superposed at {f3, h3}
2. White bishop superposed at {g2, h3}
3. White moves third piece (rook) to h3
4. **Expected**: Both knight and bishop collapse
5. **Actual**: Only first ghost found collapses

**Fix Recommendation**:
Loop through ALL own pieces with ghosts at destination, collapse all.

---

## Already Known Issues (Documented in KNOWN_ISSUES.md)

These are already tracked and don't need re-reporting:
1. ✓ Castling Creates Unknown Behavior (attempted fix exists but has BUG #3)
2. ✓ Moving Into Own Ghost Position Doesn't Collapse Superposition (attempted fix exists but has BUG #10)
3. ✓ Pawn Captures of Ghost Pieces Incorrectly Marked as Illegal (attempted fix exists but has BUG #5)
4. ✓ No Checkmate Detection
5. ✓ No En Passant Support
6. ✓ No Pawn Promotion
7. ✓ No Stalemate Detection
8. ✓ Valid Move Highlighting Uses Local WASM (causes BUG #5)

---

## Bug Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| CRITICAL | 3 | Game-breaking bugs that corrupt game state |
| HIGH | 2 | Major functionality broken or exploitable |
| MEDIUM | 3 | Incorrect behavior in edge cases |
| LOW | 2 | Minor issues with limited impact |
| **TOTAL** | **10** | **New bugs discovered** |

---

## Recommended Fix Order

1. **BUG #1** (collapsePiece wrong piece) - Add unique piece IDs
2. **BUG #2** (quantum key collisions) - Fix key generation to use unique IDs
3. **BUG #3** (castling rook quantum state) - Update rook quantum state during castling
4. **BUG #4** (castling validation) - Implement full castling rules
5. **BUG #6** (piece tracking) - Refactor to use unique piece IDs throughout
6. **BUG #5** (WASM pawn probing) - Sync client/server validation or use server-side
7. **BUG #7** (castle through check) - Add attacked square validation
8. **BUG #9** (captured piece detection) - Match by type+color+position
9. **BUG #10** (multiple own ghosts) - Loop through all own ghosts at destination
10. **BUG #8** (ghost calculation fragility) - Add defensive board cloning

---

## Testing Recommendations

### Test Case: Two Knights Superposition
```
Setup:
- White knights at b1, g1
- Move both knights to create superposition
- Attempt to collapse one knight

Verify:
- Correct knight collapses (not wrong one)
- Both knights maintain separate quantum states
- No key collisions occur
```

### Test Case: Castling Visibility
```
Setup:
- White castles kingside (e1-g1, h1-f1)

Verify:
- Black sees white king at g1 (not superposed)
- Black sees white rook at f1 (not at h1)
- Both pieces shown as classical (100% probability)
```

### Test Case: Illegal Castling Prevented
```
Setup:
- Black bishop attacking f1
- White king at e1, rook at h1

Attempt: White castles kingside

Verify:
- Move rejected (king passes through check)
```

### Test Case: Pawn Probing UI
```
Setup:
- White pawn at e4
- Black knight superposed at {f5, g6}

Verify:
- Client shows green indicator on f5 (valid pawn probe)
- Move e4xf5 accepted by server
```

---

## Code Quality Issues

### Architecture Problems
1. **No unique piece identification system** - All piece tracking relies on type+color+position
2. **Fragile state management** - Quantum state can desync from classical board
3. **Client/server validation mismatch** - WASM and TypeScript have different rules

### Missing Safeguards
1. No validation that quantum state matches classical board
2. No error handling for "piece not found" in quantum state
3. No logging when quantum state operations fail
4. No assertions to catch state corruption

### Suggested Improvements
1. Add unique piece IDs at game start (UUID or sequential)
2. Add quantum state validation after each move
3. Add debug mode to log all quantum state changes
4. Implement state reconciliation if client/server diverge

---

## Conclusion

**10 new playability bugs discovered**, ranging from critical (game-breaking) to minor (edge cases).

**Most Critical**: Piece identification bugs (#1, #2, #6) cause quantum state corruption when multiple pieces of the same type exist. This is likely why the documented issues weren't fully fixed.

**Quick Win**: Fix castling rook quantum state (#3) - simple, isolated, high impact.

**Long-term**: Implement unique piece ID system to fix root cause of multiple bugs (#1, #2, #6, #9).
